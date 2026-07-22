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

/*
============================================================
STUDENTNIJA AI PROXY v10.0
============================================================

FRONTEND ENDPOINTS

POST /ai

POST /chat
POST /think
POST /expert
POST /vision

POST /image
POST /generate-image

POST /search
POST /fetch-url

GET /health

DIRECT PROVIDER ENDPOINTS

POST /groq
POST /gemini
POST /github

============================================================
*/

/* ============================================================
   MODEL CONFIGURATION
============================================================ */

const MODELS = {
  chat: [
    {
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      label: 'Llama 3.3 70B',
    },

    {
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      label: 'Llama 3.1 8B Instant',
    },
  ],

  think: [
    {
      provider: 'github',
      model: 'deepseek/DeepSeek-R1-0528',
      label: 'DeepSeek R1 0528',
    },

    {
      provider: 'github',
      model: 'openai/o4-mini',
      label: 'OpenAI o4-mini',
    },

    {
      provider: 'github',
      model: 'openai/o3',
      label: 'OpenAI o3',
    },

    {
      provider: 'github',
      model: 'microsoft/Phi-4-reasoning',
      label: 'Phi-4 Reasoning',
    },

    {
      provider: 'github',
      model: 'microsoft/Phi-4-mini-reasoning',
      label: 'Phi-4 Mini Reasoning',
    },

    {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash Thinking',
    },

    {
      provider: 'gemini',
      model: 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash-Lite Thinking',
    },

    {
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      label: 'Llama 3.3 70B Fallback',
    },
  ],

  expert: [
    {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
    },

    {
      provider: 'gemini',
      model: 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash-Lite',
    },

    {
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      label: 'Llama 3.3 70B',
    },
  ],

  vision: [
    {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash Vision',
    },

    {
      provider: 'gemini',
      model: 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash-Lite Vision',
    },

    {
      provider: 'github',
      model: 'openai/gpt-4o-mini',
      label: 'GPT-4o Mini Vision',
    },
  ],
};

/* ============================================================
   IMAGE MODELS
============================================================ */

function getImageModels(env) {
  return [
    env.IMAGE_MODEL_PRIMARY ||
      '@cf/black-forest-labs/flux-1-schnell',

    env.IMAGE_MODEL_FALLBACK,

    env.IMAGE_MODEL_FINAL,
  ].filter(Boolean);
}

/* ============================================================
   MAIN WORKER
============================================================ */

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (
      path === '/health' &&
      request.method === 'GET'
    ) {
      return jsonResponse({
        success: true,

        service: 'StudentNija AI Proxy',

        version: '10.0',

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

        endpoints: {
          universal: '/ai',

          chat: '/chat',
          think: '/think',
          expert: '/expert',
          vision: '/vision',

          image: '/image',

          search: '/search',
          fetchUrl: '/fetch-url',
        },

        modelArchitecture: {
          chat: MODELS.chat,
          think: MODELS.think,
          expert: MODELS.expert,
          vision: MODELS.vision,
          image: getImageModels(env),
        },
      });
    }

    if (request.method !== 'POST') {
      return jsonResponse(
        {
          success: false,

          error:
            'This endpoint only accepts POST requests.',
        },

        405
      );
    }

    let body;

    try {
      const contentLength = Number(
        request.headers.get('content-length') || 0
      );

      if (
        contentLength >
        MAX_REQUEST_SIZE
      ) {
        return jsonResponse(
          {
            success: false,

            error:
              'The request is too large.',
          },

          413
        );
      }

      body = await request.json();
    } catch (error) {
      console.error(
        'JSON parsing error:',
        error
      );

      return jsonResponse(
        {
          success: false,

          error:
            'Invalid JSON request body.',
        },

        400
      );
    }

    try {
      switch (path) {
        case '/ai':
          return await routeAI(
            body,
            env
          );

        case '/chat':
          return await chatMode(
            body,
            env
          );

        case '/think':
          return await thinkMode(
            body,
            env
          );

        case '/expert':
          return await expertMode(
            body,
            env
          );

        case '/vision':
          return await visionMode(
            body,
            env
          );

        case '/image':
        case '/generate-image':
          return await generateImage(
            body,
            env
          );

        case '/search':
          return await webSearch(
            body,
            env
          );

        case '/fetch-url':
          return await fetchWebPage(
            body
          );

        case '/groq':
          return await proxyGroq(
            body,
            env
          );

        case '/gemini':
          return await proxyGemini(
            body,
            env
          );

        case '/github':
          return await proxyGitHub(
            body,
            env
          );

        default:
          return jsonResponse(
            {
              success: false,

              error:
                'Unknown endpoint.',

              availableEndpoints: [
                '/ai',
                '/chat',
                '/think',
                '/expert',
                '/vision',
                '/image',
                '/generate-image',
                '/search',
                '/fetch-url',
                '/groq',
                '/gemini',
                '/github',
                '/health',
              ],
            },

            404
          );
      }
    } catch (error) {
      console.error(
        'Unhandled StudentNija error:',
        error
      );

      return jsonResponse(
        {
          success: false,

          error:
            'StudentNija could not complete that request right now.',

          message:
            error?.message ||
            'Unknown error.',
        },

        500
      );
    }
  },
};

