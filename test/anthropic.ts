import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:8787/anthropic",
  apiKey: "sk_15f302b2d87552519b3bbfb69bf97d3958c1e762719ab3195624c068aaec98f7",
});

const chat = await client.chat.completions.create({
  model: "claude-sonnet-4-5",
  messages: [{ role: "user", content: "What is Cloudflare?" }],
});

console.log(JSON.stringify(chat, null, 2));
