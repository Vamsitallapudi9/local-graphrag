import { NextResponse } from 'next/server'
import path from 'node:path'
import fs from 'node:fs/promises'
interface UploadEntry { name: string; size: number; mtime: number; type: 'txt'|'pdf'; status?: string }
async function readUploads(p: string): Promise<UploadEntry[]> {
  try {
    const raw = await fs.readFile(p, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed as UploadEntry[] : []
  } catch { return [] }
}

export async function POST(req: Request) {
  try {
    const root = process.cwd()
    const form = await req.formData()
    const files = form.getAll('files') as File[]
    if (!files || files.length === 0) return NextResponse.json({ error: 'No files' }, { status: 400 })
    const inputDir = path.join(root, 'input')
    await fs.mkdir(inputDir, { recursive: true })
    const registryPath = path.join(root, 'output', 'uploads.json')
    await fs.mkdir(path.dirname(registryPath), { recursive: true })
    const reg = await readUploads(registryPath)
    for (const f of files) {
      // Normalize and sanitize filename to prevent path traversal
      const safeName = path.basename(String(f.name || '').replace(/\0/g, ''))
      const arr = new Uint8Array(await f.arrayBuffer())
      const outPath = path.join(inputDir, safeName)
      await fs.writeFile(outPath, arr)
      const entry: UploadEntry = { name: safeName, size: arr.length, mtime: Date.now(), type: safeName.toLowerCase().endsWith('.pdf') ? 'pdf' : 'txt', status: 'pending' }
      const idx = reg.findIndex((x) => x.name === entry.name)
      if (idx >= 0) reg[idx] = entry; else reg.push(entry)
    }
    await fs.writeFile(registryPath, JSON.stringify(reg, null, 2))
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Upload error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
