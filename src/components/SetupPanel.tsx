import React, { useState } from 'react';
import './SetupPanel.css';
import { extractText } from '../lib/resumeParser';
import { fetchCompanyBrief } from '../lib/companyFetcher';
import { GlobalSettings } from '../lib/sessionStore';
import { analyzeGap, GapAnalysisResult } from '../lib/gapAnalysis';
import { GapAnalysisReport } from './GapAnalysisReport';
import { PracticeSession } from './PracticeSession';

interface Props {
    settings: GlobalSettings;
    initialData?: {
        resumeText?: string;
        jobDescription?: string;
        companyBrief?: string;
        additionalNotes?: string;
    };
    onStart: (data: SessionData) => void;
    onBack: () => void;
}

export interface SessionData {
    resumeText: string;
    jobDescription: string;
    companyBrief: string;
    additionalNotes: string;
}

const SetupPanel: React.FC<Props> = ({ settings, initialData, onStart, onBack }) => {
    const [resumeText, setResumeText] = useState(initialData?.resumeText || '');
    const [jobDescription, setJobDescription] = useState(initialData?.jobDescription || '');
    const [companyBrief, setCompanyBrief] = useState(initialData?.companyBrief || '');
    const [additionalNotes, setAdditionalNotes] = useState(initialData?.additionalNotes || '');
    const [loading, setLoading] = useState(false);
    const [resumeFileName, setResumeFileName] = useState('');
    const [jdLoading, setJdLoading] = useState(false);
    const [jdFileName, setJdFileName] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [companyLoading, setCompanyLoading] = useState(false);
    const [companyFileName, setCompanyFileName] = useState('');
    const [notesLoading, setNotesLoading] = useState(false);
    const [notesFileName, setNotesFileName] = useState('');
    const [gapResult, setGapResult] = useState<GapAnalysisResult | null>(null);
    const [gapLoading, setGapLoading] = useState(false);
    const [gapError, setGapError] = useState('');
    const [isPracticeMode, setIsPracticeMode] = useState(false);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        setResumeFileName(file.name);
        try {
            const text = await extractText(file);
            setResumeText(text);
        } catch (err) {
            alert(`Failed to parse file: ${err}`);
        } finally {
            setLoading(false);
        }
    };

    const handleJdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setJdLoading(true);
        setJdFileName(file.name);
        try {
            const text = await extractText(file);
            setJobDescription(text);
        } catch (err) {
            alert(`Failed to parse JD file: ${err}`);
        } finally {
            setJdLoading(false);
        }
    };

    const handleCompanyUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCompanyLoading(true);
        setCompanyFileName(file.name);
        try {
            const text = await extractText(file);
            setCompanyBrief(text);
        } catch (err) {
            alert(`Failed to parse file: ${err}`);
        } finally {
            setCompanyLoading(false);
        }
    };

    const handleNotesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setNotesLoading(true);
        setNotesFileName(file.name);
        try {
            const text = await extractText(file);
            setAdditionalNotes(text);
        } catch (err) {
            alert(`Failed to parse file: ${err}`);
        } finally {
            setNotesLoading(false);
        }
    };

    const handleAutoFetch = async () => {
        if (!companyName.trim()) {
            alert('Please enter a company name first');
            return;
        }
        if (!settings.llmApiKey) {
            alert('Please configure your LLM API key in Settings first');
            return;
        }
        setCompanyLoading(true);
        try {
            const brief = await fetchCompanyBrief(companyName.trim(), {
                provider: settings.llmProvider,
                apiKey: settings.llmApiKey,
                model: settings.llmModel,
            });
            setCompanyBrief(brief);
        } catch (err) {
            alert(`Failed to fetch company info: ${err}`);
        } finally {
            setCompanyLoading(false);
        }
    };

    const handleGapAnalysis = async () => {
        if (!resumeText || !jobDescription) {
            alert('Please provide both Resume and Job Description first.');
            return;
        }
        if (!settings.llmApiKey) {
            alert('Please configure your LLM API key in Settings first');
            return;
        }

        setGapLoading(true);
        setGapError('');
        setGapResult(null);

        try {
            const result = await analyzeGap(resumeText, jobDescription, {
                provider: settings.llmProvider,
                apiKey: settings.llmApiKey,
                model: settings.llmModel
            });
            setGapResult(result);
        } catch (err) {
            setGapError(String(err));
        } finally {
            setGapLoading(false);
        }
    };

    const handleStart = () => {
        if (!settings.deepgramKey || !settings.llmApiKey) {
            alert('Please configure API keys in Settings first (use the ⚙️ button on the home screen)');
            return;
        }
        if (!resumeText) {
            alert('Please upload your resume or paste the text');
            return;
        }
        onStart({ resumeText, jobDescription, companyBrief, additionalNotes });
    };

    if (isPracticeMode) {
        return (
            <PracticeSession
                resumeText={resumeText}
                jobDescription={jobDescription}
                settings={settings}
                onExit={() => setIsPracticeMode(false)}
            />
        );
    }

    return (
        <div className="setup-panel">
            <div className="setup-header">
                <button className="back-btn" onClick={onBack}>← Back</button>
                <h1 className="setup-title">📝 Session Setup</h1>
            </div>

            <div className="setup-form">
                <div className="form-section">
                    <label className="form-label">📄 Resume</label>
                    <div className="file-upload">
                        <input
                            type="file"
                            accept=".pdf,.docx,.doc,.txt"
                            onChange={handleFileUpload}
                            id="resume-upload"
                            hidden
                        />
                        <label htmlFor="resume-upload" className="upload-btn">
                            {loading ? '⏳ Parsing...' : resumeFileName || 'Upload PDF / DOCX'}
                        </label>
                    </div>
                    <textarea
                        className="form-textarea"
                        placeholder="Or paste your resume text here..."
                        value={resumeText}
                        onChange={(e) => setResumeText(e.target.value)}
                        rows={4}
                    />
                </div>

                <div className="form-section">
                    <label className="form-label">📋 Job Description</label>
                    <div className="file-upload">
                        <input
                            type="file"
                            accept=".pdf,.docx,.doc,.txt"
                            onChange={handleJdUpload}
                            id="jd-upload"
                            hidden
                        />
                        <label htmlFor="jd-upload" className="upload-btn">
                            {jdLoading ? '⏳ Parsing...' : jdFileName || 'Upload PDF / DOCX / TXT'}
                        </label>
                    </div>
                    <textarea
                        className="form-textarea"
                        placeholder="Or paste the job description here..."
                        value={jobDescription}
                        onChange={(e) => setJobDescription(e.target.value)}
                        rows={3}
                    />
                </div>

                <div className="form-section">
                    <label className="form-label">🏢 Company Brief</label>
                    <div className="api-row">
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Enter company name..."
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                        />
                        <button
                            className="fetch-btn"
                            onClick={handleAutoFetch}
                            disabled={companyLoading || !companyName.trim()}
                        >
                            {companyLoading ? '⏳' : '🔍 Auto-Fetch'}
                        </button>
                    </div>
                    <div className="file-upload">
                        <input
                            type="file"
                            accept=".pdf,.docx,.doc,.txt"
                            onChange={handleCompanyUpload}
                            id="company-upload"
                            hidden
                        />
                        <label htmlFor="company-upload" className="upload-btn">
                            {companyFileName || 'Upload company doc'}
                        </label>
                    </div>
                    <textarea
                        className="form-textarea"
                        placeholder="Or paste company info here... (auto-filled when fetched)"
                        value={companyBrief}
                        onChange={(e) => setCompanyBrief(e.target.value)}
                        rows={3}
                    />
                </div>

                <div className="form-section">
                    <label className="form-label">📝 Additional Notes <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px', fontWeight: 'normal' }}>(Optional)</span></label>
                    <div className="file-upload">
                        <input
                            type="file"
                            accept=".pdf,.docx,.doc,.txt"
                            onChange={handleNotesUpload}
                            id="notes-upload"
                            hidden
                        />
                        <label htmlFor="notes-upload" className="upload-btn">
                            {notesLoading ? '⏳ Parsing...' : notesFileName || 'Upload PDF / DOCX / TXT'}
                        </label>
                    </div>
                    <textarea
                        className="form-textarea"
                        placeholder="Paste any extra info here — prepared questions, key talking points, project details, things you want to highlight..."
                        value={additionalNotes}
                        onChange={(e) => setAdditionalNotes(e.target.value)}
                        rows={3}
                    />
                </div>

                <div className="action-buttons" style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <button
                        className="gap-btn"
                        onClick={handleGapAnalysis}
                        disabled={gapLoading || !resumeText || !jobDescription}
                        style={{ flex: 1, background: '#ff9800', color: 'white' }}
                    >
                        {gapLoading ? 'Analyzing...' : '🛡️ Analyze Gaps'}
                    </button>
                    <button
                        className="practice-btn"
                        onClick={() => setIsPracticeMode(true)}
                        disabled={!resumeText || !jobDescription}
                        style={{ flex: 1, background: '#9c27b0', color: 'white' }}
                    >
                        🎙️ Mock Interview
                    </button>
                    <button className="start-btn" onClick={handleStart} disabled={loading || jdLoading} style={{ flex: 2 }}>
                        🚀 Start Interview Session
                    </button>
                </div>

                <GapAnalysisReport result={gapResult} loading={gapLoading} error={gapError} />

                <div className="setup-tip">
                    Press <kbd>Ctrl+Shift+I</kbd> to toggle overlay during interview
                </div>
            </div>
        </div>
    );
};

export default SetupPanel;
