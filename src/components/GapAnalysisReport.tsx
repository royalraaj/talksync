import React from 'react';
import './GapAnalysisReport.css';
import { GapAnalysisResult } from '../lib/gapAnalysis';

interface Props {
    result: GapAnalysisResult | null;
    loading: boolean;
    error?: string;
}

export const GapAnalysisReport: React.FC<Props> = ({ result, loading, error }) => {
    if (loading) {
        return (
            <div className="gap-report loading">
                <div className="spinner"></div>
                <p>Analyzing Resume vs JD... (This takes ~5s)</p>
            </div>
        );
    }

    if (error) {
        return <div className="gap-report error">⚠️ {error}</div>;
    }

    if (!result) return null;

    const { matchScore, missingSkills, predictedQuestions } = result;

    let scoreColor = 'red';
    if (matchScore >= 80) scoreColor = '#4caf50'; // Green
    else if (matchScore >= 50) scoreColor = '#ff9800'; // Orange

    return (
        <div className="gap-report">
            <h3 className="report-title">🛡️ Pre-Flight Check</h3>

            <div className="score-section">
                <div className="score-circle" style={{ borderColor: scoreColor }}>
                    <span className="score-value" style={{ color: scoreColor }}>
                        {matchScore}%
                    </span>
                    <span className="score-label">Match</span>
                </div>
                <div className="score-context">
                    {matchScore >= 80 ? 'Great fit! Ready to rock.' :
                        matchScore >= 50 ? 'Good match, but prepare for gaps.' :
                            'Low match. Expect tough questions.'}
                </div>
            </div>

            {missingSkills.length > 0 && (
                <div className="missing-skills">
                    <h4>⚠️ Potential Gaps detected:</h4>
                    <div className="tags">
                        {missingSkills.map((skill, i) => (
                            <span key={i} className="skill-tag">{skill}</span>
                        ))}
                    </div>
                </div>
            )}

            <div className="predicted-questions">
                <h4>🔮 Likely Curveball Questions:</h4>
                <ul>
                    {predictedQuestions.map((q, i) => (
                        <li key={i}>"{q}"</li>
                    ))}
                </ul>
            </div>
        </div>
    );
};
