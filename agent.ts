import OpenAI from "openai";
import { readdir } from "node:fs/promises";

// Settings: which model to talk to, and how many round trips we allow
// before giving up (protects the free request quota from endless loops).
const MODEL = "poolside/laguna-s-2.1:free";
const MAX_TURNS = 8;

// The API client. We use the OpenAI library, but point it at OpenRouter.
// Bun reads OPENROUTER_API_KEY from the .env file automatically.
const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Tool definitions: the menu we show the model. Each entry gives a name,
// a description and the arguments it takes. The model can only ASK for these;
// it cannot run anything itself.
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a text file and return its contents",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "File path" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List the entries of a directory",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Directory path" } },
        required: ["path"],
      },
    },
  },
];

// Handlers: the real code behind each tool name. When the model asks for
// "read_file", this is the function that actually touches the disk.
const handlers: Record<string, (args: any) => Promise<string>> = {
  read_file: ({ path }) => Bun.file(path).text(),
  list_dir: async ({ path }) => (await readdir(path)).join("\n"),
};

// Tool runner: finds the right handler for a requested call and runs it.
// Problems (unknown tool, broken JSON, missing file) are not crashes: they
// become text that goes back to the model, so it can see what went wrong.
async function runTool(call: { function: { name: string; arguments: string } }) {
  const handler = handlers[call.function.name];
  if (!handler) return `Error: unknown tool "${call.function.name}"`;
  try {
    return await handler(JSON.parse(call.function.arguments));
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// Log helper: shortens long tool results so the terminal stays readable.
const preview = (s: string) => (s.length > 120 ? s.slice(0, 120) + "…" : s).replaceAll("\n", "⏎");

// Read the question from the command line, or show usage and exit.
const task = process.argv.slice(2).join(" ");
if (!task) {
  console.error('Usage: bun agent.ts "your question"');
  process.exit(1);
}

// The conversation so far. It starts with just the user's question and grows
// every turn. The model has no memory, so we resend all of it each time.
const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
  { role: "user", content: task },
];

// The agent loop. Each pass: ask the model, and either print its final
// answer or run the tools it requested and go around again.
for (let turn = 1; turn <= MAX_TURNS; turn++) {
  // Ask the model, sending the whole conversation plus the tool menu.
  const response = await client.chat.completions.create({ model: MODEL, messages, tools });
  const message = response.choices[0].message;
  messages.push(message);
  console.log(`\n--- turn ${turn} (messages so far: ${messages.length}) ---`);

  // No tool requested means the model is done: print the answer and stop.
  if (!message.tool_calls?.length) {
    console.log(message.content);
    process.exit(0);
  }

  // The model asked for tools: run each one and append the result to the
  // conversation, tagged with the call's id so the model can match them up.
  for (const call of message.tool_calls) {
    if (call.type !== "function") continue;
    console.log(`→ ${call.function.name}(${call.function.arguments})`);
    const result = await runTool(call);
    console.log(`← ${preview(result)}`);
    messages.push({ role: "tool", tool_call_id: call.id, content: result });
  }
}

// If we get here, the model kept asking for tools and never gave an answer.
console.error(`\nStopped: reached MAX_TURNS (${MAX_TURNS}) without a final answer.`);
process.exit(1);
