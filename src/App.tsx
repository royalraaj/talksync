import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import HomeScreen from './components/HomeScreen';
import SettingsPanel from './components/SettingsPanel';
import SetupPanel, { SessionData } from './components/SetupPanel';
import Transcript from './components/Transcript';
import AnswerPanel from './components/AnswerPanel';
import StatusBar from './components/StatusBar';
import { ResizableLayout } from './components/ResizableLayout';
import { useAudioCapture } from './hooks/useAudioCapture';
import { useTranscription } from './hooks/useTranscription';
import { useLLM } from './hooks/useLLM';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from './lib/firebase';
import AuthScreen from './components/AuthScreen';
import { LLMConfig } from './lib/llm';
import {
  GlobalSettings, Session,
  loadSettings, saveSettings,
  listSessions, saveSession, deleteSession, createSession,
  migrateFromLocalStorage,
} from './lib/sessionStore';
import { getUserSubscription, incrementSessionCount } from './lib/subscription';
import './App.css';

type Mode = 'home' | 'settings' | 'setup' | 'session';

const DEFAULT_SETTINGS: GlobalSettings = {
  deepgramKey: '',
  llmProvider: 'openai',
  llmApiKey: '',
  llmModel: 'gpt-4o',
  opacity: 0.7,
};

function App() {
  const [mode, setMode] = useState<Mode>('home');
  const [settings, setSettings] = useState<GlobalSettings>(DEFAULT_SETTINGS);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // Firebase Auth State
  const [user, authLoading, authError] = useAuthState(auth);

  // Async init: migrate old data, then load settings + sessions from disk
  useEffect(() => {
    const init = async () => {
      try {
        await migrateFromLocalStorage();
        const [s, sess] = await Promise.all([loadSettings(), listSessions()]);
        setSettings(s);
        setSessions(sess);
      } catch (err) {
        console.error('[App] Init failed:', err);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  // Handle Auth changes (logout resets app state)
  useEffect(() => {
    if (!user && !authLoading) {
      setMode('home');
      setActiveSession(null);
    }
  }, [user, authLoading]);

  // Hooks
  const { isCapturing, startCapture, stopCapture } = useAudioCapture();
  const deepgramKey = settings.deepgramKey || '';
  const { lines, status: sttStatus, detectedQuestion, interviewerSpeaker, start: startSTT, stop: stopSTT, getConversationHistory } = useTranscription(deepgramKey);

  const llmConfig: LLMConfig | null = settings.llmApiKey
    ? { provider: settings.llmProvider, apiKey: settings.llmApiKey, model: settings.llmModel }
    : null;
  const { answer, isGenerating, error: llmError, confidence, hints, questionType, isFollowUp, generateAnswer, clearAnswer } = useLLM(llmConfig);

  // Track last answered question to avoid re-answering
  const lastQuestionRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-generate answer when question detected — debounced to wait for interviewer to finish
  useEffect(() => {
    if (detectedQuestion && detectedQuestion !== lastQuestionRef.current && activeSession) {
      // Clear any pending debounce — interviewer is still talking
      if (debounceRef.current) clearTimeout(debounceRef.current);

      // Wait 2 seconds of silence before triggering answer generation
      debounceRef.current = setTimeout(() => {
        lastQuestionRef.current = detectedQuestion;
        clearAnswer();
        generateAnswer(
          detectedQuestion,
          activeSession.resumeText,
          activeSession.jobDescription,
          activeSession.companyBrief,
          getConversationHistory(),
          undefined,
          activeSession.additionalNotes
        );
      }, 2000);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [detectedQuestion, activeSession, generateAnswer, clearAnswer, getConversationHistory]);

  // Register global hotkey: Ctrl+Shift+I to toggle visibility
  useEffect(() => {
    const setupHotkey = async () => {
      try {
        await register('CmdOrCtrl+Shift+I', async () => {
          const appWindow = getCurrentWebviewWindow();
          if (isVisible) {
            await appWindow.hide();
            setIsVisible(false);
          } else {
            await appWindow.show();
            await appWindow.setFocus();
            setIsVisible(true);
          }
        });
      } catch (err) {
        console.error('[Hotkey] Registration failed:', err);
      }
    };

    if (mode === 'session') {
      setupHotkey();
    }

    return () => {
      unregister('CmdOrCtrl+Shift+I').catch(() => { });
    };
  }, [mode, isVisible]);

  // --- Handlers ---

  const handleOpenSettings = useCallback(() => setMode('settings'), []);

  const handleSaveSettings = useCallback(async (newSettings: GlobalSettings) => {
    await saveSettings(newSettings);
    setSettings(newSettings);
    setMode('home');
  }, []);

  const handleNewSession = useCallback(() => {
    setActiveSession(null);
    setMode('setup');
  }, []);

  const handleLoadSession = useCallback((session: Session) => {
    setActiveSession(session);
    setMode('setup');
  }, []);

  const handleDeleteSession = useCallback(async (id: string) => {
    await deleteSession(id);
    const updated = await listSessions();
    setSessions(updated);
  }, []);

  const handleStartSession = useCallback(async (data: SessionData) => {
    // Create or update session
    let session: Session;
    if (activeSession) {
      session = { ...activeSession, ...data, updatedAt: new Date().toISOString() };
    } else {
      session = createSession(data);
      // It's a brand new session, increment the user's free tier usage count
      if (user) {
        try {
          const sub = await getUserSubscription(user.uid, user.email);
          if (!sub.isPro) {
            await incrementSessionCount(user.uid, sub.sessionCount);
          }
        } catch (err) {
          console.error('[Subscription] Failed to increment count:', err);
        }
      }
    }
    await saveSession(session);
    setActiveSession(session);
    const updated = await listSessions();
    setSessions(updated);
    setMode('session');

    // Enable stealth mode
    try {
      await invoke('set_stealth', { enabled: true });
    } catch (err) {
      console.error('[Stealth] Failed:', err);
    }

    // Start audio capture
    await startCapture();
  }, [activeSession, startCapture]);

  // Start STT when entering session
  useEffect(() => {
    if (mode === 'session' && settings.deepgramKey) {
      startSTT();
    }
  }, [mode, settings, startSTT]);

  // Handle session stop — auto-save transcript
  const handleStop = useCallback(async () => {
    stopCapture();
    stopSTT();

    // Auto-save transcript and answers
    if (activeSession) {
      const updatedSession: Session = {
        ...activeSession,
        transcript: lines.map(l => ({
          speaker: String(l.speaker || 'unknown'),
          text: l.text,
          timestamp: l.timestamp || Date.now(),
          isFinal: l.isFinal !== false,
        })),
        updatedAt: new Date().toISOString(),
      };
      // Save the latest answer if present
      if (detectedQuestion && answer) {
        updatedSession.answers = [
          ...(activeSession.answers || []),
          { question: detectedQuestion, answer, timestamp: Date.now() },
        ];
      }
      await saveSession(updatedSession);
      const updated = await listSessions();
      setSessions(updated);
    }

    try {
      await invoke('set_stealth', { enabled: false });
    } catch (err) {
      console.error('[Stealth] Disable failed:', err);
    }

    setMode('home');
    setActiveSession(null);
    clearAnswer();
    lastQuestionRef.current = null;
  }, [stopCapture, stopSTT, clearAnswer, activeSession, lines, detectedQuestion, answer]);

  // Window drag handler
  const handleDrag = useCallback(async () => {
    const appWindow = getCurrentWebviewWindow();
    await appWindow.startDragging();
  }, []);

  const handleClose = useCallback(async () => {
    const appWindow = getCurrentWebviewWindow();
    await appWindow.destroy();
  }, []);

  const handleQuickAction = useCallback((action: string) => {
    if (!detectedQuestion || !activeSession) return;

    let instruction = '';
    switch (action) {
      case 'shorter':
        instruction = "Make the answer shorter and more concise (max 45 seconds speaking time). Cut fluff.";
        break;
      case 'example':
        instruction = "Add a concrete STAR example from my resume to support this answer.";
        break;
      case 'technical':
        instruction = "Expand on the technical details, trade-offs, and implementation specifics. Be more engineering-focused.";
        break;
      case 'retry':
        instruction = "Regenerate the answer with a slightly different tone.";
        break;
    }

    generateAnswer(
      detectedQuestion,
      activeSession.resumeText,
      activeSession.jobDescription,
      activeSession.companyBrief,
      getConversationHistory(),
      instruction, // Pass refinement
      activeSession.additionalNotes
    );
  }, [detectedQuestion, activeSession, getConversationHistory, generateAnswer]);

  // --- Render ---

  if (isLoading || authLoading) {
    return (
      <div className="app-container setup-mode" style={{ background: 'rgba(10, 10, 26, 0.95)' }}>
        <div className="drag-region" data-tauri-drag-region onMouseDown={handleDrag}>
          <button className="close-btn" onMouseDown={e => e.stopPropagation()} onClick={handleClose} title="Exit">×</button>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>
          <div>Loading...</div>
          {authError && <div style={{ color: 'red', marginTop: '8px' }}>Auth Error: {authError.message}</div>}
        </div>
      </div>
    );
  }

  // Not logged in -> Show Auth Screen
  if (!user) {
    return (
      <div className="app-container setup-mode" style={{ background: 'rgba(10, 10, 26, 0.95)' }}>
        <div className="drag-region" data-tauri-drag-region onMouseDown={handleDrag}>
          <button className="close-btn" onMouseDown={e => e.stopPropagation()} onClick={handleClose} title="Exit">×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <AuthScreen onSuccess={() => { }} />
        </div>
      </div>
    );
  }

  if (mode === 'home') {
    return (
      <div className="app-container setup-mode" style={{ background: `rgba(10, 10, 26, ${settings.opacity})` }}>
        <div className="drag-region" data-tauri-drag-region onMouseDown={handleDrag}>
          <button className="close-btn" onMouseDown={e => e.stopPropagation()} onClick={handleClose} title="Exit">×</button>
        </div>
        <HomeScreen
          sessions={sessions}
          onNewSession={handleNewSession}
          onLoadSession={handleLoadSession}
          onDeleteSession={handleDeleteSession}
          onOpenSettings={handleOpenSettings}
        />
      </div>
    );
  }

  if (mode === 'settings') {
    return (
      <div className="app-container setup-mode" style={{ background: `rgba(10, 10, 26, 0.95)` }}>
        <div className="drag-region" data-tauri-drag-region onMouseDown={handleDrag}>
          <button className="close-btn" onMouseDown={e => e.stopPropagation()} onClick={handleClose} title="Exit">×</button>
        </div>
        <SettingsPanel
          settings={settings}
          onSave={handleSaveSettings}
          onBack={() => setMode('home')}
        />
      </div>
    );
  }

  if (mode === 'setup') {
    return (
      <div className="app-container setup-mode" style={{ background: `rgba(10, 10, 26, ${settings.opacity})` }}>
        <div className="drag-region" data-tauri-drag-region onMouseDown={handleDrag}>
          <button className="close-btn" onMouseDown={e => e.stopPropagation()} onClick={handleClose} title="Exit">×</button>
        </div>
        <SetupPanel
          settings={settings}
          initialData={activeSession ? {
            resumeText: activeSession.resumeText,
            jobDescription: activeSession.jobDescription,
            companyBrief: activeSession.companyBrief,
            additionalNotes: activeSession.additionalNotes,
          } : undefined}
          onStart={handleStartSession}
          onBack={() => { setActiveSession(null); setMode('home'); }}
        />
      </div>
    );
  }

  return (
    <div className="app-container session-mode" style={{ background: `rgba(10, 10, 26, ${settings.opacity})` }}>
      <div className="drag-region" data-tauri-drag-region onMouseDown={handleDrag}></div>
      <div className="session-content">
        <ResizableLayout
          initialTopHeightPercentage={40}
          top={<Transcript lines={lines} interviewerSpeaker={interviewerSpeaker} />}
          bottom={
            <AnswerPanel
              answer={answer}
              isGenerating={isGenerating}
              question={detectedQuestion}
              error={llmError}
              confidence={confidence}
              hints={hints}
              questionType={questionType}
              isFollowUp={isFollowUp}
              onAction={handleQuickAction}
            />
          }
        />
      </div>
      <StatusBar
        audioStatus={isCapturing}
        sttStatus={sttStatus}
        llmStatus={isGenerating ? 'generating' : 'idle'}
        onStop={handleStop}
      />
    </div>
  );
}

export default App;
