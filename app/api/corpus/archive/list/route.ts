import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'

async function dirSizeBytes(dir: string): Promise<number> {
  try {
    const ents = await fs.readdir(dir, { withFileTypes: true })
    let total = 0
    for (const ent of ents) {
      const p = path.join(dir, ent.name)
      if (ent.isFile()) {
        const st = await fs.stat(p)
        total += st.size
      } else if (ent.isDirectory()) {
        total += await dirSizeBytes(p)
      }
    }
    return total
  } catch {
    return 0
  }
}

export async function GET() {
  const root = process.cwd()
  const archivesDir = path.join(root, 'archives')
  try {
    const ents = await fs.readdir(archivesDir, { withFileTypes: true })
    const dirs = ents.filter(e => e.isDirectory()).map(e => e.name)
    const items = await Promise.all(dirs.map(async (name) => {
      const base = path.join(archivesDir, name)
      const outDir = path.join(base, 'output')
      const st = await fs.stat(base).catch(() => ({ mtimeMs: 0 })) as { mtimeMs: number }
      const sizeBytes = await dirSizeBytes(outDir)
      let kgName = ''
      try {
        const metaRaw = await fs.readFile(path.join(base, 'kg.json'), 'utf-8')
        const meta = JSON.parse(metaRaw) as { name?: string }
        if (meta?.name) kgName = String(meta.name)
      } catch {}
      return { name, kgName, modified_at: st.mtimeMs, sizeKB: Math.round(sizeBytes / 102.4) / 10 } // 0.1 KB precision
    }))
    items.sort((a, b) => (b.modified_at || 0) - (a.modified_at || 0))
    return NextResponse.json({ archives: items })
  } catch {
    return NextResponse.json({ archives: [] })
  }
}
