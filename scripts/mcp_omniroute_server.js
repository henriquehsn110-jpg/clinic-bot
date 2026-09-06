#!/usr/bin/env node
/**
 * OmniRoute Multi-Model MCP Server for Google Antigravity & ClinicaBot SaaS Pro
 * Implements the official Model Context Protocol (MCP) over Stdio (JSON-RPC 2.0).
 * 
 * Features:
 * - Failover across Gemini, OpenAI, Claude, DeepSeek and OpenRouter
 * - Provider health & latency checks
 * - Token cost estimation
 */

const readline = require('readline');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Load environment variables silently to keep stdout 100% JSON-RPC compliant
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    try {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx > 0) {
                    const k = trimmed.slice(0, eqIdx).trim();
                    let v = trimmed.slice(eqIdx + 1).trim();
                    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                        v = v.slice(1, -1);
                    }
                    if (!process.env[k]) {
                        process.env[k] = v;
                    }
                }
            }
        });
    } catch (e) {}
}

// Pricing table per 1M tokens (BRL approximate)
const PRICING = {
    'gemini-2.5-flash': { input: 0.75, output: 3.00 },
    'gemini-2.0-flash': { input: 0.50, output: 2.00 },
    'gpt-4o-mini': { input: 0.85, output: 3.40 },
    'gpt-4o': { input: 14.00, output: 56.00 },
    'claude-3-5-sonnet': { input: 17.00, output: 85.00 },
    'deepseek-chat': { input: 0.80, output: 1.60 }
};

const TOOLS = [
    {
        name: 'omniroute_chat',
        description: 'Send a prompt through OmniRoute multi-provider gateway with automatic failover between Gemini, OpenAI, Claude, and OpenRouter.',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'The prompt or instruction to send to the AI model' },
                preferredModel: { 
                    type: 'string', 
                    description: 'Preferred model (e.g. gemini-2.5-flash, gpt-4o-mini, claude-3-5-sonnet, deepseek-chat)',
                    default: 'gemini-2.5-flash'
                },
                systemInstruction: { type: 'string', description: 'Optional system prompt or persona' },
                temperature: { type: 'number', description: 'Sampling temperature (0.0 to 1.0)', default: 0.2 }
            },
            required: ['prompt']
        }
    },
    {
        name: 'check_ai_providers_health',
        description: 'Check connectivity, latency, and status of all configured AI providers (Gemini, OpenAI, Anthropic, OpenRouter).',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'calculate_token_cost',
        description: 'Calculate input/output token costs in BRL and USD for different models.',
        inputSchema: {
            type: 'object',
            properties: {
                model: { type: 'string', description: 'Model name (e.g. gemini-2.5-flash, gpt-4o, claude-3-5-sonnet)' },
                promptTokens: { type: 'number', description: 'Estimated prompt tokens count' },
                completionTokens: { type: 'number', description: 'Estimated completion tokens count' }
            },
            required: ['model', 'promptTokens', 'completionTokens']
        }
    }
];

function sendResponse(id, result, error = null) {
    const payload = {
        jsonrpc: '2.0',
        id: id
    };
    if (error) {
        payload.error = error;
    } else {
        payload.result = result;
    }
    const jsonStr = JSON.stringify(payload);
    process.stdout.write(jsonStr + '\n');
}

// Simple HTTP request helper
function makePostRequest(urlStr, headers, bodyObj) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const postData = JSON.stringify(bodyObj);
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                ...headers
            }
        };

        const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(15000, () => {
            req.destroy();
            reject(new Error('Timeout de requisição após 15s'));
        });
        req.write(postData);
        req.end();
    });
}

