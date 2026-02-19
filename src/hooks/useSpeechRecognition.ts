import { useState, useEffect, useCallback } from 'react';

export interface UseSpeechRecognitionProps {
    onResult?: (transcript: string) => void;
    onEnd?: () => void;
    onError?: (error: any) => void;
}

export function useSpeechRecognition({ onResult, onEnd, onError }: UseSpeechRecognitionProps = {}) {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');
    const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

            if (SpeechRecognition) {
                const recognitionInstance = new SpeechRecognition();
                recognitionInstance.continuous = true;
                recognitionInstance.interimResults = true;
                recognitionInstance.lang = 'en-US';

                recognitionInstance.onstart = () => {
                    setIsListening(true);
                    setError(null);
                };

                recognitionInstance.onresult = (event: SpeechRecognitionEvent) => {
                    let finalTrans = '';
                    let interimTrans = '';

                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        if (event.results[i].isFinal) {
                            finalTrans += event.results[i][0].transcript;
                        } else {
                            interimTrans += event.results[i][0].transcript;
                        }
                    }

                    if (finalTrans) {
                        setTranscript(prev => {
                            const newText = prev + ' ' + finalTrans;
                            if (onResult) onResult(newText.trim());
                            return newText.trim();
                        });
                    }
                    setInterimTranscript(interimTrans);
                };

                recognitionInstance.onerror = (event: SpeechRecognitionErrorEvent) => {
                    console.error('Speech recognition error', event.error);
                    setError(event.error);
                    setIsListening(false);
                    if (onError) onError(event.error);
                };

                recognitionInstance.onend = () => {
                    setIsListening(false);
                    if (onEnd) onEnd();
                };

                setRecognition(recognitionInstance);
            } else {
                setError('Speech Recognition API not supported in this browser.');
            }
        }
    }, [onResult, onEnd, onError]);

    const startListening = useCallback(() => {
        if (recognition && !isListening) {
            try {
                setTranscript('');
                setInterimTranscript('');
                recognition.start();
            } catch (err) {
                console.error("Failed to start recognition:", err);
            }
        }
    }, [recognition, isListening]);

    const stopListening = useCallback(() => {
        if (recognition && isListening) {
            recognition.stop();
        }
    }, [recognition, isListening]);

    const resetTranscript = useCallback(() => {
        setTranscript('');
        setInterimTranscript('');
    }, []);

    return {
        isListening,
        transcript,
        interimTranscript,
        error,
        startListening,
        stopListening,
        resetTranscript,
        hasSupport: !!recognition
    };
}