/* ============================================================
   UNIVERSAL ROUTER
============================================================ */

async function routeAI(
  body,
  env
) {
  const mode =
    normalizeMode(
      body?.mode
    );

  switch (mode) {
    case 'think':
      return await thinkMode(
        body,
        env
      );

    case 'expert':
      return await expertMode(
        body,
        env
      );

    case 'vision':
      return await visionMode(
        body,
        env
      );

    case 'chat':
    default:
      return await chatMode(
        body,
        env
      );
  }
}

/* ============================================================
   CHAT
============================================================ */

async function chatMode(
  body,
  env
) {
  return await executeFallbackChain(
    MODELS.chat,

    body,

    env,

    {
      capability: 'chat',

      thinking: false,
    }
  );
}

/* ============================================================
   THINK
============================================================ */

async function thinkMode(
  body,
  env
) {
  const normalizedBody = {
    ...body,

    system: buildSystemPrompt(
      body?.system,

      `
You are operating in StudentNija Think Mode.

Think carefully before answering.

Provide a concise user-facing reasoning summary.

The summary may explain:

- what the user is asking,
- the important concepts involved,
- the approach being used,
- what needs to be checked.

Do not reveal private hidden chain-of-thought,
private internal tokens,
or unrestricted internal reasoning.

After the concise summary,
provide the final answer normally.
`
    ),
  };

  return await executeFallbackChain(
    MODELS.think,

    normalizedBody,

    env,

    {
      capability: 'thinking',

      thinking: true,
    }
  );
}

/* ============================================================
   EXPERT
============================================================ */

async function expertMode(
  body,
  env
) {
  const normalizedBody = {
    ...body,

    system: buildSystemPrompt(
      body?.system,

      `
You are operating in StudentNija Expert Mode.

Provide an expert-level response.

For academic questions:

- explain concepts clearly,
- break difficult ideas into logical steps,
- provide useful examples,
- compare alternatives when helpful,
- identify uncertainty honestly,
- avoid inventing facts,
- prioritize accuracy.

Do not reveal private hidden chain-of-thought.

Provide a concise user-facing explanation of the approach when useful.

Then provide the final answer normally.
`
    ),
  };

  return await executeFallbackChain(
    MODELS.expert,

    normalizedBody,

    env,

    {
      capability: 'expert',

      thinking: true,
    }
  );
}

/* ============================================================
   VISION
============================================================ */

async function visionMode(
  body,
  env
) {
  const normalizedBody = {
    ...body,

    system: buildSystemPrompt(
      body?.system,

      `
You are operating in StudentNija Vision Mode.

Analyze supplied images,
screenshots,
documents,
charts,
diagrams,
handwritten notes,
and other visual content carefully.

You may:

- describe visible content,
- extract text,
- analyze screenshots,
- explain diagrams,
- solve mathematics,
- identify study topics,
- summarize notes,
- detect possible mistakes,
- create study questions,
- organize educational material.

Never claim to see content that is not present.

Do not reveal private hidden chain-of-thought.

Provide the final answer clearly.
`
    ),
  };

  return await executeFallbackChain(
    MODELS.vision,

    normalizedBody,

    env,

    {
      capability: 'vision',

      thinking: true,
    }
  );
}

/* ============================================================
   FALLBACK ENGINE
============================================================ */

async function executeFallbackChain(
  models,

  body,

  env,

  options = {}
) {
  const failures = [];

  const startedAt =
    Date.now();

  for (
    let index = 0;

    index < models.length;

    index++
  ) {
    const entry =
      models[index];

    try {
      console.log(
        `[StudentNija AI] Trying ${entry.provider}/${entry.model}`
      );

      const result =
        await executeModel(
          entry,

          body,

          env,

          options
        );

      if (
        result &&
        result.success
      ) {
        const elapsed =
          Date.now() -
          startedAt;

        return jsonResponse({
          success: true,

          text:
            normalizeText(
              result.data?.text
            ),

          thoughtSummary:
            normalizeText(
              result.data?.thoughtSummary
            ),

          provider:
            entry.provider,

          model:
            entry.model,

          modelLabel:
            entry.label ||
            entry.model,

          mode:
            options.capability ||
            'chat',

          fallbackUsed:
            index > 0,

          fallbackPosition:
            index + 1,

          thoughtDuration:
            options.thinking
              ? formatThoughtDuration(
                  elapsed
                )
              : null,

          fallbackAttempts:
            index,

          failures:
            failures.length
              ? failures
              : undefined,
        });
      }

      failures.push({
        provider:
          entry.provider,

        model:
          entry.model,

        reason:
          'Unsuccessful response',
      });
    } catch (error) {
      console.warn(
        `[StudentNija fallback] ${entry.provider}/${entry.model} failed:`,

        error?.message ||
          error
      );

      failures.push({
        provider:
          entry.provider,

        model:
          entry.model,

        reason:
          classifyFailure(
            error
          ),
      });
    }
  }

  return jsonResponse(
    {
      success: false,

      error:
        'StudentNija could not get an AI response right now.',

      fallbackExhausted: true,

      failures,
    },

    503
  );
}

