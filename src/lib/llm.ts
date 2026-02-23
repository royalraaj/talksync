// LLM API client — supports OpenAI, Anthropic, Gemini, and Groq with streaming
import { fetch } from '@tauri-apps/plugin-http';

type LLMStreamCallback = (token: string, done: boolean) => void;
type LLMErrorCallback = (error: string) => void;

import { QuestionType } from './promptBuilder';

export interface LLMConfig {
    provider: 'openai' | 'anthropic' | 'gemini' | 'groq';
    apiKey: string;
    model: string;
}

export interface LLMContext {
    resume: string;
    jobDescription: string;
    companyBrief: string;
    additionalNotes?: string;
    conversationHistory: string;
    currentQuestion: string;
    previousQA?: { question: string; answer: string };
    refinementInstruction?: string;
}

const BASE_SYSTEM_PROMPT = `You are acting AS the interview candidate. You must answer in first person as if YOU are being interviewed.

VOICE & TONE:
- Sound like a real human: use natural transitions ("So what happened was...", "Honestly, the biggest win was...", "I actually ran into this at...")
- Vary your sentence length — mix short punchy lines with longer explanations
- NEVER use bullet points or numbered lists — speak in flowing paragraphs
- NEVER say "As an AI", "That's a great question", or anything that breaks character
- Use "I", "my", "we" — you ARE the candidate
- Start confidently and directly — jump into the substance immediately
- End with a concrete result, impact, or takeaway (numbers are gold)
- Reference SPECIFIC details from the resume: project names, company names, technologies, team sizes, metrics
- Use natural pauses: dashes and ellipses for breathing room
- Include occasional filler phrases naturally: "Actually", "I'd say", "Honestly", "What was interesting was"
- Use everyday language — avoid overly polished, essay-like sentences

WORD LIMITS (STRICT):
- Regular questions: 120-160 words (~45-60 seconds speaking)
- "Tell me about yourself": 180-220 words (~75-90 seconds speaking)
- Follow-up questions: 60-90 words (~25-35 seconds speaking)
- General/short questions: 40-70 words (~15-25 seconds speaking)

STRATEGIC GUIDELINES:
- **Strategic Honesty:** When asked about weaknesses, be real but always pivot to the *solution* or *improvement* you made. Never leave a negative hanging.
- **Professional Journey:** "Tell me about yourself" is NOT a life story. It is: Past Experience -> Key Skills/Wins -> Why You Are Here Now.
- **Reverse Interviewing:** If the interviewer asks "Do you have any questions?", DO NOT say "No". Ask a smart, high-impact question (see General section).

KEY PHRASE FORMATTING:
- Wrap important numbers, company names, project names, and key achievements in **bold** markers.
- Example: "We migrated **150 microservices** to **AWS EKS** and cut deployment time by **40%**"
- This helps the candidate scan the answer quickly while speaking.`;

const TYPE_INSTRUCTIONS: Record<QuestionType, string> = {
    behavioral: `QUESTION TYPE: Behavioral (past experience)
WORD LIMIT: 120-160 words.
FORMAT: Use the STAR method conversationally — weave Situation → Task → Action → Result into a natural story.
- **Situation:** Set the scene briefly (1-2 sentences).
- **Task:** What was the challenge? (Use the "PPC" method: Planning, Prioritization, Communication).
- **Action:** focus on YOUR specific contribution. Use "I", not just "We".
- **Result:** MANDATORY. Include specific numbers: team size, timeline, percentage improvement, cost saved.
- End with what you learned or how it changed your approach.`,

    technical: `QUESTION TYPE: Technical
WORD LIMIT: 120-160 words.
FORMAT: Explain step-by-step but conversationally — like you're whiteboarding with a colleague.
- Start with your high-level approach, then dive into specifics.
- Mention the actual technologies/tools from your resume that you'd use.
- Address trade-offs briefly ("I chose X over Y because...").
- If relevant, reference a past project where you solved something similar.`,

    personal: `QUESTION TYPE: Personal / Motivational
WORD LIMIT: 180-220 words for "Tell me about yourself", 120-160 words for others.
FORMAT: Be warm, authentic, and genuine — this is about who you are.
- **"Tell me about yourself":** Structure as [Past Experience] -> [Key Skills/Achievements] -> [Why This Role]. NO childhood stories.
- **"Weaknesses":** State a REAL weakness, then immediately explain the system you use to manage it (e.g. "I sometimes struggle with X, so I use tool Y to keep me on track").
- **"Why Us":** Mention specific details about the company (Mission, Vision, Recent Projects) and align them with your career goals.
- **"Why Hire You":** Align your unique skills directly to the job description. Mention a track record of results (Cost saving, Revenue generation, Efficiency).`,

    situational: `QUESTION TYPE: Situational (hypothetical)
WORD LIMIT: 120-160 words.
FORMAT: Show structured thinking while staying conversational.
- Briefly acknowledge the scenario, then outline your approach step by step.
- Draw parallels to similar real situations you've handled.
- Show decision-making: "First I'd..., then I'd assess..., and based on that..."
- End with the expected positive outcome.`,

    general: `QUESTION TYPE: General
WORD LIMIT: 40-70 words.
FORMAT: Direct and concise — get to the point fast.
- Answer the specific question without over-explaining.
- Support with one brief example if relevant.
- Keep it under 30 seconds of speaking time.

IMPORTANT - REVERSE INTERVIEW:
If the interviewer asks "Do you have any questions for me?" or "Any questions?", IGNORE the standard format and ask ONE of these high-impact questions:
1. "What would you say are the biggest challenges the team is currently facing?"
2. "What do the first 30 to 60 days look like in this role to be considered successful?"
3. "How would you describe the team dynamics and culture here?"
4. "How does this role contribute to the company's broader goals for the year?"
Select the one that feels most natural.`,
};

