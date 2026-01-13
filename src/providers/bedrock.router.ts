/**
 * Bedrock Provider Router
 *
 * This router provides an OpenAI-compatible interface for AWS Bedrock models,
 * allowing clients to use the familiar OpenAI SDK/format while accessing
 * Bedrock models through Cloudflare's AI Gateway.
 *
 * ## How it works:
 *
 * 1. **Request Translation**: Accepts OpenAI chat completion format and converts
 *    it to Bedrock's Converse API format.
 *
 * 2. **AWS Signing**: Uses aws4fetch to sign requests with AWS Signature V4,
 *    which Bedrock requires for authentication.
 *
 * 3. **AI Gateway Routing**: Sends requests through Cloudflare AI Gateway
 *    (not directly to AWS) for logging, caching, and analytics. The gateway
 *    URL pattern is:
 *    `{gateway_url}/aws-bedrock/bedrock-runtime/{region}/model/{modelId}/converse`
 *
 * 4. **Dual Authentication**: Bedrock requests require both:
 *    - AWS Authorization header (Signature V4) for Bedrock
 *    - cf-aig-authorization header for AI Gateway
 *
 * 5. **Response Translation**: Converts Bedrock's Converse API response back
 *    to OpenAI chat completion format.
 *
 * ## Model Mapping:
 *
 * Clients can use friendly model aliases (e.g., "nova-micro") which are
 * resolved to full Bedrock model IDs. Full Bedrock model IDs (containing a ".")
 * are passed through directly.
 *
 * @see https://developers.cloudflare.com/ai-gateway/providers/bedrock/
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html
 */

import { Hono, Context } from "hono";
import { AwsClient } from "aws4fetch";

/**
 * Model name mappings from friendly names to Bedrock model IDs.
 * These models support the Converse API which we use for chat completions.
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html
 */
const MODEL_MAPPING: Record<string, string> = {
  // Amazon Nova models
  "nova-pro": "amazon.nova-pro-v1:0",
  "nova-lite": "amazon.nova-lite-v1:0",
  "nova-micro": "amazon.nova-micro-v1:0",
};

/**
 * Resolves a model name to a Bedrock model ID.
 * If the model already contains a dot, assume it's a full Bedrock model ID.
 * Otherwise, look up in the mapping.
 */
function resolveModelId(model: string): string | null {
  if (model.includes(".")) {
    return model;
  }
  return MODEL_MAPPING[model] || null;
}

/**
 * Converts OpenAI chat completion format to Bedrock Converse API format.
 *
 * OpenAI format:
 * ```json
 * {
 *   "model": "nova-micro,
 *   "messages": [{"role": "user", "content": "Hello"}],
 *   "max_tokens": 1024
 * }
 * ```
 *
 * Bedrock Converse format:
 * ```json
 * {
 *   "messages": [{"role": "user", "content": [{"text": "Hello"}]}],
 *   "inferenceConfig": {"maxTokens": 1024}
 * }
 * ```
 */
function convertToConverseFormat(openaiRequest: Record<string, unknown>): {
  messages: Array<{ role: string; content: Array<{ text: string }> }>;
  inferenceConfig?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
  };
} {
  const messages = openaiRequest.messages as Array<{
    role: string;
    content: string;
  }>;
  const converseMessages = messages.map((msg) => ({
    role: msg.role === "assistant" ? "assistant" : "user",
    content: [{ text: msg.content }],
  }));

  const inferenceConfig: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
  } = {};

  if (openaiRequest.max_tokens) {
    inferenceConfig.maxTokens = openaiRequest.max_tokens as number;
  }
  if (openaiRequest.temperature !== undefined) {
    inferenceConfig.temperature = openaiRequest.temperature as number;
  }
  if (openaiRequest.top_p !== undefined) {
    inferenceConfig.topP = openaiRequest.top_p as number;
  }
  if (openaiRequest.stop) {
    inferenceConfig.stopSequences = openaiRequest.stop as string[];
  }

  return {
    messages: converseMessages,
    ...(Object.keys(inferenceConfig).length > 0 && { inferenceConfig }),
  };
}

