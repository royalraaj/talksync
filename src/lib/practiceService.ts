import { LLMConfig } from './llm';
import { fetch } from '@tauri-apps/plugin-http';

export interface PracticeQuestion {
    id: string;
    type: 'behavioral' | 'technical' | 'situational' | 'personal';
    text: string;
    context?: string;
}

export interface FeedbackResult {
    score: number;
    strengths: string[];
    improvements: string[];
    examplePhrase: string;
}

const SYSTEM_PROMPT_QUESTION = `You are an Expert Interviewer. Generate a challenging but fair interview question based on the candidate's Resume and Job Description.
Output JSON only:
{
  "text": "The question string",
  "type": "behavioral|technical|situational",
  "context": "Brief explanation of why you asked this"
}`;

const SYSTEM_PROMPT_FEEDBACK = `You are an Interview Coach. Analyze the candidate's spoken answer.
Compare it to the Ideal Answer.
Output JSON only:
{
  "score": number (0-100),
  "strengths": ["string", "string"],
  "improvements": ["string", "string"],
  "examplePhrase": "A complete, high-quality MODEL ANSWER in the first person ('I...'). Use the STAR method if behavioral. This should be a direct script the candidate could use."
}`;

export async function generatePracticeQuestion(
    resume: string,
    jd: string,
    history: string[], // List of previous question texts
    config: LLMConfig
): Promise<PracticeQuestion> {
    const historyText = history.length > 0
        ? `\n\nPREVIOUSLY ASKED QUESTIONS (DO NOT REPEAT THESE):\n- ${history.join('\n- ')}`
        : '';

    const userMessage = `RESUME:\n${resume.slice(0, 2000)}\n\nJOB DESCRIPTION:\n${jd.slice(0, 2000)}${historyText}\n\nGenerate 1 specific, distinct interview question.`;

    try {
        const jsonStr = await callLLM(config, SYSTEM_PROMPT_QUESTION, userMessage);
        const parsed = JSON.parse(cleanJson(jsonStr));
        return {
            id: Date.now().toString(),
            ...parsed
        };
    } catch (err) {
        console.error("Failed to generate question:", err);
        return {
            id: 'error',
            type: 'behavioral',
            text: 'Tell me about a time you faced a technical challenge.',
            context: 'Fallback question due to error.'
        };
    }
}

export async function generateFeedback(
    question: string,
    userAnswer: string,
    config: LLMConfig
): Promise<FeedbackResult> {
    const userMessage = `QUESTION: "${question}"\n\nCANDIDATE ANSWER: "${userAnswer}"\n\nProvide coaching feedback.`;

    try {
        const jsonStr = await callLLM(config, SYSTEM_PROMPT_FEEDBACK, userMessage);
        return JSON.parse(cleanJson(jsonStr));
    } catch (err) {
        console.error("Failed to generate feedback:", err);
        return {
            score: 0,
            strengths: [],
            improvements: ["Error generating feedback"],
            examplePhrase: ""
        };
    }
}

async function callLLM(config: LLMConfig, systemPrompt: string, userMsg: string): Promise<string> {
    if (config.provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
            body: JSON.stringify({
                model: config.model || 'gpt-4o',
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
                temperature: 0.7,
                response_format: { type: "json_object" }
            })
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        return data.choices[0].message.content;
    }

    if (config.provider === 'groq') {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
            body: JSON.stringify({
                model: config.model || 'llama3-70b-8192',
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
                temperature: 0.7,
                response_format: { type: "json_object" }
            })
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        return data.choices[0].message.content;
    }

    if (config.provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: config.model || 'claude-3-sonnet-20240229',
                system: systemPrompt,
                messages: [{ role: 'user', content: userMsg }],
                max_tokens: 1000,
                temperature: 0.7
            })
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        return data.content[0].text;
    }

    if (config.provider === 'gemini') {
        const model = config.model || 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: 'user', parts: [{ text: userMsg }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        return data.candidates[0].content.parts[0].text;
    }

    throw new Error(`Provider ${config.provider} not supported`);
}

function cleanJson(text: string): string {
    return text.replace(/```json\n?|\n?```/g, '').trim();
}
