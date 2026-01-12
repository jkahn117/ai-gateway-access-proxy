import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:8787/openai",
  apiKey: "sk_15f302b2d87552519b3bbfb69bf97d3958c1e762719ab3195624c068aaec98f7",
});

const response = await client.responses.create({
  model: "gpt-5",
  input: "Talk to me about open source",
});

// const chat = await client.chat.completions.create({
//   model: "gpt-5",
//   messages: [{ role: "user", content: "What is Cloudflare?" }],
// });

// const embeddings = await client.embeddings.create({
//   model: "@cf/baai/bge-large-en-v1.5",
//   input: "I love matcha",
// });

console.log(response);
