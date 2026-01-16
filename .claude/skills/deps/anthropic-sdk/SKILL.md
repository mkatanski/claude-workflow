---
name: anthropic-sdk
description: TypeScript SDK for Claude API. Use when making programmatic Claude API calls, building chat applications, or integrating Claude into TypeScript/JavaScript projects. Covers authentication, message handling, streaming, and tool use.
---

# Anthropic TypeScript SDK

TypeScript/JavaScript SDK for building applications with Claude.

## When to Use

- Making direct API calls to Claude
- Building chat applications
- Integrating Claude into web services
- Programmatic content generation
- Tool/function calling implementations

## Installation

```bash
npm install @anthropic-ai/sdk
# or
bun add @anthropic-ai/sdk
```

## Authentication

```typescript
import Anthropic from "@anthropic-ai/sdk";

// Uses ANTHROPIC_API_KEY environment variable by default
const client = new Anthropic();

// Or explicit key
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

## Basic Usage

### Simple Message

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const message = await client.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages: [
    { role: "user", content: "Hello, Claude!" }
  ],
});

console.log(message.content[0].text);
```

### Multi-turn Conversation

```typescript
const messages: Anthropic.MessageParam[] = [
  { role: "user", content: "My name is Alice." },
  { role: "assistant", content: "Hello Alice! How can I help you today?" },
  { role: "user", content: "What's my name?" },
];

const response = await client.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages,
});
```

### With System Prompt

```typescript
const response = await client.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  system: "You are a helpful assistant that responds in JSON format.",
  messages: [
    { role: "user", content: "List 3 colors" }
  ],
});
```

## Streaming

```typescript
const stream = await client.messages.stream({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages: [
    { role: "user", content: "Tell me a story" }
  ],
});

for await (const event of stream) {
  if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
    process.stdout.write(event.delta.text);
  }
}

// Get final message
const finalMessage = await stream.finalMessage();
```

## Tool Use (Function Calling)

```typescript
const tools: Anthropic.Tool[] = [
  {
    name: "get_weather",
    description: "Get the current weather in a location",
    input_schema: {
      type: "object" as const,
      properties: {
        location: {
          type: "string",
          description: "City and state, e.g. San Francisco, CA",
        },
      },
      required: ["location"],
    },
  },
];

const response = await client.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  tools,
  messages: [
    { role: "user", content: "What's the weather in Boston?" }
  ],
});

// Check for tool use
for (const block of response.content) {
  if (block.type === "tool_use") {
    console.log(`Tool: ${block.name}`);
    console.log(`Input: ${JSON.stringify(block.input)}`);
    // Call your function and return result
  }
}
```

### Tool Result

```typescript
// After getting tool_use response, send result back
const messages: Anthropic.MessageParam[] = [
  { role: "user", content: "What's the weather in Boston?" },
  {
    role: "assistant",
    content: [
      {
        type: "tool_use",
        id: "tool_use_id_from_response",
        name: "get_weather",
        input: { location: "Boston, MA" },
      },
    ],
  },
  {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "tool_use_id_from_response",
        content: "Sunny, 72°F",
      },
    ],
  },
];

const finalResponse = await client.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  tools,
  messages,
});
```

## Model Names

| Model | ID |
|-------|-----|
| Claude Sonnet 4 | `claude-sonnet-4-20250514` |
| Claude Opus 4 | `claude-opus-4-20250514` |
| Claude Haiku 3.5 | `claude-3-5-haiku-20241022` |

## Common Pitfalls

1. **Missing `max_tokens`** - Required parameter for all message requests
2. **Wrong content type** - Response content is an array; access via `message.content[0].text`
3. **Forgetting tool_use_id** - Tool results must reference the exact ID from the tool_use block
4. **Not handling stop_reason** - Check `stop_reason` to know if model finished, hit max_tokens, or wants to use a tool

## Error Handling

```typescript
import Anthropic from "@anthropic-ai/sdk";

try {
  const message = await client.messages.create({ ... });
} catch (error) {
  if (error instanceof Anthropic.APIError) {
    console.error(`API Error: ${error.status} - ${error.message}`);
  } else if (error instanceof Anthropic.RateLimitError) {
    console.error("Rate limited - implement backoff");
  } else {
    throw error;
  }
}
```

## Reference

- **Official Docs**: https://docs.anthropic.com/en/api/getting-started
- **TypeScript SDK**: https://github.com/anthropics/anthropic-sdk-typescript
- **Use context7** to get latest documentation and patterns
