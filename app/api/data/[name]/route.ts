import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'

const ALLOWED = new Set([
  'entities.json',
  'relationships.json',
  'communities.json',
  'community_reports.json',
])

export async function GET(_req: NextRequest, context: { params: Promise<{ name: string }> | { name: string } }) {
  const p = 'then' in context.params ? await (context.params as Promise<{ name: string }>) : (context.params as { name: string })
  const name = p.name
  if (!ALLOWED.has(name)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  try {
    const filePath = path.join(process.cwd(), 'output', name)
    const raw = await fs.readFile(filePath, 'utf-8')
    return new NextResponse(raw, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 404 })
  }
}
