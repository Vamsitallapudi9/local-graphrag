# 4. How embeddings are made

## What is an embedding, really?

An embedding is a **list of numbers that describes what a piece of text means**.

Picture a huge map where every sentence has an address. Sentences about similar things live on the same street:

```
  "the cat sat on the mat"    ●  ● "a kitten slept on the rug"
                                         (close together: similar meaning)


                                                    ● "quarterly revenue grew 8%"
                                                      (far away: different meaning)
```

Instead of 2 numbers (like a street map), a real embedding uses hundreds or thousands of numbers. The local model in this app uses **768**. You never need to read these numbers. The computer just compares them.

## Who makes the embeddings?

An **embedding model** makes them. It is a different, smaller kind of model than the LLM that writes text. You choose one of three:

| Option | Model | Numbers per text | Cost | Your text leaves your computer? |
|--------|-------|------------------|------|---------------------------------|
| **Local (default)** | `BAAI/bge-base-en-v1.5` from Hugging Face | 768 | Free | No |
| **OpenAI API** | `text-embedding-3-small` | 1,536 | Small, per token | Yes, to OpenAI |
| **Gemini API** | `gemini-embedding-001` | 3,072 | Free tier, then per token | Yes, to Google |

Claude has no embedding model (Anthropic does not offer one), so **Claude always uses the local model**. Ollama has its own local embedding model (`embeddinggemma`).

You choose this per provider in **Projects → Model settings** (the settings icon).

## Option 1: The local model (step by step)

*Code:* `scripts/embed_server.py`, `lib/server/embedServer.ts`

1. **Download once.** The model is about 220 MB. It downloads by itself on your first build, or you can download it ahead of time:
   ```bash
   pnpm download-embeddings
   ```
   It is saved in `.graphrag/hf-models/`.
2. **A tiny local server starts.** When a build needs embeddings, the app starts `scripts/embed_server.py` on `http://127.0.0.1:11435`. It only listens on your own computer.
3. **It looks like OpenAI.** GraphRAG only knows how to talk to "OpenAI-style" embedding services. So this little server answers in exactly the same format as OpenAI. GraphRAG never knows the difference.
4. **The math runs on your CPU.** It uses `fastembed`, a light library that runs the model with ONNX (no big GPU or PyTorch needed).

Think of it as a **translator at a front desk**: GraphRAG speaks "OpenAI", the model speaks "fastembed", and the server translates.

### Want a different local model?

Set these in a `.env` file, then download and rebuild:

```bash
EMBED_MODEL=BAAI/bge-small-en-v1.5
EMBED_DIMENSIONS=384
```

```bash
EMBED_MODEL=BAAI/bge-small-en-v1.5 pnpm download-embeddings
```

The model must be one that [fastembed supports](https://qdrant.github.io/fastembed/examples/Supported_Models/), and `EMBED_DIMENSIONS` must match its size.

## Options 2 and 3: OpenAI or Gemini embeddings

*Code:* `lib/server/providerConfig.ts`

When you pick the provider's API, GraphRAG sends text straight to OpenAI or Google using the same API key you entered for that provider. There is nothing to download. It is faster on big document sets, but it costs a little and your text leaves your machine.

## Where embeddings are used

During the build, GraphRAG embeds three things (see [step 6](03-building-the-graph.md#step-6-make-embeddings)):

- entity descriptions,
- community reports,
- original text chunks.

They are stored in **LanceDB**, a vector database saved in `output/lancedb/`.

When you ask a question, your **question is embedded too**, with the **same model**. Then LanceDB finds the stored texts whose numbers are closest to your question's numbers. Those are the most related entities and passages.

## The one rule: never mix embedding models

Numbers from different models do not mean the same thing. It is like comparing addresses from two different cities. They also have different lengths (768 vs 1,536 vs 3,072), and the database refuses mixed lengths.

So the app:

- remembers which provider built the current graph and uses the **same** settings when you ask questions,
- keeps a separate cache folder for each provider and model combination.

**If you change the embedding model, rebuild the project** (use **Rebuild from scratch** to be safe).

Next: [How questions are answered](05-asking-questions.md)
