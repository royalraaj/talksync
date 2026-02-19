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

export function useTranscription(apiKey: string) {
    const [lines, setLines] = useState<TranscriptLine[]>([]);
    const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'>('idle');
    const [detectedQuestion, setDetectedQuestion] = useState<string | null>(null);
    const [interviewerSpeaker, setInterviewerSpeaker] = useState<number>(0);

    const clientRef = useRef<DeepgramClient | null>(null);
    const unlistenRef = useRef<UnlistenFn | null>(null);
    const interimIdRef = useRef<number>(0);
    const entriesRef = useRef<ConversationEntry[]>([]);

    // Base64 decode helper
    const base64ToArrayBuffer = useCallback((base64: string): ArrayBuffer => {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }, []);

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

            // Identify interviewer (first speaker)
            if (entriesRef.current.length === 1) {
                setInterviewerSpeaker(identifyInterviewer(entriesRef.current));
            }

            // Check for questions from the interviewer
            if (speaker === interviewerSpeaker) {
                const question = detectQuestion(alt.transcript);
                if (question) {
                    setDetectedQuestion(question);
                }
            }
        } else {
            interimIdRef.current++;
            setLines(prev => {
                // Replace any existing interim lines, keep finals
                const finals = prev.filter(l => l.isFinal);
                return [...finals, line];
            });
        }
    }, [interviewerSpeaker]);

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
