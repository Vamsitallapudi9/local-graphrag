# 1. The big picture

## What problem does this solve?

Imagine you get 50 long reports. You want to know: *Who is involved? How are they connected? What are the main themes?* Reading everything takes days.

This app reads the documents for you. It finds the **people, companies, places and events** inside them, finds **how they are connected**, and draws all of it as a **3D map**. Then you can **ask questions** in plain English and get answers that point back to the map.

## A city-map analogy

Think of your documents as a pile of books about a city.

- Every **name** in the books (a person, a company, a place) becomes a **building** on the map. In the app, a building is a **dot**.
- Every **connection** the books mention ("Alice works at Acme") becomes a **road** between two buildings. In the app, a road is a **line**.
- Buildings that are close friends form a **neighborhood**. In the app, this is a **community**: a group of dots that are strongly linked.
- For each neighborhood, someone writes a **short guide**: "This area is about the finance team and their deals." In the app, this is a **community report**.

When you ask a question, the app looks at the right buildings, roads and guides, and writes an answer.

## The main parts

The app has two halves that work together.

```
 +-----------------------------+          +-----------------------------+
 |  The website (Next.js)      |  starts  |  The worker (GraphRAG,      |
 |  - 3D map, chat, projects   | -------> |  Python)                    |
 |  - runs on your computer    |          |  - reads documents          |
 |  - app/, components/, lib/  | <------- |  - asks the AI model        |
 +-----------------------------+  results |  - writes graph files       |
                                          +-----------------------------+
                                                        |
                                                        v
                                          +-----------------------------+
                                          |  An AI model (you choose)   |
                                          |  OpenAI, Claude, Gemini     |
                                          |  or Ollama (offline)        |
                                          +-----------------------------+
```

1. **The website** is what you see and click. It is built with Next.js (a popular web framework) and draws the 3D map with Three.js (a 3D library for the browser).
2. **GraphRAG** is an open-source tool from Microsoft. It does the heavy reading. The website starts it as a background program and shows its progress.
3. **The AI model** is the "reader". GraphRAG sends it small pieces of text and asks it questions like "which names are in this text?". You pick which model to use (see [Model providers](06-model-providers.md)).

## The journey of one document

1. You upload `report.pdf` in the **Projects** panel.
2. The app turns the PDF into plain text.
3. You press **Build**. GraphRAG cuts the text into pieces and sends each piece to the AI model.
4. The model sends back the names and connections it found.
5. GraphRAG merges everything, groups it into communities, writes summaries, and turns text into numbers (embeddings) for search.
6. The results are saved as files in `output/`.
7. The website reads those files and draws the 3D map.
8. You open **Ask**, type a question, and the answer lights up the matching dots.

Each step is explained in the next pages.

## Where things are saved

Everything stays in the project folder on your computer:

| Folder | What is inside |
|--------|----------------|
| `input/` | Your uploaded files, as plain text |
| `output/` | The finished graph (the files the map is drawn from) |
| `cache/` | Saved AI answers, so a rebuild does not pay twice |
| `archives/` | Saved copies of other projects |
| `.graphrag/` | Your settings and API keys (private, never uploaded to git) |
| `logs/` | Logs from the build and the helper servers |
| `.build-jobs/` | A temporary workspace for each build |

None of these are pushed to GitHub. They are listed in `.gitignore`.

Next: [Key ideas in plain words](02-key-ideas.md)