/* ============================================================
   MODEL EXECUTION
============================================================ */

async function executeModel(
  entry,

  body,

  env,

  options
) {
  switch (
    entry.provider
  ) {
    case 'groq':
      return await callGroqModel(
        entry.model,

        body,

        env,

        options
      );

    case 'gemini':
      return await callGeminiModel(
        entry.model,

        body,

        env,

        options
      );

    case 'github':
      return await callGitHubModel(
        entry.model,

        body,

        env,

        options
      );

    default:
      throw new Error(
        `Unsupported provider: ${entry.provider}`
      );
  }
}

/* ============================================================
   GROQ
============================================================ */

async function callGroqModel(
  model,

  body,

  env,

  options = {}
) {
  if (
    !env.GROQ_API_KEY
  ) {
    throw new Error(
      'GROQ_API_KEY is not configured.'
    );
  }

  const messages =
    normalizeOpenAIMessages(
      body?.messages || [],

      body?.system
    );

  const payload = {
    model,

    messages,

    temperature:
      body?.temperature ??
      0.7,

    max_tokens:
      body?.max_tokens ??
      body?.maxTokens ??
      4000,

    stream: false,
  };

  const response =
    await fetchWithTimeout(
      'https://api.groq.com/openai/v1/chat/completions',

      {
        method: 'POST',

        headers: {
          Authorization:
            `Bearer ${env.GROQ_API_KEY}`,

          'Content-Type':
            'application/json',
        },

        body:
          JSON.stringify(
            payload
          ),
      },

      REQUEST_TIMEOUT
    );

  if (
    !response.ok
  ) {
    throw await createProviderError(
      response,

      'Groq'
    );
  }

  const data =
    await response.json();

  const text =
    extractOpenAIText(
      data
    );

  if (
    !text
  ) {
    throw new Error(
      'Groq returned an empty response.'
    );
  }

  return {
    success: true,

    data: {
      text,

      thoughtSummary:
        options.thinking
          ? createFallbackThoughtSummary(
              body,

              options
            )
          : null,
    },
  };
}

/* ============================================================
   GEMINI
============================================================ */

async function callGeminiModel(
  model,

  body,

  env,

  options = {}
) {
  if (
    !env.GEMINI_API_KEY
  ) {
    throw new Error(
      'GEMINI_API_KEY is not configured.'
    );
  }

  const contents =
    convertToGeminiContents(
      body?.messages || [],

      body?.files ||
        body?.images ||
        []
    );

  const cleanContents =
    contents.filter(
      (item) =>
        item &&
        Array.isArray(
          item.parts
        ) &&
        item.parts.length
    );

  if (
    !cleanContents.length
  ) {
    throw new Error(
      'Gemini received no valid content.'
    );
  }

  const requestBody = {
    contents:
      cleanContents,
  };

  if (
    body?.system
  ) {
    requestBody.systemInstruction =
      {
        parts: [
          {
            text:
              String(
                body.system
              ),
          },
        ],
      };
  }

  const generationConfig = {
    ...(body?.generationConfig ||
      {}),
  };

  if (
    options.thinking
  ) {
    generationConfig.thinkingConfig =
      {
        ...(generationConfig.thinkingConfig ||
          {}),

        thinkingBudget:
          Number.isInteger(
            body?.thinkingBudget
          )
            ? body.thinkingBudget
            : -1,
      };
  }

  requestBody.generationConfig =
    generationConfig;

  const endpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/' +

    `${encodeURIComponent(
      model
    )}:generateContent` +

    `?key=${encodeURIComponent(
      env.GEMINI_API_KEY
    )}`;

  const response =
    await fetchWithTimeout(
      endpoint,

      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',
        },

        body:
          JSON.stringify(
            requestBody
          ),
      },

      REQUEST_TIMEOUT
    );

  if (
    !response.ok
  ) {
    throw await createProviderError(
      response,

      'Gemini'
    );
  }

  const data =
    await response.json();

  const extracted =
    extractGeminiResponse(
      data
    );

  if (
    !extracted.text
  ) {
    throw new Error(
      'Gemini returned an empty response.'
    );
  }

  return {
    success: true,

    data: {
      text:
        extracted.text,

      thoughtSummary:
        extracted.thoughtSummary ||
        (
          options.thinking
            ? createFallbackThoughtSummary(
                body,

                options
              )
            : null
        ),
    },
  };
}

/* ============================================================
   GITHUB MODELS
============================================================ */

