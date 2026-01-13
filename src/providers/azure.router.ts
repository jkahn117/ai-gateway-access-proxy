import { Hono, Context } from "hono";

const PROVIDER_NAME = "azure-openai";

type AzureBindings = {
  AI_GATEWAY_URL: string;
  AI_GATEWAY_TOKEN: string;
  AZURE_RESOURCE_NAME: string;
};

export const azureRouter = new Hono<{ Bindings: AzureBindings }>();

azureRouter.post("*", async (c: Context) => {
  const gateway = c.env.AI.gateway(c.env.AI_GATEWAY_ID);
  const baseUrl = await gateway.getUrl(PROVIDER_NAME);

  const path = c.req.path.replace("/azure/", "");

  const model = c.get("model");
  const requestBody = c.get("requestBody");

  const proxyResponse = await c.get("aiFetch")(
    `${baseUrl}/${c.env.AZURE_RESOURCE_NAME}/${model}/${path}?api-version=2024-12-01-preview`,
    {
      method: c.req.raw.method,
      body: JSON.stringify(requestBody),
    }
  );

  return proxyResponse;
});
