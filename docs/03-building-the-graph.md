# 3. How the graph is built

When you press **Build**, the app starts GraphRAG with this command (see `lib/server/indexJob.ts`):

```
uv run graphrag index --root <workspace> --method standard
```

GraphRAG then runs a fixed list of steps, one after another. Below is each step in plain words, with what goes in and what comes out.

```
 PDF/.txt -> 0. text -> 1. chunks -> 2. entities + relationships (LLM)
          -> 3. merge + clean -> 4. communities -> 5. community reports (LLM)
          -> 6. embeddings -> 7. files in output/ -> 3D map
```

## Step 0: Turn files into plain text

*Code:* `lib/server/converters.ts`

PDFs are converted to plain text with the `pdf-parse` library. `.txt` files are used as they are.

Scanned PDFs (photos of pages) have no real text inside, so they come out empty. Only text-based PDFs work.

## Step 1: Cut the text into chunks

*GraphRAG step:* `create_base_text_units` · *Settings:* `chunking` in `settings.yaml`

The text is cut into pieces of **1,200 tokens** (about 2 pages). Each piece overlaps the next by **100 tokens**, so a sentence cut in half at a boundary still appears whole in one of the pieces.

*Why?* An LLM reads a short piece much more carefully than a whole book, and every model has a limit on how much it can read at once.

## Step 2: Find entities and relationships (this is where the LLM works)

*GraphRAG step:* `extract_graph` · *Prompt:* `prompts/extract_graph.txt`

This is the heart of the app. For **every chunk**, GraphRAG sends the LLM a message that says, in short:

> Here is some text. List every **entity** (organization, person, geo, event) with a short description. Then list every **relationship** that the text *clearly* states, with a description and a strength from 1 to 10. Do not make anything up.

The four entity types come from `settings.yaml` (`entity_types: [organization, person, geo, event]`).

### A real example

**Text sent to the LLM:**

> Marie Curie worked at the University of Paris. In 1903 she shared the Nobel Prize in Physics with Pierre Curie.

**What the LLM sends back** (the special format is defined in the prompt):

```
("entity"<|>MARIE CURIE<|>PERSON<|>Physicist who worked at the University of Paris)##
("entity"<|>UNIVERSITY OF PARIS<|>ORGANIZATION<|>University where Marie Curie worked)##
("entity"<|>PIERRE CURIE<|>PERSON<|>Physicist who shared the 1903 Nobel Prize)##
("entity"<|>NOBEL PRIZE IN PHYSICS 1903<|>EVENT<|>Award shared by Marie and Pierre Curie)##
("relationship"<|>MARIE CURIE<|>UNIVERSITY OF PARIS<|>Marie Curie worked at the university<|>8)##
("relationship"<|>MARIE CURIE<|>PIERRE CURIE<|>Shared the 1903 Nobel Prize in Physics<|>9)##
<|COMPLETE|>
```

GraphRAG reads this text back into rows of a table.

### "Gleaning": a second look

`max_gleanings: 1` in `settings.yaml` means GraphRAG asks the model once more: *"Did you miss anything?"* This catches entities the first pass skipped. It costs one extra call per chunk.

## Step 3: Merge and clean up

*GraphRAG steps:* `extract_graph` (summary part) and `finalize_graph` · *Prompt:* `prompts/summarize_descriptions.txt`

The same entity shows up in many chunks. "MARIE CURIE" might appear in 20 chunks with 20 slightly different descriptions.

- Entities with the **same name and type** are merged into **one dot**.
- Relationships between the same two entities are merged into **one line**, and their strengths are added up into a **weight**.
- The LLM is asked to combine the many descriptions into **one short description** (up to 500 words).
- GraphRAG counts each dot's **degree** (number of lines) and **frequency** (number of chunks it appeared in).

Result: `entities.parquet` and `relationships.parquet`.

## Step 4: Find communities

*GraphRAG step:* `create_communities` · *Setting:* `cluster_graph.max_cluster_size: 10`

GraphRAG runs **hierarchical Leiden clustering**. This is a math method, not an LLM. It looks only at the dots and lines, and finds groups of dots that are linked more tightly to each other than to the rest.

"Hierarchical" means it makes groups inside groups. A big community ("European science") can contain smaller ones ("the Curie family", "Paris universities"). Groups larger than 10 are split again.

Result: `communities.parquet`.

## Step 5: Write a report for each community (the LLM again)

*GraphRAG step:* `create_community_reports` · *Prompt:* `prompts/community_report_graph.txt`

For each community, GraphRAG gives the LLM the list of its entities and relationships and asks for a report with:

- a **title** (for example "Curie family and the 1903 Nobel Prize"),
- a **summary**,
- an **importance rating** from 0 to 10, with a one-line reason,
- **5 to 10 findings**, each with an explanation.

These reports power the **Overview** question mode, which answers "big picture" questions.

Result: `community_reports.parquet`.

## Step 6: Make embeddings

*GraphRAG step:* `generate_text_embeddings`

GraphRAG turns three kinds of text into embeddings (lists of numbers that capture meaning):

1. every **entity description**,
2. every **community report**,
3. every **chunk** of the original text.

They are saved in the vector store `output/lancedb/` so questions can quickly find the closest matches. The full story is in [How embeddings are made](04-embeddings.md).

## Step 7: Hand the results to the website

*Code:* `lib/server/converters.ts`, `lib/server/indexJob.ts`

GraphRAG writes `.parquet` files. The app converts them to `.json` files that the browser can load:

| File | What it holds |
|------|---------------|
| `entities.json` | Every dot: name, type, description, degree, frequency |
| `relationships.json` | Every line: source, target, description, weight |
| `communities.json` | Every community and which dots belong to it |
| `community_reports.json` | The written report for each community |
| `text_units.json` | The chunks of original text |

**Live view:** the app converts each file as soon as its step finishes, so dots start appearing on the map while the build is still running.

## How a build stays safe

*Code:* `lib/server/indexJob.ts`

- Every build runs in its own **temporary workspace** (`.build-jobs/<id>/`). Your current graph is only replaced if the build **succeeds**.
- If the provider rejects your key or you run out of credit, the app spots the error in the logs and **stops early**, instead of retrying for ten minutes.
- AI answers are saved in `cache/`, so rebuilding the same text does not pay twice. **Rebuild from scratch** clears that cache.

## What it costs

The LLM is called for every chunk (twice with gleaning), for merging descriptions, and once per community. A rough guide: a 100-page document makes about 50 chunks, which means a few hundred LLM calls. Try small files first.

Next: [How embeddings are made](04-embeddings.md)
