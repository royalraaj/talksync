import React, { useEffect, useState } from 'react';
import { Session } from '../lib/sessionStore';
import { auth } from '../lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { getUserSubscription, UserSubscription, FREE_TIER_LIMIT } from '../lib/subscription';
import './HomeScreen.css';

interface Props {
    sessions: Session[];
    onNewSession: () => void;
    onLoadSession: (session: Session) => void;
    onDeleteSession: (id: string) => void;
    onOpenSettings: () => void;
}

const HomeScreen: React.FC<Props> = ({
    sessions,
    onNewSession,
    onLoadSession,
    onDeleteSession,
    onOpenSettings,
}) => {
    const [user] = useAuthState(auth);
    const [sub, setSub] = useState<UserSubscription | null>(null);

    useEffect(() => {
        if (user) {
            getUserSubscription(user.uid, user.email).then(setSub).catch(console.error);
        }
    }, [user, sessions.length]); // Re-fetch on session changes just in case

    const isLimitReached = sub && !sub.isPro && sub.sessionCount >= FREE_TIER_LIMIT;

    const handleNewSession = () => {
        if (isLimitReached) {
            alert(`You've reached the free limit of ${FREE_TIER_LIMIT} sessions. Please upgrade in Settings!`);
            onOpenSettings();
        } else {
            onNewSession();
        }
    };

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return `${diffDays}d ago`;
        return d.toLocaleDateString();
    };

    return (
        <div className="home-screen">
            <div className="home-header">
                <div>
                    <h1 className="home-title">🎯 TalkSync {sub?.isPro && <span style={{ fontSize: '14px', background: 'gold', color: 'black', WebkitTextFillColor: 'black', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>PRO</span>}</h1>
                    <p className="home-subtitle">Your AI interview assistant</p>
                </div>
                <button className="settings-btn" onClick={onOpenSettings} title="Settings">
                    ⚙️
                </button>
            </div>

            {sub && !sub.isPro && (
                <div style={{ background: 'rgba(255, 165, 0, 0.1)', border: '1px solid orange', padding: '12px', borderRadius: '8px', marginBottom: '16px', color: 'orange', fontSize: '13px' }}>
                    <strong>Free Tier:</strong> You have used {sub.sessionCount} of {FREE_TIER_LIMIT} free sessions.
                    {isLimitReached && <span> Upgrade to Pro to continue.</span>}
                </div>
            )}

            <button
                className="new-session-btn"
                onClick={handleNewSession}
                style={{ opacity: isLimitReached ? 0.5 : 1 }}
            >
                {isLimitReached ? '🔒 Upgrade to Pro for More Sessions' : '➕ New Interview Session'}
            </button>

            {sessions.length > 0 && (
                <div className="sessions-section">
                    <h2 className="sessions-title">Previous Sessions</h2>
                    <div className="session-list">
                        {sessions.map(session => (
                            <div
                                key={session.id}
                                className="session-card"
                                onClick={() => onLoadSession(session)}
                            >
                                <div className="session-info">
                                    <span className="session-name">{session.name}</span>
                                    <span className="session-date">{formatDate(session.updatedAt)}</span>
                                </div>
                                <div className="session-meta">
                                    {session.transcript.length > 0 && (
                                        <span className="session-badge">
                                            💬 {session.transcript.length} lines
                                        </span>
                                    )}
                                    {session.answers.length > 0 && (
                                        <span className="session-badge">
                                            🤖 {session.answers.length} answers
                                        </span>
                                    )}
                                </div>
                                <button
                                    className="delete-session-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm('Delete this session?')) {
                                            onDeleteSession(session.id);
                                        }
                                    }}
                                    title="Delete session"
                                >
                                    🗑️
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {sessions.length === 0 && (
                <div className="empty-state">
                    <p className="empty-icon">🎤</p>
                    <p className="empty-text">No sessions yet</p>
                    <p className="empty-hint">Create your first session to get started</p>
                </div>
            )}
        </div>
    );
};

export default HomeScreen;
