import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// Local Hugging Face embeddings (fastembed / ONNX on CPU) served as an
// OpenAI-compatible endpoint. Replaces Ollama for embeddings.
export const EMBED_PORT = Number(process.env.EMBED_PORT || 11435)
export const EMBED_API_BASE = `http://127.0.0.1:${EMBED_PORT}/v1`

export async function embedServerHealth(): Promise<{ running: boolean; model?: string; dimensions?: number }> {
  try {
    const response = await fetch(`http://127.0.0.1:${EMBED_PORT}/health`, { signal: AbortSignal.timeout(1500) })
    if (!response.ok) return { running: false }
    const payload = await response.json() as { model?: string; dimensions?: number }
    return { running: true, model: payload.model, dimensions: payload.dimensions }
  } catch {
    return { running: false }
  }
}

let starting: Promise<void> | null = null

export async function ensureEmbedServer(model: string, log: (line: string) => void = () => {}) {
  const health = await embedServerHealth()
  if (health.running && health.model === model) return
  if (health.running && health.model !== model) {
    throw new Error(`EMBED_MODEL_MISMATCH: local embedding server is running ${health.model}; stop it and rebuild to use ${model}`)
  }
  if (!starting) {
    starting = (async () => {
      const cwd = process.cwd()
      fs.mkdirSync(path.join(cwd, 'logs'), { recursive: true })
      const out = fs.openSync(path.join(cwd, 'logs', 'embed-server.log'), 'a')
      const child = spawn('uv', ['run', '--frozen', 'python', 'scripts/embed_server.py'], {
        cwd,
        env: { ...process.env, EMBED_MODEL: model, EMBED_PORT: String(EMBED_PORT), EMBED_CACHE_DIR: path.join(cwd, '.graphrag', 'hf-models') },
        stdio: ['ignore', out, out],
        detached: true,
      })
      child.unref()
      log(`EMBEDDINGS · starting local ${model} (first run downloads it from Hugging Face)`)
      // First start can include the model download.
      for (let i = 0; i < 600; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        if ((await embedServerHealth()).running) { log('EMBEDDINGS · ready'); return }
        if (child.exitCode !== null) throw new Error('EMBED_SERVER_FAILED: see logs/embed-server.log')
      }
      throw new Error('EMBED_SERVER_TIMEOUT: see logs/embed-server.log')
    })().finally(() => { starting = null })
  }
  await starting
}
