import { Hono, Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { except } from "hono/combine";
import { apiKey, aiFetch, logger } from "./middleware";

import { tokenRouter } from "./token.router";
import { openaiRouter } from "./providers/openai.router";
import { anthropicRouter } from "./providers/anthropic";
import { workersAiRouter } from "./providers/workers-ai.router";

export interface TeamInfo {
  apiKey: string;
  teamId: string;
  name: string;
  createdAt: string;
}

export type Bindings = {
  AI_GATEWAY_ID: string;
  AI: Ai;
};

const app = new Hono<{ Bindings: Bindings }>();
app.use("*", except(["/tokens"]), apiKey);
app.use("*", except(["/tokens"]), logger);
app.use("*", except(["/tokens"]), aiFetch);
app.route("/tokens", tokenRouter);

// provider routes
app.route("/openai", openaiRouter);
app.route("/anthropic", anthropicRouter);
app.route("/workers-ai", workersAiRouter);

// global error handler
app.onError((error, c) => {
  console.error("Unhandled error:", error);
  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status);
  }
  return c.json({ error: "Internal Server Error" }, 500);
});

export default app;