function buildUserMessage(context: LLMContext): string {
    let msg = '';

    if (context.resume) {
        msg += `## MY RESUME\n${context.resume}\n\n`;
    }
    if (context.jobDescription) {
        msg += `## JOB DESCRIPTION I'M INTERVIEWING FOR\n${context.jobDescription}\n\n`;
    }
    if (context.companyBrief) {
        msg += `## COMPANY INFO\n${context.companyBrief}\n\n`;
    }
    if (context.additionalNotes) {
        msg += `## ADDITIONAL NOTES & PREPARED INFORMATION\nThe candidate has provided the following extra context. Use this to enrich your answers when relevant:\n${context.additionalNotes}\n\n`;
    }
    if (context.conversationHistory) {
        msg += `## CONVERSATION SO FAR\n${context.conversationHistory}\n\n`;
    }
    if (context.previousQA) {
        msg += `## PREVIOUS Q&A (the interviewer is asking you to elaborate on THIS)\nQ: "${context.previousQA.question}"\nA: "${context.previousQA.answer}"\n\nIMPORTANT: The interviewer is following up on your previous answer above. Expand with NEW depth, additional examples, or more specifics. Do NOT repeat the same answer — build on it.\n\n`;
    }

    if (context.refinementInstruction) {
        msg += `## REFINEMENT REQUEST\n The user wants you to REWRITE the answer to the question below.\nINSTRUCTION: ${context.refinementInstruction}\n\n`;
    }

    msg += `## QUESTION ASKED\n"${context.currentQuestion}"

RESPOND IN THIS EXACT FORMAT:

[CONFIDENCE:high|medium|low]

Your opening hook — the first thing to say confidently (1-2 sentences, get straight to the point).

The core of your answer with **key numbers**, **company names**, and **project names** bolded for quick scanning. Use natural pauses — dashes and ellipses for breathing room. Keep paragraphs short (2-3 sentences max each).

Your closing impact statement — end strong with a result, metric, or forward-looking statement.

[HINTS]
- Say: "[exact ready-to-speak phrase about key achievement]"
- Say: "[specific number or metric to drop in naturally]"
- Say: "[closing line that ties back to the company/role]"

RULES FOR THE FORMAT:
- [CONFIDENCE:high] = resume + JD strongly match the question, you have specific examples
- [CONFIDENCE:medium] = partial match, you can give a plausible answer
- [CONFIDENCE:low] = the question is outside the resume scope, answer is generic
- [HINTS] section = 3 concise "Say:" ready-to-speak phrases the candidate can drop in naturally. These should be EXACT phrases they can say out loud, not abstract notes.
- Bold (**text**) key numbers, names, and achievements in the answer for quick visual scanning.
- RESPECT THE WORD LIMIT for this question type. Count your words.`;

    return msg;
}

function buildSystemPrompt(questionType: QuestionType): string {
    return `${BASE_SYSTEM_PROMPT}

${TYPE_INSTRUCTIONS[questionType]}`;
}


