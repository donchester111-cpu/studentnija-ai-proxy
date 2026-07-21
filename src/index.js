const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const MAX_REQUEST_SIZE = 2 * 1024 * 1024;
const REQUEST_TIMEOUT = 30000;
const SEARCH_TIMEOUT = 15000;
const FETCH_TIMEOUT = 15000;

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (request.method !== 'POST') {
      return jsonResponse(
        {
          error: 'Method not allowed',
          allowed: ['POST', 'OPTIONS'],
        },
        405
      );
    }

    const url = new URL(request.url);
    const path = url.pathname;

    let body;

    try {
      const contentLength = Number(
        request.headers.get('content-length') || 0
      );

      if (contentLength > MAX_REQUEST_SIZE) {
        return jsonResponse(
          {
            error: 'Request too large',
            maxSize: '2MB',
          },
          413
        );
      }

      body = await request.json();
    } catch {
      return jsonResponse(
        {
          error: 'Invalid JSON request body',
        },
        400
      );
    }

    try {
      switch (path) {
        case '/groq':
          return await proxyGroq(body, env);

        case '/gemini':
          return await proxyGemini(body, env);

        case '/github':
          return await proxyGitHub(body, env);

        case '/search':
          return await webSearch(body, env);

        case '/fetch-url':
          return await fetchWebPage(body);

        case '/health':
          return jsonResponse({
            success: true,
            service: 'StudentNija AI Proxy',
            status: 'online',
            timestamp: new Date().toISOString(),
          });

        default:
          return jsonResponse(
            {
              error: 'Unknown endpoint',
              availableEndpoints: [
                '/groq',
                '/gemini',
                '/github',
                '/search',
                '/fetch-url',
                '/health',
              ],
            },
            404
          );
      }
    } catch (error) {
      console.error('Proxy error:', error);

      return jsonResponse(
        {
          error: 'Internal proxy error',
          message: error?.message || 'Unknown error',
        },
        500
      );
    }
  },
};

/* ============================================================
   GROQ
============================================================ */

async function proxyGroq(body, env) {
  const API_KEY = env.GROQ_API_KEY;

  if (!API_KEY) {
    return errorResponse('GROQ_API_KEY is not configured', 500);
  }

  const response = await fetchWithTimeout(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    REQUEST_TIMEOUT
  );

  return relayResponse(response);
}

/* ============================================================
   GEMINI
============================================================ */

async function proxyGemini(body, env) {
  const API_KEY = env.GEMINI_API_KEY;

  if (!API_KEY) {
    return errorResponse('GEMINI_API_KEY is not configured', 500);
  }

  const model =
    body.model || 'gemini-2.5-flash';

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent?key=${API_KEY}`;

  const cleanBody = { ...body };

  delete cleanBody.model;

  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cleanBody),
    },
    REQUEST_TIMEOUT
  );

  return relayResponse(response);
}

/* ============================================================
   GITHUB MODELS
============================================================ */

async function proxyGitHub(body, env) {
  const TOKEN = env.GITHUB_TOKEN;

  if (!TOKEN) {
    return errorResponse('GITHUB_TOKEN is not configured', 500);
  }

  const response = await fetchWithTimeout(
    'https://models.inference.ai.azure.com/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    REQUEST_TIMEOUT
  );

  return relayResponse(response);
}

/* ============================================================
   WEB SEARCH
   Tavily API
============================================================ */

async function webSearch(body, env) {
  const API_KEY = env.TAVILY_API_KEY;

  if (!API_KEY) {
    return errorResponse(
      'TAVILY_API_KEY is not configured',
      500
    );
  }

  const query = String(body.query || '').trim();

  if (!query) {
    return errorResponse(
      'Search query is required',
      400
    );
  }

  if (query.length > 500) {
    return errorResponse(
      'Search query is too long',
      400
    );
  }

  const searchDepth =
    body.search_depth === 'advanced'
      ? 'advanced'
      : 'basic';

  const maxResults = Math.min(
    Math.max(Number(body.max_results) || 5, 1),
    10
  );

  const response = await fetchWithTimeout(
    'https://api.tavily.com/search',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: API_KEY,
        query,
        search_depth: searchDepth,
        max_results: maxResults,
        include_answer: true,
        include_raw_content: false,
        include_images: false,
      }),
    },
    SEARCH_TIMEOUT
  );

  if (!response.ok) {
    return relayResponse(response);
  }

  const data = await response.json();

  const results = Array.isArray(data.results)
    ? data.results.map((item) => ({
        title: item.title || '',
        url: item.url || '',
        content: item.content || '',
        score: item.score || 0,
        publishedDate: item.published_date || null,
      }))
    : [];

  return jsonResponse({
    success: true,
    query,
    answer: data.answer || null,
    results,
  });
}

/* ============================================================
   FETCH WEBPAGE
============================================================ */

async function fetchWebPage(body) {
  const targetUrl = String(body.url || '').trim();

  if (!targetUrl) {
    return errorResponse(
      'URL is required',
      400
    );
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return errorResponse(
      'Invalid URL',
      400
    );
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return errorResponse(
      'Only HTTP and HTTPS URLs are supported',
      400
    );
  }

  const response = await fetchWithTimeout(
    parsedUrl.toString(),
    {
      method: 'GET',
      headers: {
        'User-Agent':
          'StudentNijaAI/1.0 Educational Research Bot',
        Accept:
          'text/html,application/xhtml+xml,text/plain',
      },
    },
    FETCH_TIMEOUT
  );

  if (!response.ok) {
    return jsonResponse(
      {
        success: false,
        error: `Website returned HTTP ${response.status}`,
      },
      response.status
    );
  }

  const contentType =
    response.headers.get('content-type') || '';

  const rawText = await response.text();

  let cleanText = rawText;

  if (
    contentType.includes('text/html') ||
    contentType.includes('application/xhtml+xml')
  ) {
    cleanText = extractReadableText(rawText);
  }

  cleanText = cleanText
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30000);

  return jsonResponse({
    success: true,
    url: parsedUrl.toString(),
    contentType,
    content: cleanText,
  });
}

/* ============================================================
   HTML TEXT EXTRACTION
============================================================ */

function extractReadableText(html) {
  return html
    .replace(
      /<(script|style|noscript|svg|iframe|canvas|nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi,
      ' '
    )
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

/* ============================================================
   FETCH WITH TIMEOUT
============================================================ */

async function fetchWithTimeout(
  url,
  options = {},
  timeout = 30000
) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(
        'Request timed out'
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/* ============================================================
   RESPONSE HELPERS
============================================================ */

async function relayResponse(response) {
  const data = await response.text();

  return new Response(data, {
    status: response.status,
    headers: {
      ...corsHeaders,
      'Content-Type':
        response.headers.get('Content-Type') ||
        'application/json',
    },
  });
}

function jsonResponse(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    }
  );
}

function errorResponse(message, status = 500) {
  return jsonResponse(
    {
      success: false,
      error: message,
    },
    status
  );
}
