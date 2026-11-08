'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Cloud, Download, FileInput, FilePlus, FolderInput, HardDrive, Loader2, Pencil, Plus, RotateCcw, Settings2, Square, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CountUp, Ring, SplitText } from '@/components/kinetic'
import { ProviderSetupDialog, type ProviderStatus } from '@/components/ProviderSetupDialog'

type Upload = {
  name: string
  size: number
  mtime: number
  type: 'txt' | 'pdf'
  status?: string
}

type CorpusState = {
  uploads: Upload[]
  outputStats?: {
    entities?: number
    relationships?: number
    communities?: number
    text_units?: number
    last_index_time?: string
  }
  queue: { name: string; status: 'pending' | 'processing' | 'done' | 'error'; message?: string }[]
  kgName?: string
}

type ArchiveEntry = { name: string; kgName?: string; sizeKB: number }

const formatSize = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`
const formatUploadStatus = (status?: string) => status === 'pending_removal' ? 'remove after build' : (status || 'pending').replaceAll('_', ' ')
const formatElapsed = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`

export default function CorpusPanel({ onProjectNamed, onProjectDeleted }: { onProjectNamed?: (name: string) => void; onProjectDeleted?: () => void }) {
  const [state, setState] = useState<CorpusState>({ uploads: [], queue: [] })
  const [archives, setArchives] = useState<ArchiveEntry[]>([])
  const [persistedLogs, setPersistedLogs] = useState<{ ts: number; text: string }[]>([])
  const [liveLogs, setLiveLogs] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'failed' | 'succeeded'>('idle')
  const [stopping, setStopping] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(true)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [currentNameDraft, setCurrentNameDraft] = useState('')
  const [editingCurrentName, setEditingCurrentName] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)
  const [editingArchive, setEditingArchive] = useState<string | null>(null)
  const [archiveNameDraft, setArchiveNameDraft] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [pendingCurrentDelete, setPendingCurrentDelete] = useState(false)
  const [progress, setProgress] = useState(0)
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null)
  const [providerSetupOpen, setProviderSetupOpen] = useState(false)
  const [providerSetupTab, setProviderSetupTab] = useState<'local' | 'cloud'>('local')
  const [activeBuildProvider, setActiveBuildProvider] = useState<'local' | 'cloud' | null>(null)
  const [jobProjectName, setJobProjectName] = useState<string | null>(null)
  const [anyJobRunning, setAnyJobRunning] = useState(false)
  const [jobModel, setJobModel] = useState<string | null>(null)
  const sseRef = useRef<EventSource | null>(null)
  const logContainerRef = useRef<HTMLDivElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const bundleInputRef = useRef<HTMLInputElement | null>(null)
  const wasAnyJobRunningRef = useRef(false)

  const loadLogs = useCallback(async () => {
    try {
      const response = await fetch('/api/corpus/logs', { cache: 'no-store' })
      if (!response.ok) return
      const data = await response.json()
      setPersistedLogs(Array.isArray(data) ? data : [])
    } catch {}
  }, [])

  const refreshArchives = useCallback(async () => {
    try {
      const response = await fetch('/api/corpus/archive/list', { cache: 'no-store' })
      if (!response.ok) return
      const data = await response.json()
      const entries = Array.isArray(data?.archives) ? data.archives : []
      setArchives(entries.map((entry: ArchiveEntry) => ({
        name: String(entry.name || ''),
        kgName: entry.kgName ? String(entry.kgName) : undefined,
        sizeKB: Number(entry.sizeKB || 0),
      })))
    } catch {}
  }, [])

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/corpus/state', { cache: 'no-store' })
      if (response.ok) setState(await response.json())
    } finally {
      setLoading(false)
    }
    await Promise.all([loadLogs(), refreshArchives()])
  }, [loadLogs, refreshArchives])

  useEffect(() => { refresh() }, [refresh])

  const refreshProviders = useCallback(async () => {
    try {
      const response = await fetch('/api/providers', { cache: 'no-store' })
      if (response.ok) setProviderStatus(await response.json())
    } catch {}
  }, [])

  useEffect(() => { void refreshProviders() }, [refreshProviders])

  useEffect(() => {
    importInputRef.current?.setAttribute('webkitdirectory', '')
    importInputRef.current?.setAttribute('directory', '')
  }, [])

  // The index job is server-owned and survives this panel unmounting, so the
  // panel resynchronizes against /status: reattach to a running build, and
  // pick up the terminal outcome of a build that finished while closed.
  useEffect(() => {
    let cancelled = false
    const syncJob = async () => {
      try {
        const response = await fetch('/api/corpus/index/status', { cache: 'no-store' })
        if (!response.ok || cancelled) return
        const job = await response.json() as { running?: boolean; status?: string; startedAt?: number | null; progress?: number; buildProvider?: 'local' | 'cloud' | null; projectName?: string | null; completionModel?: string | null }
        const isRunning = job.running === true
        const selectedProjectIsRunning = isRunning && job.projectName === state.kgName
        setAnyJobRunning(isRunning)
        setJobProjectName(job.projectName ?? null)
        setJobModel(job.completionModel ?? null)
        setRunning(selectedProjectIsRunning)
        setActiveBuildProvider(job.buildProvider ?? null)
        if (typeof job.progress === 'number') setProgress(job.progress)
        if (selectedProjectIsRunning) {
          setRunStatus('running')
          if (job.startedAt) setStartTime(job.startedAt)
          await loadLogs()
        } else {
          if (wasAnyJobRunningRef.current) {
            setStartTime(null)
            await Promise.all([loadLogs(), refresh()])
            if (job.status === 'succeeded' && job.projectName === state.kgName) notifyGraph('graph-data-updated')
          }
          if (job.projectName === state.kgName) {
            setRunStatus(job.status === 'succeeded' ? 'succeeded' : job.status === 'failed' ? 'failed' : 'idle')
          }
        }
        wasAnyJobRunningRef.current = isRunning
      } catch {}
    }
    syncJob()
    const timer = window.setInterval(syncJob, 1000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [loadLogs, refresh, state.kgName])

  useEffect(() => {
    setCurrentNameDraft(state.kgName || '')
    if (!loading && !state.kgName?.trim()) setEditingCurrentName(true)
  }, [loading, state.kgName])

  useEffect(() => {
    if (!running || !startTime) return
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [running, startTime])

  useEffect(() => {
    const element = logContainerRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [persistedLogs, liveLogs])

  const notifyGraph = (event: 'graph-data-updated' | 'graph-data-cleared') => {
    window.dispatchEvent(new Event(event))
  }

  const saveCurrentName = async () => {
    const next = currentNameDraft.trim()
    if (!next || next === state.kgName) return
    const response = await fetch('/api/corpus/kg/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: next }),
    })
    if (response.ok) {
      setEditingCurrentName(false)
      await refresh()
      onProjectNamed?.(next)
    }
  }

  const newProject = async () => {
    const name = newProjectName.trim()
    if (!name) return
    const response = await fetch('/api/corpus/archive/create', { method: 'POST' })
    if (!response.ok) return
    await fetch('/api/corpus/kg/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setLiveLogs([])
    setRunStatus('idle')
    notifyGraph('graph-data-cleared')
    setNewProjectName('')
    setCreatingProject(false)
    await refresh()
    onProjectNamed?.(name)
  }

  const restoreArchive = async (name: string) => {
    sseRef.current?.close()
    sseRef.current = null
    const response = await fetch('/api/corpus/archive/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!response.ok) return
    // The restored project brings its own terminal history; drop this one's.
    setLiveLogs([])
    setRunStatus('idle')
    const restored = archives.find(project => project.name === name)
    onProjectNamed?.(restored?.kgName || name)
    await refresh()
    notifyGraph('graph-data-updated')
  }

  const renameArchive = async (from: string) => {
    const to = archiveNameDraft.trim()
    if (!to || to === from) return
    const response = await fetch('/api/corpus/archive/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    })
    if (response.ok) {
      setEditingArchive(null)
      setArchiveNameDraft('')
      await refreshArchives()
    }
  }

  const deleteArchive = async (name: string) => {
    const response = await fetch('/api/corpus/archive/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (response.ok) {
      setPendingDelete(null)
      await refreshArchives()
    }
  }

  const deleteCurrentProject = async () => {
    const response = await fetch('/api/corpus/project/delete', { method: 'POST' })
    if (!response.ok) return
    setPendingCurrentDelete(false)
    setLiveLogs([])
    notifyGraph('graph-data-cleared')
    await refresh()
    onProjectDeleted?.()
  }

  const uploadFiles = async (files: FileList | File[]) => {
    const pdfs = Array.from(files).filter(file => /\.(pdf|txt)$/i.test(file.name))
    if (!pdfs.length) return
    const body = new FormData()
    pdfs.forEach(file => body.append('files', file))
    setUploading(true)
    try {
      const response = await fetch('/api/corpus/upload', { method: 'POST', body })
      if (response.ok) await refresh()
    } finally {
      setUploading(false)
    }
  }

  const removeFile = async (name: string) => {
    const response = await fetch('/api/corpus/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (response.ok) await refresh()
  }

  const importOutput = async (selection: FileList | null) => {
    const files = selection ? Array.from(selection) : []
    if (!files.length || importing) return
    const body = new FormData()
    files.forEach(file => body.append('files', file, file.webkitRelativePath || file.name))
    setImporting(true)
    setImportError(null)
    try {
      const response = await fetch('/api/corpus/import', { method: 'POST', body })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        setImportError(result.error || 'Output import failed.')
        return
      }
      setLiveLogs([])
      await refresh()
      notifyGraph('graph-data-updated')
    } catch {
      setImportError('Output import failed.')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
      if (bundleInputRef.current) bundleInputRef.current.value = ''
    }
  }

  const startIndex = (provider: 'local' | 'cloud', fresh = false) => {
    if (anyJobRunning) return
    if (!providerStatus?.[provider].ready) {
      setProviderSetupTab(provider)
      setProviderSetupOpen(true)
      return
    }
    setPersistedLogs([])
    setLiveLogs([])
    setElapsed(0)
    setProgress(0)
    setStartTime(Date.now())
    setRunning(true)
    setRunStatus('running')
    setActiveBuildProvider(provider)
    setJobProjectName(state.kgName || null)
    setAnyJobRunning(true)
    const source = new EventSource(`/api/corpus/index/stream?provider=${provider}${fresh ? '&fresh=1' : ''}`)
    sseRef.current = source
    source.onmessage = event => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'log') setLiveLogs(previous => [...previous, message.line])
        if (message.type === 'progress' && typeof message.value === 'number') setProgress(message.value)
        // Builds run in an isolated workspace. The selected graph updates only
        // after the complete artifact set is published back to its
        // originating project.
        if (message.type === 'done') {
          setAnyJobRunning(false)
          setRunning(false)
          setRunStatus(message.ok === true ? 'succeeded' : 'failed')
          setStartTime(null)
          source.close()
          refresh()
          if (message.ok === true) notifyGraph('graph-data-updated')
        }
      } catch {}
    }
    source.onerror = () => {
      source.close()
    }
  }

  const rebuildFromScratch = () => {
    if (window.confirm('Rebuild everything from scratch? This clears the cache and re-processes every document. It takes longer and costs more tokens.')) {
      startIndex(activeBuildProvider ?? (providerStatus?.local.ready && !providerStatus?.cloud.ready ? 'local' : 'cloud'), true)
    }
  }

  const stopIndex = async () => {
    if (stopping) return
    setStopping(true)
    try {
      const response = await fetch('/api/corpus/index/stop', { method: 'POST' })
      if (!response.ok) return
      sseRef.current?.close()
      sseRef.current = null
      setRunning(false)
      setAnyJobRunning(false)
      setRunStatus('idle')
      setStartTime(null)
      await loadLogs()
    } finally {
      setStopping(false)
    }
  }

  const stats = state.outputStats
  // Hide .txt files extracted from a PDF (same base name); keep standalone .txt uploads.
  const pdfBases = new Set(state.uploads.filter(file => file.type === 'pdf').map(file => file.name.replace(/\.pdf$/i, '')))
  const files = state.uploads.filter(file => file.type === 'pdf' || !pdfBases.has(file.name.replace(/\.txt$/i, '')))
  const mergedLogs = React.useMemo(() => {
    const persistedText = new Set(persistedLogs.map(entry => entry.text.trim()))
    return [
      ...persistedLogs.map(entry => ({ ts: entry.ts, text: entry.text })),
      ...liveLogs.filter(text => !persistedText.has(text.trim())).map((text, index) => ({ ts: Date.now() + index, text })),
    ]
  }, [liveLogs, persistedLogs])
  const terminalLines = React.useMemo(() => {
    const lines = mergedLogs
      .flatMap(entry => entry.text.split(/[\r\n]+/).filter(Boolean).map(text => ({ ts: entry.ts, text: text.trim() })))
      .filter(line => !/^\d+\s*\/\s*\d+(?:\s+\.*)?$/.test(line.text))
    const completed = new Set(lines.map(line => line.text.match(/Workflow complete:\s*(.+)/i)?.[1]?.trim()).filter(Boolean) as string[])
    const failed = lines.some(line => /Pipeline error:|completed with errors/i.test(line.text)) || runStatus === 'failed'
    const lastLine = lines.length - 1
    return lines.map((line, index) => {
      const starting = line.text.match(/Starting workflow:\s*(.+)/i)?.[1]?.trim()
      const complete = line.text.match(/Workflow complete:\s*(.+)/i)?.[1]?.trim()
      const isError = /Pipeline error:|completed with errors|INGEST BLOCKED|INGEST STOPPED/i.test(line.text)
      const state: 'active' | 'success' | 'error' | undefined = isError
        ? 'error'
        : complete || (starting && completed.has(starting))
          ? 'success'
          : starting && failed
            ? 'error'
            : starting || (running && index === lastLine)
              ? 'active'
              : undefined
      const kind = isError || /ENGINE ERROR|FATAL|PUBLISH FAILED/i.test(line.text)
        ? 'error'
        : /warning/i.test(line.text)
          ? 'warning'
          : complete || /PUBLISHED ·|Pipeline complete|Converted \d+ parquet/i.test(line.text)
            ? 'success'
            : starting
              ? 'workflow'
              : /BUILD ·|Starting pipeline|LIVE VIEW ·|PENDING REMOVAL/i.test(line.text)
                ? 'system'
                : 'output'
      return { ...line, state, kind }
    })
  }, [mergedLogs, runStatus, running])

  const hasName = Boolean(state.kgName?.trim())
  const statusText = running ? `Building, ${elapsed}s` : stats ? 'Ready' : 'Not built yet'
  const iconBtn = 'grid h-10 w-10 place-items-center rounded-full hover:bg-white/10 disabled:opacity-40'

  return (
    <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)]">
      {/* Project rail */}
      <nav className="hidden min-h-0 flex-col border-r border-white/10 bg-white/[0.02] md:flex" aria-label="Projects">
        <div className="flex items-center justify-between px-5 pb-3 pt-6">
          <h2 className="text-xl font-semibold">Projects</h2>
          <button className={iconBtn} onClick={() => setCreatingProject(true)} aria-label="New project"><Plus className="h-4 w-4" /></button>
        </div>

        {creatingProject && (
          <form className="rise mx-4 mb-3 rounded-2xl bg-white/[0.06] p-3" onSubmit={event => { event.preventDefault(); newProject() }}>
            <Input autoFocus value={newProjectName} onChange={event => setNewProjectName(event.target.value)} placeholder="Project name" aria-label="Project name" className="h-10 rounded-xl" />
            <div className="mt-2 flex justify-end gap-1">
              <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={() => { setCreatingProject(false); setNewProjectName('') }}>Cancel</Button>
              <Button type="submit" size="sm" className="rounded-full" disabled={!newProjectName.trim()}>Create</Button>
            </div>
          </form>
        )}

        <div className="scroll-soft min-h-0 flex-1 space-y-1 overflow-auto px-3 pb-4" data-hmi-scroll>
          {hasName && (
            <div className="rounded-2xl bg-primary/15 px-4 py-3 ring-1 ring-primary/50">
              <div className="flex items-center gap-2">
                {anyJobRunning && jobProjectName === state.kgName && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-label="Build running" />}
                <div className="truncate font-semibold">{state.kgName}</div>
              </div>
              <div className="mt-0.5 text-sm text-muted-foreground">{anyJobRunning && jobProjectName === state.kgName ? `Building, ${progress}%` : 'Open now'}</div>
            </div>
          )}
          {archives.map(project => {
            const isEditing = editingArchive === project.name
            const isDeleting = pendingDelete === project.name
            const isBuilding = anyJobRunning && jobProjectName === (project.kgName || project.name)
            return (
              <div key={project.name} className="group rounded-2xl px-4 py-3 hover:bg-white/[0.06]">
                {isEditing ? (
                  <form className="flex gap-1" onSubmit={event => { event.preventDefault(); renameArchive(project.name) }}>
                    <Input autoFocus value={archiveNameDraft} onChange={event => setArchiveNameDraft(event.target.value)} aria-label="New name" className="h-9 min-w-0 rounded-xl" />
                    <button type="submit" className={iconBtn} aria-label="Save name"><Check className="h-4 w-4" /></button>
                    <button type="button" className={iconBtn} onClick={() => setEditingArchive(null)} aria-label="Cancel"><X className="h-4 w-4" /></button>
                  </form>
                ) : (
                  <>
                    <button className="flex w-full items-center gap-2 text-left font-medium" onClick={() => restoreArchive(project.name)}>
                      {isBuilding && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-label="Build running" />}
                      <span className="truncate">{project.kgName || project.name}</span>
                    </button>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{isBuilding ? `Building, ${progress}%` : `${project.sizeKB.toFixed(1)} KB`}</span>
                      <div className="flex opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10 disabled:opacity-40" disabled={isBuilding} onClick={() => { setEditingArchive(project.name); setArchiveNameDraft(project.kgName || project.name) }} aria-label={isBuilding ? 'Stop the build before renaming' : `Rename ${project.kgName || project.name}`}><Pencil className="h-3.5 w-3.5" /></button>
                        {isDeleting ? (
                          <Button variant="destructive" size="sm" className="h-8 rounded-full px-3" onClick={() => deleteArchive(project.name)}>Delete</Button>
                        ) : (
                          <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10 disabled:opacity-40" disabled={isBuilding} onClick={() => setPendingDelete(project.name)} aria-label={isBuilding ? 'Stop the build before deleting' : `Delete ${project.kgName || project.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )
          })}
          {!archives.length && hasName && <p className="px-4 py-3 text-sm text-muted-foreground">No other projects yet.</p>}
        </div>
      </nav>

      <main className="flex min-h-0 min-w-0 flex-col">
        {!hasName ? (
          <div className="flex h-full items-center justify-center p-8">
            <form className="rise w-full max-w-md" onSubmit={event => { event.preventDefault(); saveCurrentName() }}>
              <h2 className="text-5xl font-semibold leading-none tracking-tight">Name your project</h2>
              <p className="mt-3 text-muted-foreground">A short name you will recognise later. It labels this graph and its saved copy.</p>
              <Input autoFocus value={currentNameDraft} onChange={event => setCurrentNameDraft(event.target.value)} placeholder="Offshore autonomy research" aria-label="Project name" className="mt-6 h-12 rounded-2xl px-4 text-base" />
              <Button type="submit" className="mt-3 h-12 w-full rounded-full text-base" disabled={!currentNameDraft.trim()}>Continue</Button>
            </form>
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-end justify-between gap-4 px-6 pb-4 pt-6 pr-6 md:pr-56">
              {editingCurrentName ? (
                <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={event => { event.preventDefault(); saveCurrentName() }}>
                  <Input autoFocus value={currentNameDraft} onChange={event => setCurrentNameDraft(event.target.value)} aria-label="Project name" className="h-12 max-w-md rounded-2xl text-lg" />
                  <button type="submit" className={iconBtn} aria-label="Save name"><Check className="h-4 w-4" /></button>
                  <button type="button" className={iconBtn} onClick={() => { setEditingCurrentName(false); setCurrentNameDraft(state.kgName || '') }} aria-label="Cancel"><X className="h-4 w-4" /></button>
                </form>
              ) : (
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-4xl font-semibold leading-tight tracking-tight">
                    <span key={state.kgName} className="truncate"><SplitText text={state.kgName || ''} /></span>
                    <button className={iconBtn} disabled={running} onClick={() => setEditingCurrentName(true)} aria-label={running ? 'Stop the build before renaming' : 'Rename project'}><Pencil className="h-4 w-4" /></button>
                  </h2>
                  <p className="text-muted-foreground">{statusText}</p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button className={iconBtn} onClick={refresh} aria-label="Refresh"><RotateCcw className="h-4 w-4" /></button>
                {pendingCurrentDelete ? (
                  <>
                    <Button variant="ghost" className="rounded-full" onClick={() => setPendingCurrentDelete(false)}>Cancel</Button>
                    <Button variant="destructive" className="rounded-full" onClick={deleteCurrentProject}>Delete project</Button>
                  </>
                ) : (
                  <button className={iconBtn} onClick={() => setPendingCurrentDelete(true)} aria-label="Delete this project"><Trash2 className="h-4 w-4" /></button>
                )}
                <button className={iconBtn} onClick={() => setProviderSetupOpen(true)} aria-label="Model settings"><Settings2 className="h-4 w-4" /></button>
                {running ? (
                  <Button variant="destructive" className="h-11 rounded-full px-5" onClick={stopIndex} disabled={stopping}>{stopping ? <Loader2 className="animate-spin" /> : <Square />} {stopping ? 'Stopping' : 'Stop build'}</Button>
                ) : anyJobRunning ? (
                  <div className="flex h-11 max-w-[260px] items-center gap-2 rounded-full border border-white/15 px-4 text-sm text-muted-foreground" title={`Build continues for ${jobProjectName || 'another project'}`}>
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                    <span className="truncate">Building {jobProjectName}</span>
                  </div>
                ) : (
                  <>
                    <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => startIndex('local')} disabled={!files.length}><HardDrive /> Build with Ollama</Button>
                    <Button className="h-11 rounded-full px-5" onClick={() => startIndex('cloud')} disabled={!files.length}><Cloud /> Build with Claude</Button>
                    <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => rebuildFromScratch()} disabled={!files.length} title="Clear cache and old results, then regenerate embeddings and the whole graph from every document"><RotateCcw /> Rebuild from scratch</Button>
                  </>
                )}
              </div>
            </header>

            <section className="grid grid-cols-2 gap-3 px-6 sm:grid-cols-4" aria-label="Project statistics">
              {[['Entities', stats?.entities ?? 0], ['Relationships', stats?.relationships ?? 0], ['Communities', stats?.communities ?? 0], ['Text chunks', stats?.text_units ?? 0]].map(([label, value], i) => (
                <div key={label} className="rise rounded-3xl bg-white/[0.05] px-5 py-4" style={{ animationDelay: `${i * 70}ms` }}>
                  <div className="font-display text-4xl font-semibold leading-none">{loading ? '–' : <CountUp value={Number(value)} />}</div>
                  <div className="mt-1.5 text-sm text-muted-foreground">{label}</div>
                </div>
              ))}
            </section>

            <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-4 p-6 lg:grid-cols-2 lg:grid-rows-1">
              {/* Sources */}
              <section
                className={`flex min-h-0 flex-col rounded-3xl border border-dashed transition-colors ${dragOver ? 'border-primary bg-primary/10' : 'border-white/20 bg-white/[0.02]'}`}
                aria-label="Source files"
                onDragOver={event => { event.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={event => { event.preventDefault(); setDragOver(false); if (event.dataTransfer.files.length) uploadFiles(event.dataTransfer.files) }}
              >
                <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-4">
                  <h3 className={`min-w-0 truncate text-lg font-semibold ${importError ? 'text-destructive' : ''}`}>{importError || `Documents (${files.length})`}</h3>
                  <div className="flex shrink-0 items-center">
                    <Input ref={importInputRef} type="file" multiple accept=".json,.parquet" className="hidden" onChange={event => void importOutput(event.target.files)} />
                    <Input ref={bundleInputRef} type="file" accept=".json,.graphrag.json" className="hidden" onChange={event => void importOutput(event.target.files)} />
                    <button className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10 disabled:opacity-40" disabled={running || importing} onClick={() => importInputRef.current?.click()} aria-label="Import a GraphRAG output folder">{importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderInput className="h-4 w-4" />}</button>
                    <button className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10 disabled:opacity-40" disabled={running || importing} onClick={() => bundleInputRef.current?.click()} aria-label="Import an exported bundle"><FileInput className="h-4 w-4" /></button>
                    <a className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" href="/api/corpus/export" download aria-label="Export this project's graph"><Download className="h-4 w-4" /></a>
                    <Input id="project-file-input" type="file" multiple accept=".pdf,.txt" className="hidden" onChange={event => event.target.files && uploadFiles(event.target.files)} />
                    <Button size="sm" className="ml-1 h-9 rounded-full px-4" onClick={() => document.getElementById('project-file-input')?.click()}>{uploading ? <Loader2 className="animate-spin" /> : <FilePlus />} Add files</Button>
                  </div>
                </div>
                <div className="scroll-soft min-h-0 flex-1 overflow-auto px-2 pb-2" data-hmi-scroll>
                  {!files.length ? (
                    <button className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground" onClick={() => document.getElementById('project-file-input')?.click()}>
                      <FilePlus className="h-7 w-7" />
                      <span className="font-medium">Drop PDF or text files here</span>
                      <span className="text-sm">or click to choose</span>
                    </button>
                  ) : files.map(file => (
                    <div key={file.name} className="group flex min-h-12 items-center gap-3 rounded-2xl px-3 hover:bg-white/[0.06]">
                      <a className="min-w-0 flex-1 truncate hover:text-primary" href={`/api/corpus/file?name=${encodeURIComponent(file.name)}`} target="_blank" rel="noreferrer">{file.name}</a>
                      <span className="shrink-0 text-sm text-muted-foreground">{file.status ? formatUploadStatus(file.status) : formatSize(file.size)}</span>
                      <button className="grid h-8 w-8 shrink-0 place-items-center rounded-full opacity-60 hover:bg-white/10 group-hover:opacity-100 disabled:opacity-30" disabled={file.status === 'pending_removal'} onClick={() => removeFile(file.name)} aria-label={file.status === 'pending_removal' ? 'Removal scheduled for next build' : `Remove ${file.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Build log */}
              <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl bg-black/30 ring-1 ring-white/10" aria-label="Build log">
                <div className="flex items-center gap-3 px-5 pb-3 pt-4">
                  <Ring value={running || runStatus === 'succeeded' ? progress : 0} size={40} className="shrink-0 text-foreground" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold leading-tight">Build log</h3>
                    <p className="truncate text-sm text-muted-foreground">
                      {running ? `${formatElapsed(elapsed)}, ${progress}%${activeBuildProvider ? ` with ${activeBuildProvider === 'cloud' ? 'Claude' : 'Ollama'}` : ''}${jobModel ? ` (${jobModel})` : ''}` : runStatus === 'failed' ? 'Last build failed' : runStatus === 'succeeded' ? 'Last build finished' : 'Waiting for a build'}
                    </p>
                  </div>
                </div>
                <div className="h-0.5 bg-white/10" aria-hidden><div className={`h-full transition-[width] duration-500 ${running ? 'bar-live' : runStatus === 'failed' ? 'bg-destructive' : 'bg-mint'}`} style={{ width: `${running || runStatus === 'succeeded' ? progress : 0}%` }} /></div>
                <div ref={logContainerRef} className="scroll-soft min-h-0 flex-1 overflow-auto py-2 font-mono text-xs leading-5" data-hmi-scroll aria-label="Build output" aria-live="off">
                  {!terminalLines.length ? <p className="px-5 py-4 font-sans text-sm text-muted-foreground">Build output shows up here as it runs.</p> : terminalLines.map((entry, index) => (
                    <div key={`${entry.ts}-${index}`} className={`grid min-w-0 grid-cols-[18px_minmax(0,1fr)] gap-2 px-5 py-0.5 ${entry.kind === 'error' ? 'bg-destructive/10 text-destructive' : entry.kind === 'warning' ? 'text-amber-200' : entry.kind === 'success' ? 'text-mint' : entry.kind === 'workflow' ? 'text-foreground' : entry.kind === 'system' ? 'text-lilac' : 'text-muted-foreground'}`}>
                      <span className="flex items-start justify-center pt-1">{entry.state === 'active' ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : entry.state === 'success' ? <Check className="h-3 w-3 text-mint" /> : entry.state === 'error' ? <X className="h-3 w-3 text-destructive" /> : <span className="mt-1.5 h-1 w-1 rounded-full bg-current opacity-30" />}</span>
                      <span className="min-w-0 whitespace-pre-wrap break-words">{entry.text}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
      </main>
      <ProviderSetupDialog open={providerSetupOpen} onOpenChange={setProviderSetupOpen} status={providerStatus} onStatusChange={setProviderStatus} initialTab={providerSetupTab} />
    </div>
  )
}
