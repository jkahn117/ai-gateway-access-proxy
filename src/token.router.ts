/**
 * Routes for token management.
 */

import { Hono, Context } from "hono";
import { TeamInfo } from ".";

type Bindings = {
  TEAM_INFO: KVNamespace;
};

export interface CreateTokenRequest {
  teamId: string;
  name: string;
  limited?: boolean;
}

// Generate a secure random API key
function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return (
    "sk_" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

export const tokenRouter = new Hono<{ Bindings: Bindings }>();

// CREATE - Generate a new API key for a team
tokenRouter.post("/", async (c: Context) => {
  const body = await c.req.json<CreateTokenRequest>();

  if (!body.teamId) {
    return c.json({ error: "teamId is required" }, 400);
  }

  const apiKey = generateApiKey();
  const teamInfo: TeamInfo = {
    apiKey,
    teamId: body.teamId,
    createdAt: new Date().toISOString(),
    name: body.name,
    limited: body.limited || false,
  };

  await c.env.TEAM_INFO.put(apiKey, JSON.stringify(teamInfo));

  return c.json(teamInfo, 201);
});

// READ - Get team info by API key
tokenRouter.get("/:apiKey", async (c) => {
  const apiKey = c.req.param("apiKey");
  const teamInfo = await c.env.TEAM_INFO.get<TeamInfo>(apiKey, "json");

  if (!teamInfo) {
    return c.json({ error: "Token not found" }, 404);
  }

  return c.json(teamInfo);
});

// REFRESH - Invalidate old API key and create a new one
tokenRouter.post("/:apiKey/refresh", async (c) => {
  const oldApiKey = c.req.param("apiKey");
  const existing = await c.env.TEAM_INFO.get<TeamInfo>(oldApiKey, "json");

  if (!existing) {
    return c.json({ error: "Token not found" }, 404);
  }

  // Generate new API key
  const newApiKey = generateApiKey();
  const updatedTeamInfo: TeamInfo = {
    ...existing,
    apiKey: newApiKey,
  };

  // Delete old key and create new one
  await c.env.TEAM_INFO.delete(oldApiKey);
  await c.env.TEAM_INFO.put(newApiKey, JSON.stringify(updatedTeamInfo));

  return c.json(updatedTeamInfo);
});

export default tokenRouter;
