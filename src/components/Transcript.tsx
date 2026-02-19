import React, { useRef, useEffect } from 'react';
import './Transcript.css';
import { TranscriptLine } from '../hooks/useTranscription';

interface Props {
    lines: TranscriptLine[];
    interviewerSpeaker: number;
}

const Transcript: React.FC<Props> = ({ lines, interviewerSpeaker }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const shouldAutoScroll = useRef(true);

    useEffect(() => {
        if (shouldAutoScroll.current && containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [lines]);

    const handleScroll = () => {
        if (!containerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 60;
    };

    return (
        <div className="transcript" ref={containerRef} onScroll={handleScroll}>
            <div className="transcript-header">
                <span className="transcript-icon">🎙</span>
                <span>Live Transcript</span>
            </div>
            {lines.length === 0 && (
                <div className="transcript-empty">
                    Waiting for speech...
                </div>
            )}
            {lines.map((line) => (
                <div
                    key={line.id}
                    className={`transcript-line ${line.isFinal ? 'final' : 'interim'} ${line.speaker === interviewerSpeaker ? 'interviewer' : 'candidate'
                        }`}
                >
                    <span className="speaker-label">
                        {line.speaker === interviewerSpeaker ? '👤' : '🧑‍💻'}
                    </span>
                    <span className="speaker-text">{line.text}</span>
                </div>
            ))}
        </div>
    );
};

export default Transcript;
