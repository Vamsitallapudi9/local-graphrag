# Local GraphRAG documentation

New here? Good. These pages assume you know **nothing** about AI, graphs or this code. Read them in order. Each one is short.

| # | Page | What you will learn |
|---|------|---------------------|
| 1 | [The big picture](01-big-picture.md) | What the app does, and its main parts |
| 2 | [Key ideas in plain words](02-key-ideas.md) | LLM, embedding, entity, relationship, community and other words you will see |
| 3 | [How the graph is built](03-building-the-graph.md) | How a pile of documents becomes dots and lines, step by step |
| 4 | [How embeddings are made](04-embeddings.md) | How text turns into numbers, and which embedding model to pick |
| 5 | [How questions are answered](05-asking-questions.md) | What happens when you type a question in **Ask** |
| 6 | [Model providers and setup](06-model-providers.md) | OpenAI, Claude, Gemini and Ollama: keys, models, downloads |
| 7 | [The 3D view](07-the-3d-view.md) | How the dots get their place, size and color |
| 8 | [Code tour](08-code-tour.md) | Every folder and important file, and what it does |
| 9 | [Troubleshooting](09-troubleshooting.md) | Common errors and how to fix them |

## The whole app in one picture

```
 Your files        Build                         Graph files        You
 (PDF, .txt)  -->  GraphRAG + an AI model   -->  in output/    -->  3D map + Ask
                   - cut text into pieces
                   - find names and links
                   - group them into teams
                   - write a summary per team
                   - turn text into numbers
```

If you only read one page, read [The big picture](01-big-picture.md).
