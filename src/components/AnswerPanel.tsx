import React, { useRef, useEffect, useState } from 'react';
import { ConfidenceLevel } from '../hooks/useLLM';
import { QuestionType } from '../lib/promptBuilder';
import './AnswerPanel.css';

interface Props {
    answer: string;
    isGenerating: boolean;
    question: string | null;
    error: string | null;
    confidence: ConfidenceLevel;
    hints: string[];
    questionType: QuestionType;
    isFollowUp: boolean;
    onAction: (action: string) => void;
}

const CONFIDENCE_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
    high: { label: 'High', color: '#4caf50', emoji: '🟢' },
    medium: { label: 'Medium', color: '#ff9800', emoji: '🟡' },
    low: { label: 'Low', color: '#f44336', emoji: '🔴' },
};

const QTYPE_CONFIG: Record<QuestionType, { label: string; emoji: string }> = {
    behavioral: { label: 'Behavioral', emoji: '📖' },
    technical: { label: 'Technical', emoji: '⚙️' },
    personal: { label: 'Personal', emoji: '💭' },
    situational: { label: 'Situational', emoji: '🎯' },
    general: { label: 'General', emoji: '💬' },
};

/** Parse **bold** markers into React elements with highlighted styling */
function renderFormattedText(text: string): React.ReactNode[] {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            const inner = part.slice(2, -2);
            return (
                <span key={i} className="key-phrase">{inner}</span>
            );
        }
        return <span key={i}>{part}</span>;
    });
}

/** Calculate speaking time estimate from word count (avg 2.5 words/sec) */
function getSpeakingTime(text: string): { words: number; seconds: number; label: string } {
    const words = text.split(/\s+/).filter(w => w.length > 0).length;
    const seconds = Math.round(words / 2.5);
    let label: string;
    if (seconds < 60) {
        label = `~${seconds}s`;
    } else {
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        label = sec > 0 ? `~${min}m ${sec}s` : `~${min}m`;
    }
    return { words, seconds, label };
}

const AnswerPanel: React.FC<Props> = ({
    answer, isGenerating, question, error,
    confidence, hints, questionType, isFollowUp,
    onAction
}) => {
    const answerRef = useRef<HTMLDivElement>(null);
    const [hintsExpanded, setHintsExpanded] = useState(true);

    useEffect(() => {
        if (answerRef.current) {
            answerRef.current.scrollTop = answerRef.current.scrollHeight;
        }
    }, [answer]);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(answer);
    };

    const qType = QTYPE_CONFIG[questionType];
    const conf = confidence ? CONFIDENCE_CONFIG[confidence] : null;
    const speakingTime = answer ? getSpeakingTime(answer) : null;

    return (
        <div className="answer-panel">
            <div className="answer-header">
                <div className="answer-title">
                    <span className="answer-icon">💡</span>
                    <span>Suggested Answer</span>
                </div>
                <div className="answer-actions">
                    {speakingTime && !isGenerating && (
                        <span className="speaking-time-badge" title={`${speakingTime.words} words`}>
                            ⏱ {speakingTime.label}
                        </span>
                    )}
                    {conf && (
                        <span className="confidence-badge" style={{ borderColor: conf.color }}>
                            {conf.emoji} {conf.label}
                        </span>
                    )}
                    {answer && (
                        <button className="copy-btn" onClick={copyToClipboard} title="Copy answer">
                            📋
                        </button>
                    )}
                </div>
            </div>

            {question && (
                <div className="detected-question">
                    <span className="question-badge">Q</span>
                    <span className="qtype-badge">{qType.emoji} {qType.label}</span>
                    {isFollowUp && <span className="followup-badge">↩️ Follow-up</span>}
                    {question}
                </div>
            )}

            {error && (
                <div className="answer-error">⚠️ {error}</div>
            )}

            {/* Hints ABOVE the answer — quick-reference cheat sheet */}
            {hints.length > 0 && (
                <div className="hints-section">
                    <button
                        className="hints-toggle"
                        onClick={() => setHintsExpanded(!hintsExpanded)}
                    >
                        🎯 Quick Phrases {hintsExpanded ? '▾' : '▸'}
                    </button>
                    {hintsExpanded && (
                        <ul className="hints-list">
                            {hints.map((hint, i) => (
                                <li key={i} className="hint-item">{hint}</li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            <div className="answer-content" ref={answerRef}>
                {!answer && !isGenerating && !error && (
                    <div className="answer-empty">
                        Listening for questions...
                    </div>
                )}
                {answer && (
                    <div className="answer-text">
                        {renderFormattedText(answer)}
                    </div>
                )}
                {isGenerating && (
                    <span className="generating-indicator">
                        <span className="dot"></span>
                        <span className="dot"></span>
                        <span className="dot"></span>
                    </span>
                )}
            </div>

            {/* Quick Actions */}
            {answer && !isGenerating && (
                <div className="quick-actions">
                    <button onClick={() => onAction('shorter')} title="Make it concise (<45s)">
                        ⏱️ Shorter
                    </button>
                    <button onClick={() => onAction('simplify')} title="Simpler vocabulary">
                        💬 Simplify
                    </button>
                    <button onClick={() => onAction('example')} title="Add a STAR example">
                        ➕ Example
                    </button>
                    <button onClick={() => onAction('technical')} title="Add technical details">
                        ⚙️ Deep Dive
                    </button>
                    <button onClick={() => onAction('retry')} title="Regenerate answer">
                        🔄 Retry
                    </button>
                </div>
            )}
        </div>
    );
};

export default AnswerPanel;
