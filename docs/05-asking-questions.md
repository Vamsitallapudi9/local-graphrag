# 5. How questions are answered

*Code:* `app/api/chat/stream/route.ts`, `components/ChatPanel.tsx`

When you type a question in **Ask**, the app runs:

```
uv run graphrag query "<your question>" --method <mode>
```

using the **provider that built the graph** (with its current settings in Model settings). The answer streams back word by word.

## The four modes

| In the app | GraphRAG name | Best for | How it works, simply |
|------------|---------------|----------|----------------------|
| **Deep** (default) | `drift` | "How is A connected to B?", follow-up digging | Starts from the community reports for a broad view, then asks itself follow-up questions and digs into the related entities |
| **Specific** | `local` | Facts about one person, company or thing | Finds the entities in your question, then reads their descriptions, relationships and the original text around them |
| **Overview** | `global` | "What are the main themes?" | Reads **all** community reports, collects useful points from each one ("map"), then combines them into one answer ("reduce") |
| **Simple** | `basic` | Plain document search | Classic RAG: finds the text chunks closest to your question and answers from them only, without using the graph |

### Example

Question: *"Who did Marie Curie work with?"*

- **Specific** finds the entity `MARIE CURIE`, sees lines to `PIERRE CURIE` and `UNIVERSITY OF PARIS`, reads the text around them, and answers.
- **Overview** would be a poor fit here. It is better for "What are the main topics across all these papers?"

## Step by step (Specific mode)

1. Your question is turned into an embedding (see [How embeddings are made](04-embeddings.md)).
2. LanceDB finds the entities whose descriptions are closest in meaning.
3. GraphRAG collects those entities, their relationships, their communities' reports and the original chunks they came from.
4. All of this is put into one prompt (`prompts/local_search_system_prompt.txt`) with your question.
5. The LLM writes the answer, citing its sources like `[Data: Entities (12, 7)]`.

## Why the map lights up

After the answer arrives, the app looks for entity names that appear **word-for-word** in your question or in the answer (see `findEntityIds` in `app/api/chat/stream/route.ts`). Up to 30 matching dots are highlighted on the 3D map, so you can see *where* the answer lives.

## Tips

- Use **Specific** when you can name the thing you are asking about.
- Use **Overview** for summaries of everything.
- Use **Deep** when you are not sure (it's the default).
- Use **Simple** to check what the raw documents say.
- Answers can only be as good as the graph. If something is missing, try a stronger extraction model and rebuild.

Next: [Model providers and setup](06-model-providers.md)
