import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'

export async function POST(req: Request) {
  try {
    const { name } = await req.json().catch(() => ({})) as { name?: string }
    if (typeof name !== 'string') return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
    const root = process.cwd()
    const p = path.join(root, 'output', 'kg.json')
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, JSON.stringify({ name, updated_at: Date.now() }, null, 2))
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to rename'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

