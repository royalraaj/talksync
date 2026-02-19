import React, { useState, useEffect, useRef } from 'react';
import { PracticeReport } from './PracticeReport';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { generatePracticeQuestion, generateFeedback, PracticeQuestion, FeedbackResult } from '../lib/practiceService';
import { GlobalSettings } from '../lib/sessionStore';
import './PracticeSession.css';

interface Props {
    resumeText: string;
    jobDescription: string;
    settings: GlobalSettings;
    onExit: () => void;
}

export const PracticeSession: React.FC<Props> = ({ resumeText, jobDescription, settings, onExit }) => {
    const [question, setQuestion] = useState<PracticeQuestion | null>(null);
    const [status, setStatus] = useState<'idle' | 'recording' | 'processing' | 'feedback'>('idle');
    const [transcript, setTranscript] = useState('');
    const transcriptRef = useRef(''); // Ref to access latest transcript in async callbacks
    const [feedback, setFeedback] = useState<FeedbackResult | null>(null);
    const [error, setError] = useState('');

    // History & Report State
    const [history, setHistory] = useState<{ question: PracticeQuestion; feedback: FeedbackResult }[]>([]);
    const [view, setView] = useState<'session' | 'report'>('session');

    // Keep ref in sync with state
    useEffect(() => {
        transcriptRef.current = transcript;
    }, [transcript]);

    const { startListening, stopListening, isListening, error: micError, resetTranscript } = useSpeechRecognition({
        onError: (err) => setError("Speech recognition error: " + String(err)),
        onResult: (text) => setTranscript(text)
    });

    useEffect(() => {
        if (micError) {
            setError("Microphone Error: " + String(micError));
        }
    }, [micError]);

    const loadNewQuestion = async () => {
        setStatus('processing');
        setQuestion(null);
        setFeedback(null);
        setTranscript('');
        setError('');

        // Extract previous question texts for context
        const previousQuestions = history.map(h => h.question.text);

        try {
            const q = await generatePracticeQuestion(resumeText, jobDescription, previousQuestions, {
                provider: settings.llmProvider,
                apiKey: settings.llmApiKey,
                model: settings.llmModel
            });
            setQuestion(q);
            setStatus('idle');
        } catch (err) {
            setError('Failed to load question: ' + String(err));
            setStatus('idle');
        }
    };

    // Load first question on mount
    useEffect(() => {
        loadNewQuestion();
    }, []);

    const handleToggleRecord = async () => {
        if (isListening) {
            stopListening();
            setStatus('processing');

            // Short delay to allow final transcript to settle
            setTimeout(async () => {
                const finalTranscript = transcriptRef.current; // Read from Ref
                console.log('Final Transcript:', finalTranscript);

                if (!finalTranscript) {
                    setError("No speech detected. Please try again.");
                    setStatus('idle');
                    return;
                }

                // Generate Feedback
                if (question) {
                    try {
                        const fb = await generateFeedback(question.text, finalTranscript, {
                            provider: settings.llmProvider,
                            apiKey: settings.llmApiKey,
                            model: settings.llmModel
                        });
                        setFeedback(fb);
                        // Add to history
                        setHistory(prev => [...prev, { question, feedback: fb }]);
                        setStatus('feedback');
                    } catch (err) {
                        console.error(err);
                        setError('Feedback generation failed: ' + String(err));
                        setStatus('idle');
                    }
                }
            }, 500);

        } else {
            setError('');
            setFeedback(null);
            resetTranscript();
            setTranscript(''); // Clear displayed transcript
            setStatus('recording');
            startListening();
        }
    };

    if (view === 'report') {
        return <PracticeReport history={history} onClose={onExit} />;
    }

    return (
        <div className="practice-session">
            <div className="practice-header">
                <h2>🎙️ Mock Interview</h2>
                <div className="header-actions">
                    <button
                        className="end-session-btn"
                        onClick={() => setView('report')}
                        disabled={history.length === 0}
                    >
                        End Session
                    </button>
                    <button className="exit-btn" onClick={onExit}>Exit</button>
                </div>
            </div>

            {error && <div className="error-banner">
                {error}
                {transcript && <div className="debug-path" style={{ fontSize: '0.8em', marginTop: '5px' }}>Path: {transcript}</div>}
            </div>}

            <div className="question-card">
                {question ? (
                    <>
                        <span className="q-type">{question.type}</span>
                        <h3>{question.text}</h3>
                        <p className="q-context">{question.context}</p>
                    </>
                ) : (
                    <div className="loading-spinner">Loading Question...</div>
                )}
            </div>

            <div className="controls">
                {status !== 'feedback' && (
                    <button
                        className={`record-btn ${status === 'recording' ? 'recording' : ''}`}
                        onClick={handleToggleRecord}
                        disabled={!question || status === 'processing'}
                    >
                        {status === 'recording' ? '⏹ Stop & Analyze' :
                            status === 'processing' ? '⏳ Processing...' : '🔴 Record Answer'}
                    </button>
                )}

                {status === 'feedback' && (
                    <button className="next-btn" onClick={loadNewQuestion}>
                        Next Question ➡
                    </button>
                )}
            </div>

            {(transcript || status === 'processing') && (
                <div className="transcript-box">
                    <h4>You said:</h4>
                    <p>{transcript || "Listening..."}</p>
                </div>
            )}

            {feedback && (
                <div className="feedback-panel">
                    <div className="score-badge" style={{ borderColor: feedback.score > 70 ? 'green' : 'orange' }}>
                        {feedback.score}/100
                    </div>
                    <div className="feedback-details">
                        <div className="feedback-section">
                            <h5>✅ Strengths</h5>
                            <ul>{feedback.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                        </div>
                        <div className="feedback-section">
                            <h5>🚀 Improvements</h5>
                            <ul>{feedback.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
                        </div>
                        <div className="feedback-section">
                            <h5>🏆 Model Answer:</h5>
                            <p className="example-phrase">"{feedback.examplePhrase}"</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