async function callGitHubModel(
  model,

  body,

  env,

  options = {}
) {
  if (
    !env.GITHUB_TOKEN
  ) {
    throw new Error(
      'GITHUB_TOKEN is not configured.'
    );
  }

  const messages =
    normalizeGitHubMessages(
      body?.messages || [],

      body?.system
    );

  const payload = {
    model,

    messages,

    temperature:
      body?.temperature ??
      0.7,

    max_tokens:
      body?.max_tokens ??
      body?.maxTokens ??
      4000,
  };

  const endpoint =
    env.GITHUB_MODELS_ENDPOINT ||

    'https://models.inference.ai.azure.com/chat/completions';

  const response =
    await fetchWithTimeout(
      endpoint,

      {
        method: 'POST',

        headers: {
          Authorization:
            `Bearer ${env.GITHUB_TOKEN}`,

          'Content-Type':
            'application/json',

          Accept:
            'application/json',
        },

        body:
          JSON.stringify(
            payload
          ),
      },

      REQUEST_TIMEOUT
    );

  if (
    !response.ok
  ) {
    throw await createProviderError(
      response,

      'GitHub Models'
    );
  }

  const data =
    await response.json();

  const text =
    extractOpenAIText(
      data
    );

  if (
    !text
  ) {
    throw new Error(
      'GitHub Models returned an empty response.'
    );
  }

  return {
    success: true,

    data: {
      text,

      thoughtSummary:
        options.thinking
          ? createFallbackThoughtSummary(
              body,

              options
            )
          : null,
    },
  };
}

/* ============================================================
   DIRECT GROQ
============================================================ */

async function proxyGroq(
  body,

  env
) {
  const model =
    body?.model ||

    'llama-3.3-70b-versatile';

  const result =
    await callGroqModel(
      model,

      body,

      env,

      {}
    );

  return jsonResponse({
    success: true,

    text:
      result.data.text,

    provider:
      'groq',

    model,
  });
}

/* ============================================================
   DIRECT GEMINI
============================================================ */

async function proxyGemini(
  body,

  env
) {
  const model =
    body?.model ||

    'gemini-2.5-flash';

  const result =
    await callGeminiModel(
      model,

      body,

      env,

      {
        thinking:
          body?.thinking !==
          false,
      }
    );

  return jsonResponse({
    success: true,

    text:
      result.data.text,

    thoughtSummary:
      result.data.thoughtSummary,

    provider:
      'gemini',

    model,
  });
}

/* ============================================================
   DIRECT GITHUB
============================================================ */

async function proxyGitHub(
  body,

  env
) {
  const model =
    body?.model;

  if (
    !model
  ) {
    return errorResponse(
      'A model is required.',

      400
    );
  }

  const result =
    await callGitHubModel(
      model,

      body,

      env,

      {}
    );

  return jsonResponse({
    success: true,

    text:
      result.data.text,

    provider:
      'github',

    model,
  });
}

/* ============================================================
   IMAGE GENERATION
============================================================ */

async function generateImage(
  body,

  env
) {
  if (
    !env.AI ||
    typeof env.AI.run !==
      'function'
  ) {
    return errorResponse(
      'Image generation is unavailable because the Cloudflare AI binding is not configured.',

      503
    );
  }

  const prompt =
    String(
      body?.prompt ||
        ''
    ).trim();

  if (
    !prompt
  ) {
    return errorResponse(
      'An image prompt is required.',

      400
    );
  }

  if (
    prompt.length >
    MAX_IMAGE_PROMPT_LENGTH
  ) {
    return errorResponse(
      'The image prompt is too long.',

      400
    );
  }

  const models =
    getImageModels(
      env
    );

  const failures = [];

  const startedAt =
    Date.now();

  for (
    let index = 0;

    index < models.length;

    index++
  ) {
    const model =
      models[index];

    try {
      console.log(
        `[StudentNija Image] Trying ${model}`
      );

      const input = {
        prompt,

        ...(body?.options ||
          {}),
      };

      const result =
        await runWorkersAIWithTimeout(
          env.AI,

          model,

          input,

          IMAGE_TIMEOUT
        );

      const normalized =
        await normalizeImageResult(
          result
        );

      if (
        !normalized
      ) {
        throw new Error(
          'The image model returned no image data.'
        );
      }

      return new Response(
        normalized.bytes,

        {
          status: 200,

          headers: {
            ...corsHeaders,

            'Content-Type':
              normalized.contentType ||
              'image/jpeg',

            'Cache-Control':
              'no-store',

            'X-StudentNija-Provider':
              'cloudflare-workers-ai',

            'X-StudentNija-Model':
              model,

            'X-StudentNija-Fallback':
              String(
                index > 0
              ),

            'X-StudentNija-Duration':
              String(
                Date.now() -
                  startedAt
              ),
          },
        }
      );
    } catch (error) {
      console.warn(
        `[StudentNija Image Fallback] ${model} failed:`,

        error?.message ||
          error
      );

      failures.push({
        model,

        reason:
          classifyFailure(
            error
          ),
      });
    }
  }

  return jsonResponse(
    {
      success: false,

      error:
        'StudentNija could not generate the image right now.',

      fallbackExhausted: true,

      failures,
    },

    503
  );
}

/* ============================================================
   WORKERS AI TIMEOUT
============================================================ */

async function runWorkersAIWithTimeout(
  ai,

  model,

  input,

  timeout
) {
  let timer;

  const timeoutPromise =
    new Promise(
      (_, reject) => {
        timer =
          setTimeout(
            () => {
              reject(
                new Error(
                  'Image generation timed out.'
                )
              );
            },

            timeout
          );
      }
    );

  try {
    return await Promise.race([
      ai.run(
        model,

        input
      ),

      timeoutPromise,
    ]);
  } finally {
    clearTimeout(
      timer
    );
  }
}

