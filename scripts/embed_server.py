"""Tiny local OpenAI-compatible /v1/embeddings server.

Runs a Hugging Face embedding model on CPU through fastembed (ONNX, no torch,
no Ollama). GraphRAG talks to it as if it were the OpenAI embeddings API.
Binds to 127.0.0.1 only.

Download the model ahead of time (no server):
    uv run --frozen python scripts/embed_server.py --download-only
"""
import base64
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
from fastembed import TextEmbedding

MODEL = os.environ.get("EMBED_MODEL", "BAAI/bge-base-en-v1.5")
PORT = int(os.environ.get("EMBED_PORT", "11435"))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.environ.get("EMBED_CACHE_DIR") or os.path.join(ROOT, ".graphrag", "hf-models")

print(f"loading {MODEL} ...", flush=True)
model = TextEmbedding(model_name=MODEL, cache_dir=CACHE)
DIM = len(next(iter(model.embed(["warmup"]))))
if "--download-only" in sys.argv:
    print(f"downloaded: {MODEL} dim={DIM} -> {CACHE}", flush=True)
    sys.exit(0)
print(f"ready: {MODEL} dim={DIM} port={PORT}", flush=True)


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.rstrip("/") in ("/health", "/v1/models"):
            self._send(200, {"ok": True, "model": MODEL, "dimensions": DIM,
                             "data": [{"id": MODEL, "object": "model"}]})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path.rstrip("/") != "/v1/embeddings":
            return self._send(404, {"error": "not found"})
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            texts = req["input"]
            if isinstance(texts, str):
                texts = [texts]
            raw = list(model.embed(texts))
            # The OpenAI SDK asks for base64 by default and decodes it itself.
            if req.get("encoding_format") == "base64":
                vectors = [base64.b64encode(np.asarray(v, dtype=np.float32).tobytes()).decode() for v in raw]
            else:
                vectors = [v.tolist() for v in raw]
            tokens = sum(len(t.split()) for t in texts)
            self._send(200, {
                "object": "list",
                "model": MODEL,
                "data": [{"object": "embedding", "index": i, "embedding": v} for i, v in enumerate(vectors)],
                "usage": {"prompt_tokens": tokens, "total_tokens": tokens},
            })
        except Exception as exc:  # noqa: BLE001
            self._send(400, {"error": {"message": str(exc)}})

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    try:
        ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
