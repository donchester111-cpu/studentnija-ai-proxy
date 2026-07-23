// ============================================================
// StudentNija AI Proxy v12.0 – Full Reasoning Support
// ============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const MAX_REQUEST_SIZE = 8 * 1024 * 1024;
const REQUEST_TIMEOUT = 60000;
const SEARCH_TIMEOUT = 20000;
const FETCH_TIMEOUT = 20000;
const IMAGE_TIMEOUT = 120000;
const MAX_TEXT_LENGTH = 30000;
const MAX_IMAGE_PROMPT_LENGTH = 2048;

const MODELS = {
  chat: [
    { provider: 'groq', model: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
    { provider: 'groq', model: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
  ],
  think: [
    { provider: 'github', model: 'DeepSeek-R1', label: 'DeepSeek R1' },
    { provider: 'github', model: 'Phi-4', label: 'Phi-4 (Reasoning)' },
    { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { provider: 'gemini', model: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
    { provider: 'groq', model: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Fallback)' },
  ],
  expert: [
    { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { provider: 'gemini', model: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
    { provider: 'groq', model: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
  ],
  vision: [
    { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash Vision' },
    { provider: 'gemini', model: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite Vision' },
    { provider: 'github', model: 'gpt-4o-mini', label: 'GPT-4o Mini Vision' },
  ],
};

function getImageModels(env) {
  return [
    env.IMAGE_MODEL_PRIMARY || '@cf/black-forest-labs/flux-1-schnell',
    env.IMAGE_MODEL_FALLBACK || '@cf/lykon/dreamshaper-8-lcm',
    env.IMAGE_MODEL_FINAL || '@cf/stabilityai/stable-diffusion-xl-base-1.0',
  ].filter(Boolean);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/health' && request.method === 'GET') {
      return jsonResponse({
        success: true,
        service: 'StudentNija AI Proxy',
        version: '12.0',
        status: 'online',
        timestamp: new Date().toISOString(),
        capabilities: {
          chat: true,
          think: true,
          expert: true,
          vision: true,
          imageGeneration: Boolean(env.AI),
          webSearch: Boolean(env.TAVILY_API_KEY),
          urlReading: true,
          fallbackRouting: true,
        },
        endpoints: ['/ai', '/chat', '/think', '/expert', '/vision', '/image', '/search', '/fetch-url', '/groq', '/gemini', '/github', '/health'],
      });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ success: false, error: 'Only POST requests are accepted.' }, 405);
    }

    let body;
    try {
      const contentLength = Number(request.headers.get('content-length') || 0);
      if (contentLength > MAX_REQUEST_SIZE) {
        return jsonResponse({ success: false, error: 'Request too large.' }, 413);
      }
      body = await request.json();
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON body.' }, 400);
    }

    try {
      switch (path) {
        case '/ai':           return await routeAI(body, env);
        case '/chat':         return await chatMode(body, env);
        case '/think':        return await thinkMode(body, env);
        case '/expert':       return await expertMode(body, env);
        case '/vision':       return await visionMode(body, env);
        case '/image':
        case '/generate-image': return await generateImage(body, env);
        case '/search':       return await webSearch(body, env);
        case '/fetch-url':    return await fetchWebPage(body);
        case '/groq':         return await proxyGroq(body, env);
        case '/gemini':       return await proxyGemini(body, env);
        case '/github':       return await proxyGitHub(body, env);
        default:              return jsonResponse({ success: false, error: 'Unknown endpoint.' }, 404);
      }
    } catch (error) {
      console.error('Unhandled error:', error);
      return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
    }
  },
};

async function routeAI(body, env) {
  const mode = normalizeMode(body?.mode);
  switch (mode) {
    case 'think':   return await thinkMode(body, env);
    case 'expert':  return await expertMode(body, env);
    case 'vision':  return await visionMode(body, env);
    default:        return await chatMode(body, env);
  }
}

async function chatMode(body, env) {
  return await executeFallbackChain(MODELS.chat, body, env, { capability: 'chat', thinking: false });
}

async function thinkMode(body, env) {
  const enhancedSystem = buildSystemPrompt(body?.system, `
You are in StudentNija Think Mode. Provide a clear, accurate, and well‑reasoned final answer.
If you need to show your reasoning, place it inside <think> tags.
Do not include the reasoning outside those tags.
`);
  const newBody = { ...body, system: enhancedSystem };
  return await executeFallbackChain(MODELS.think, newBody, env, { capability: 'thinking', thinking: true });
}

async function expertMode(body, env) {
  const enhancedSystem = buildSystemPrompt(body?.system, `
You are in StudentNija Expert Mode. Provide a deep, precise, and structured final answer.
Place any reasoning inside <think> tags.
`);
  const newBody = { ...body, system: enhancedSystem };
  return await executeFallbackChain(MODELS.expert, newBody, env, { capability: 'expert', thinking: true });
}

async function visionMode(body, env) {
  const enhancedSystem = buildSystemPrompt(body?.system, `
You are in StudentNija Vision Mode. Analyze the visual content and provide a clear final answer.
Place any reasoning inside <think> tags.
`);
  const newBody = { ...body, system: enhancedSystem };
  return await executeFallbackChain(MODELS.vision, newBody, env, { capability: 'vision', thinking: true });
}

// ============================================================
// FALLBACK ENGINE – guaranteed to return real thinking if available
// ============================================================

async function executeFallbackChain(models, body, env, options = {}) {
  const failures = [];
  const startedAt = Date.now();

  for (let i = 0; i < models.length; i++) {
    const entry = models[i];
    try {
      console.log(`[StudentNija] Trying ${entry.provider}/${entry.model}`);
      const result = await executeModel(entry, body, env, options);
      if (result && result.success) {
        const elapsed = Date.now() - startedAt;
        const rawText = normalizeText(result.data?.text);
        const { cleaned, thinking: thinkContent } = stripThinkTags(rawText);

        let thinkingObj = null;
        let thoughtSummary = null;

        if (options.thinking) {
          // REAL THINKING: from <think> tags, or from Gemini's thought parts, or from the model's own summary
          const realThought = thinkContent || result.data?.thoughtSummary || null;
          if (realThought) {
            thoughtSummary = realThought;
            // Convert to bullet list (split by newlines or periods)
            const bullets = realThought.split(/\n+/).filter(s => s.trim().length > 0);
            if (bullets.length === 0) {
              // If no newlines, split by sentences
              const sentences = realThought.match(/[^.!?]+[.!?]+/g) || [realThought];
              bullets.push(...sentences.map(s => s.trim()).filter(s => s.length > 0));
            }
            thinkingObj = {
              title: `Thought for ${formatThoughtDuration(elapsed)}`,
              bullets: bullets.slice(0, 8), // max 8 bullets
              model: entry.label || entry.model,
            };
          } else {
            // NO real thinking – use a contextual fallback (but this should rarely happen)
            const fallback = generateContextualSummary(extractLatestUserText(body?.messages), cleaned);
            thoughtSummary = fallback;
            const bullets = fallback.split('\n').filter(s => s.trim().length > 0);
            thinkingObj = {
              title: `Thought for ${formatThoughtDuration(elapsed)}`,
              bullets: bullets.slice(0, 6),
              model: entry.label || entry.model,
            };
          }
        }

        return jsonResponse({
          success: true,
          text: cleaned,
          thinking: thinkingObj,
          thoughtSummary: thoughtSummary, // always send for frontend
          provider: entry.provider,
          model: entry.model,
          modelLabel: entry.label || entry.model,
          mode: options.capability || 'chat',
          fallbackUsed: i > 0,
          fallbackPosition: i + 1,
          thoughtDuration: options.thinking ? formatThoughtDuration(elapsed) : null,
          fallbackAttempts: i,
          failures: failures.length ? failures : undefined,
        });
      }
      failures.push({ provider: entry.provider, model: entry.model, reason: 'Unsuccessful response' });
    } catch (error) {
      console.warn(`[StudentNija fallback] ${entry.provider}/${entry.model} failed:`, error?.message || error);
      failures.push({ provider: entry.provider, model: entry.model, reason: classifyFailure(error) });
    }
  }

  return jsonResponse(
    { success: false, error: 'All AI models are currently unavailable.', fallbackExhausted: true, failures },
    503
  );
}

// ============================================================
// HELPERS
// ============================================================

function stripThinkTags(text) {
  if (typeof text !== 'string') return { cleaned: text, thinking: null };
  const match = text.match(/<think>([\s\S]*?)<\/think>/);
  if (match) {
    const thinking = match[1].trim();
    const cleaned = text.replace(/<think>[\s\S]*?<\/think>/, '').trim();
    return { cleaned, thinking };
  }
  return { cleaned: text, thinking: null };
}

function generateContextualSummary(userText, assistantText) {
  const query = userText || 'the request';
  const answer = assistantText || '';
  let firstSentence = answer.split(/[.!?]/)[0]?.trim() || '';
  if (firstSentence.length > 120) firstSentence = firstSentence.slice(0, 120) + '…';
  const bullets = [
    `Understanding the request: "${query.slice(0, 80)}"`,
  ];
  if (firstSentence) {
    bullets.push(`Providing a response: "${firstSentence}"`);
  } else {
    bullets.push('Analyzing the request and preparing a structured answer.');
  }
  bullets.push('Checking the answer for accuracy and clarity before responding.');
  return bullets.join('\n');
}

// ============================================================
// MODEL EXECUTION
// ============================================================

async function executeModel(entry, body, env, options) {
  switch (entry.provider) {
    case 'groq':   return await callGroqModel(entry.model, body, env, options);
    case 'gemini': return await callGeminiModel(entry.model, body, env, options);
    case 'github': return await callGitHubModel(entry.model, body, env, options);
    default: throw new Error(`Unknown provider: ${entry.provider}`);
  }
}

// ---------- GROQ ----------
async function callGroqModel(model, body, env, options) {
  if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY missing');
  const messages = normalizeOpenAIMessages(body?.messages || [], body?.system);
  const payload = {
    model,
    messages,
    temperature: body?.temperature ?? 0.7,
    max_tokens: body?.max_tokens ?? body?.maxTokens ?? 4000,
    stream: false,
  };
  const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, REQUEST_TIMEOUT);
  if (!response.ok) throw await createProviderError(response, 'Groq');
  const data = await response.json();
  const text = extractOpenAIText(data);
  if (!text) throw new Error('Empty Groq response');
  return {
    success: true,
    data: { text, thoughtSummary: null }, // Groq doesn't support thinking
  };
}

// ---------- GEMINI (REAL THINKING ENABLED) ----------
async function callGeminiModel(model, body, env, options) {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
  const contents = convertToGeminiContents(body?.messages || [], body?.files || []);
  const requestBody = {
    contents: contents.filter(c => c && Array.isArray(c.parts) && c.parts.length),
  };
  if (body?.system) requestBody.systemInstruction = { parts: [{ text: String(body.system) }] };

  const generationConfig = {
    temperature: body?.temperature ?? 0.7,
    maxOutputTokens: 8192, // allow room for thoughts + answer
    ...(body?.generationConfig || {}),
  };

  if (options.thinking) {
    // Enable Gemini's thinking with a generous budget
    generationConfig.thinkingConfig = { thinkingBudget: 1024 };
  }

  requestBody.generationConfig = generationConfig;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  }, REQUEST_TIMEOUT);
  if (!response.ok) throw await createProviderError(response, 'Gemini');
  const data = await response.json();
  const extracted = extractGeminiResponse(data);
  if (!extracted.text) throw new Error('Empty Gemini response');
  return {
    success: true,
    data: {
      text: extracted.text,
      thoughtSummary: extracted.thoughtSummary || null,
    },
  };
}

// ---------- GITHUB ----------
async function callGitHubModel(model, body, env, options) {
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN missing');
  const messages = normalizeGitHubMessages(body?.messages || [], body?.system);
  const payload = {
    model,
    messages,
    temperature: body?.temperature ?? 0.7,
    max_tokens: body?.max_tokens ?? body?.maxTokens ?? 4000,
  };
  const endpoint = env.GITHUB_MODELS_ENDPOINT || 'https://models.inference.ai.azure.com/chat/completions';
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  }, REQUEST_TIMEOUT);
  if (!response.ok) throw await createProviderError(response, 'GitHub Models');
  const data = await response.json();
  const text = extractOpenAIText(data);
  if (!text) throw new Error('Empty GitHub response');
  return {
    success: true,
    data: { text, thoughtSummary: null }, // GitHub models may or may not return thinking; we'll rely on <think> tags
  };
}

