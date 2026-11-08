# 6. Model providers and setup

The app can use four providers. You can switch between them for each build.

| Provider | Reads your documents with | Embeddings | Needs | Text leaves your computer? |
|----------|---------------------------|------------|-------|----------------------------|
| **OpenAI** | `gpt-5.4-mini` (default) | Local model **or** OpenAI `text-embedding-3-small` | OpenAI API key | Yes, to OpenAI |
| **Claude** | `claude-sonnet-5-5` (default) | Local model | Anthropic API key **or** a Claude Code login | Yes, to Anthropic |
| **Gemini** | `gemini-flash-latest` (default) | Local model **or** Gemini `gemini-embedding-001` | Gemini API key | Yes, to Google |
| **Ollama** | `gemma4` on your computer | `embeddinggemma` on your computer | Ollama installed | No |

You can type any other model name the provider offers in **Model settings**.

## Before your first build: checklist

1. **Pick a provider** and get its key (below). Ollama needs no key.
2. **Pick an embedding model.** If you choose the **local** one (the default, and the only choice for Claude), download it once:
   ```bash
   pnpm download-embeddings
   ```
   It is about 220 MB, saved in `.graphrag/hf-models/`. If you skip this, the first build downloads it for you, so it just takes longer.
3. **Enter the key** in the app: **Projects → settings icon (Model settings) → provider tab → paste key → Save settings.** Or put it in a `.env` file (see below).
4. In **Projects**, choose the provider in the dropdown, then press **Build with …**.

## Getting an API key

### OpenAI
1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys) and sign in.
2. Click **Create new secret key** and copy it (it starts with `sk-`).
3. Add some credit under **Billing**. API keys do not work on a free ChatGPT plan.

### Claude (Anthropic)
1. Go to [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) and sign in.
2. Click **Create Key** and copy it (it starts with `sk-ant-`).
3. Add credit under **Billing**.

**No key? Use your Claude Code login instead.** If you have [Claude Code](https://claude.com/claude-code) installed and logged in, leave the key empty. The app then talks to Claude through the `claude` command on your computer (see "How the Claude Code option works" below). It is slower, but there is no separate API bill.

### Gemini (Google)
1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and sign in with a Google account.
2. Click **Create API key** and copy it (it starts with `AIza`).
3. There is a free tier with rate limits. Big builds may need billing turned on.

### Ollama (fully offline)
1. Install from [ollama.com/download](https://ollama.com/download) and open it.
2. In **Model settings → Ollama**, press **Pull model** for both the extraction model and the embedding model.

## Using a `.env` file instead

Create a file called `.env` in the project folder:

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
```

You only need the line for the provider you use. A key saved in the app wins over one in `.env`. The `.env` file is in `.gitignore`, so it will **not** be pushed to GitHub. Restart `pnpm dev` after editing it.

## Where keys are stored

Keys entered in the app are saved in `.graphrag/providers.json`. That file:

- is only readable by your own user account (file permission `600`),
- is ignored by git,
- is never sent back to the browser (the browser only learns "a key is configured").

Keys are also masked (for example `sk-REDACTED`) in build logs and chat errors.

## How the adapters work (for developers)

*Code:* `lib/providers.ts`, `lib/server/providerConfig.ts`, `settings.yaml`

Each provider is described once, in `lib/providers.ts`, as an **adapter**: its name, where to get a key, the environment variable for the key, its default model, and its embedding model (if it has one).

GraphRAG does not know about our adapters. It reads `settings.yaml`, which has blanks like `${GRAPHRAG_COMPLETION_MODEL}`. Before every build or question, `resolveProviderEnv()` fills those blanks from the chosen adapter:

| Blank in `settings.yaml` | OpenAI | Claude (key) | Gemini |
|--------------------------|--------|--------------|--------|
| `GRAPHRAG_COMPLETION_PROVIDER` | `openai` | `anthropic` | `gemini` |
| `GRAPHRAG_COMPLETION_MODEL` | `gpt-5.4-mini` | `claude-sonnet-5-5` | `gemini-flash-latest` |
| `GRAPHRAG_COMPLETION_API_BASE` | empty (official URL) | empty | empty |
| `GRAPHRAG_API_KEY` | your key | your key | your key |
| `GRAPHRAG_EMBEDDING_*` | local server or OpenAI | local server | local server or Gemini |

Inside GraphRAG, a library called **LiteLLM** turns `provider/model` (for example `gemini/gemini-flash-latest`) into the correct API call for that company. That is why one `settings.yaml` works for all of them.

### How the Claude Code option works

*Code:* `scripts/llm_server.py`, `scripts/claude_client.py`, `lib/server/llmServer.ts`

GraphRAG expects an "OpenAI-style" web address. When Claude has no key:

1. The app starts `scripts/llm_server.py`, a tiny server on `http://127.0.0.1:11436` that looks like OpenAI.
2. For each request, it calls `scripts/claude_client.py`, which runs `claude -p "..."` (the Claude Code command line) and returns the answer.
3. GraphRAG thinks it's talking to OpenAI, but Claude answers.

It only listens on your own computer. It is slower than a key because every request starts the `claude` command.

### Adding another model name

You do not need code for that. Just type the model name in **Model settings**. To change a default, edit `defaultCompletionModel` in `lib/providers.ts`.

## Speed and parallel requests

Cloud providers get **4 requests at a time**, and Ollama gets 1. If your account allows more, set this in `.env`:

```bash
GRAPHRAG_CONCURRENT_REQUESTS=8
```

Lower it if you see "rate limit" (429) errors.

Next: [The 3D view](07-the-3d-view.md)
