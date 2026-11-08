'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Cloud, Download, ExternalLink, HardDrive, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type ProviderStatus = {
  local: {
    ready: boolean
    installed: boolean
    running: boolean
    version: string | null
    models: string[]
    completionModel: string
    embeddingModel: string
    embeddingVectorSize: number
    completionReady: boolean
    embeddingReady: boolean
  }
  cloud: {
    ready: boolean
    keyStored: boolean
    completionModel: string
    embeddingModel: string
  }
}

export function ProviderSetupDialog({ open, onOpenChange, status, onStatusChange, initialTab = 'local' }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: ProviderStatus | null
  onStatusChange: (status: ProviderStatus) => void
  initialTab?: 'local' | 'cloud'
}) {
  const [tab, setTab] = useState(initialTab)
  const [apiKey, setApiKey] = useState('')
  const [completionModel, setCompletionModel] = useState('gemma4:latest')
  const [embeddingModel, setEmbeddingModel] = useState('BAAI/bge-base-en-v1.5')
  const [embeddingVectorSize, setEmbeddingVectorSize] = useState(768)
  const [cloudCompletionModel, setCloudCompletionModel] = useState('claude-sonnet-5-5')
  const [cloudEmbeddingModel, setCloudEmbeddingModel] = useState('BAAI/bge-base-en-v1.5')
  const [saving, setSaving] = useState(false)
  const [pulling, setPulling] = useState<string | null>(null)
  const [pullLog, setPullLog] = useState<string[]>([])
  const [error, setError] = useState('')

  useEffect(() => { if (open) setTab(initialTab) }, [initialTab, open])
  useEffect(() => {
    if (!status) return
    setCompletionModel(status.local.completionModel)
    setEmbeddingModel(status.local.embeddingModel)
    setEmbeddingVectorSize(status.local.embeddingVectorSize)
    setCloudCompletionModel(status.cloud.completionModel)
    setCloudEmbeddingModel(status.cloud.embeddingModel)
  }, [status])

  const refresh = useCallback(async () => {
    const response = await fetch('/api/providers', { cache: 'no-store' })
    if (response.ok) onStatusChange(await response.json())
  }, [onStatusChange])

  const saveLocal = async () => {
    setSaving(true); setError('')
    try {
      const response = await fetch('/api/providers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'local', completionModel, embeddingModel, embeddingVectorSize }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not save the local settings')
      onStatusChange(payload)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the local settings') }
    finally { setSaving(false) }
  }

  const saveCloud = async () => {
    setSaving(true); setError('')
    try {
      const response = await fetch('/api/providers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'cloud', apiKey, completionModel: cloudCompletionModel, embeddingModel: cloudEmbeddingModel }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not save the Claude settings')
      setApiKey('')
      onStatusChange(payload)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the Claude settings') }
    finally { setSaving(false) }
  }

  const removeCloud = async () => {
    const response = await fetch('/api/providers', { method: 'DELETE' })
    if (response.ok) onStatusChange(await response.json())
  }

  const pullModel = (model: string) => {
    setPulling(model); setPullLog([]); setError('')
    const source = new EventSource(`/api/providers/ollama/pull?model=${encodeURIComponent(model)}`)
    source.onmessage = event => {
      const message = JSON.parse(event.data) as { type: string; line?: string; ok?: boolean; error?: string }
      if (message.type === 'progress' && message.line) setPullLog(previous => [...previous.slice(-40), message.line!])
      if (message.type === 'done') {
        source.close(); setPulling(null)
        if (!message.ok) setError(message.error || `Could not pull ${model}`)
        void refresh()
      }
    }
    source.onerror = () => { source.close(); setPulling(null); setError('Ollama pull connection closed'); void refresh() }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] max-w-2xl overflow-hidden rounded-3xl border-white/15 bg-[#0d1138] p-0 text-foreground shadow-2xl">
        <DialogHeader className="px-7 pb-2 pt-7">
          <DialogTitle className="text-3xl font-semibold tracking-tight">Model settings</DialogTitle>
          <DialogDescription>Choose which model reads your documents. Every project can build with either one.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={value => setTab(value as 'local' | 'cloud')} className="min-h-0 gap-0">
          <TabsList className="mx-7 mt-4 grid h-11 w-[calc(100%-3.5rem)] grid-cols-2 rounded-full bg-white/[0.06] p-1">
            <TabsTrigger value="local" className="rounded-full text-sm font-semibold"><HardDrive /> On this computer</TabsTrigger>
            <TabsTrigger value="cloud" className="rounded-full text-sm font-semibold"><Cloud /> Claude</TabsTrigger>
          </TabsList>

          <TabsContent value="local" className="min-h-0 overflow-auto px-7 py-5" data-hmi-scroll>
            <div className="grid gap-5">
              <div className="grid grid-cols-3 overflow-hidden rounded-2xl bg-white/[0.05] text-sm">
                <StatusCell label="Ollama" ok={status?.local.installed === true} value={status?.local.installed ? 'Installed' : 'Not installed'} />
                <StatusCell label="Service" ok={status?.local.running === true} value={status?.local.running ? 'Responding' : 'Offline'} />
                <StatusCell label="Preset" ok={status?.local.ready === true} value={status?.local.ready ? 'Ready' : 'Needs setup'} />
              </div>
              {!status?.local.installed && (
                <div className="rounded-2xl bg-white/[0.05] p-4">
                  <p className="text-sm">Install Ollama, then return here and check again.</p>
                  <p className="mt-1 text-xs text-muted-foreground">macOS 14+, Windows, and Linux are supported by Ollama.</p>
                  <Button asChild className="mt-4 h-11 rounded-full"><a href="https://ollama.com/download" target="_blank" rel="noreferrer">Open official installer <ExternalLink /></a></Button>
                </div>
              )}
              {status?.local.installed && !status.local.running && (
                <div className="rounded-2xl border border-amber-400/30 p-4 text-sm">Ollama is installed but not running. Open the Ollama app, then press Check again.</div>
              )}
              <div className="grid gap-3">
                <label className="grid gap-1.5 text-xs"><span>Extraction model</span><Input value={completionModel} onChange={event => setCompletionModel(event.target.value)} className="h-11 rounded-2xl" /></label>
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 text-xs"><span className="truncate text-muted-foreground">{status?.local.completionReady ? 'Installed' : 'Required'} · {completionModel}</span><Button variant="outline" size="sm" className="rounded-full" disabled={!status?.local.running || pulling !== null} onClick={() => pullModel(completionModel)}>{pulling === completionModel ? <Loader2 className="animate-spin" /> : <Download />} Pull model</Button></div>
                <label className="grid gap-1.5 text-xs"><span>Embedding model</span><Input value={embeddingModel} onChange={event => setEmbeddingModel(event.target.value)} className="h-11 rounded-2xl" /></label>
                <label className="grid gap-1.5 text-xs"><span>Embedding dimensions</span><Input type="number" min={32} max={8192} value={embeddingVectorSize} onChange={event => setEmbeddingVectorSize(Number(event.target.value))} className="h-11 rounded-2xl" /></label>
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 text-xs"><span className="truncate text-muted-foreground">{status?.local.embeddingReady ? 'Installed' : 'Required'} · {embeddingModel}</span><Button variant="outline" size="sm" className="rounded-full" disabled={!status?.local.running || pulling !== null} onClick={() => pullModel(embeddingModel)}>{pulling === embeddingModel ? <Loader2 className="animate-spin" /> : <Download />} Pull model</Button></div>
              </div>
              {pullLog.length > 0 && <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-2xl bg-black/40 p-3 font-mono text-xs text-muted-foreground" data-hmi-scroll>{pullLog.join('\n')}</pre>}
              <div className="flex justify-between gap-3"><Button variant="outline" className="h-11 rounded-full" onClick={refresh}><RefreshCw /> Check again</Button><Button className="h-11 rounded-full" onClick={saveLocal} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Check />} Save settings</Button></div>
            </div>
          </TabsContent>

          <TabsContent value="cloud" className="min-h-0 overflow-auto px-7 py-5" data-hmi-scroll>
            <div className="grid gap-4">
              <div className="rounded-2xl bg-white/[0.05] p-4 text-sm"><p>Claude (Anthropic) does the extraction: faster and stronger than a small local model. Embeddings run locally from a Hugging Face model (CPU, no Ollama), because Anthropic has no embedding API. It downloads once on the first build.</p><p className="mt-1 text-xs text-muted-foreground">This app-wide key is available to every GraphRAG project. It is stored in a gitignored file readable only by your operating-system account and never returned to the browser.</p></div>
              <label className="grid gap-1.5 text-xs"><span>Anthropic API key</span><Input type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={status?.cloud.ready ? 'Key configured — enter a new key to replace it' : 'sk-ant-…'} className="h-11 rounded-2xl" /></label>
              <label className="grid gap-1.5 text-xs"><span>Extraction model</span><Input value={cloudCompletionModel} onChange={event => setCloudCompletionModel(event.target.value)} className="h-11 rounded-2xl" /></label>
              <label className="grid gap-1.5 text-xs"><span>Embedding model (local Hugging Face, 768-dim)</span><Input value={cloudEmbeddingModel} onChange={event => setCloudEmbeddingModel(event.target.value)} className="h-11 rounded-2xl" /></label>
              <div className="flex items-center justify-between gap-3"><Button variant="ghost" className="rounded-lg text-red-300" onClick={removeCloud} disabled={!status?.cloud.keyStored}><Trash2 /> Remove stored key</Button><Button className="h-11 rounded-full" onClick={saveCloud} disabled={saving || !apiKey.trim()}>{saving ? <Loader2 className="animate-spin" /> : <Check />} Save settings</Button></div>
            </div>
          </TabsContent>
        </Tabs>
        {error && <p className="bg-destructive/10 px-7 py-3 text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}

function StatusCell({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return <div className="p-3.5"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 ${ok ? 'text-mint' : 'text-amber-200'}`}>{value}</p></div>
}