/* ============================================================
   IMAGE NORMALIZATION
============================================================ */

async function normalizeImageResult(
  result
) {
  if (
    !result
  ) {
    return null;
  }

  if (
    result instanceof ArrayBuffer
  ) {
    return {
      bytes:
        result,

      contentType:
        'image/jpeg',
    };
  }

  if (
    result instanceof Uint8Array
  ) {
    return {
      bytes:
        result,

      contentType:
        'image/jpeg',
    };
  }

  if (
    typeof result.image ===
    'string'
  ) {
    return {
      bytes:
        base64ToArrayBuffer(
          result.image
        ),

      contentType:
        'image/jpeg',
    };
  }

  if (
    result.image instanceof ArrayBuffer
  ) {
    return {
      bytes:
        result.image,

      contentType:
        'image/jpeg',
    };
  }

  if (
    result.image instanceof Uint8Array
  ) {
    return {
      bytes:
        result.image,

      contentType:
        'image/jpeg',
    };
  }

  if (
    typeof result.data ===
    'string'
  ) {
    return {
      bytes:
        base64ToArrayBuffer(
          result.data
        ),

      contentType:
        'image/png',
    };
  }

  if (
    result.data instanceof ArrayBuffer
  ) {
    return {
      bytes:
        result.data,

      contentType:
        'image/png',
    };
  }

  if (
    result.data instanceof Uint8Array
  ) {
    return {
      bytes:
        result.data,

      contentType:
        'image/png',
    };
  }

  if (
    result.body &&
    typeof result.body.getReader ===
      'function'
  ) {
    return {
      bytes:
        await streamToArrayBuffer(
          result.body
        ),

      contentType:
        'image/png',
    };
  }

  if (
    typeof result.getReader ===
      'function'
  ) {
    return {
      bytes:
        await streamToArrayBuffer(
          result
        ),

      contentType:
        'image/png',
    };
  }

  return null;
}

/* ============================================================
   WEB SEARCH
============================================================ */

async function webSearch(
  body,

  env
) {
  if (
    !env.TAVILY_API_KEY
  ) {
    return errorResponse(
      'Web search is unavailable.',

      503
    );
  }

  const query =
    String(
      body?.query ||
        ''
    ).trim();

  if (
    !query
  ) {
    return errorResponse(
      'A search query is required.',

      400
    );
  }

  if (
    query.length >
    500
  ) {
    return errorResponse(
      'The search query is too long.',

      400
    );
  }

  const searchDepth =
    body?.search_depth ===
    'advanced'
      ? 'advanced'
      : 'basic';

  const maxResults =
    Math.min(
      Math.max(
        Number(
          body?.max_results
        ) || 5,

        1
      ),

      10
    );

  const response =
    await fetchWithTimeout(
      'https://api.tavily.com/search',

      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',
        },

        body:
          JSON.stringify({
            api_key:
              env.TAVILY_API_KEY,

            query,

            search_depth:
              searchDepth,

            max_results:
              maxResults,

            include_answer:
              true,

            include_raw_content:
              false,

            include_images:
              false,
          }),
      },

      SEARCH_TIMEOUT
    );

  if (
    !response.ok
  ) {
    throw await createProviderError(
      response,

      'Web Search'
    );
  }

  const data =
    await response.json();

  const results =
    Array.isArray(
      data?.results
    )
      ? data.results.map(
          (item) => ({
            title:
              String(
                item?.title ||
                  ''
              ),

            url:
              String(
                item?.url ||
                  ''
              ),

            content:
              String(
                item?.content ||
                  ''
              ),

            score:
              Number(
                item?.score ||
                  0
              ),

            publishedDate:
              item?.published_date ||
              null,

            source:
              getHostname(
                item?.url
              ),
          })
        )
      : [];

  return jsonResponse({
    success: true,

    query,

    answer:
      data?.answer ||
      null,

    results,
  });
}

/* ============================================================
   URL FETCHING
============================================================ */

async function fetchWebPage(
  body
) {
  const targetUrl =
    String(
      body?.url ||
        ''
    ).trim();

  if (
    !targetUrl
  ) {
    return errorResponse(
      'A URL is required.',

      400
    );
  }

  let parsedUrl;

  try {
    parsedUrl =
      new URL(
        targetUrl
      );
  } catch {
    return errorResponse(
      'Invalid URL.',

      400
    );
  }

  if (
    ![
      'http:',
      'https:',
    ].includes(
      parsedUrl.protocol
    )
  ) {
    return errorResponse(
      'Only HTTP and HTTPS URLs are supported.',

      400
    );
  }

  const response =
    await fetchWithTimeout(
      parsedUrl.toString(),

      {
        method: 'GET',

        headers: {
          'User-Agent':
            'StudentNijaAI/1.0 Educational Research Bot',

          Accept:
            'text/html,application/xhtml+xml,text/plain,application/pdf',
        },
      },

      FETCH_TIMEOUT
    );

  if (
    !response.ok
  ) {
    return jsonResponse(
      {
        success: false,

        error:
          'The website could not be read right now.',
      },

      response.status
    );
  }

  const contentType =
    response.headers.get(
      'content-type'
    ) || '';

  const rawText =
    await response.text();

  let cleanText =
    rawText;

  if (
    contentType.includes(
      'text/html'
    ) ||
    contentType.includes(
      'application/xhtml+xml'
    )
  ) {
    cleanText =
      extractReadableText(
        rawText
      );
  }

  cleanText =
    cleanText
      .replace(
        /\s+/g,

        ' '
      )
      .trim()
      .slice(
        0,

        MAX_TEXT_LENGTH
      );

  return jsonResponse({
    success: true,

    url:
      parsedUrl.toString(),

    title:
      extractTitle(
        rawText
      ),

    contentType,

    content:
      cleanText,
  });
}

