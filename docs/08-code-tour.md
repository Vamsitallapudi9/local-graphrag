# 8. Code tour

This page lists every folder and important file, and says what it does in one or two lines. Use it as a map when you open the code.

## How the two halves fit together

```
 Browser (React)                     Next.js server (Node.js)                 Python (uv)
 ───────────────                     ────────────────────────                 ───────────
 app/page.tsx          ──fetch──>    app/api/**/route.ts        ──spawn──>    graphrag index / query
 components/*.tsx      <──SSE────    lib/server/*.ts            ──spawn──>    scripts/embed_server.py
                                                                ──spawn──>    scripts/llm_server.py
```

- The **browser** only shows things and calls the API.
- The **Next.js server** owns files, keys and background jobs.
- **Python** does the AI work. Next.js starts it as a separate process (`uv run ...`).
- Long tasks (builds, answers) stream progress back with **Server-Sent Events (SSE)**, a simple one-way live feed.

## Top-level files

| File | What it does |
|------|--------------|
| `package.json` | JavaScript dependencies and commands (`pnpm dev`, `pnpm build`, `pnpm download-embeddings`) |
| `pyproject.toml`, `uv.lock` | Python dependencies (GraphRAG, fastembed, pyarrow), installed by `uv` |
| `settings.yaml` | GraphRAG's settings. Values like `${GRAPHRAG_COMPLETION_MODEL}` are filled in by the app before each run |
| `next.config.ts`, `tsconfig.json`, `eslint.config.mjs` | Build, TypeScript and lint settings |

## `app/`: pages and API

| File | What it does |
|------|--------------|
| `app/layout.tsx` | The page shell (title, fonts) |
| `app/page.tsx` | The main screen: 3D view, search, Projects and Ask panels, keyboard shortcuts |
| `app/globals.css` | Global styles (Tailwind CSS) |

### API routes (`app/api/`)

| Route | Method | What it does |
|-------|--------|--------------|
| `/api/providers` | GET | Shows which providers are ready (never returns keys) |
| `/api/providers` | POST | Saves a provider's key, model and embedding choice |
| `/api/providers?provider=<id>` | DELETE | Removes a saved API key |
| `/api/providers/ollama/pull` | GET | Downloads an Ollama model, with live progress |
| `/api/corpus/upload` | POST | Uploads `.pdf` / `.txt` files into `input/` |
| `/api/corpus/state` | GET | Lists your files and their status |
| `/api/corpus/file` | GET | Opens one uploaded file |
| `/api/corpus/remove` | POST | Removes one file |
| `/api/corpus/index/stream` | GET | Starts (or re-joins) a build and streams its progress |
| `/api/corpus/index/status` | GET | Says if a build is running |
| `/api/corpus/index/stop` | POST | Stops the build |
| `/api/corpus/logs` | GET | Build log lines |
| `/api/corpus/kg/rename` | POST | Renames the current project |
| `/api/corpus/archive/*` | GET/POST | Lists, saves, restores, renames and deletes saved projects |
| `/api/corpus/export` | GET | Downloads the graph as one JSON file |
| `/api/corpus/import` | POST | Loads a graph from an exported file |
| `/api/corpus/project/delete` | POST | Deletes the current project |
| `/api/corpus/nuke` | POST | "Start fresh": moves everything into `archives/` and empties the workspace |
| `/api/data/<name>` | GET | Serves graph JSON files from `output/` (only allowed names) |
| `/api/chat/stream` | POST | Answers a question with `graphrag query` and streams it |

## `components/`: what you see

| File | What it does |
|------|--------------|
| `GraphVisualizer.tsx` | Draws the 3D graph (Three.js), glow effect, camera controls |
| `GalaxyBackground.tsx` | The starry background |
| `CorpusPanel.tsx` | The **Projects** panel: files, provider dropdown, Build, progress, saved projects |
| `ProviderSetupDialog.tsx` | **Model settings**: Ollama, OpenAI, Claude and Gemini tabs |
| `ChatPanel.tsx` | The **Ask** panel: question box, four answer modes, streamed answer |
| `Inspector.tsx` | Details for the clicked entity: description, links, community |
| `kinetic.tsx` | Small animations (count-up numbers, text that rises in) |
| `ui/` | Basic building blocks (button, dialog, input, tabs) |

## `lib/`: logic

| File | What it does |
|------|--------------|
| `providers.ts` | **The adapters.** One description per provider: key link, env var, default models, embedding options. Used by both browser and server |
| `graphData.ts` | Loads the JSON graph files and joins them together |
| `forceSimulation.ts` | Physics layout for the 3D view, entity colors and sizes |
| `utils.ts` | Small helpers |
| `server/providerConfig.ts` | Saves and reads provider settings (`.graphrag/providers.json`), checks readiness, turns the chosen adapter into GraphRAG settings (`resolveProviderEnv`) and starts the helper servers before a question |
| `server/graphragEnv.ts` | Fills in safe defaults for every `${...}` blank in `settings.yaml` (concurrency, vector size) so GraphRAG never fails on a missing value |
| `server/indexJob.ts` | Runs a build: copies files into `.build-jobs/<id>/`, runs `graphrag index`, reads progress, turns errors into friendly messages, publishes the result |
| `server/converters.ts` | PDF to text, and Parquet to JSON |
| `server/embedServer.ts` | Starts and checks `scripts/embed_server.py` |
| `server/llmServer.ts` | Starts and checks `scripts/llm_server.py` (Claude Code mode) |
| `server/redact.ts` | Hides API keys in logs and errors |

## `scripts/`: Python helpers

| File | What it does |
|------|--------------|
| `embed_server.py` | Local embedding server (port 11435). OpenAI-style API on top of fastembed. `--download-only` just downloads the model |
| `llm_server.py` | OpenAI-style chat server (port 11436) that forwards to Claude Code |
| `claude_client.py` | Runs `claude -p` and returns the text |

## `prompts/`: instructions for the AI

Plain text files that GraphRAG sends to the model. For example:

- `extract_graph.txt`: find entities and relationships,
- `summarize_descriptions.txt`: merge descriptions,
- `community_report_graph.txt`: write community reports,
- `*_search_*.txt`: answer questions in each mode.

Edit these to change the AI's behavior (for example, to find other entity types). Then rebuild.

## `types/`

TypeScript type definitions for libraries that don't ship their own (`d3-force-3d`, `parquetjs-lite`, `pdf-parse`).

## Folders created while running (not in git)

| Folder | What is in it |
|--------|---------------|
| `input/` | Your uploaded files (PDFs are converted to `.txt`. The originals move to `input/_pdfs/`) |
| `output/` | The finished graph: Parquet tables, their JSON copies, and `lancedb/` (embeddings) |
| `cache/` | Saved AI answers, one folder per provider and model. Rebuilding the same text is much cheaper |
| `archives/` | Saved projects |
| `.build-jobs/` | A private work folder for each build. It's only copied to `output/` if the build succeeds |
| `.graphrag/` | `providers.json` (your settings and keys) and `hf-models/` (the local embedding model) |
| `.venv/` | The Python environment made by `uv` |

Next: [Troubleshooting](09-troubleshooting.md)
