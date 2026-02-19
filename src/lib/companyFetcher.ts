// Company brief auto-fetcher — uses the configured LLM to generate a company overview
import { fetch } from '@tauri-apps/plugin-http';

export interface FetchCompanyConfig {
    provider: 'openai' | 'anthropic' | 'gemini' | 'groq';
    apiKey: string;
    model: string;
}

const COMPANY_PROMPT = `You are a research assistant. Given a company name, provide a concise brief covering:

1. **What they do** — products, services, industry
2. **Company size & stage** — startup, mid-size, enterprise; employee count if known
3. **Culture & values** — work culture, mission statement
4. **Recent news** — any notable recent developments, funding, product launches
5. **Tech stack** (if tech company) — known technologies they use
6. **Interview tips** — what they typically look for in candidates

Keep it under 250 words. Be factual and specific. If unsure about something, say so rather than inventing details.`;

const ERROR_MESSAGES: Record<number, string> = {
    401: 'Invalid API key. Please check your key and try again.',
    403: 'Access denied. Your API key may not have the required permissions.',
    429: 'Rate limit exceeded. Retrying in a moment...',
    500: 'Server error from the API provider. Please try again.',
    503: 'API service temporarily unavailable. Please try again later.',
};


async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(
    fetchFn: () => Promise<Response>,
    provider: string,
    maxRetries = 3
): Promise<Response> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const response = await fetchFn();

        if (response.ok) return response;

        // Read the actual error body for diagnosis
        let errorDetail = '';
        try {
            const errorBody = await response.json();
            errorDetail = errorBody?.error?.message || errorBody?.message || JSON.stringify(errorBody).slice(0, 200);
        } catch {
            errorDetail = await response.text().catch(() => '');
        }

        console.error(`[CompanyFetcher] ${provider} error ${response.status}:`, errorDetail);

        if (response.status === 429 && attempt < maxRetries - 1) {
            const delay = (attempt + 1) * 5000; // 5s, 10s, 15s
            console.log(`[CompanyFetcher] Rate limited, retrying in ${delay / 1000}s...`);
            await sleep(delay);
            continue;
        }

        const friendlyMsg = ERROR_MESSAGES[response.status];
        lastError = new Error(friendlyMsg
            ? `${friendlyMsg}\n\nDetails: ${errorDetail}`
            : `${provider} API error ${response.status}: ${errorDetail}`
        );
    }
    throw lastError || new Error('Request failed after retries');
}

export async function fetchCompanyBrief(
    companyName: string,
    config: FetchCompanyConfig
): Promise<string> {
    if (!companyName.trim()) throw new Error('Please enter a company name');

    // Trim whitespace from API key (common copy-paste issue)
    config.apiKey = config.apiKey.trim();
    console.log(`[CompanyFetcher] Using ${config.provider}/${config.model}, key starts with: ${config.apiKey.slice(0, 8)}...`);

    const userMessage = `Company: ${companyName.trim()}\n\nGenerate a concise interview-prep brief for this company.`;

    if (config.provider === 'openai' || config.provider === 'groq') {
        return fetchViaOpenAICompatible(config, userMessage);
    } else if (config.provider === 'anthropic') {
        return fetchViaAnthropic(config, userMessage);
    } else if (config.provider === 'gemini') {
        return fetchViaGemini(config, userMessage);
    }

    throw new Error(`Provider ${config.provider} not supported`);
}

async function fetchViaOpenAICompatible(config: FetchCompanyConfig, userMessage: string): Promise<string> {
    const baseUrl = config.provider === 'groq'
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';

    const response = await fetchWithRetry(() => fetch(baseUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
            model: config.model,
            messages: [
                { role: 'system', content: COMPANY_PROMPT },
                { role: 'user', content: userMessage },
            ],
            temperature: 0.5,
            max_tokens: 600,
        }),
    }), config.provider);

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No response received';
}

async function fetchViaAnthropic(config: FetchCompanyConfig, userMessage: string): Promise<string> {
    const response = await fetchWithRetry(() => fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
            model: config.model,
            system: COMPANY_PROMPT,
            messages: [{ role: 'user', content: userMessage }],
            max_tokens: 600,
            temperature: 0.5,
        }),
    }), 'Anthropic');

    const data = await response.json();
    return data.content?.[0]?.text || 'No response received';
}

async function fetchViaGemini(config: FetchCompanyConfig, userMessage: string): Promise<string> {
    const model = config.model || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

    const response = await fetchWithRetry(() => fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: COMPANY_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: userMessage }] }],
            generationConfig: { temperature: 0.5, maxOutputTokens: 600 },
        }),
    }), 'Gemini');

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received';
}