/* ============================================================
   GEMINI CONTENT CONVERSION
============================================================ */

function convertToGeminiContents(
  messages = [],

  files = []
) {
  const contents =
    [];

  for (
    const message of
      messages
  ) {
    if (
      !message ||
      !message.role
    ) {
      continue;
    }

    const role =
      message.role ===
      'assistant'
        ? 'model'
        : 'user';

    const parts =
      [];

    if (
      typeof message.content ===
      'string'
    ) {
      if (
        message.content.trim()
      ) {
        parts.push({
          text:
            message.content,
        });
      }
    }

    if (
      Array.isArray(
        message.content
      )
    ) {
      for (
        const part of
          message.content
      ) {
        if (
          part?.type ===
          'text'
        ) {
          parts.push({
            text:
              String(
                part.text ||
                  ''
              ),
          });
        }

        if (
          part?.type ===
          'image_url'
        ) {
          const imageUrl =
            part.image_url
              ?.url;

          const inlineData =
            parseDataUrl(
              imageUrl
            );

          if (
            inlineData
          ) {
            parts.push({
              inlineData,
            });
          }
        }
      }
    }

    if (
      parts.length
    ) {
      contents.push({
        role,

        parts,
      });
    }
  }

  for (
    const file of
      files
  ) {
    if (
      !file ||
      !file.mimeType ||
      !file.data
    ) {
      continue;
    }

    contents.push({
      role: 'user',

      parts: [
        {
          inlineData: {
            mimeType:
              file.mimeType,

            data:
              stripDataUrlPrefix(
                file.data
              ),
          },
        },
      ],
    });
  }

  return contents;
}

/* ============================================================
   OPENAI MESSAGE NORMALIZATION
============================================================ */

function normalizeOpenAIMessages(
  messages = [],

  system
) {
  const normalized =
    [];

  if (
    system
  ) {
    normalized.push({
      role: 'system',

      content:
        String(
          system
        ),
    });
  }

  for (
    const message of
      messages
  ) {
    if (
      !message ||
      !message.role
    ) {
      continue;
    }

    normalized.push({
      role:
        message.role,

      content:
        normalizeMessageContent(
          message.content
        ),
    });
  }

  return normalized;
}

/* ============================================================
   GITHUB MESSAGE NORMALIZATION
============================================================ */

function normalizeGitHubMessages(
  messages = [],

  system
) {
  const normalized =
    [];

  if (
    system
  ) {
    normalized.push({
      role: 'system',

      content:
        String(
          system
        ),
    });
  }

  for (
    const message of
      messages
  ) {
    if (
      !message ||
      !message.role
    ) {
      continue;
    }

    if (
      typeof message.content ===
      'string'
    ) {
      normalized.push({
        role:
          message.role,

        content:
          message.content,
      });

      continue;
    }

    if (
      Array.isArray(
        message.content
      )
    ) {
      const parts =
        [];

      for (
        const part of
          message.content
      ) {
        if (
          part?.type ===
          'text'
        ) {
          parts.push({
            type: 'text',

            text:
              String(
                part.text ||
                  ''
              ),
          });
        }

        if (
          part?.type ===
          'image_url'
        ) {
          const imageUrl =
            part.image_url
              ?.url;

          if (
            imageUrl
          ) {
            parts.push({
              type:
                'image_url',

              image_url: {
                url:
                  imageUrl,
              },
            });
          }
        }
      }

      normalized.push({
        role:
          message.role,

        content:
          parts,
      });
    }
  }

  return normalized;
}

function normalizeMessageContent(
  content
) {
  if (
    typeof content ===
    'string'
  ) {
    return content;
  }

  if (
    Array.isArray(
      content
    )
  ) {
    return content
      .map(
        (part) => {
          if (
            part?.type ===
            'text'
          ) {
            return String(
              part.text ||
                ''
            );
          }

          return '';
        }
      )
      .join(
        '\n'
      );
  }

  return normalizeText(
    content
  );
}

/* ============================================================
   GEMINI RESPONSE EXTRACTION
============================================================ */

function extractGeminiResponse(
  data
) {
  let text =
    '';

  const thoughtParts =
    [];

  const candidates =
    Array.isArray(
      data?.candidates
    )
      ? data.candidates
      : [];

  for (
    const candidate of
      candidates
  ) {
    const parts =
      candidate
        ?.content
        ?.parts ||
      [];

    for (
      const part of
        parts
    ) {
      if (
        typeof part?.text !==
        'string'
      ) {
        continue;
      }

      if (
        part.thought ===
        true
      ) {
        thoughtParts.push(
          part.text
        );
      } else {
        text +=
          part.text;
      }
    }
  }

  return {
    text:
      text.trim(),

    thoughtSummary:
      thoughtParts
        .join(
          '\n\n'
        )
        .trim() ||
      null,
  };
}

