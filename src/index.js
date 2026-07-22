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
const MAX_IMAGE_PROMPT_LENGTH = 4000;

/*
============================================================
STUDENTNIJA AI PROXY v9.0
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

GET  /health

DIRECT PROVIDER ENDPOINTS

POST /groq
POST /gemini
POST /github

============================================================
FRONTEND MODE ARCHITECTURE
============================================================

CHAT

Fast everyday conversation.

Primary:
Groq Llama 3.3 70B

Fallback:
Groq Llama 3.1 8B Instant


THINK

Deep reasoning mode.

Primary:
GitHub DeepSeek R1 0528

Fallbacks:
GitHub OpenAI reasoning model
GitHub Phi reasoning model
Gemini thinking
Groq Llama 3.3 70B


EXPERT

Advanced study and expert explanations.

Primary:
Gemini 2.5 Flash

Fallback:
Gemini 2.5 Flash-Lite

Final fallback:
Groq Llama 3.3 70B


VISION

Image/document understanding.

Primary:
Gemini 2.5 Flash

Fallback:
Gemini 2.5 Flash-Lite

Final fallback:
GitHub multimodal model


IMAGE GENERATION

Cloudflare Workers AI only.

Primary:
FLUX.1 Schnell

Fallback:
Environment-configured model

Final fallback:
Environment-configured model

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
   IMAGE MODEL CONFIGURATION
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
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    /*
    ========================================================
    HEALTH
    ========================================================
    */

    if (
      path === '/health' &&
      request.method === 'GET'
    ) {
      return jsonResponse({
        success: true,

        service: 'StudentNija AI Proxy',

        version: '9.0',

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
   UNIVERSAL AI ROUTER
============================================================ */

async function routeAI(
  body,
  env
) {
  const mode =
    normalizeMode(
      body.mode
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
   CHAT MODE
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
   THINK MODE
============================================================ */

async function thinkMode(
  body,
  env
) {
  const normalizedBody = {
    ...body,

    system: buildSystemPrompt(
      body.system,

      `
You are operating in StudentNija Think Mode.

Think deeply before answering.

The user interface displays a user-facing thought summary.

Provide a concise reasoning summary that explains:

1. What the user is asking.
2. What important concepts are being considered.
3. What approach is being used.
4. What should be checked before answering.

Do not reveal hidden private chain-of-thought,
private internal tokens,
or unrestricted internal reasoning.

The thought summary must be concise,
useful, and understandable to the user.

Then provide the final answer normally.
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
   EXPERT MODE
============================================================ */

async function expertMode(
  body,
  env
) {
  const normalizedBody = {
    ...body,

    system: buildSystemPrompt(
      body.system,

      `
You are operating in StudentNija Expert Mode.

Provide a high-quality expert-level response.

For academic questions:

- explain concepts clearly,
- break difficult ideas into steps,
- provide useful examples,
- compare alternatives when helpful,
- identify uncertainty,
- avoid inventing facts,
- prioritize accuracy over unnecessary length.

When appropriate, provide a concise user-facing reasoning summary.

Do not reveal hidden private chain-of-thought.

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
   VISION MODE
============================================================ */

async function visionMode(
  body,
  env
) {
  const normalizedBody = {
    ...body,

    system: buildSystemPrompt(
      body.system,

      `
You are operating in StudentNija Vision Mode.

Analyze the supplied images,
screenshots,
documents,
charts,
diagrams,
handwritten notes,
and visual content carefully.

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

Provide a concise user-facing analysis summary when useful.

Do not reveal hidden private chain-of-thought.

Then provide the final answer normally.
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
          ...result.data,

          success: true,

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
      body.messages || [],

      body.system
    );

  const payload = {
    model,

    messages,

    temperature:
      body.temperature ??
      0.7,

    max_tokens:
      body.max_tokens ??
      body.maxTokens ??
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

  return {
    success: true,

    data: {
      response: data,

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
      body.messages || [],

      body.files ||
        body.images ||
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

  const requestBody = {
    contents:
      cleanContents,
  };

  if (
    body.system
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
    ...(body.generationConfig ||
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
            body.thinkingBudget
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

  return {
    success: true,

    data: {
      response: data,

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
      body.messages || [],

      body.system
    );

  const payload = {
    model,

    messages,

    temperature:
      body.temperature ??
      0.7,

    max_tokens:
      body.max_tokens ??
      body.maxTokens ??
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

  return {
    success: true,

    data: {
      response: data,

      text:
        extractOpenAIText(
          data
        ),

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
   DIRECT GROQ ENDPOINT
============================================================ */

async function proxyGroq(
  body,

  env
) {
  const model =
    body.model ||

    'llama-3.3-70b-versatile';

  return await executeDirectProvider(
    'groq',

    model,

    body,

    env
  );
}

/* ============================================================
   DIRECT GEMINI ENDPOINT
============================================================ */

async function proxyGemini(
  body,

  env
) {
  const model =
    body.model ||

    'gemini-2.5-flash';

  return await executeDirectProvider(
    'gemini',

    model,

    body,

    env
  );
}

/* ============================================================
   DIRECT GITHUB ENDPOINT
============================================================ */

async function proxyGitHub(
  body,

  env
) {
  const model =
    body.model;

  if (
    !model
  ) {
    return errorResponse(
      'A model is required.',

      400
    );
  }

  return await executeDirectProvider(
    'github',

    model,

    body,

    env
  );
}

/* ============================================================
   DIRECT PROVIDER EXECUTION
============================================================ */

async function executeDirectProvider(
  provider,

  model,

  body,

  env
) {
  let result;

  switch (
    provider
  ) {
    case 'groq':
      result =
        await callGroqModel(
          model,

          body,

          env,

          {
            capability:
              body.mode ||
              'chat',
          }
        );

      break;

    case 'gemini':
      result =
        await callGeminiModel(
          model,

          body,

          env,

          {
            capability:
              body.mode ||
              'expert',

            thinking:
              body.thinking !==
              false,
          }
        );

      break;

    case 'github':
      result =
        await callGitHubModel(
          model,

          body,

          env,

          {
            capability:
              body.mode ||
              'thinking',

            thinking: true,
          }
        );

      break;

    default:
      throw new Error(
        'Unsupported provider.'
      );
  }

  return jsonResponse({
    ...result.data,

    success: true,

    provider,

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
    !env.AI
  ) {
    return jsonResponse(
      {
        success: false,

        error:
          'Image generation is unavailable because the Cloudflare AI binding is not configured.',
      },

      503
    );
  }

  const prompt =
    String(
      body.prompt ||
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

        ...(body.options ||
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
              'image/png',

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
   CLOUDFLARE AI TIMEOUT
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
   IMAGE RESULT NORMALIZATION
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
        'image/png',
    };
  }

  if (
    result instanceof Uint8Array
  ) {
    return {
      bytes:
        result,

      contentType:
        'image/png',
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
        'image/png',
    };
  }

  if (
    result.image instanceof Uint8Array
  ) {
    return {
      bytes:
        result.image,

      contentType:
        'image/png',
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
    result instanceof ReadableStream
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

  if (
    result.body instanceof ReadableStream
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
      body.query ||
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
    body.search_depth ===
    'advanced'
      ? 'advanced'
      : 'basic';

  const maxResults =
    Math.min(
      Math.max(
        Number(
          body.max_results
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
      data.results
    )
      ? data.results.map(
          (item) => ({
            title:
              item.title ||
              '',

            url:
              item.url ||
              '',

            content:
              item.content ||
              '',

            score:
              item.score ||
              0,

            publishedDate:
              item.published_date ||
              null,

            source:
              getHostname(
                item.url
              ),
          })
        )
      : [];

  return jsonResponse({
    success: true,

    query,

    answer:
      data.answer ||
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
      body.url ||
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
              part.text ||
              '',
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
   OPENAI/GITHUB MESSAGE NORMALIZATION
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

/*
GitHub/OpenAI multimodal message format.

This preserves images instead of deleting them.

This is important for the Vision fallback.
*/

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
              part.text ||
              '',
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
            return part.text ||
              '';
          }

          return '';
        }
      )
      .join(
        '\n'
      );
  }

  return String(
    content ||
      ''
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
        typeof part.text !==
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
        (part) =>
          typeof part ===
          'string'
            ? part
            : part?.text ||
              ''
      )
      .join(
        ''
      )
      .trim();
  }

  return '';
}

/* ============================================================
   USER-FACING THOUGHT SUMMARY
============================================================ */

function createFallbackThoughtSummary(
  body,

  options = {}
) {
  const userText =
    extractLatestUserText(
      body.messages
    );

  const mode =
    options.capability ||
    body.mode ||
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
   SYSTEM PROMPT BUILDER
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
   TEXT EXTRACTION
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
            part.text ||
            ''
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
   URL
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

    chunks.push(
      value
    );

    total +=
      value.byteLength;
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