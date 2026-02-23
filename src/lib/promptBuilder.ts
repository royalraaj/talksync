// Prompt builder — assembles context from resume, JD, company, and conversation
// Includes question detection and classification logic

export type QuestionType = 'behavioral' | 'technical' | 'personal' | 'situational' | 'general';

const BEHAVIORAL_PATTERNS = [
    /\btell me about a time\b/i,
    /\bdescribe a (time|situation|experience)\b/i,
    /\bgive me an example\b/i,
    /\bhave you ever\b/i,
    /\bwhat challenges\b/i,
    /\bwhat was the (most|biggest|hardest)\b/i,
    /\bhow did you (handle|deal|manage|resolve|overcome)\b/i,
    /\bshare (a|an) (time|experience|example)\b/i,
    /\bwalk me through a (time|situation)\b/i,
    /\bwhat happened when\b/i,
    /\btell us about\b.*\b(experience|project|time)\b/i,
];

const TECHNICAL_PATTERNS = [
    /\b(explain|describe)\b.*\b(how|architecture|system|design|algorithm|data structure)\b/i,
    /\bhow (would|do) you (implement|build|design|architect|optimize|scale)\b/i,
    /\bwhat is\b.*\b(difference|between)\b/i,
    /\b(API|database|REST|microservic|Docker|Kubernetes|AWS|cloud|SQL|NoSQL|React|Node)\b/i,
    /\bwhat('s| is) the (time|space) complexity\b/i,
    /\bcode\b.*\b(review|quality)\b/i,
    /\btrade-?offs?\b/i,
    /\bsystem design\b/i,
    /\bdebug(ging)?\b/i,
    /\bwhat tools\b/i,
];

const PERSONAL_PATTERNS = [
    /\btell me about yourself\b/i,
    /\bwhat motivates\b/i,
    /\bwhy (do you want|are you interested|are you leaving|did you leave)\b/i,
    /\bwhere do you see yourself\b/i,
    /\bwhat are your (strengths|weaknesses|goals)\b/i,
    /\bstrengths and weaknesses\b/i,
    /\bwhat do you do (for fun|outside|in your free)\b/i,
    /\bwhy (should we|this company|this role)\b/i,
    /\bwhat makes you\b/i,
    /\bpassion(ate)?\b/i,
    /\bwhat kind of (team|environment|culture)\b/i,
];

const SITUATIONAL_PATTERNS = [
    /\bwhat would you do if\b/i,
    /\bhow would you (handle|approach|deal|respond)\b/i,
    /\bimagine\b.*\b(scenario|situation)\b/i,
    /\bwhat if\b/i,
    /\bhypothetical\b/i,
    /\bsuppose\b/i,
    /\bif you were\b/i,
    /\bin a situation where\b/i,
];

const FOLLOWUP_PATTERNS = [
    /\b(can you |could you )?(elaborate|expand)\b/i,
    /\btell me more\b/i,
    /\bgo (deeper|further|into more detail)\b/i,
    /\bmore (detail|specifics|specifically)\b/i,
    /\bwhat do you mean\b/i,
    /\b(and |so )?(then )?what happened\b/i,
    /\bhow (exactly|specifically)\b/i,
    /\bcan you (give|provide) (more|an) (detail|example)\b/i,
    /\bcould you (explain|clarify) (that|further|more)\b/i,
    /\bunpack that\b/i,
    /\bwalk me through that\b/i,
    /\bany(thing)? else\b.*\b(add|mention|share)\b/i,
    /\bkeep going\b/i,
    /\bcontinue\b/i,
];

/**
 * Detect if a question is a follow-up to the previous answer
 */
export function isFollowUp(text: string): boolean {
    const t = text.trim();

    // Check explicit follow-up patterns
    for (const p of FOLLOWUP_PATTERNS) {
        if (p.test(t)) return true;
    }

    // Very short questions with "?" are likely follow-ups (e.g. "How so?", "Really?", "Like what?")
    const words = t.split(/\s+/);
    if (words.length <= 6 && t.endsWith('?')) {
        // Exclude common short standalone questions
        if (!/\b(tell me about|what is your|why do you|where did you)\b/i.test(t)) {
            return true;
        }
    }

    return false;
}

/**
 * Classify an interview question by type
 */
export function classifyQuestion(text: string): QuestionType {
    const t = text.trim();

    // Check patterns in priority order
    for (const p of BEHAVIORAL_PATTERNS) {
        if (p.test(t)) return 'behavioral';
    }
    for (const p of PERSONAL_PATTERNS) {
        if (p.test(t)) return 'personal';
    }
    for (const p of SITUATIONAL_PATTERNS) {
        if (p.test(t)) return 'situational';
    }
    for (const p of TECHNICAL_PATTERNS) {
        if (p.test(t)) return 'technical';
    }

    return 'general';
}
export interface ConversationEntry {
    speaker: number; // Speaker ID from diarization
    text: string;
    timestamp: number;
}

// Common question patterns that don't necessarily end with "?"
const QUESTION_PATTERNS = [
    /\btell me about\b/i,
    /\bdescribe\b.*\b(time|situation|experience|project)\b/i,
    /\bwalk me through\b/i,
    /\bexplain\b.*\b(how|why|what)\b/i,
    /\bwhat (is|are|was|were|do|did|would|could)\b/i,
    /\bhow (do|did|would|could|have)\b/i,
    /\bwhy (do|did|would|should)\b/i,
    /\bcan you\b.*\b(tell|describe|explain|share)\b/i,
    /\bgive me an example\b/i,
    /\bwhere do you see yourself\b/i,
    /\bwhat('s| is) your\b/i,
    /\bhave you ever\b/i,
    /\bwhat challenges\b/i,
    /\bwhat motivates\b/i,
    /\bwhy (should|are you|do you want)\b/i,
    /\bstrengths and weaknesses\b/i,
    /\btell us\b/i,
    /\bshare (a|an|your)\b/i,
];

// Implicit questions: commands, WH-words without '?', imperative phrases
const IMPLICIT_QUESTION_PATTERNS = [
    /^(discuss|describe|elaborate|explain|outline|summarize|detail)\b/i,
    /^please\s+(tell|describe|explain|discuss|share|walk)/i,
    /^(what|how|why|when|where|which|who|whom|whose)\b/i,
    /^(do|does|did|is|are|was|were|can|could|would|should|have|has|had)\s+you\b/i,
    /\b(your experience with|your approach to|your opinion on|your thoughts on)\b/i,
    /\b(talk about|speak to|address)\b/i,
    /^(so|okay|alright|now)\s*,?\s*(what|how|why|tell|describe|can|could|would)/i,
    /\b(what kind of|what type of|what sort of)\b/i,
    /\b(comfortable with|familiar with|experience in|knowledge of)\b/i,
];

/**
 * Detect if a transcript segment contains a question
 * Supports single utterances and multi-sentence accumulated text
 * Returns the detected question text, or null
 */
export function detectQuestion(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 5) return null;

    // Direct question mark
    if (trimmed.includes('?')) {
        // Extract the question sentence(s)
        const sentences = trimmed.split(/(?<=[.!?])\s+/);
        const questions = sentences.filter((s) => s.includes('?'));
        if (questions.length > 0) {
            // Return the full accumulated text for context, not just the question sentence
            return trimmed;
        }
    }

    // Pattern-based detection (explicit question patterns)
    for (const pattern of QUESTION_PATTERNS) {
        if (pattern.test(trimmed)) {
            return trimmed;
        }
    }

    // Implicit question detection (commands, WH-words, imperatives)
    for (const pattern of IMPLICIT_QUESTION_PATTERNS) {
        if (pattern.test(trimmed)) {
            return trimmed;
        }
    }

    // Multi-sentence detection: split into sentences and check each
    const sentences = trimmed.split(/(?<=[.!?])\s+/);
    if (sentences.length > 1) {
        for (const sentence of sentences) {
            const s = sentence.trim();
            if (s.length < 5) continue;
            // Check if any individual sentence is a question
            for (const pattern of [...QUESTION_PATTERNS, ...IMPLICIT_QUESTION_PATTERNS]) {
                if (pattern.test(s)) {
                    return trimmed; // Return full text for context
                }
            }
        }
    }

    return null;
}

/**
 * Build conversation history string from entries (last 5 minutes)
 */
export function buildConversationHistory(
    entries: ConversationEntry[],
    maxAgeMs: number = 5 * 60 * 1000
): string {
    const now = Date.now();
    const recent = entries.filter((e) => now - e.timestamp < maxAgeMs);

    return recent
        .map((e) => {
            const label = e.speaker === 0 ? 'Interviewer' : 'Me';
            return `${label}: ${e.text}`;
        })
        .join('\n');
}

/**
 * Estimate which speaker is the interviewer using multiple signals:
 * 1. Question ratio — the speaker who asks more questions is likely the interviewer
 * 2. Talk ratio — the interviewer typically speaks less overall
 * 3. First speaker — fallback heuristic
 * Re-evaluates on every call for improving accuracy over time.
 */
export function identifyInterviewer(entries: ConversationEntry[]): number {
    if (entries.length === 0) return 0;
    if (entries.length < 3) {
        // Not enough data yet — fall back to first speaker
        return entries[0].speaker;
    }

    // Collect unique speakers
    const speakers = new Set(entries.map(e => e.speaker));
    if (speakers.size < 2) return entries[0].speaker;

    // Score each speaker
    const scores: Record<number, number> = {};
    const wordCounts: Record<number, number> = {};
    const questionCounts: Record<number, number> = {};

    for (const speaker of speakers) {
        scores[speaker] = 0;
        wordCounts[speaker] = 0;
        questionCounts[speaker] = 0;
    }

    for (const entry of entries) {
        const words = entry.text.split(/\s+/).length;
        wordCounts[entry.speaker] += words;

        // Count questions asked by this speaker
        if (detectQuestion(entry.text)) {
            questionCounts[entry.speaker]++;
        }
    }

    for (const speaker of speakers) {
        // Higher question ratio = more likely interviewer
        const totalQuestions = Object.values(questionCounts).reduce((a, b) => a + b, 0);
        if (totalQuestions > 0) {
            scores[speaker] += (questionCounts[speaker] / totalQuestions) * 50;
        }

        // Lower talk ratio = more likely interviewer (they listen more)
        const totalWords = Object.values(wordCounts).reduce((a, b) => a + b, 0);
        if (totalWords > 0) {
            const talkRatio = wordCounts[speaker] / totalWords;
            scores[speaker] += (1 - talkRatio) * 30;
        }

        // First speaker bonus
        if (entries[0].speaker === speaker) {
            scores[speaker] += 20;
        }
    }

    // Return speaker with highest score
    let bestSpeaker = entries[0].speaker;
    let bestScore = -1;
    for (const speaker of speakers) {
        if (scores[speaker] > bestScore) {
            bestScore = scores[speaker];
            bestSpeaker = speaker;
        }
    }

    return bestSpeaker;
}
