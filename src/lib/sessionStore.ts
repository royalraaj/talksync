// Session and settings persistence via Tauri FS (appDataDir)
// Data stored as JSON files in %APPDATA%/com.raj.talksync/

import {
    readTextFile,
    writeTextFile,
    exists,
    mkdir,
    readDir,
    remove,
    BaseDirectory,
} from '@tauri-apps/plugin-fs';

export interface TranscriptLine {
    speaker: string;
    text: string;
    timestamp: number;
    isFinal: boolean;
}

export interface SavedAnswer {
    question: string;
    answer: string;
    timestamp: number;
}

export interface Session {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    resumeText: string;
    jobDescription: string;
    companyBrief: string;
    transcript: TranscriptLine[];
    answers: SavedAnswer[];
}

export interface GlobalSettings {
    deepgramKey: string;
    llmProvider: 'openai' | 'anthropic' | 'gemini' | 'groq';
    llmApiKey: string;
    llmModel: string;
    opacity: number;
}

const SETTINGS_FILE = 'settings.json';
const SESSIONS_DIR = 'sessions';
const FS_OPTS = { baseDir: BaseDirectory.AppData };

// localStorage keys (for migration)
const OLD_SESSIONS_KEY = 'interview-helper-sessions';
const OLD_SETTINGS_KEY = 'interview-helper-settings';
const OLD_CONFIG_KEY = 'interview-helper-config';

const DEFAULT_SETTINGS: GlobalSettings = {
    deepgramKey: '',
    llmProvider: 'openai',
    llmApiKey: '',
    llmModel: 'gpt-4o',
    opacity: 0.7,
};

// --- Directory Setup ---

async function ensureDataDirs(): Promise<void> {
    try {
        const sessionsExists = await exists(SESSIONS_DIR, FS_OPTS);
        if (!sessionsExists) {
            await mkdir(SESSIONS_DIR, { ...FS_OPTS, recursive: true });
        }
    } catch (err) {
        console.error('[SessionStore] Failed to create data directories:', err);
    }
}

// --- Settings ---

export async function loadSettings(): Promise<GlobalSettings> {
    try {
        const fileExists = await exists(SETTINGS_FILE, FS_OPTS);
        if (fileExists) {
            const raw = await readTextFile(SETTINGS_FILE, FS_OPTS);
            return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
        }
    } catch (err) {
        console.error('[SessionStore] Failed to load settings:', err);
    }
    return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings: GlobalSettings): Promise<void> {
    try {
        await writeTextFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), FS_OPTS);
    } catch (err) {
        console.error('[SessionStore] Failed to save settings:', err);
    }
}

// --- Sessions ---

function sessionFilePath(id: string): string {
    return `${SESSIONS_DIR}/${id}.json`;
}

export async function listSessions(): Promise<Session[]> {
    try {
        await ensureDataDirs();
        const dirExists = await exists(SESSIONS_DIR, FS_OPTS);
        if (!dirExists) return [];

        const entries = await readDir(SESSIONS_DIR, FS_OPTS);
        const sessions: Session[] = [];

        for (const entry of entries) {
            if (entry.name?.endsWith('.json')) {
                try {
                    const raw = await readTextFile(`${SESSIONS_DIR}/${entry.name}`, FS_OPTS);
                    sessions.push(JSON.parse(raw));
                } catch (err) {
                    console.error(`[SessionStore] Failed to read session ${entry.name}:`, err);
                }
            }
        }

        // Sort by most recently updated
        return sessions.sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
    } catch (err) {
        console.error('[SessionStore] Failed to list sessions:', err);
        return [];
    }
}

export async function loadSession(id: string): Promise<Session | null> {
    try {
        const path = sessionFilePath(id);
        const fileExists = await exists(path, FS_OPTS);
        if (fileExists) {
            const raw = await readTextFile(path, FS_OPTS);
            return JSON.parse(raw);
        }
    } catch (err) {
        console.error(`[SessionStore] Failed to load session ${id}:`, err);
    }
    return null;
}

export async function saveSession(session: Session): Promise<void> {
    try {
        await ensureDataDirs();
        session.updatedAt = new Date().toISOString();
        const path = sessionFilePath(session.id);
        await writeTextFile(path, JSON.stringify(session, null, 2), FS_OPTS);
    } catch (err) {
        console.error(`[SessionStore] Failed to save session ${session.id}:`, err);
    }
}