// ============================================================
// IMAGE GENERATION
// ============================================================

async function generateImage(body, env) {
  if (!env.AI || typeof env.AI.run !== 'function') {
    return errorResponse('Image generation is unavailable – Cloudflare AI binding not configured.', 503);
  }

  const prompt = String(body?.prompt || '').trim();
  if (!prompt) return errorResponse('A prompt is required.', 400);
  if (prompt.length > MAX_IMAGE_PROMPT_LENGTH) return errorResponse('Prompt too long.', 400);

  const models = getImageModels(env);
  const failures = [];
  const startedAt = Date.now();

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      console.log(`[StudentNija Image] Trying ${model}`);
      const result = await runWorkersAIWithTimeout(env.AI, model, { prompt }, IMAGE_TIMEOUT);
      const normalized = await normalizeImageResult(result);
      if (!normalized) throw new Error('No image data returned.');
      return new Response(normalized.bytes, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': normalized.contentType || 'image/jpeg',
          'Cache-Control': 'no-store',
          'X-StudentNija-Provider': 'cloudflare-workers-ai',
          'X-StudentNija-Model': model,
          'X-StudentNija-Fallback': String(i > 0),
          'X-StudentNija-Duration': String(Date.now() - startedAt),
        },
      });
    } catch (error) {
      console.warn(`[StudentNija Image Fallback] ${model} failed:`, error?.message || error);
      failures.push({ model, reason: classifyFailure(error) });
    }
  }

  return jsonResponse(
    { success: false, error: 'Image generation failed after trying all models.', fallbackExhausted: true, failures },
    503
  );
}

