import { Hono, Context } from "hono";
import { Bindings } from "..";

const PROVIDER_NAME = "google-ai-studio";

export const googleRouter = new Hono<{ Bindings: Bindings }>();

googleRouter.post("*", async (c: Context) => {
  const gateway = c.env.AI.gateway(c.env.AI_GATEWAY_ID);
  const baseUrl = await gateway.getUrl();

  const path = c.req.path.replace("/google", "");
  const model = c.get("model");
  const requestBody = c.get("requestBody");

  // Google AI Studio requires provider prefix in model name
  const modifiedBody = JSON.stringify({
    ...requestBody,
    model: `${PROVIDER_NAME}/${model}`,
  });

  const proxyResponse = await c.get("aiFetch")(`${baseUrl}compat${path}`, {
    method: c.req.raw.method,
    body: modifiedBody,
  });

  return proxyResponse;
});