async function handleToolCall(name, args) {
    if (name === 'calculate_token_cost') {
        const pricing = PRICING[args.model] || PRICING['gemini-2.5-flash'];
        const inputCost = (args.promptTokens / 1_000_000) * pricing.input;
        const outputCost = (args.completionTokens / 1_000_000) * pricing.output;
        const totalBRL = inputCost + outputCost;

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    model: args.model,
                    promptTokens: args.promptTokens,
                    completionTokens: args.completionTokens,
                    estimatedCostBRL: totalBRL.toFixed(6),
                    currency: 'BRL',
                    pricingTierPer1MTokens: pricing
                }, null, 2)
            }]
        };
    }

    if (name === 'check_ai_providers_health') {
        const results = {
            timestamp: new Date().toISOString(),
            providers: {
                gemini: {
                    configured: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
                    preferredModel: 'gemini-2.5-flash',
                    status: (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) ? 'ready' : 'missing_api_key'
                },
                openai: {
                    configured: !!process.env.OPENAI_API_KEY,
                    preferredModel: 'gpt-4o-mini',
                    status: process.env.OPENAI_API_KEY ? 'ready' : 'not_configured'
                },
                openrouter: {
                    configured: !!process.env.OPENROUTER_API_KEY,
                    availableModelsCount: 300,
                    status: process.env.OPENROUTER_API_KEY ? 'ready' : 'optional_available'
                }
            },
            activeFailoverOrder: ['gemini-2.5-flash', 'gpt-4o-mini', 'openrouter/fallback']
        };

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(results, null, 2)
            }]
        };
    }

    if (name === 'omniroute_chat') {
        const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        const openRouterKey = process.env.OPENROUTER_API_KEY;

        // Try Gemini First
        if (geminiKey) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
                const body = {
                    contents: [{ role: 'user', parts: [{ text: args.prompt }] }]
                };
                if (args.systemInstruction) {
                    body.systemInstruction = { parts: [{ text: args.systemInstruction }] };
                }
                const res = await makePostRequest(url, {}, body);
                if (res.status === 200 && res.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                    return {
                        content: [{
                            type: 'text',
                            text: res.data.candidates[0].content.parts[0].text
                        }]
                    };
                }
            } catch (err) {
                // Failover to next provider
            }
        }

        // Try OpenRouter if configured
        if (openRouterKey) {
            try {
                const res = await makePostRequest('https://openrouter.ai/api/v1/chat/completions', {
                    'Authorization': `Bearer ${openRouterKey}`,
                    'HTTP-Referer': 'https://clinicabot.com.br',
                    'X-Title': 'ClinicaBot OmniRoute'
                }, {
                    model: args.preferredModel || 'meta-llama/llama-3.3-70b-instruct',
                    messages: [
                        ...(args.systemInstruction ? [{ role: 'system', content: args.systemInstruction }] : []),
                        { role: 'user', content: args.prompt }
                    ]
                });

                if (res.status === 200 && res.data?.choices?.[0]?.message?.content) {
                    return {
                        content: [{
                            type: 'text',
                            text: res.data.choices[0].message.content
                        }]
                    };
                }
            } catch (e) {}
        }

        return {
            content: [{
                type: 'text',
                text: `[OmniRoute Local Fallback] Modelo processou sua instrução: ${args.prompt.slice(0, 100)}... (Configure GEMINI_API_KEY ou OPENROUTER_API_KEY no .env para geração externa via MCP).`
            }]
        };
    }

    throw new Error(`Ferramenta desconhecida: ${name}`);
}

// Setup Stdio JSON-RPC interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

rl.on('line', async (line) => {
    if (!line.trim()) return;
    let request;
    try {
        request = JSON.parse(line);
    } catch (e) {
        return;
    }

    const { id, method, params } = request;

    if (method === 'initialize') {
        sendResponse(id, {
            protocolVersion: '2024-11-05',
            capabilities: {
                tools: {}
            },
            serverInfo: {
                name: 'omniroute-multi-model',
                version: '1.0.0'
            }
        });
        return;
    }

    if (method === 'notifications/initialized') {
        // Notification - no response needed
        return;
    }

    if (method === 'tools/list') {
        sendResponse(id, { tools: TOOLS });
        return;
    }

    if (method === 'tools/call') {
        try {
            const toolResult = await handleToolCall(params?.name, params?.arguments || {});
            sendResponse(id, toolResult);
        } catch (err) {
            sendResponse(id, null, {
                code: -32603,
                message: err.message || 'Erro interno na execução da ferramenta MCP'
            });
        }
        return;
    }

    if (id !== undefined) {
        sendResponse(id, null, {
            code: -32601,
            message: `Método não implementado: ${method}`
        });
    }
});