async function runWorkersAIWithTimeout(ai, model, input, timeout) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Image generation timed out.')), timeout);
  });
  try {
    return await Promise.race([ai.run(model, input), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

async function normalizeImageResult(result) {
  if (!result) return null;
  if (result instanceof ArrayBuffer || result instanceof Uint8Array) {
    return { bytes: result, contentType: 'image/jpeg' };
  }
  if (typeof result.image === 'string') {
    return { bytes: base64ToArrayBuffer(result.image), contentType: 'image/jpeg' };
  }
  if (result.image instanceof ArrayBuffer || result.image instanceof Uint8Array) {
    return { bytes: result.image, contentType: 'image/jpeg' };
  }
  if (typeof result.data === 'string') {
    return { bytes: base64ToArrayBuffer(result.data), contentType: 'image/png' };
  }
  if (result.data instanceof ArrayBuffer || result.data instanceof Uint8Array) {
    return { bytes: result.data, contentType: 'image/png' };
  }
  if (result.body && typeof result.body.getReader === 'function') {
    return { bytes: await streamToArrayBuffer(result.body), contentType: 'image/png' };
  }
  if (typeof result.getReader === 'function') {
    return { bytes: await streamToArrayBuffer(result), contentType: 'image/png' };
  }
  return null;
}

// ============================================================
// WEB SEARCH & URL FETCHING (unchanged)
// ============================================================

async function webSearch(body, env) {
  if (!env.TAVILY_API_KEY) return errorResponse('Web search unavailable – Tavily API key missing.', 503);
  const query = String(body?.query || '').trim();
  if (!query) return errorResponse('Search query required.', 400);
  if (query.length > 500) return errorResponse('Query too long.', 400);

  const searchDepth = body?.search_depth === 'advanced' ? 'advanced' : 'basic';
  const maxResults = Math.min(Math.max(Number(body?.max_results) || 5, 1), 10);

  const response = await fetchWithTimeout('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: env.TAVILY_API_KEY,
      query,
      search_depth: searchDepth,
      max_results: maxResults,
      include_answer: true,
      include_raw_content: false,
      include_images: false,
    }),
  }, SEARCH_TIMEOUT);

  if (!response.ok) throw await createProviderError(response, 'Web Search');
  const data = await response.json();
  const results = Array.isArray(data?.results) ? data.results.map(item => ({
    title: String(item?.title || ''),
    url: String(item?.url || ''),
    content: String(item?.content || ''),
    score: Number(item?.score || 0),
    publishedDate: item?.published_date || null,
    source: getHostname(item?.url),
  })) : [];

  return jsonResponse({ success: true, query, answer: data?.answer || null, results });
}

