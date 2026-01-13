# AI Gateway Proxy

A Cloudflare Worker that provides a unified API gateway for multiple AI providers. Teams can access OpenAI, Anthropic, Google AI Studio, AWS Bedrock, Azure OpenAI, and Cloudflare Workers AI through a single authentication mechanism, with all requests routed through Cloudflare's AI Gateway for logging, caching, and analytics.

## Features

- **Multi-provider support** - Access OpenAI, Anthropic, Google, Bedrock, Azure, and Workers AI through a single gateway
- **Team-based API keys** - Issue and manage API keys per team/organization
- **Request proxying** - Automatic routing to the correct provider via Cloudflare AI Gateway
- **Metadata tracking** - Team information attached to requests for analytics and attribution

## Getting Started

### Prerequisites

- Node.js 18+
- Cloudflare account with Workers and AI Gateway enabled
- Wrangler CLI

### Installation

```bash
npm install
```

### Local Development

Create a `.dev.vars` file with your secrets:

```bash
AI_GATEWAY_TOKEN=your_gateway_token_here
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
```

Start the development server:

```bash
npm run dev
```

### Deployment

```bash
npm run deploy
```

## API Reference

### Authentication

All provider endpoints require authentication via Bearer token:

```
Authorization: Bearer sk_your_api_key_here
```

### Token Management

#### Create a Token

Create a new API key for a team.

```bash
curl -X POST https://your-worker.dev/tokens \
  -H "Content-Type: application/json" \
  -d '{
    "teamId": "team_123",
    "name": "Acme Corp"
  }'
```

**Request Body:**

| Field | Type | Description |
|-------|------|-------------|
| `teamId` | string | Unique identifier for the team |
| `name` | string | Display name for the team |

**Response:**

```json
{
  "apiKey": "sk_15f302b2d87552519b3bbfb69bf97d3958c1e762719ab3195624c068aaec98f7",
  "teamId": "team_123",
  "name": "Acme Corp",
  "createdAt": "2025-01-09T12:00:00.000Z"
}
```

#### Get Token Info

Retrieve team information for an API key.

```bash
curl https://your-worker.dev/tokens/sk_your_api_key_here
```

#### Refresh a Token

Rotate an API key. Invalidates the old key and generates a new one while preserving team info.

```bash
curl -X POST https://your-worker.dev/tokens/sk_your_api_key_here/refresh
```

**Response:**

```json
{
  "apiKey": "sk_new_key_here",
  "teamId": "team_123",
  "name": "Acme Corp",
  "createdAt": "2025-01-09T12:00:00.000Z"
}
```

## Providers

### OpenAI

Proxy requests to OpenAI's API.

**Base path:** `/openai`

```bash
curl -X POST https://your-worker.dev/openai/v1/chat/completions \
  -H "Authorization: Bearer sk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Anthropic

Proxy requests to Anthropic's Claude API.

**Base path:** `/anthropic`

```bash
curl -X POST https://your-worker.dev/anthropic/v1/messages \
  -H "Authorization: Bearer sk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Workers AI

Proxy requests to Cloudflare's Workers AI models.

**Base path:** `/workers-ai`

```bash
curl -X POST https://your-worker.dev/workers-ai/@cf/meta/llama-3.1-8b-instruct \
  -H "Authorization: Bearer sk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Google AI Studio

Proxy requests to Google AI Studio (Gemini models).

**Base path:** `/google`

```bash
curl -X POST https://your-worker.dev/google/v1/chat/completions \
  -H "Authorization: Bearer sk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.0-flash",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Azure OpenAI

Proxy requests to Azure OpenAI Service.

**Base path:** `/azure`

```bash
curl -X POST https://your-worker.dev/azure/v1/chat/completions \
  -H "Authorization: Bearer sk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Amazon Bedrock

Proxy requests to AWS Bedrock models using an OpenAI-compatible interface. The gateway translates requests to Bedrock's Converse API and handles AWS Signature V4 signing automatically.

**Base path:** `/bedrock`

**Supported endpoints:** `/v1/chat/completions` only

```bash
curl -X POST https://your-worker.dev/bedrock/v1/chat/completions \
  -H "Authorization: Bearer sk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nova-pro",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

**Supported model aliases:**

| Alias | Bedrock Model ID |
|-------|------------------|
| `nova-pro` | `amazon.nova-pro-v1:0` |
| `nova-lite` | `amazon.nova-lite-v1:0` |
| `nova-micro` | `amazon.nova-micro-v1:0` |

