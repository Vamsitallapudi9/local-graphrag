'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Cloud, Download, ExternalLink, HardDrive, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CLOUD_PROVIDER_IDS, PROVIDER_ADAPTERS, type BuildProvider, type CloudProviderId, type EmbeddingSource, type ProviderAdapter } from '@/lib/providers'

export type CloudProviderStatus = {
  ready: boolean
  keyStored: boolean
  keyFromEnv: boolean
  viaClaudeCode: boolean
  claudeCliInstalled?: boolean
  completionModel: string
  embeddingSource: EmbeddingSource
  embeddingModel: string
  embeddingDimensions: number
}

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
  localEmbedding: { model: string; dimensions: number; running: boolean }
} & Record<CloudProviderId, CloudProviderStatus>

export function ProviderSetupDialog({ open, onOpenChange, status, onStatusChange, initialTab = 'local' }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: ProviderStatus | null
  onStatusChange: (status: ProviderStatus) => void
  initialTab?: BuildProvider
}) {
  const [tab, setTab] = useState<BuildProvider>(initialTab)
  const [completionModel, setCompletionModel] = useState('gemma4:latest')
  const [embeddingModel, setEmbeddingModel] = useState('embeddinggemma:latest')
  const [embeddingVectorSize, setEmbeddingVectorSize] = useState(768)
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
  }, [status])

  const refresh = useCallback(async () => {
    const response = await fetch('/api/providers', { cache: 'no-store' })
    if (response.ok) onStatusChange(await response.json())
  }, [onStatusChange])

  const saveProvider = async (body: Record<string, unknown>) => {
    setSaving(true); setError('')
    try {
      const response = await fetch('/api/providers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not save the settings')
      onStatusChange(payload)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the settings')
      return false
    } finally { setSaving(false) }
  }

  const saveLocal = () => saveProvider({ provider: 'local', completionModel, embeddingModel, embeddingVectorSize })

  const removeKey = async (provider: CloudProviderId) => {
    const response = await fetch(`/api/providers?provider=${provider}`, { method: 'DELETE' })
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
          <DialogDescription>Choose which model reads your documents. Every project can build with any of them.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={value => setTab(value as BuildProvider)} className="min-h-0 gap-0">
          <TabsList className="mx-7 mt-4 grid h-11 w-[calc(100%-3.5rem)] grid-cols-4 rounded-full bg-white/[0.06] p-1">
            <TabsTrigger value="local" className="rounded-full text-sm font-semibold"><HardDrive /> Ollama</TabsTrigger>
            {CLOUD_PROVIDER_IDS.map(id => (
              <TabsTrigger key={id} value={id} className="rounded-full text-sm font-semibold"><Cloud /> {PROVIDER_ADAPTERS[id].label}</TabsTrigger>
            ))}
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

          {CLOUD_PROVIDER_IDS.map(id => (
            <TabsContent key={id} value={id} className="min-h-0 overflow-auto px-7 py-5" data-hmi-scroll>
              <CloudProviderTab
                adapter={PROVIDER_ADAPTERS[id]}
                status={status?.[id]}
                localEmbedding={status?.localEmbedding}
                saving={saving}
                onSave={body => saveProvider({ provider: id, ...body })}
                onRemoveKey={() => removeKey(id)}
              />
            </TabsContent>
          ))}
        </Tabs>
        {error && <p className="bg-destructive/10 px-7 py-3 text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}

function CloudProviderTab({ adapter, status, localEmbedding, saving, onSave, onRemoveKey }: {
  adapter: ProviderAdapter
  status?: CloudProviderStatus
  localEmbedding?: ProviderStatus['localEmbedding']
  saving: boolean
  onSave: (body: { apiKey: string; completionModel: string; embeddingSource: EmbeddingSource }) => Promise<boolean>
  onRemoveKey: () => void
}) {
  const [apiKey, setApiKey] = useState('')
  const [completionModel, setCompletionModel] = useState(adapter.defaultCompletionModel)
  const [embeddingSource, setEmbeddingSource] = useState<EmbeddingSource>('local')

  useEffect(() => {
    if (!status) return
    setCompletionModel(status.completionModel)
    setEmbeddingSource(status.embeddingSource)
  }, [status])

  const hasKey = Boolean(status?.keyStored || status?.keyFromEnv)
  const keyHint = status?.keyStored
    ? 'Key saved. Enter a new key to replace it.'
    : status?.keyFromEnv
      ? `Using ${adapter.envKey} from your environment.`
      : adapter.keyOptional
        ? 'Optional. Leave empty to use your Claude Code login.'
        : adapter.keyPlaceholder
  const localLabel = `On this computer: ${localEmbedding?.model ?? 'Hugging Face model'} (free, private)`
  const save = async () => { if (await onSave({ apiKey, completionModel, embeddingSource })) setApiKey('') }

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl bg-white/[0.05] p-4 text-sm">
        <p>{adapter.label} reads your documents and finds the entities and links. Your text is sent to {adapter.label}, so don&apos;t use private data.</p>
        {adapter.keyOptional && <p className="mt-1 text-xs text-muted-foreground">No key? The app uses your Claude Code login instead{status?.claudeCliInstalled === false ? ', but the claude command was not found' : ''}.</p>}
        <p className="mt-1 text-xs text-muted-foreground">Keys are stored in a gitignored file readable only by your account and are never sent back to the browser.</p>
        <a className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline" href={adapter.keyUrl} target="_blank" rel="noreferrer">Get a {adapter.label} API key <ExternalLink className="h-3 w-3" /></a>
      </div>
      <div className="grid grid-cols-2 overflow-hidden rounded-2xl bg-white/[0.05] text-sm">
        <StatusCell label="API key" ok={hasKey || status?.viaClaudeCode === true} value={hasKey ? 'Configured' : status?.viaClaudeCode ? 'Claude Code login' : 'Missing'} />
        <StatusCell label="Preset" ok={status?.ready === true} value={status?.ready ? 'Ready' : 'Needs setup'} />
      </div>
      <label className="grid gap-1.5 text-xs"><span>{adapter.label} API key</span><Input type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={keyHint} className="h-11 rounded-2xl" /></label>
      <label className="grid gap-1.5 text-xs"><span>Extraction model</span><Input value={completionModel} onChange={event => setCompletionModel(event.target.value)} className="h-11 rounded-2xl" /></label>
      <label className="grid gap-1.5 text-xs">
        <span>Embedding model</span>
        <select value={embeddingSource} onChange={event => setEmbeddingSource(event.target.value as EmbeddingSource)} className="h-11 rounded-2xl border border-white/15 bg-transparent px-3 text-sm">
          <option value="local" className="bg-[#0d1138]">{localLabel}</option>
          {adapter.embedding && <option value="provider" className="bg-[#0d1138]">{adapter.label} API: {adapter.embedding.model}</option>}
        </select>
        <span className="text-muted-foreground">
          {embeddingSource === 'local'
            ? 'Downloads once (about 220 MB) on the first build, or ahead of time with pnpm download-embeddings.'
            : `Uses your ${adapter.label} key. Nothing to download.`}
          {!adapter.embedding && ' Anthropic has no embedding API, so Claude always uses the local model.'}
        </span>
      </label>
      <p className="text-xs text-amber-200/80">After changing the embedding model, rebuild the project so questions use matching embeddings.</p>
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" className="rounded-lg text-red-300" onClick={onRemoveKey} disabled={!status?.keyStored}><Trash2 /> Remove saved key</Button>
        <Button className="h-11 rounded-full" onClick={save} disabled={saving || (!apiKey.trim() && !hasKey && !adapter.keyOptional)}>{saving ? <Loader2 className="animate-spin" /> : <Check />} Save settings</Button>
      </div>
    </div>
  )
}

function StatusCell({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return <div className="p-3.5"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 ${ok ? 'text-mint' : 'text-amber-200'}`}>{value}</p></div>
}