async function fetchWebPage(body) {
  const targetUrl = String(body?.url || '').trim();
  if (!targetUrl) return errorResponse('URL required.', 400);
  let parsedUrl;
  try { parsedUrl = new URL(targetUrl); } catch { return errorResponse('Invalid URL.', 400); }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) return errorResponse('Only HTTP/HTTPS URLs allowed.', 400);

  const response = await fetchWithTimeout(parsedUrl.toString(), {
    method: 'GET',
    headers: {
      'User-Agent': 'StudentNijaAI/1.0 Educational Research Bot',
      Accept: 'text/html,application/xhtml+xml,text/plain,application/pdf',
    },
  }, FETCH_TIMEOUT);

  if (!response.ok) return jsonResponse({ success: false, error: 'Could not fetch URL.' }, response.status);
  const contentType = response.headers.get('content-type') || '';
  const rawText = await response.text();
  let cleanText = rawText;
  if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
    cleanText = extractReadableText(rawText);
  }
  cleanText = cleanText.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
  return jsonResponse({
    success: true,
    url: parsedUrl.toString(),
    title: extractTitle(rawText),
    contentType,
    content: cleanText,
  });
}

// ============================================================
// DIRECT PROXY ENDPOINTS
// ============================================================

async function proxyGroq(body, env) {
  const model = body?.model || 'llama-3.3-70b-versatile';
  const result = await callGroqModel(model, body, env, {});
  return jsonResponse({ success: true, text: result.data.text, provider: 'groq', model });
}

