# How it works

Plain words, no jargon. Think of it like building a **city map from a pile of books**.

## The big picture

```
  Your files  ->  Build (GraphRAG)  ->  Graph files  ->  3D view + Chat
  (PDF, txt)      reads and links        in output/       in the browser
```

Two parts talk to each other:

- **The website** (Next.js, in `app/`, `components/`, `lib/`). What you see and click.
- **GraphRAG** (Python, run with `uv`). The worker that reads documents and builds the graph.

The website starts GraphRAG as a background process and streams its progress back to you.

## Step by step

### 1. Add files
PDFs are turned into plain text (`lib/server/converters.ts`). `.txt` files are used as they are. Scanned PDFs (pictures of pages) won't work, because there is no text to read.

### 2. Build
GraphRAG does this, in order:

| Step | Everyday example |
|------|-----------------|
| Cut text into chunks | Tearing a book into pages |
| Find entities and links | Highlighting every name and who they work with |
| Group into communities | Sorting highlights into "finance team", "legal team" |
| Write a summary per community | One-paragraph notes for each team |
| Turn text into numbers (embeddings) | Giving each note a "meaning address" so similar ones sit close together |

Settings live in `settings.yaml`. The instructions given to Claude live in `prompts/`.

### 3. Explore
The build writes files into `output/`. The website reads them and draws each entity as a dot and each link as a line. `lib/forceSimulation.ts` makes linked dots pull together and unlinked ones push apart, like magnets, so clusters appear on their own. `components/GraphVisualizer.tsx` draws it with Three.js.

### 4. Ask
When you ask a question, the website runs `graphrag query`. Four ways to answer:

- **Deep (drift):** starts broad, then follows links to dig deeper.
- **Specific (local):** finds the entities in your question and reads around them.
- **Overview (global):** reads the community summaries to answer big-picture questions.
- **Simple (basic):** plain search over the text chunks.

The entities in the answer light up in the graph.

## Key parts, in detail

### Claude without an API key
GraphRAG expects an OpenAI-style web address to talk to. I don't have a key, but I do have Claude Code logged in. So:

- `scripts/claude_client.py` runs `claude -p "..."` (the Claude Code command line) and returns the answer.
- `scripts/llm_server.py` is a tiny local server that looks like OpenAI to GraphRAG, but answers using the file above.

Analogy: a translator at a front desk. GraphRAG speaks "OpenAI", Claude Code speaks "CLI", the translator converts between them.

It only listens on `127.0.0.1`, so nothing outside your computer can reach it.

### Local embeddings
Claude can't make embeddings. `scripts/embed_server.py` does it with a small Hugging Face model (`BAAI/bge-base-en-v1.5`) running on the CPU, and also pretends to be OpenAI for GraphRAG. Same translator idea.

### Fully offline with Ollama
The setup dialog also offers an Ollama preset (`lib/server/providerConfig.ts`). It uses local models for both extraction (`gemma4`) and embeddings (`embeddinggemma`), so no text leaves your computer. It is slower, so it sends one request at a time.

### `.txt` input
Supported next to PDF so you can test fast with plain text.

### UI touches
Small animations live in `components/kinetic.tsx` (numbers that count up, text that rises in).

## Folders created while running (not in git)

| Folder | What is in it |
|--------|--------------|
| `input/` | Your uploaded files |
| `output/` | The finished graph |
| `cache/` | Saved Claude answers, so a rebuild is cheaper |
| `archives/` | Saved copies of past graphs |
| `.graphrag/` | Local settings |
| `.build-jobs/` | Logs of each build |

## Known limits

- Builds take a while: each Claude call starts the CLI, and only 4 run at once (1 with Ollama).
- Text-based PDFs only.
- With the Claude preset, your text is sent to Anthropic. Don't use private data, or use the Ollama preset.

## Ideas for next

- Faster builds through a persistent Claude session instead of one CLI call per request.
- OCR for scanned PDFs.
- Export the graph as an image.
