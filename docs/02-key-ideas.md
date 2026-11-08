# 2. Key ideas in plain words

You will see these words everywhere in the code and docs. Each one gets a one-line meaning and an everyday example.

## AI and models

**LLM (Large Language Model)**
A program that has read a huge amount of text and can now read and write like a person. GPT (OpenAI), Claude (Anthropic) and Gemini (Google) are LLMs.
*Example:* you give it a paragraph and ask "who is mentioned here?", and it answers.

**Model provider**
The company (or program) that runs the LLM for you. This app supports **OpenAI**, **Claude**, **Gemini**, and **Ollama** (which runs models on your own computer).

**API key**
A secret password that lets your app use a provider's model. The provider uses it to know who to bill. Keep it private, like a bank PIN.

**Prompt**
The instructions we send to the LLM. This project's prompts live in the `prompts/` folder, as plain text files you can read.

**Token**
LLMs read text in small pieces called tokens. A token is roughly 3/4 of an English word. Providers charge per token.

## Text and search

**Chunk (also called a "text unit")**
A small piece of a document. Documents are cut into chunks of about 1,200 tokens (around 2 pages), because a model reads small pieces more carefully than a whole book.
*Example:* tearing a book into chapters so a helper can read one at a time.

**Embedding**
A list of numbers that stands for the *meaning* of a piece of text. Texts with similar meanings get similar numbers.
*Example:* "cat" and "kitten" get numbers that are close. "cat" and "airplane" get numbers that are far apart.
See [How embeddings are made](04-embeddings.md).

**Vector**
Just another word for "a list of numbers". An embedding is a vector.

**Dimensions**
How many numbers are in one embedding. The local model makes 768 numbers per text, OpenAI's makes 1,536, and Gemini's makes 3,072. More numbers can hold more detail.

**Vector store**
A database built to find "the closest lists of numbers" fast. This app uses **LanceDB**, saved in `output/lancedb/`.

**RAG (Retrieval-Augmented Generation)**
A way of answering questions: first **find** (retrieve) the right pieces of your documents, then ask the LLM to **write** (generate) an answer using only those pieces. It's like an open-book exam.

**GraphRAG**
RAG plus a **graph**. Instead of only finding similar text, it also uses the map of names and connections. This helps with questions like "how is X connected to Y?" or "what are the big themes?".

## Graphs

**Graph**
A set of **dots** and **lines** that connect them. (Not a bar chart!)

**Entity (a dot)**
A "thing" found in the text: a person, organization, place or event.
*Example:* "Marie Curie", "University of Paris", "Paris", "Nobel Prize 1903".

**Relationship (a line)**
A connection between two entities, with a short description and a **strength** from 1 to 10.
*Example:* Marie Curie → University of Paris: "taught at", strength 8.

**Degree**
How many lines touch a dot. Popular dots have a high degree and are drawn bigger.

**Community**
A group of entities that are more connected to each other than to the rest. Found automatically by a method called **Leiden clustering**.
*Example:* a group of friends at a party who mostly talk to each other.

**Community report**
A short summary the LLM writes about one community: a title, a summary, an importance score and key findings.

## Files

**Parquet**
A compact table file format that GraphRAG writes (`entities.parquet`, and so on). The app converts these to **JSON** so the browser can read them.

**JSON**
A simple text format for data, like `{"name": "Alice", "age": 30}`.

Next: [How the graph is built](03-building-the-graph.md)
