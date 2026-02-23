// Hook: manages real-time transcription via Deepgram
// Listens to Tauri audio-chunk events and pipes to Deepgram WebSocket
import { useState, useCallback, useRef, useEffect } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { DeepgramClient, TranscriptResult } from '../lib/deepgram';
import { ConversationEntry, detectQuestion, identifyInterviewer } from '../lib/promptBuilder';

export interface TranscriptLine {
    id: string;
    speaker: number;
    text: string;
    isFinal: boolean;
    timestamp: number;
}

interface AudioChunkPayload {
    data: string; // base64 encoded PCM
    sample_rate: number;
    channels: number;
}

// Sentence accumulation buffer for multi-utterance question detection
interface SpeakerBuffer {
    speaker: number;
    texts: string[];
    lastTimestamp: number;
}

const BUFFER_FLUSH_TIMEOUT_MS = 2500; // Flush buffer after 2.5s of silence
const BUFFER_MAX_ENTRIES = 5; // Max utterances to accumulate before flush
const REIDENTIFY_INTERVAL = 5; // Re-evaluate interviewer every N entries

export function useTranscription(apiKey: string) {
    const [lines, setLines] = useState<TranscriptLine[]>([]);
    const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'>('idle');
    const [detectedQuestion, setDetectedQuestion] = useState<string | null>(null);
    const [interviewerSpeaker, setInterviewerSpeaker] = useState<number>(0);

    const clientRef = useRef<DeepgramClient | null>(null);
    const unlistenRef = useRef<UnlistenFn | null>(null);
    const interimIdRef = useRef<number>(0);
    const entriesRef = useRef<ConversationEntry[]>([]);

    // Sentence accumulation buffer
    const speakerBufferRef = useRef<SpeakerBuffer>({ speaker: -1, texts: [], lastTimestamp: 0 });
    const bufferFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const interviewerSpeakerRef = useRef<number>(0); // Ref to avoid stale closure

    // Keep ref in sync with state
    useEffect(() => {
        interviewerSpeakerRef.current = interviewerSpeaker;
    }, [interviewerSpeaker]);

    // Base64 decode helper
    const base64ToArrayBuffer = useCallback((base64: string): ArrayBuffer => {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }, []);

    /**
     * Flush the speaker buffer and run question detection on the accumulated text.
     * Called when: speaker changes, silence timeout, or buffer is full.
     */
    const flushBuffer = useCallback(() => {
        const buffer = speakerBufferRef.current;
        if (buffer.texts.length === 0) return;

        const accumulatedText = buffer.texts.join(' ').trim();
        const speaker = buffer.speaker;

        console.log(`[Transcription] Buffer flush (speaker ${speaker}): "${accumulatedText.substring(0, 80)}..."`);

        // Run question detection on ALL speakers (safety net — interviewer ID might be wrong)
        const question = detectQuestion(accumulatedText);
        if (question) {
            // Prioritize if it's from the identified interviewer, but also detect from others
            const isInterviewer = speaker === interviewerSpeakerRef.current;
            if (isInterviewer) {
                console.log(`[Transcription] Question detected from interviewer: "${question.substring(0, 60)}..."`);
                setDetectedQuestion(question);
            } else {
                // Also check — might be a question from candidate's perspective or misidentified speaker
                // Only set if we don't already have a pending question
                console.log(`[Transcription] Question detected from speaker ${speaker} (non-interviewer): "${question.substring(0, 60)}..."`);
                setDetectedQuestion(prev => prev || question);
            }
        }

        // Clear buffer
        speakerBufferRef.current = { speaker: -1, texts: [], lastTimestamp: 0 };
    }, []);

    /**
     * Add an utterance to the speaker buffer.
     * Flushes on speaker change or when buffer is full.
     */
    const addToBuffer = useCallback((speaker: number, text: string, timestamp: number) => {
        const buffer = speakerBufferRef.current;

        // If speaker changed, flush the previous buffer first
        if (buffer.speaker !== -1 && buffer.speaker !== speaker) {
            flushBuffer();
        }

        // Add to buffer
        speakerBufferRef.current = {
            speaker,
            texts: [...(buffer.speaker === speaker ? buffer.texts : []), text],
            lastTimestamp: timestamp,
        };

        // Reset flush timer (wait for more speech from same speaker)
        if (bufferFlushTimerRef.current) {
            clearTimeout(bufferFlushTimerRef.current);
        }
        bufferFlushTimerRef.current = setTimeout(() => {
            flushBuffer();
        }, BUFFER_FLUSH_TIMEOUT_MS);

        // Force flush if buffer is full
        if (speakerBufferRef.current.texts.length >= BUFFER_MAX_ENTRIES) {
            flushBuffer();
        }

        // Also run IMMEDIATE detection on each utterance (catch obvious questions instantly)
        const question = detectQuestion(text);
        if (question && speaker === interviewerSpeakerRef.current) {
            // For immediate single-utterance questions (e.g., "Tell me about yourself")
            // Still set immediately — the buffer flush will also catch multi-sentence ones
            setDetectedQuestion(question);
        }
    }, [flushBuffer]);

    const handleTranscript = useCallback((result: TranscriptResult, isFinal: boolean) => {
        const alt = result.channel.alternatives[0];
        if (!alt || !alt.transcript.trim()) return;

        // Determine speaker from first word's diarization
        const speaker = alt.words?.[0]?.speaker ?? 0;

        const line: TranscriptLine = {
            id: isFinal ? `final-${Date.now()}` : `interim-${interimIdRef.current}`,
            speaker,
            text: alt.transcript,
            isFinal,
            timestamp: Date.now(),
        };

        if (isFinal) {
            // Replace the last interim line with this final one
            setLines(prev => {
                const filtered = prev.filter(l => l.isFinal);
                return [...filtered, line].slice(-50); // Keep last 50 lines
            });

            // Track conversation entries
            const entry: ConversationEntry = {
                speaker,
                text: alt.transcript,
                timestamp: Date.now(),
            };
            entriesRef.current.push(entry);

            // Re-evaluate interviewer periodically (every REIDENTIFY_INTERVAL entries)
            if (entriesRef.current.length % REIDENTIFY_INTERVAL === 0 || entriesRef.current.length <= 3) {
                const newInterviewer = identifyInterviewer(entriesRef.current);
                setInterviewerSpeaker(newInterviewer);
            }

            // Add to sentence accumulation buffer for multi-utterance detection
            addToBuffer(speaker, alt.transcript, Date.now());
        } else {
            interimIdRef.current++;
            setLines(prev => {
                // Replace any existing interim lines, keep finals
                const finals = prev.filter(l => l.isFinal);
                return [...finals, line];
            });
        }
    }, [addToBuffer]);

    const start = useCallback(async () => {
        if (!apiKey) {
            setStatus('error');
            return;
        }

        // Create Deepgram client
        const client = new DeepgramClient(
            apiKey,
            handleTranscript,
            (err) => console.error('[Transcription]', err),
            (s) => setStatus(s === 'connecting' ? 'connecting' : s === 'connected' ? 'connected' : s === 'error' ? 'error' : 'disconnected')
        );
        clientRef.current = client;
        client.connect();

        // Listen for audio chunks from Rust backend
        const unlisten = await listen<AudioChunkPayload>('audio-chunk', (event) => {
            const audioData = base64ToArrayBuffer(event.payload.data);
            client.sendAudio(audioData);
        });
        unlistenRef.current = unlisten;
    }, [apiKey, handleTranscript, base64ToArrayBuffer]);

    const stop = useCallback(() => {
        clientRef.current?.disconnect();
        clientRef.current = null;
        unlistenRef.current?.();
        unlistenRef.current = null;
        if (bufferFlushTimerRef.current) {
            clearTimeout(bufferFlushTimerRef.current);
        }
        setStatus('idle');
    }, []);

    const clearQuestion = useCallback(() => {
        setDetectedQuestion(null);
    }, []);

    const getConversationHistory = useCallback((): ConversationEntry[] => {
        return entriesRef.current;
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            clientRef.current?.disconnect();
            unlistenRef.current?.();
            if (bufferFlushTimerRef.current) {
                clearTimeout(bufferFlushTimerRef.current);
            }
        };
    }, []);

    return {
        lines,
        status,
        detectedQuestion,
        interviewerSpeaker,
        start,
        stop,
        clearQuestion,
        getConversationHistory,
    };
}
