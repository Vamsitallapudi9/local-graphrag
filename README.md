# Local GraphRAG

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg) ![Next.js](https://img.shields.io/badge/Next.js-16-black) ![Python](https://img.shields.io/badge/Python-3.12-3776AB) ![GraphRAG](https://img.shields.io/badge/GraphRAG-3.1-purple)

Drop in your documents. Get a 3D map of the people, things and ideas inside them. Then ask questions and watch the answer light up on the map.

Everything runs on your own computer. Claude does the reading through your normal Claude Code login, so there is no API key to manage. Prefer fully offline? Switch to the Ollama preset.

<!-- Add a screenshot: save it as docs/screenshot.png, then uncomment the line below. -->
<!-- ![Local GraphRAG: 3D knowledge graph with chat](docs/screenshot.png) -->

## What it does

1. You add PDFs or `.txt` files.
2. It reads them and pulls out **entities** (people, companies, drugs, places...) and how they **connect**.
3. It groups related entities into **communities** and writes a short summary for each.
4. You explore the result as a 3D graph, or ask questions in a chat.

## Features

- **Claude without an API key.** A tiny local bridge (`scripts/llm_server.py`) lets GraphRAG talk to Claude through the Claude Code CLI.
- **Local embeddings.** Text-to-numbers runs on your machine with a Hugging Face model, so nothing extra to install or pay for.
- **Fully offline option.** An Ollama preset runs both extraction and embeddings on local models.
- **Interactive 3D graph.** Force-directed layout with search, details on click, and answers highlighted on the map.
- **Four ways to ask.** Deep, specific, overview and simple search modes.
- **Projects and archives.** Keep several graphs, save snapshots, import and export them.
- **PDF and `.txt` input.**

Details of how each part works: [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md).

## Run it

You need: Node 20.9+, [pnpm](https://pnpm.io), Python 3.12, [uv](https://docs.astral.sh/uv/), and either [Claude Code](https://claude.com/claude-code) logged in or [Ollama](https://ollama.com) running.

```bash
git clone https://github.com/Vamsitallapudi9/local-graphrag.git
cd local-graphrag
pnpm install
uv sync --frozen
pnpm dev
```

Open http://127.0.0.1:3000. With Claude, the first build downloads a ~220 MB embedding model once.

## Use it

1. Open **Projects**, name a project, add files, press build.
2. Close the panel. Drag to rotate, scroll to zoom, click a dot to see details, `Cmd/Ctrl+K` to search.
3. Open **Ask** to chat. Pick a mode:

| Mode | Use it for |
|------|-----------|
| Deep | Following links between topics (default) |
| Specific | Facts about one thing |
| Overview | Big themes across all documents |
| Simple | Plain search over the text |

## Privacy

Your documents stay on your machine, except the text pieces sent to Claude to be read. Don't use confidential or personal data with the Claude preset; use the Ollama preset to keep everything local.

## Project layout

```
app/          pages and API routes (Next.js)
components/   the 3D graph, chat, projects panel
lib/          graph math and the server code that runs builds
scripts/      the two small local servers (Claude bridge, embeddings)
settings.yaml GraphRAG settings
prompts/      the instructions GraphRAG gives Claude
```

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm build
```

## License

MIT. See [LICENSE](LICENSE). Built on [Microsoft GraphRAG](https://github.com/microsoft/graphrag), originally based on an MIT-licensed project (see LICENSE).