async function proxyGemini(body, env) {
  const model = body?.model || 'gemini-2.5-flash';
  const result = await callGeminiModel(model, body, env, { thinking: body?.thinking !== false });
  return jsonResponse({ success: true, text: result.data.text, thoughtSummary: result.data.thoughtSummary, provider: 'gemini', model });
}

async function proxyGitHub(body, env) {
  const model = body?.model;
  if (!model) return errorResponse('Model required.', 400);
  const result = await callGitHubModel(model, body, env, {});
  return jsonResponse({ success: true, text: result.data.text, provider: 'github', model });
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function normalizeMode(mode) {
  const m = String(mode || 'chat').toLowerCase().trim();
  if (['think', 'thinking'].includes(m)) return 'think';
  if (m === 'expert') return 'expert';
  if (m === 'vision') return 'vision';
  return 'chat';
}

function buildSystemPrompt(existing, addition) {
  return [existing ? String(existing).trim() : '', String(addition || '').trim()].filter(Boolean).join('\n\n');
}

function normalizeText(value) {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text.trim();
    if (typeof value.content === 'string') return value.content.trim();
    if (Array.isArray(value.parts)) return value.parts.map(p => typeof p === 'string' ? p : p?.text || '').join('').trim();
    return '';
  }
  return String(value).trim();
}

function formatThoughtDuration(ms) {
  if (ms < 1000) return 'less than a second';
  const sec = Math.round(ms / 1000);
  return `${sec} second${sec === 1 ? '' : 's'}`;
}

function classifyFailure(error) {
  const status = error?.status;
  if (status === 429) return 'rate_limit';
  if (status === 401 || status === 403) return 'authentication';
  if (status === 408 || status === 504) return 'timeout';
  if (status >= 500) return 'provider_unavailable';
  if (String(error?.message || '').toLowerCase().includes('timeout')) return 'timeout';
  return 'provider_error';
}