/**
 * Converts Bedrock Converse API response to OpenAI chat completion format.
 */
function convertToOpenAIFormat(
  converseResponse: {
    output?: { message?: { content?: Array<{ text: string }> } };
    usage?: { inputTokens?: number; outputTokens?: number };
  },
  model: string
): {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
} {
  const content = converseResponse.output?.message?.content?.[0]?.text || "";

  return {
    id: `chatcmpl-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: content,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: converseResponse.usage?.inputTokens || 0,
      completion_tokens: converseResponse.usage?.outputTokens || 0,
      total_tokens:
        (converseResponse.usage?.inputTokens || 0) +
        (converseResponse.usage?.outputTokens || 0),
    },
  };
}

type BedrockBindings = {
  AI_GATEWAY_URL: string;
  AI_GATEWAY_TOKEN: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
};

export const bedrockRouter = new Hono<{ Bindings: BedrockBindings }>();

/**
 * POST /v1/chat/completions
 *
 * Accepts OpenAI-compatible chat completion requests and proxies them to
 * Bedrock's Converse API via Cloudflare AI Gateway.
 */
bedrockRouter.post("/chat/completions", async (c: Context) => {
  const region = c.env.AWS_REGION || "us-east-1";

  // Get request body and model from middleware
  const requestBody = c.get("requestBody") as Record<string, unknown>;
  const model = c.get("model") as string;
  const originalModel = c.get("originalModel") as string;

  // Resolve the model name to a Bedrock model ID
  const modelId = resolveModelId(model);
  if (!modelId) {
    return c.json(
      {
        error: {
          message: `Unknown model: ${model}. Use a Bedrock model ID or one of: ${Object.keys(
            MODEL_MAPPING
          ).join(", ")}`,
          type: "invalid_request_error",
        },
      },
      400
    );
  }

  // Convert to Bedrock Converse API format
  const converseBody = convertToConverseFormat(requestBody);
  const body = JSON.stringify(converseBody);

  // Create AWS client for request signing
  const awsClient = new AwsClient({
    accessKeyId: c.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
    region: region,
    service: "bedrock",
  });

  // Sign the request against the original Bedrock URL
  // AWS Signature V4 is computed against the actual Bedrock endpoint
  const bedrockUrl = `https://bedrock-runtime.${region}.amazonaws.com/model/${modelId}/converse`;
  const signedRequest = await awsClient.sign(bedrockUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: body,
  });

  // Build the AI Gateway URL (request goes here, not directly to AWS)
  const gatewayUrl = `${c.env.AI_GATEWAY_URL}/aws-bedrock/bedrock-runtime/${region}/model/${modelId}/converse`;

  // Combine AWS signed headers with AI Gateway authentication
  // - Authorization header: AWS Signature V4 (for Bedrock)
  // - cf-aig-authorization header: Bearer token (for AI Gateway)
  const finalHeaders = new Headers(signedRequest.headers);
  finalHeaders.set("cf-aig-authorization", `Bearer ${c.env.AI_GATEWAY_TOKEN}`);

  // Send request through AI Gateway
  const response = await fetch(gatewayUrl, {
    method: "POST",
    headers: finalHeaders,
    body: body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = errorText;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.message || errorJson.Message || errorText;
    } catch {
      // Keep original text
    }

    return c.json(
      {
        error: {
          message: `Bedrock API error: ${errorMessage}`,
          type: "api_error",
        },
      },
      response.status
    );
  }

  // Convert Bedrock response to OpenAI format
  // Use originalModel so client sees what they requested
  const converseResponse = await response.json();
  const openaiResponse = convertToOpenAIFormat(converseResponse, originalModel);

  return c.json(openaiResponse);
});

/**
 * Catch-all handler for unsupported Bedrock endpoints.
 * Currently only /v1/chat/completions is implemented.
 */
bedrockRouter.all("*", async (c: Context) => {
  return c.json(
    {
      error: {
        message: `The endpoint ${c.req.path} is not supported for Bedrock. Only /chat/completions is currently available.`,
        type: "invalid_request_error",
      },
    },
    501
  );
});
