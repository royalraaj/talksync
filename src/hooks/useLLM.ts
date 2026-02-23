// Hook: manages LLM answer generation with streaming
import { useState, useCallback, useRef } from 'react';
import { streamAnswer, LLMConfig, LLMContext } from '../lib/llm';
import { buildConversationHistory, ConversationEntry, classifyQuestion, QuestionType, isFollowUp as checkFollowUp } from '../lib/promptBuilder';

export type ConfidenceLevel = 'high' | 'medium' | 'low' | null;

/** Parse [CONFIDENCE:xxx] tag from the beginning of the streamed response */
function parseConfidence(text: string): { confidence: ConfidenceLevel; cleanText: string } {
    const match = text.match(/^\s*\[CONFIDENCE:(high|medium|low)\]\s*/i);
    if (match) {
        return {
            confidence: match[1].toLowerCase() as ConfidenceLevel,
            cleanText: text.slice(match[0].length),
        };
    }
    return { confidence: null, cleanText: text };
}

/** Parse [HINTS] section from the end of the response */
function parseHints(text: string): { answer: string; hints: string[] } {
    const hintsIdx = text.indexOf('[HINTS]');
    if (hintsIdx === -1) {
        return { answer: text.trim(), hints: [] };
    }
    const answerPart = text.slice(0, hintsIdx).trim();
    const hintsPart = text.slice(hintsIdx + 7).trim();
    const hints = hintsPart
        .split('\n')
        .map(line => line.replace(/^[-•*]\s*/, '').trim())
        .filter(line => line.length > 0);
    return { answer: answerPart, hints };
}

export function useLLM(config: LLMConfig | null) {
    const [rawAnswer, setRawAnswer] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confidence, setConfidence] = useState<ConfidenceLevel>(null);
    const [hints, setHints] = useState<string[]>([]);
    const [questionType, setQuestionType] = useState<QuestionType>('general');
    const [followUp, setFollowUp] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const fullTextRef = useRef('');
    const lastQARef = useRef<{ question: string; answer: string } | null>(null);

    const generateAnswer = useCallback(async (
        question: string,
        resume: string,
        jobDescription: string,
        companyBrief: string,
        conversationEntries: ConversationEntry[],
        refinementInstruction?: string,
        additionalNotes?: string,
    ) => {
        if (!config?.apiKey) {
            setError('No API key configured');
            return;
        }

        // Detect follow-up (only if not a manual refinement)
        const isFollowUpQ = !refinementInstruction && checkFollowUp(question);
        setFollowUp(isFollowUpQ);

        // Classify question type
        const qType = classifyQuestion(question);
        setQuestionType(qType);

        // Abort any previous generation
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setRawAnswer('');
        setIsGenerating(true);
        setError(null);
        setConfidence(null);
        setHints([]);
        fullTextRef.current = '';

        const context: LLMContext = {
            resume,
            jobDescription,
            companyBrief,
            additionalNotes,
            conversationHistory: buildConversationHistory(conversationEntries),
            currentQuestion: question,
            // If follow-up, inject previous Q&A so LLM can expand on it
            previousQA: isFollowUpQ && lastQARef.current ? lastQARef.current : undefined,
            refinementInstruction,
        };

        try {
            await streamAnswer(
                config,
                context,
                qType,
                (token: string, done: boolean) => {
                    if (done) {
                        setIsGenerating(false);
                        // Final parse after all tokens received
                        const { confidence: conf, cleanText } = parseConfidence(fullTextRef.current);
                        const { answer: cleanAnswer, hints: parsedHints } = parseHints(cleanText);
                        setConfidence(conf);
                        setHints(parsedHints);
                        setRawAnswer(cleanAnswer);
                        // Save this Q&A for potential follow-up (session-scoped via ref)
                        lastQARef.current = { question, answer: cleanAnswer };
                    } else {
                        fullTextRef.current += token;
                        // Live preview: strip confidence tag for display
                        const { cleanText } = parseConfidence(fullTextRef.current);
                        // Strip hints section for live display (only show answer portion)
                        const hintsIdx = cleanText.indexOf('[HINTS]');
                        const displayText = hintsIdx >= 0 ? cleanText.slice(0, hintsIdx).trim() : cleanText;
                        setRawAnswer(displayText);
                    }
                },
                (err: string) => {
                    setError(err);
                    setIsGenerating(false);
                },
                controller.signal
            );
        } catch (err) {
            console.error('streamAnswer failed:', err);
            setError(`LLM call failed: ${err}`);
            setIsGenerating(false);
        }
    }, [config]);

    const clearAnswer = useCallback(() => {
        abortRef.current?.abort();
        setRawAnswer('');
        setIsGenerating(false);
        setError(null);
        setConfidence(null);
        setHints([]);
        setQuestionType('general');
        setFollowUp(false);
        fullTextRef.current = '';
        lastQARef.current = null;
    }, []);

    return { answer: rawAnswer, isGenerating, error, confidence, hints, questionType, isFollowUp: followUp, generateAnswer, clearAnswer };
}
