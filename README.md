# tiny-agent

A tiny AI agent written from scratch in TypeScript, for learning.

## Goal

Understand what an "agent" really is by building the raw mechanism yourself, with no agent framework or SDK.
An agent is a loop:

1. Send the conversation and a list of tools to the model.
2. If the model asks for a tool, **your program** runs it (the model never executes anything).
3. Put the result back into the conversation and ask again.
4. Stop when the model answers without asking for a tool.

Everything else in tools like Codex or Copilot (permissions, sandboxing, planning, streaming, sub-agents) is
infrastructure built around this loop. The work is split into [stages](docs/stages.md), each adding one idea.

## Stack

| Piece | What it is for |
| --- | --- |
| [Bun](https://bun.com) | Runs TypeScript directly, installs packages, and loads `.env` automatically. |
| TypeScript | Types for the message and tool shapes, so mistakes show up early. |
| [`openai`](https://www.npmjs.com/package/openai) npm package | HTTP client for the OpenAI-style chat API. We only change the `baseURL`. |
| [OpenRouter](https://openrouter.ai) | One API for many models, including free ones that support tool calling. |

## Setup

```bash
bun install
```

1. Create an account at <https://openrouter.ai> (sign up or log in).
2. Open <https://openrouter.ai/settings/keys> and click **Create Key**.
3. Put the key in `.env` (copy `.env.example`; `.env` is git-ignored):

```bash
cp .env.example .env
# then edit .env:
OPENROUTER_API_KEY=sk-or-...
```

Bun loads `.env` on its own, so there is no `export` or `set -x` step and no `dotenv` package.

The free tier is limited (about 50 requests/day), and every loop iteration is one request.

## Run

```bash
bun agent.ts "what do the scripts in package.json do?"
bun agent.ts "read nope.txt"
```

The second command checks the error path: the missing-file error should go back to the model, which should then
explain it. The first command should show at least one tool turn before the final answer.

Models sometimes answer without calling a tool at all (for `read nope.txt` it may just guess the file is missing).
If you want to force the error path, be explicit:

```bash
bun agent.ts "Use the read_file tool to read nope.txt and tell me what happened"
```

Note that this project's `package.json` has no `scripts` section, so the correct answer to the first question is
"there are none":
```
bun agent.ts "what do the scripts in package.json do?"

--- turn 1 (messages so far: 2) ---
→ read_file({"path": "package.json"})
← {⏎  "name": "tiny-agent",⏎  "module": "index.ts",⏎  "type": "module",⏎  "private": true,⏎  "devDependencies": {⏎    "@ty…

--- turn 2 (messages so far: 4) ---
I don't see a `scripts` section defined in the `package.json` file you've shared. This means there are no custom scripts (like `build`, `test`, `start`, `lint`, etc.) configured for this project.

If you expect scripts to be present, you might want to check if there's a different `package.json` in a subdirectory or make sure you're looking at the correct project root.
```

If you get `429 Provider returned error`, the free model is rate-limited upstream (shared with other users).
That is not your quota. Wait a bit or switch `MODEL` in `agent.ts` to another `:free` model.

The output shows each turn: `→` is the tool call the model requested, `←` is the result your program sent back.

## Files

- `agent.ts`: the whole agent.
- `docs/stages.md`: the roadmap, with finished stages checked off.
- `.env.example`: template for the API key.

To change the model, edit `MODEL` in `agent.ts` (pick any `:free` model that supports tools).
