# 9. Troubleshooting

When a build fails, open the **logs** in the Projects panel. The last red lines usually say what went wrong. Detailed logs for the helper servers are in `logs/embed-server.log` and `logs/llm-server.log`.

## Setup problems

| You see | What it means | Fix |
|---------|---------------|-----|
| `uv: command not found` | The Python tool is missing | Install it: `brew install uv` (Mac) or see [docs.astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |
| `pnpm: command not found` | The JavaScript package tool is missing | `npm install -g pnpm` (or `corepack enable`) |
| Build button is greyed out | No documents are added yet | Upload at least one `.pdf` or `.txt` file |

## API key problems

| You see | What it means | Fix |
|---------|---------------|-----|
| `OpenAI API key missing` (or Gemini) | No key saved and none in `.env` | Add it in **Model settings**, or put `OPENAI_API_KEY=...` / `GEMINI_API_KEY=...` in `.env` and restart `pnpm dev` |
| `API key rejected (401)` | The key is wrong, deleted, or for another provider | Make a new key and paste it again. Check for extra spaces |
| `Provider quota exhausted (429)` | Your account has no credit left | Add billing or credit on the provider's site, or switch provider |
| Many `rate limit` / `429` lines, but it keeps going | You're sending requests too fast for your plan | Wait, or set `GRAPHRAG_CONCURRENT_REQUESTS=2` in `.env` |
| `The configured model is not available` | The model name is misspelled, retired, or not on your plan | Fix the name in **Model settings** (see the provider's model list) |

## Embedding problems

| You see | What it means | Fix |
|---------|---------------|-----|
| `EMBED_SERVER_FAILED` or `EMBED_SERVER_TIMEOUT` | The local embedding server could not start | Read `logs/embed-server.log`. Often the first download was interrupted, so run `pnpm download-embeddings` again |
| `EMBED_MODEL_MISMATCH` | An old embedding server is running a different model | Stop the old helper (it keeps running in the background): `kill $(lsof -ti :11435)`, then rebuild |
| Questions fail with a vector or dimension error | The graph was built with one embedding model, and you're asking with another | **Rebuild from scratch** with the provider and embedding you want |
| First build is slow at "Starting local embeddings…" | It is downloading the ~220 MB model | Wait once, or run `pnpm download-embeddings` before building |

## Claude Code (no-key) mode

| You see | What it means | Fix |
|---------|---------------|-----|
| `LLM_SERVER_FAILED` | The Claude bridge could not start | Read `logs/llm-server.log`. If port 11436 is stuck, run `kill $(lsof -ti :11436)` and try again |
| `claude: command not found` in the logs | Claude Code is not installed or not on your PATH | Install [Claude Code](https://claude.com/claude-code), run `claude` once to log in, or just add an Anthropic API key |
| Very slow builds | Each request starts the `claude` command | Use an API key for big document sets |

## Ollama

| You see | What it means | Fix |
|---------|---------------|-----|
| Ollama tab says "not running" | The Ollama app is closed | Open Ollama (or run `ollama serve`) |
| `model not found` | The model isn't downloaded | Press **Pull model** in Model settings, or run `ollama pull gemma4` |
| Very slow builds | Your computer does all the work, one request at a time | Use a smaller model, fewer documents, or a cloud provider |

## Document problems

| You see | What it means | Fix |
|---------|---------------|-----|
| `INGEST BLOCKED` or `No usable text input` | The PDF has no text inside (it's a scan or photo), or it's broken | Convert it with an OCR tool first, or upload a `.txt` |
| `No entities detected` | The model returned nothing usable | Check the log for key or quota errors above it, or try a stronger model |
| The graph is tiny | Very short documents give few entities | Add more text. Try a stronger extraction model |

## Known limits

- **Builds take time.** Every chunk needs several AI calls. Cloud providers send 4 at a time, and Ollama sends 1.
- **Text-based PDFs only.** Scanned pages need OCR first.
- **Cloud providers see your text.** OpenAI, Anthropic and Google receive the document text you build with. For private data, use Ollama with the local embedding model.
- **Claude Code mode is slow**, because every request starts the `claude` command.

## Ideas for the future

- OCR for scanned PDFs.
- A faster Claude Code bridge that keeps one session open.
- Export the graph as an image.

## Still stuck?

- Press **Rebuild from scratch**. It clears the old cache and results, then builds everything again.
- Delete `.graphrag/providers.json` to reset all model settings (you'll need to enter keys again).
- [Open an issue](https://github.com/Vamsitallapudi9/local-graphrag/issues) with the last 30 log lines. **Remove any keys first** (the app hides them, but check).

Back to the [documentation index](README.md).