/* ============================================================
   OPENAI RESPONSE EXTRACTION
============================================================ */

function extractOpenAIText(
  data
) {
  const choice =
    data?.choices?.[0];

  const content =
    choice?.message
      ?.content;

  if (
    typeof content ===
    'string'
  ) {
    return content.trim();
  }

  if (
    Array.isArray(
      content
    )
  ) {
    return content
      .map(
        (part) => {
          if (
            typeof part ===
            'string'
          ) {
            return part;
          }

          return String(
            part?.text ||
              ''
          );
        }
      )
      .join(
        ''
      )
      .trim();
  }

  return '';
}

/* ============================================================
   THOUGHT SUMMARY
============================================================ */

function createFallbackThoughtSummary(
  body,

  options = {}
) {
  const userText =
    extractLatestUserText(
      body?.messages
    );

  const mode =
    options.capability ||
    body?.mode ||
    'chat';

  const summary =
    [];

  if (
    userText
  ) {
    summary.push(
      `Understanding the request: "${truncate(
        userText,

        220
      )}"`
    );
  }

  if (
    mode ===
    'thinking'
  ) {
    summary.push(
      'Breaking the question into its important parts and identifying the main reasoning path.'
    );

    summary.push(
      'Checking the relevant details and evaluating the best answer before responding.'
    );
  }

  if (
    mode ===
    'expert'
  ) {
    summary.push(
      'Analyzing the topic in greater depth and organizing the explanation for clarity and accuracy.'
    );
  }

  if (
    mode ===
    'vision'
  ) {
    summary.push(
      'Examining the supplied visual content and identifying the information most relevant to the request.'
    );
  }

  return summary.join(
    '\n\n'
  );
}

/* ============================================================
   SYSTEM PROMPT
============================================================ */

function buildSystemPrompt(
  existing,

  addition
) {
  return [
    existing
      ? String(
          existing
        ).trim()
      : '',

    String(
      addition ||
        ''
    ).trim(),
  ]
    .filter(Boolean)
    .join(
      '\n\n'
    );
}

/* ============================================================
   MODE NORMALIZATION
============================================================ */

function normalizeMode(
  mode
) {
  const value =
    String(
      mode ||
        'chat'
    )
      .toLowerCase()
      .trim();

  if (
    [
      'think',
      'thinking',
    ].includes(
      value
    )
  ) {
    return 'think';
  }

  if (
    value ===
    'expert'
  ) {
    return 'expert';
  }

  if (
    value ===
    'vision'
  ) {
    return 'vision';
  }

  return 'chat';
}

/* ============================================================
   LATEST USER TEXT
============================================================ */

function extractLatestUserText(
  messages = []
) {
  for (
    let i =
      messages.length -
      1;

    i >= 0;

    i--
  ) {
    const message =
      messages[i];

    if (
      message?.role !==
      'user'
    ) {
      continue;
    }

    if (
      typeof message.content ===
      'string'
    ) {
      return message.content;
    }

    if (
      Array.isArray(
        message.content
      )
    ) {
      return message.content
        .filter(
          (part) =>
            part?.type ===
            'text'
        )
        .map(
          (part) =>
            String(
              part.text ||
                ''
            )
        )
        .join(
          ' '
        );
    }
  }

  return '';
}

/* ============================================================
   HTML EXTRACTION
============================================================ */

function extractReadableText(
  html
) {
  return html
    .replace(
      /<(script|style|noscript|svg|iframe|canvas|nav|footer|header|aside)[^>]*>[\s\S]*?<\/\1>/gi,

      ' '
    )
    .replace(
      /<!--[\s\S]*?-->/g,

      ' '
    )
    .replace(
      /<[^>]+>/g,

      ' '
    )
    .replace(
      /&nbsp;/gi,

      ' '
    )
    .replace(
      /&amp;/gi,

      '&'
    )
    .replace(
      /&quot;/gi,

      '"'
    )
    .replace(
      /&#39;/gi,

      "'"
    )
    .replace(
      /&lt;/gi,

      '<'
    )
    .replace(
      /&gt;/gi,

      '>'
    );
}

function extractTitle(
  html
) {
  const match =
    String(
      html ||
        ''
    ).match(
      /<title[^>]*>([\s\S]*?)<\/title>/i
    );

  return match
    ? match[1]
        .replace(
          /\s+/g,

          ' '
        )
        .trim()
    : null;
}

/* ============================================================
   HOSTNAME
============================================================ */

function getHostname(
  url
) {
  try {
    return new URL(
      url
    ).hostname;
  } catch {
    return '';
  }
}

/* ============================================================
   STRING HELPERS
============================================================ */