You can also use full Bedrock model IDs directly (any ID containing a `.`).

## Adding New Providers

<!-- TODO: Add documentation for implementing new providers -->

## Cloudflare AI Gateway Setup

Before deploying, you need to create an AI Gateway and generate an API token with the appropriate permissions.

### 1. Create an AI Gateway

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **AI** > **AI Gateway** in the sidebar
3. Click **Create Gateway**
4. Enter a name for your gateway (this becomes your `AI_GATEWAY_ID`)
5. Click **Create**

### 2. Create an API Token

Generate a Cloudflare API token with AI Gateway permissions:

1. Go to **My Profile** > **API Tokens** (or visit https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Select **Create Custom Token**
4. Configure the token:
   - **Token name:** `AI Gateway Access` (or your preferred name)
   - **Permissions:**
     - `Account` | `AI Gateway` | `Read`
     - `Account` | `AI Gateway` | `Edit`
   - **Account Resources:**
     - `Include` | `Your Account Name`
5. Click **Continue to summary** > **Create Token**
6. Copy the token immediately (it won't be shown again)

### 3. Configure the Worker

Add the token to your environment:

**For local development**, add to `.dev.vars`:

```bash
AI_GATEWAY_TOKEN=your_cloudflare_api_token_here
```

**For production**, set the secret via Wrangler:

```bash
npx wrangler secret put AI_GATEWAY_TOKEN
```

Then update your `wrangler.jsonc` with your gateway details:

```jsonc
{
  "vars": {
    "AI_GATEWAY_URL": "https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT_ID/YOUR_GATEWAY_ID",
    "AI_GATEWAY_ID": "YOUR_GATEWAY_ID"
  }
}
```

You can find your Account ID in the Cloudflare Dashboard URL or in the **Workers & Pages** overview page.

## AWS Bedrock Setup

To use the Bedrock provider, you need AWS credentials with Bedrock access.

### 1. Create an IAM User for Bedrock

1. Log in to the [AWS Console](https://console.aws.amazon.com)
2. Navigate to **IAM** > **Users** > **Create user**
3. Enter a username (e.g., `ai-gateway-bedrock`)
4. Click **Next** and select **Attach policies directly**
5. Search for and attach the `AmazonBedrockFullAccess` policy (or create a more restrictive custom policy)
6. Click **Create user**

### 2. Generate Access Keys

1. Select the user you just created
2. Go to the **Security credentials** tab
3. Under **Access keys**, click **Create access key**
4. Select **Application running outside AWS**
5. Click **Create access key**
6. Copy both the **Access key ID** and **Secret access key**

### 3. Enable Bedrock Models

Before using Bedrock models, you must request access:

1. Navigate to **Amazon Bedrock** > **Model access** in the AWS Console
2. Click **Manage model access**
3. Select the models you want to use (e.g., Claude, Llama, Titan)
4. Click **Save changes** and wait for access to be granted

### 4. Configure the Worker

**For local development**, add to `.dev.vars`:

```bash
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
```

**For production**, set the secrets via Wrangler:

```bash
npx wrangler secret put AWS_ACCESS_KEY_ID
npx wrangler secret put AWS_SECRET_ACCESS_KEY
```

Optionally set a different region in `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "AWS_REGION": "us-west-2"
  }
}
```

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `AI_GATEWAY_URL` | Full URL to your Cloudflare AI Gateway |
| `AI_GATEWAY_ID` | Your AI Gateway identifier |
| `AI_GATEWAY_TOKEN` | Authentication token for AI Gateway (secret) |
| `AWS_REGION` | AWS region for Bedrock (default: `us-east-1`) |
| `AWS_ACCESS_KEY_ID` | AWS access key for Bedrock (secret) |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key for Bedrock (secret) |

### KV Namespaces

| Namespace | Description |
|-----------|-------------|
| `TEAM_INFO` | Stores API key to team info mappings |

## Project Structure

```
src/
├── index.ts              # Main entry point and route mounting
├── middleware.ts         # Auth, logging, and fetch middleware
├── token.router.ts       # Token CRUD operations
└── providers/
    ├── anthropic.router.ts   # Anthropic proxy
    ├── azure.router.ts       # Azure OpenAI proxy
    ├── bedrock.router.ts     # AWS Bedrock proxy
    ├── google.router.ts      # Google AI Studio proxy
    ├── openai.router.ts      # OpenAI proxy
    └── workers-ai.router.ts  # Workers AI proxy
```

## License

MIT
