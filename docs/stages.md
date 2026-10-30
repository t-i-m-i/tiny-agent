# Stages

Tick a box when a stage is finished. Each stage adds one idea on top of the previous one.

## [x] Stage 1: the loop (`agent.ts`)

The core of every agent: ask the model, run the tool it requests, feed the result back, repeat.

- [x] OpenAI-compatible client pointed at OpenRouter
- [x] Tools: `read_file(path)` and `list_dir(path)`, described with JSON schema
- [x] Handlers map: tool name -> function that actually runs (the model never executes anything)
- [x] Loop that stops when the model answers without requesting a tool
- [x] `MAX_TURNS` cap (the free tier allows ~50 requests/day)
- [x] Unknown tool, bad JSON arguments, or a thrown error -> returned to the model as the tool result so it can recover
- [x] Per-turn logging so you can watch the `messages` array grow
- [x] Verified against the live API (happy path and missing-file error path)

## [ ] Stage 2: `write_file` with confirmation

Add a tool that changes things, and ask the user `y/N` before it runs. This is the first permission layer.

## [ ] Stage 3: `run_command`

Let the model run shell commands. Shows why sandboxing and allow-lists exist.

## [ ] Stage 4 (optional): polish

System prompt, streaming responses, trimming the conversation when it grows too long.
