import React from 'react';
import { FeedbackResult, PracticeQuestion } from '../lib/practiceService';
import './PracticeReport.css';

interface SessionItem {
    question: PracticeQuestion;
    feedback: FeedbackResult;
}

interface Props {
    history: SessionItem[];
    onClose: () => void;
}

export const PracticeReport: React.FC<Props> = ({ history, onClose }) => {
    if (history.length === 0) {
        return (
            <div className="practice-report">
                <h2>📊 Session Report</h2>
                <p>No questions answered yet.</p>
                <button className="close-btn" onClick={onClose}>Close</button>
            </div>
        );
    }

    const avgScore = Math.round(history.reduce((acc, item) => acc + item.feedback.score, 0) / history.length);

    // Aggregating strengths/improvements could be done here
    const allStrengths = Array.from(new Set(history.flatMap(h => h.feedback.strengths)));
    const allImprovements = Array.from(new Set(history.flatMap(h => h.feedback.improvements)));

    return (
        <div className="practice-report">
            <h2>📊 Performance Report</h2>

            <div className="stats-grid">
                <div className="stat-card">
                    <span className="stat-value">{history.length}</span>
                    <span className="stat-label">Questions</span>
                </div>
                <div className="stat-card" style={{ borderColor: avgScore > 70 ? '#4caf50' : '#ff9800' }}>
                    <span className="stat-value">{avgScore}%</span>
                    <span className="stat-label">Avg Score</span>
                </div>
            </div>

            <div className="summary-section">
                <div className="col">
                    <h4>👍 Top Strengths</h4>
                    <ul>
                        {allStrengths.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                </div>
                <div className="col">
                    <h4>🚀 Key Improvements</h4>
                    <ul>
                        {allImprovements.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                </div>
            </div>

            <div className="history-list">
                <h4>History</h4>
                {history.map((item, i) => (
                    <div key={i} className="history-item">
                        <div className="history-q">
                            <span className="q-num">Q{i + 1}</span>
                            {item.question.text}
                        </div>
                        <div className="history-score" style={{ color: item.feedback.score > 70 ? '#4caf50' : '#ff9800' }}>
                            {item.feedback.score}%
                        </div>
                    </div>
                ))}
            </div>

            <button className="close-btn main" onClick={onClose}>Return to Setup</button>
        </div>
    );
};
