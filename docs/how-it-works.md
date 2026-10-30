# How the agent loop works

This expands the short "An agent is a loop" section of the README. It assumes you have never seen this before.

## 1. The one fact everything depends on

**The model can only read text and write text.** It cannot open files, run commands, or browse the web. It lives
on a server somewhere, and all it ever does is: text goes in, text comes out.

So how can an "agent" read your files? The model can't, but **your program can**. The trick is to let the model
*ask* your program to do things, by writing a specially formatted piece of text.

## 2. What is a "tool"?

A tool is a **menu item** you show the model. Each item has three parts:

| Part | Example | Who uses it |
| --- | --- | --- |
| a name | `read_file` | the model writes it when it wants this tool |
| a description | "Read a text file and return its contents" | the model reads it to decide *when* the tool is useful |
| the arguments it takes | `path` (a string) | the model fills them in |

That is all a tool is from the model's point of view: a name, a sentence about what it's for, and a list of
blanks to fill in. In `agent.ts` this is the `tools` array.

The menu says nothing about *how* the file gets read. The model doesn't know or care. It's like a restaurant
menu: you read "soup of the day", you don't see the kitchen.

## 3. Where the "kitchen" is: your program

The real code lives in the `handlers` object in `agent.ts`:

```ts
const handlers = {
  read_file: ({ path }) => Bun.file(path).text(),   // really reads the disk
  list_dir:  async ({ path }) => (await readdir(path)).join("\n"),
};
```

The only link between the menu and the kitchen is **the name**. The menu says `read_file`; your program has a
function stored under the key `read_file`. When the model asks for `read_file`, your program looks that name up
in `handlers` and runs the function. If you renamed the key to `banana`, the model would still ask for
`read_file` and your program would answer "unknown tool".

## 4. Why a `read_file` tool, and not just "run commands"?

Good question. Two parts to the answer:

**The model has no way to run commands by itself.** Even `cat package.json` is just text to it. Something has to
actually execute it. If you wanted the model to use the shell, you would give it a tool like
`run_command(command)`, and your program would run that string in a real shell. That is exactly what Stage 3
does.

**Narrow tools are safer and more reliable.** `read_file` can only read a file. It can't delete anything, can't
send your data anywhere, can't install things. A `run_command` tool can do anything your user account can do,
so you need permissions and sandboxing around it. Real agents usually offer both: small safe tools for common
jobs (read, search, edit) and a broad one (shell) with a permission prompt.

In short: a tool is a **capability you chose to give the model**. The model can only do what is on the menu.

## 5. The full flow, with the real data from a run

Question: `what do the scripts in package.json do?`

```
 YOU            YOUR PROGRAM (agent.ts)                  MODEL (on OpenRouter)
  |                      |                                      |
  |-- the question ----->|                                      |
  |                      |-- request #1 ----------------------->|
  |                      |   "user: what do the scripts...?"    |
  |                      |   + the tool menu                    |
  |                      |                                      |
  |                      |<-- reply: "please call read_file     |
  |                      |    with path = package.json" --------|
  |                      |                                      |
  |                      | (runs Bun.file("package.json")       |
  |                      |  on YOUR disk)                       |
  |                      |                                      |
  |                      |-- request #2 ----------------------->|
  |                      |   the question                       |
  |                      |   + the model's own tool request     |
  |                      |   + the file contents (tool result)  |
  |                      |   + the tool menu                    |
  |                      |                                      |
  |                      |<-- reply: "There is no scripts       |
  |<-- final answer -----|    section..." (plain text) ---------|
```

Step by step:

1. **You ask a question.** Your program puts it in a list called `messages`.
2. **Request #1.** Your program sends the model two things: the `messages` list and the tool menu. The
   model reads the question and the menu and thinks: "to answer this I need to see package.json, and there's a
   tool for reading files."
3. **The model replies with a tool request instead of an answer.** It is just structured text:
   `tool_calls: [{ name: "read_file", arguments: {"path": "package.json"} }]`. Nothing has been read yet.
   This is the log line `→ read_file({"path": "package.json"})`.
