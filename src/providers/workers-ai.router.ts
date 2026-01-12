import { Hono, Context } from "hono";
import { Bindings } from "..";

const PROVIDER_NAME = "workers-ai";

export const workersAiRouter = new Hono<{ Bindings: Bindings }>();

workersAiRouter.post("*", async (c: Context) => {
  const gateway = c.env.AI.gateway(c.env.AI_GATEWAY_ID);
  const baseUrl = await gateway.getUrl(PROVIDER_NAME);

  const path = c.req.path.replace(`/${PROVIDER_NAME}`, "");

  // TODO: replace with AI.run for more flexibility!
  const proxyResponse = await c.get("aiFetch")(`${baseUrl}/v1${path}`, {
    method: c.req.raw.method,
    body: c.req.raw.body,
  });

  console.log("Response status:", proxyResponse.status);
  if (!proxyResponse.ok) {
    console.log("Error: ", await proxyResponse.clone().text());
  }

  return proxyResponse;
});
