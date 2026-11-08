import { NextRequest } from 'next/server'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs/promises'
import { resolveQueryEnv } from '@/lib/server/providerConfig'
import { redactSecrets } from '@/lib/server/redact'

type Entity = { id: string; title?: string }

const METHODS = ['drift', 'local', 'global', 'basic']

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

// Entities whose title appears as a whole phrase in the text.
function findEntityIds(text: string, entities: Entity[], max = 30) {
  const hay = ` ${normalize(text)} `
  const ids: string[] = []
  for (const e of entities) {
    const title = normalize(e.title || '')
    if (title.length >= 3 && hay.includes(` ${title} `)) ids.push(e.id)
    if (ids.length >= max) break
  }
  return ids
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const question = String(body?.message || '').trim()
  const method = METHODS.includes(body?.method) ? body.method : 'drift'
  if (!question) return new Response('Missing message', { status: 400 })

  const root = process.cwd()
  const encoder = new TextEncoder()
  let child: ReturnType<typeof spawn> | undefined
  let cancelled = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (!cancelled) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      const fail = (message: string) => {
        send('fault', { message })
        controller.close()
      }

      let env: NodeJS.ProcessEnv
      try {
        await fs.mkdir(path.join(root, 'output'), { recursive: true })
        env = await resolveQueryEnv()
      } catch (e) {
        return fail(e instanceof Error ? e.message : 'Could not start the model servers.')
      }
      if (cancelled) return

      child = spawn('uv', ['run', 'graphrag', 'query', question, '--method', method, '--root', root, '--data', path.join(root, 'output')], { cwd: root, env })
      let out = ''
      child.stdout?.on('data', (chunk: Buffer) => {
        const text = redactSecrets(chunk.toString())
        out += text
        send('answer-chunk', { text })
      })
      child.stderr?.on('data', (chunk: Buffer) => console.warn('[chat] graphrag:', redactSecrets(chunk.toString()).trim()))
      child.on('error', () => fail('The GraphRAG query process could not start.'))
      child.on('close', async (code) => {
        if (cancelled) return
        const answer = out.trim()
        if (code !== 0 || !answer) {
          return fail(code !== 0 ? 'The query failed. Check that the project is indexed, then try again.' : 'No answer came back. Try another mode.')
        }
        const entities: Entity[] = await fs.readFile(path.join(root, 'output', 'entities.json'), 'utf-8').then(JSON.parse, () => [])
        send('answer', { text: answer, highlights: findEntityIds(`${answer} ${question}`, entities) })
        controller.close()
      })
    },
    cancel() {
      cancelled = true
      child?.kill('SIGTERM')
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' },
  })
}
