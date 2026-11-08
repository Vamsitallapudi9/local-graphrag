"""Tiny local OpenAI-compatible /v1/chat/completions server.

Every request is answered by claude_client.ask (the local Claude Code CLI), so
GraphRAG needs no API key. Binds to 127.0.0.1 only.
"""
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from claude_client import ask

PORT = int(os.environ.get("LLM_PORT", "11436"))
STARTED = time.time()


def text_of(content):
    if isinstance(content, list):
        return "".join(p.get("text", "") for p in content if isinstance(p, dict))
    return content or ""


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
            # pid + start time let the app restart a server running stale code.
            self._send(200, {"ok": True, "data": [], "pid": os.getpid(), "started": STARTED})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path.rstrip("/") != "/v1/chat/completions":
            return self._send(404, {"error": "not found"})
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            msgs = req["messages"]
            system = "\n\n".join(text_of(m["content"]) for m in msgs if m["role"] == "system") or None
            # The CLI takes one prompt; flatten the rest of the conversation.
            convo = [m for m in msgs if m["role"] != "system"]
            prompt = text_of(convo[0]["content"]) if len(convo) == 1 else \
                "\n\n".join(f'{m["role"].upper()}: {text_of(m["content"])}' for m in convo)
            fmt = req.get("response_format") or {}
            schema = (fmt.get("json_schema") or {}).get("schema") if fmt.get("type") == "json_schema" else None
            out = ask(prompt, system=system, model=req.get("model", "claude-sonnet-5-5"), schema=schema)
            if schema:
                out = json.dumps(out)
            if req.get("stream"):
                # GraphRAG queries ask for a stream; answer with the whole text as one SSE chunk.
                def chunk(delta, finish=None):
                    return "data: " + json.dumps({
                        "id": "chatcmpl-local", "object": "chat.completion.chunk", "created": int(time.time()),
                        "model": req.get("model"), "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
                    }) + "\n\n"
                body = (chunk({"role": "assistant", "content": out}) + chunk({}, "stop") + "data: [DONE]\n\n").encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            self._send(200, {
                "id": "chatcmpl-local", "object": "chat.completion", "created": int(time.time()),
                "model": req.get("model"),
                "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": out}}],
                "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            })
        except Exception as exc:  # noqa: BLE001
            self._send(500, {"error": {"message": str(exc)}})

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    print(f"ready: claude CLI bridge port={PORT}", flush=True)
    try:
        ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
