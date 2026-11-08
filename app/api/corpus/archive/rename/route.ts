import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'

export async function POST(req: Request) {
  try {
    const { from, to } = await req.json().catch(() => ({})) as { from?: string; to?: string }
    if (!from || !to || /[\\/]/.test(from) || /[\\/]/.test(to)) return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
    const root = process.cwd()
    const src = path.join(root, 'archives', from)
    const dst = path.join(root, 'archives', to)
    await fs.stat(src)
    await fs.rename(src, dst)
    // Update kg.json name if present
    try {
      const metaPath = path.join(dst, 'kg.json')
      const raw = await fs.readFile(metaPath, 'utf-8').catch(() => '')
      let meta: Record<string, unknown> = {}
      if (raw) { try { meta = JSON.parse(raw) as Record<string, unknown> } catch {} }
      meta.name = to
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2))
    } catch {}
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to rename'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