function extractLatestUserText(messages = []) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== 'user') continue;
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) return msg.content.filter(p => p?.type === 'text').map(p => String(p.text || '')).join(' ');
  }
  return '';
}

// ---------- Gemini content conversion ----------
function convertToGeminiContents(messages = [], files = []) {
  const contents = [];
  for (const msg of messages) {
    if (!msg || !msg.role) continue;
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts = [];
    if (typeof msg.content === 'string' && msg.content.trim()) parts.push({ text: msg.content });
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part?.type === 'text') parts.push({ text: String(part.text || '') });
        if (part?.type === 'image_url') {
          const inline = parseDataUrl(part.image_url?.url);
          if (inline) parts.push({ inlineData: inline });
        }
      }
    }
    if (parts.length) contents.push({ role, parts });
  }
  for (const file of files) {
    if (!file?.mimeType || !file?.data) continue;
    contents.push({ role: 'user', parts: [{ inlineData: { mimeType: file.mimeType, data: stripDataUrlPrefix(file.data) } }] });
  }
  return contents;
}

// ---------- OpenAPI message normalization ----------
function normalizeOpenAIMessages(messages = [], system) {
  const result = [];
  if (system) result.push({ role: 'system', content: String(system) });
  for (const msg of messages) {
    if (!msg?.role) continue;
    result.push({ role: msg.role, content: normalizeMessageContent(msg.content) });
  }
  return result;
}

function normalizeGitHubMessages(messages = [], system) {
  const result = [];
  if (system) result.push({ role: 'system', content: String(system) });
  for (const msg of messages) {
    if (!msg?.role) continue;
    if (typeof msg.content === 'string') { result.push({ role: msg.role, content: msg.content }); continue; }
    if (Array.isArray(msg.content)) {
      const parts = [];
      for (const part of msg.content) {
        if (part?.type === 'text') parts.push({ type: 'text', text: String(part.text || '') });
        if (part?.type === 'image_url' && part.image_url?.url) {
          parts.push({ type: 'image_url', image_url: { url: part.image_url.url } });
        }
      }
      result.push({ role: msg.role, content: parts });
    }
  }
  return result;
}

function normalizeMessageContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter(p => p?.type === 'text').map(p => String(p.text || '')).join('\n');
  return normalizeText(content);
}

// ---------- Response extraction ----------
function extractOpenAIText(data) {
  const choice = data?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map(p => typeof p === 'string' ? p : String(p?.text || '')).join('').trim();
  return '';
}

function extractGeminiResponse(data) {
  let text = '', thoughtParts = [];
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts || [];
    for (const part of parts) {
      if (typeof part?.text !== 'string') continue;
      if (part.thought === true) {
        thoughtParts.push(part.text);
      } else {
        text += part.text;
      }
    }
  }
  return {
    text: text.trim(),
    thoughtSummary: thoughtParts.join('\n\n').trim() || null,
  };
}

// ---------- HTML extraction ----------
function extractReadableText(html) {
  return html
    .replace(/<(script|style|noscript|svg|iframe|canvas|nav|footer|header|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function extractTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, ' ').trim() : null;
}

function getHostname(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function truncate(str, max) {
  const s = String(str || '');
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// ---------- Data URL helpers ----------
function parseDataUrl(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function stripDataUrlPrefix(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/^data:[^;]+;base64,/, '');
}

// ---------- Stream to ArrayBuffer ----------
async function streamToArrayBuffer(stream) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) { chunks.push(value); total += value.byteLength; }
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

// ---------- Base64 ----------
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ---------- Fetch with timeout ----------
async function fetchWithTimeout(url, options = {}, timeout = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Request timed out.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Provider error helper ----------
async function createProviderError(response, provider) {
  let message = `${provider} request failed with HTTP ${response.status}`;
  try {
    const text = await response.text();
    console.error(`${provider} raw error:`, text);
    if (text) message += `: ${text.slice(0, 1000)}`;
  } catch {}
  const error = new Error(message);
  error.status = response.status;
  return error;
}

// ---------- JSON / error responses ----------
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message, status = 500) {
  return jsonResponse({ success: false, error: message }, status);
}