import { LLMConfig } from './llm';
import { fetch } from '@tauri-apps/plugin-http';

export interface GapAnalysisResult {
    matchScore: number;
    missingSkills: string[];
    predictedQuestions: string[];
}

const GAP_ANALYSIS_SYSTEM_PROMPT = `You are a strict Resume Analyzer.
Your task is to compare the candidate's Resume against the Job Description.

OUTPUT FORMAT:
You must return valid JSON only. No markdown formatting, no code blocks, no intro text.
structure:
{
  "matchScore": number (0-100),
  "missingSkills": string[] (list of 3-5 key skills/requirements in JD that are MISSING or WEAK in Resume),
  "predictedQuestions": string[] (3 hard interview questions probing these missing areas)
}

RULES:
- Be critical. If the JD requires "React" and Resume only mentions "JavaScript", that is a partial gap.
- If the JD requires "5 years experience" and Resume has 2, that is a gap.
- Questions should be specific, e.g. "I see you have experience with X, but this role requires Y. How would you bridge that gap?"`;

export async function analyzeGap(
    resume: string,
    jd: string,
    config: LLMConfig
): Promise<GapAnalysisResult> {
    const userMessage = `RESUME:\n${resume}\n\nJOB DESCRIPTION:\n${jd}`;

    try {
        let jsonStr = '';

        if (config.provider === 'openai') {
            jsonStr = await fetchOpenAI(config, userMessage);
        } else if (config.provider === 'anthropic') {
            jsonStr = await fetchAnthropic(config, userMessage);
        } else if (config.provider === 'gemini') {
            jsonStr = await fetchGemini(config, userMessage);
        } else if (config.provider === 'groq') {
            jsonStr = await fetchGroq(config, userMessage);
        } else {
            throw new Error(`Provider ${config.provider} not supported for gap analysis`);
        }

        // Clean up markdown code blocks if present
        const cleaned = jsonStr.replace(/```json\n?|\n?```/g, '').trim();
        return JSON.parse(cleaned);

    } catch (err) {
        console.error("Gap Analysis Failed:", err);
        return {
            matchScore: 0,
            missingSkills: ["Error analyzing gap", String(err)],
            predictedQuestions: []
        };
    }
}

async function fetchOpenAI(config: LLMConfig, userMsg: string): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
        body: JSON.stringify({
            model: config.model || 'gpt-4o',
            messages: [{ role: 'system', content: GAP_ANALYSIS_SYSTEM_PROMPT }, { role: 'user', content: userMsg }],
            temperature: 0.2, // Low temp for consistent JSON
            response_format: { type: "json_object" }
        })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.choices[0].message.content;
}

async function fetchAnthropic(config: LLMConfig, userMsg: string): Promise<string> {
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
            system: GAP_ANALYSIS_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userMsg }],
            max_tokens: 1000,
            temperature: 0.2
        })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.content[0].text;
}

async function fetchGemini(config: LLMConfig, userMsg: string): Promise<string> {
    const model = config.model || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: GAP_ANALYSIS_SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: userMsg }] }],
            generationConfig: { responseMimeType: "application/json" }
        })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
}

async function fetchGroq(config: LLMConfig, userMsg: string): Promise<string> {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
            model: config.model || 'llama3-70b-8192',
            messages: [{ role: 'system', content: GAP_ANALYSIS_SYSTEM_PROMPT }, { role: 'user', content: userMsg }],
            temperature: 0.2,
            response_format: { type: "json_object" }
        })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.choices[0].message.content;
}
