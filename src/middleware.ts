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
  };
  Variables: {
    aiFetch: (url: string, init?: RequestInit) => Promise<Response>;
    team: TeamInfo;
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
  forwardHeaders.set(
    "cf-aig-metadata",
    JSON.stringify({ team_id: team.teamId })
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

const logger = createMiddleware<Env>(async (c, next) => {
  // cloning so we can read again later
  const cloned = c.req.raw.clone();

  // inspect the body of the response for routing
  const body = await cloned.json();
  const model = (body as any).model;

  const team = c.get("team");

  console.log("----------------------------------");
  if (team) {
    console.log("Team", team);
  }
  console.log("Model:", model);
  console.log("Path:", c.req.path);
  console.log("----------------------------------");

  await next();
});

export { apiKey, aiFetch, logger };

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
