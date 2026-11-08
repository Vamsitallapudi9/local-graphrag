import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// Local OpenAI-compatible bridge to the Claude Code CLI (scripts/llm_server.py).
// Replaces direct Anthropic API calls, so no API key is needed.
export const LLM_PORT = Number(process.env.LLM_PORT || 11436)
export const LLM_API_BASE = `http://127.0.0.1:${LLM_PORT}/v1`

const healthy = () => fetch(`http://127.0.0.1:${LLM_PORT}/health`, { signal: AbortSignal.timeout(1500) }).then(r => r.ok, () => false)

const health = () => fetch(`http://127.0.0.1:${LLM_PORT}/health`, { signal: AbortSignal.timeout(1500) })
  .then(r => r.ok ? r.json() as Promise<{ pid?: number; started?: number }> : null, () => null)

export async function ensureLlmServer(log: (line: string) => void = () => {}) {
  const cwd = process.cwd()
  const running = await health()
  if (running) {
    // Restart if the bridge's code was edited after it started (or it predates pid/started reporting).
    const codeMtime = Math.max(...['llm_server.py', 'claude_client.py'].map(f => fs.statSync(path.join(cwd, 'scripts', f)).mtimeMs))
    if (running.pid && running.started && running.started * 1000 >= codeMtime) return
    log('LLM · bridge code changed, restarting')
    try {
      if (running.pid) process.kill(running.pid)
      else spawn('pkill', ['-f', 'scripts/llm_server.py']) // old server without pid in /health
    } catch {}
    for (let i = 0; i < 20 && await healthy(); i++) await new Promise(resolve => setTimeout(resolve, 250))
  }
  fs.mkdirSync(path.join(cwd, 'logs'), { recursive: true })
  const out = fs.openSync(path.join(cwd, 'logs', 'llm-server.log'), 'a')
  const child = spawn('uv', ['run', '--frozen', 'python', 'scripts/llm_server.py'], {
    cwd,
    env: { ...process.env, LLM_PORT: String(LLM_PORT), PYTHONPATH: path.join(cwd, 'scripts') },
    stdio: ['ignore', out, out],
    detached: true,
  })
  child.unref()
  log('LLM · starting Claude CLI bridge')
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 500))
    if (await healthy()) { log('LLM · ready'); return }
    if (child.exitCode !== null) break
  }
  throw new Error('LLM_SERVER_FAILED: see logs/llm-server.log')
}
