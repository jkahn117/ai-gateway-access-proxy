import { Hono, Context } from "hono";
import { Bindings } from "..";

const PROVIDER_NAME = "azure-openai";

export const azureRouter = new Hono<{ Bindings: Bindings }>();

azureRouter.post("*", async (c: Context) => {
  const gateway = c.env.AI.gateway(c.env.AI_GATEWAY_ID);
  const baseUrl = await gateway.getUrl(PROVIDER_NAME);

  const path = c.req.path.replace(`/${PROVIDER_NAME}`, "");

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