function normalizeText(
  value
) {
  if (
    typeof value ===
    'string'
  ) {
    return value.trim();
  }

  if (
    value ===
    null ||
    value ===
    undefined
  ) {
    return '';
  }

  if (
    typeof value ===
    'object'
  ) {
    if (
      typeof value.text ===
      'string'
    ) {
      return value.text.trim();
    }

    if (
      typeof value.content ===
      'string'
    ) {
      return value.content.trim();
    }

    if (
      Array.isArray(
        value.parts
      )
    ) {
      return value.parts
        .map(
          (part) =>
            typeof part ===
            'string'
              ? part
              : part?.text ||
                ''
        )
        .join('')
        .trim();
    }

    return '';
  }

  return String(
    value
  ).trim();
}

function truncate(
  value,

  max
) {
  const text =
    String(
      value ||
        ''
    );

  return text.length >
    max
    ? text.slice(
        0,

        max
      ) + '…'
    : text;
}

function formatThoughtDuration(
  milliseconds
) {
  if (
    milliseconds <
    1000
  ) {
    return 'less than a second';
  }

  const seconds =
    Math.round(
      milliseconds /
        1000
    );

  return `${seconds} second${
    seconds === 1
      ? ''
      : 's'
  }`;
}

/* ============================================================
   DATA URL
============================================================ */

function parseDataUrl(
  value
) {
  if (
    typeof value !==
    'string'
  ) {
    return null;
  }

  const match =
    value.match(
      /^data:([^;]+);base64,(.+)$/s
    );

  if (
    !match
  ) {
    return null;
  }

  return {
    mimeType:
      match[1],

    data:
      match[2],
  };
}

function stripDataUrlPrefix(
  value
) {
  if (
    typeof value !==
    'string'
  ) {
    return value;
  }

  return value.replace(
    /^data:[^;]+;base64,/,

    ''
  );
}

/* ============================================================
   STREAM
============================================================ */

async function streamToArrayBuffer(
  stream
) {
  const reader =
    stream.getReader();

  const chunks =
    [];

  let total =
    0;

  while (
    true
  ) {
    const {
      done,

      value,
    } =
      await reader.read();

    if (
      done
    ) {
      break;
    }

    if (
      value
    ) {
      chunks.push(
        value
      );

      total +=
        value.byteLength;
    }
  }

  const result =
    new Uint8Array(
      total
    );

  let offset =
    0;

  for (
    const chunk of
      chunks
  ) {
    result.set(
      chunk,

      offset
    );

    offset +=
      chunk.byteLength;
  }

  return result.buffer;
}

/* ============================================================
   BASE64
============================================================ */

function base64ToArrayBuffer(
  base64
) {
  const binary =
    atob(
      base64
    );

  const bytes =
    new Uint8Array(
      binary.length
    );

  for (
    let i = 0;

    i <
    binary.length;

    i++
  ) {
    bytes[i] =
      binary.charCodeAt(
        i
      );
  }

  return bytes.buffer;
}

/* ============================================================
   TIMEOUT FETCH
============================================================ */

async function fetchWithTimeout(
  url,

  options = {},

  timeout = 30000
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),

      timeout
    );

  try {
    return await fetch(
      url,

      {
        ...options,

        signal:
          controller.signal,
      }
    );
  } catch (error) {
    if (
      error?.name ===
      'AbortError'
    ) {
      throw new Error(
        'Request timed out.'
      );
    }

    throw error;
  } finally {
    clearTimeout(
      timer
    );
  }
}

/* ============================================================
   PROVIDER ERROR
============================================================ */

async function createProviderError(
  response,

  provider
) {
  let message =
    `${provider} request failed with HTTP ${response.status}`;

  try {
    const text =
      await response.text();

    console.error(
      `${provider} raw error:`,

      text
    );

    if (
      text
    ) {
      message +=
        `: ${text.slice(
          0,

          1000
        )}`;
    }
  } catch (error) {
    console.error(
      'Could not read provider error:',

      error
    );
  }

  const error =
    new Error(
      message
    );

  error.status =
    response.status;

  return error;
}

/* ============================================================
   FAILURE CLASSIFICATION
============================================================ */

function classifyFailure(
  error
) {
  const status =
    error?.status;

  if (
    status ===
    429
  ) {
    return 'rate_limit';
  }

  if (
    status ===
      401 ||
    status ===
      403
  ) {
    return 'authentication_or_permission';
  }

  if (
    status ===
      408 ||
    status ===
      504
  ) {
    return 'timeout';
  }

  if (
    status >=
    500
  ) {
    return 'provider_unavailable';
  }

  if (
    String(
      error?.message ||
        ''
    )
      .toLowerCase()
      .includes(
        'timeout'
      )
  ) {
    return 'timeout';
  }

  return 'provider_error';
}

/* ============================================================
   JSON RESPONSE
============================================================ */

function jsonResponse(
  data,

  status = 200
) {
  return new Response(
    JSON.stringify(
      data
    ),

    {
      status,

      headers: {
        ...corsHeaders,

        'Content-Type':
          'application/json',
      },
    }
  );
}

/* ============================================================
   ERROR RESPONSE
============================================================ */

function errorResponse(
  message,

  status = 500
) {
  return jsonResponse(
    {
      success: false,

      error:
        message,
    },

    status
  );
}