export async function deleteSession(id: string): Promise<void> {
    try {
        const path = sessionFilePath(id);
        const fileExists = await exists(path, FS_OPTS);
        if (fileExists) {
            await remove(path, FS_OPTS);
        }
    } catch (err) {
        console.error(`[SessionStore] Failed to delete session ${id}:`, err);
    }
}

export function createSession(data: {
    resumeText: string;
    jobDescription: string;
    companyBrief: string;
}): Session {
    const now = new Date().toISOString();
    // Auto-generate name from company/JD
    let name = 'Interview Session';
    if (data.companyBrief) {
        const firstLine = data.companyBrief.split('\n')[0].slice(0, 40);
        name = firstLine || name;
    }
    if (data.jobDescription) {
        const jdFirst = data.jobDescription.split('\n')[0].slice(0, 30).trim();
        if (jdFirst) name = `${name} — ${jdFirst}`;
    }

    return {
        id: crypto.randomUUID(),
        name,
        createdAt: now,
        updatedAt: now,
        resumeText: data.resumeText,
        jobDescription: data.jobDescription,
        companyBrief: data.companyBrief,
        transcript: [],
        answers: [],
    };
}

// --- Migration: localStorage → file system (one-time) ---

export async function migrateFromLocalStorage(): Promise<void> {
    const MIGRATED_FLAG = 'talksync-migrated-to-fs';

    // Skip if already migrated
    if (localStorage.getItem(MIGRATED_FLAG)) return;

    try {
        await ensureDataDirs();
        let didMigrate = false;

        // 1. Migrate old config format (interview-helper-config)
        const oldConfigRaw = localStorage.getItem(OLD_CONFIG_KEY);
        if (oldConfigRaw) {
            const old = JSON.parse(oldConfigRaw);
            const settings = await loadSettings();
            if (old.deepgramKey && !settings.deepgramKey) settings.deepgramKey = old.deepgramKey;
            if (old.llmApiKey && !settings.llmApiKey) settings.llmApiKey = old.llmApiKey;
            if (old.llmProvider) settings.llmProvider = old.llmProvider;
            if (old.llmModel) settings.llmModel = old.llmModel;
            if (settings.opacity === undefined) settings.opacity = 0.7;
            await saveSettings(settings);

            // Migrate session data from old config
            if (old.resumeText || old.jobDescription || old.companyBrief) {
                const session = createSession({
                    resumeText: old.resumeText || '',
                    jobDescription: old.jobDescription || '',
                    companyBrief: old.companyBrief || '',
                });
                session.name = 'Migrated Session';
                await saveSession(session);
            }

            localStorage.removeItem(OLD_CONFIG_KEY);
            didMigrate = true;
        }

        // 2. Migrate settings (interview-helper-settings)
        const settingsRaw = localStorage.getItem(OLD_SETTINGS_KEY);
        if (settingsRaw) {
            const existingSettings = await loadSettings();
            const oldSettings = JSON.parse(settingsRaw);
            // Only migrate if file settings are still defaults
            if (!existingSettings.deepgramKey && !existingSettings.llmApiKey) {
                await saveSettings({ ...DEFAULT_SETTINGS, ...oldSettings });
            }
            localStorage.removeItem(OLD_SETTINGS_KEY);
            didMigrate = true;
        }

        // 3. Migrate sessions (interview-helper-sessions)
        const sessionsRaw = localStorage.getItem(OLD_SESSIONS_KEY);
        if (sessionsRaw) {
            const oldSessions: Session[] = JSON.parse(sessionsRaw);
            for (const session of oldSessions) {
                await saveSession(session);
            }
            localStorage.removeItem(OLD_SESSIONS_KEY);
            didMigrate = true;
        }

        // Mark migration complete
        localStorage.setItem(MIGRATED_FLAG, 'true');

        if (didMigrate) {
            // console.log('[SessionStore] Successfully migrated localStorage data to file system');
        }
    } catch (err) {
        console.error('[SessionStore] Migration from localStorage failed:', err);
    }
}
