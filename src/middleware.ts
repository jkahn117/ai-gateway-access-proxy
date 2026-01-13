import { HonoRequest } from "hono";
import { createMiddleware } from "hono/factory";

import { TeamInfo } from ".";

type Env = {
  Bindings: {
    AI_GATEWAY_URL: string;
    AI_GATEWAY_TOKEN: string;
    AI_GATEWAY_ID: string;
    TEAM_INFO: KVNamespace;
    AI: Ai;
    // AWS credentials for Bedrock
    AWS_ACCESS_KEY_ID: string;
    AWS_SECRET_ACCESS_KEY: string;
    AWS_REGION: string;
    // Azure
    AZURE_RESOURCE_NAME: string;
  };
  Variables: {
    aiFetch: (url: string, init?: RequestInit) => Promise<Response>;
    team: TeamInfo;
    /** The original model requested by the client */
    originalModel: string;
    /** The resolved model (after any team overrides/mappings) */
    model: string;
    /** The request body with the resolved model */
    requestBody: Record<string, unknown>;
  };
};

/**
 * Middleware to verify the API key and add associated team info to context.
 */
const apiKey = createMiddleware<Env>(async (c, next) => {
  // 1. Get the API key from the request header.
  const apiKey = getApiKey(c.req);
  if (!apiKey) {
    return c.text("Unauthorized", 401);
  }

  // 2. Get the team info based on the API key
  const team = await getTeamInfo(apiKey, c.env.TEAM_INFO);
  if (!team) {
    return c.text("Unauthorized", 401);
  }

  // 3. Add the tema context to the request for use in the handler
  c.set("team", team);

  await next();
});

/**
 * Middleware to setup a fetch request to send to AI Gateway.
 */
const aiFetch = createMiddleware<Env>(async (c, next) => {
  const team = c.get("team");

  if (!team) {
    return c.text("Unauthorized", 401);
  }

  // Prepare the headers for the AI Gateway request
  const forwardHeaders = new Headers(c.req.raw.headers);

  // Set the Authorization heaer to authenticate the worker
  forwardHeaders.set("Authorization", `Bearer ${c.env.AI_GATEWAY_TOKEN}`);
  forwardHeaders.delete("host");
  forwardHeaders.set("host", "gateway.ai.cloudflare.com");

  // Add the team's id as metadata for logging and analytics
  const model = c.get("model");
  const originalModel = c.get("originalModel");
  forwardHeaders.set(
    "cf-aig-metadata",
    JSON.stringify({
      team_id: team.teamId,
      model,
      originalModel,
    })
  );

  c.set("aiFetch", (url: string, init?: RequestInit) => {
    console.log("Forwarding request to:", url);
    return fetch(url, {
      ...init,
      headers: forwardHeaders,
    });
  });

  await next();
});

/**
 * Middleware to capture the model from the request body and optionally
 * override it based on team configuration.
 *
 * This middleware:
 * 1. Parses the request body and extracts the model
 * 2. If team.limited is true, maps premium models to cheaper alternatives
 * 3. Stores both originalModel and model in context
 * 4. Stores the modified requestBody in context for routers to use
 */
const resolveModel = createMiddleware<Env>(async (c, next) => {
  const body = await c.req.json();
  const originalModel = (body as Record<string, unknown>).model as string;

  // Get the team to check for limited status
  const team = c.get("team");

  // Resolve the model based on team configuration
  let resolvedModel = originalModel;

  // TODO: Implement model override here if desired
  // if (team?.limited) {
  //   resolvedModel = "dynamic/LIMITED_MODEL";
  // }

  // Store both the original and resolved model
  c.set("originalModel", originalModel);
  c.set("model", resolvedModel);

  // Store the modified request body with the resolved model
  const modifiedBody = {
    ...(body as Record<string, unknown>),
    model: resolvedModel,
  };
  c.set("requestBody", modifiedBody);

  await next();
});

/**
 * Middleware to log request details.
 * Uses values from context set by previous middleware.
 */
const logger = createMiddleware<Env>(async (c, next) => {
  const team = c.get("team");
  const originalModel = c.get("originalModel");
  const model = c.get("model");

  console.log("----------------------------------");
  if (team) {
    console.log("Team:", team.teamId, team.name);
  }
  if (originalModel !== model) {
    console.log("Model:", originalModel, "->", model);
  } else {
    console.log("Model:", model);
  }
  console.log("Path:", c.req.path);
  console.log("----------------------------------");

  await next();
});

export { apiKey, aiFetch, resolveModel, logger };

/**
 *
 * @param reqest
 * @returns
 */
function getApiKey(reqest: HonoRequest): string | null {
  const authHeader = reqest.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  return null;
}

/**
 *
 * @param apiKey
 * @param kv
 * @returns
 */
async function getTeamInfo(
  apiKey: string,
  kv: KVNamespace
): Promise<TeamInfo | null> {
  const teamInfo = await kv.get<TeamInfo>(apiKey, "json");
  return teamInfo;
}