4. **Your program does the work.** It finds `read_file` in `handlers`, runs it, and gets the file contents.
   This is the log line `← {⏎ "name": "tiny-agent"...`.
5. **Your program adds the result to `messages`** as a new entry with `role: "tool"`. Now the list holds:
   the question, the model's tool request, and the file contents.
6. **Request #2.** Your program sends the *whole* list again, plus the menu. The model now has the file
   contents in front of it.
7. **The model answers in plain text** ("there is no scripts section"). No tool request this time, so your
   program prints it and stops.

## 6. Why does the whole list get sent again each time?

The model has **no memory** between requests. Every request is a fresh start. The only reason it "remembers" the
question in request #2 is that your program included it again. That is why the log says
`messages so far: 2` after turn 1 and `4` after turn 2: the list only ever grows.

Consequence: long conversations cost more and eventually don't fit. Managing that (trimming, summarising) is
part of what bigger agents do. It is on the optional Stage 4 list.

## 7. Where the "loop" comes from

Look at what decides whether to go around again:

- The model replied with a **tool request** -> run it, add the result, ask again.
- The model replied with **plain text** -> that's the answer, stop.

A harder question may need several rounds ("list the folder", then "read this file", then "read that one").
The model chooses, round by round, what to do next. **That decision-making is what makes it an agent** and not
just a fixed script. Your code doesn't contain the plan; the model improvises it, one step at a time, and your
loop keeps feeding it the results.

`MAX_TURNS` is the safety net in case the model keeps asking forever.

## 8. Who does what

| Piece | Job | Lives in |
| --- | --- | --- |
| The model | Reads the conversation, decides: answer, or ask for a tool | OpenRouter's server |
| The tool menu (`tools`) | Tells the model what it may ask for | `agent.ts` |
| The handlers (`handlers`) | Do the real work on your machine | `agent.ts` |
| The loop (`for` loop) | Passes messages back and forth until there's an answer | `agent.ts` |
| `messages` | The conversation so far; the model's only memory | `agent.ts` |

## 9. Two things worth noticing

- **The model can be wrong or lazy.** When we asked it to `read nope.txt`, it sometimes just said "I can't find
  it" without calling the tool at all. It is a text predictor following the menu as a suggestion, not a
  program obeying a command. That is why real agents add system prompts, retries and permission checks.
- **You are in control.** Because *your program* runs the tools, you decide what is allowed. Add a confirmation
  prompt before writing a file (Stage 2) and the model can no longer change anything without you saying yes.
  That is the origin of every "permission" and "sandbox" feature in tools like Codex or Copilot.

## 10. Claude Code analogy

Claude Code uses the same mechanism, with a much bigger menu and a lot more infrastructure around the loop.

**Its tools are your `tools` array and `handlers`, scaled up:**

| Claude Code tool | Your equivalent |
| --- | --- |
| `Read` | `read_file` |
| `Write`, `Edit` | `write_file` (Stage 2) |
| `Bash` | `run_command` (Stage 3) |
| `Agent` | a sub-agent: a second loop started by a tool call |
| `AskUserQuestion` | a tool whose handler asks *you* something and returns your answer |

Each one has a name, a description and arguments, just like in `agent.ts`. The Claude Code program on your machine
holds the handlers. When the model calls `Read`, it only emits a tool request. Claude Code runs it on your disk and
puts the result back into the conversation.

**The same distinction applies there.** The model only produces text, and the program around it does everything.
A permission prompt or a denied call is the equivalent of your Stage 2 `y/N` check, sitting between the model's
request and the handler.

**Some real differences:**

- **A large menu, partly deferred.** Some tools are only listed by name, and their full definitions load when
  needed. This keeps the context small, since the menu is resent every request, just like your `messages` list.
- **A long system prompt** with rules for how to behave. That is the "system prompt" item in Stage 4.
- **Parallel tool calls.** The model can request several tools in a single reply, which is why your loop has
  `for (const call of message.tool_calls)`.
- **Plan mode is not magic.** It restricts which tools are allowed, and the program enforces that. It does not
  depend on the model being polite.

Once you have built Stages 2 and 3, you will have written the core of a smaller version of the same thing.