export async function streamAnswer(
    config: LLMConfig,
    context: LLMContext,
    questionType: QuestionType,
    onToken: LLMStreamCallback,
    onError: LLMErrorCallback,
    signal?: AbortSignal
): Promise<void> {
    const systemPrompt = buildSystemPrompt(questionType);
    const userMessage = buildUserMessage(context);

    if (config.provider === 'openai') {
        await streamOpenAI(config, systemPrompt, userMessage, onToken, onError, signal);
    } else if (config.provider === 'anthropic') {
        await streamAnthropic(config, systemPrompt, userMessage, onToken, onError, signal);
    } else if (config.provider === 'gemini') {
        await streamGemini(config, systemPrompt, userMessage, onToken, onError, signal);
    } else if (config.provider === 'groq') {
        await streamGroq(config, systemPrompt, userMessage, onToken, onError, signal);
    } else {
        onError(`Provider ${config.provider} not yet supported`);
    }
}

async function streamOpenAI(
    config: LLMConfig,
    systemPrompt: string,
    userMessage: string,
    onToken: LLMStreamCallback,
    onError: LLMErrorCallback,
    signal?: AbortSignal
): Promise<void> {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model: config.model || 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ],
                stream: true,
                temperature: 0.7,
                max_tokens: 800,
                presence_penalty: 0.1,
            }),
            signal,
        });

        if (!response.ok) {
            const errText = await response.text();
            onError(`OpenAI API error ${response.status}: ${errText}`);
            return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
            onError('No response body');
            return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                onToken('', true);
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') {
                    if (trimmed === 'data: [DONE]') {
                        onToken('', true);
                    }
                    continue;
                }
                if (trimmed.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(trimmed.slice(6));
                        const token = json.choices?.[0]?.delta?.content;
                        if (token) {
                            onToken(token, false);
                        }
                    } catch {
                        // Skip malformed JSON chunks
                    }
                }
            }
        }
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        onError(`OpenAI streaming error: ${err}`);
    }
}

async function streamAnthropic(
    config: LLMConfig,
    systemPrompt: string,
    userMessage: string,
    onToken: LLMStreamCallback,
    onError: LLMErrorCallback,
    signal?: AbortSignal
): Promise<void> {
    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model: config.model || 'claude-sonnet-4-20250514',
                system: systemPrompt,
                messages: [{ role: 'user', content: userMessage }],
                stream: true,
                max_tokens: 800,
                temperature: 0.7,
            }),
            signal,
        });

        if (!response.ok) {
            const errText = await response.text();
            onError(`Anthropic API error ${response.status}: ${errText}`);
            return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
            onError('No response body');
            return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                onToken('', true);
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                if (trimmed.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(trimmed.slice(6));
                        if (json.type === 'content_block_delta' && json.delta?.text) {
                            onToken(json.delta.text, false);
                        }
                        if (json.type === 'message_stop') {
                            onToken('', true);
                        }
                    } catch {
                        // Skip malformed chunks
                    }
                }
            }
        }
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        onError(`Anthropic streaming error: ${err}`);
    }
}

async function streamGemini(
    config: LLMConfig,
    systemPrompt: string,
    userMessage: string,
    onToken: LLMStreamCallback,
    onError: LLMErrorCallback,
    signal?: AbortSignal
): Promise<void> {
    try {
        const model = config.model || 'gemini-2.0-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${config.apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: 'user', parts: [{ text: userMessage }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 800,
                },
            }),
            signal,
        });

        if (!response.ok) {
            const errText = await response.text();
            onError(`Gemini API error ${response.status}: ${errText}`);
            return;
        }

        const reader = response.body?.getReader();
        if (!reader) { onError('No response body'); return; }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) { onToken('', true); break; }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                try {
                    const json = JSON.parse(trimmed.slice(6));
                    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) onToken(text, false);
                } catch { /* skip */ }
            }
        }
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        onError(`Gemini streaming error: ${err}`);
    }
}

// Groq uses the OpenAI-compatible API format — ultra-fast inference (~100ms first token)
async function streamGroq(
    config: LLMConfig,
    systemPrompt: string,
    userMessage: string,
    onToken: LLMStreamCallback,
    onError: LLMErrorCallback,
    signal?: AbortSignal
): Promise<void> {
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model: config.model || 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ],
                stream: true,
                temperature: 0.7,
                max_tokens: 800,
            }),
            signal,
        });

        if (!response.ok) {
            const errText = await response.text();
            onError(`Groq API error ${response.status}: ${errText}`);
            return;
        }

        const reader = response.body?.getReader();
        if (!reader) { onError('No response body'); return; }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) { onToken('', true); break; }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') {
                    if (trimmed === 'data: [DONE]') onToken('', true);
                    continue;
                }
                if (trimmed.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(trimmed.slice(6));
                        const token = json.choices?.[0]?.delta?.content;
                        if (token) onToken(token, false);
                    } catch { /* skip */ }
                }
            }
        }
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        onError(`Groq streaming error: ${err}`);
    }
}
