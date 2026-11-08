'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Send, Sparkles, Square, X } from 'lucide-react'

type Message = { role: 'user' | 'assistant'; content: string; error?: boolean; entities?: number }

const MODES = [
  { id: 'drift', label: 'Deep', hint: 'Follows connections between topics. Best default.' },
  { id: 'local', label: 'Specific', hint: 'Facts about particular entities.' },
  { id: 'global', label: 'Overview', hint: 'Themes across the whole collection.' },
  { id: 'basic', label: 'Simple', hint: 'Plain search over the source text.' },
] as const
type Mode = typeof MODES[number]['id']

const STARTERS: { q: string; mode: Mode }[] = [
  { q: 'What are the main themes?', mode: 'global' },
  { q: 'Who or what is most central, and why?', mode: 'drift' },
  { q: 'How are the key topics connected?', mode: 'drift' },
]

// GraphRAG answers are markdown with [Data: …] citations; show headings and plain text.
const Answer = ({ text }: { text: string }) => (
  <>
    {text.replace(/\s*\[Data:[^\]]*\]?/g, '').replace(/\*\*/g, '').split('\n').map((line, i) =>
      /^#+\s/.test(line)
        ? <div key={i} className="mt-2 font-semibold first:mt-0">{line.replace(/^#+\s/, '')}</div>
        : <div key={i} className="min-h-4">{line}</div>)}
  </>
)

interface ChatPanelProps {
  onHighlight: (ids: string[]) => void
  onClose: () => void
}

export default function ChatPanel({ onHighlight, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<Mode>('drift')
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => () => abortRef.current?.abort(), [])

  const patchLast = (patch: Partial<Message>) =>
    setMessages(list => list.map((m, i) => (i === list.length - 1 ? { ...m, ...patch } : m)))

  const ask = async (question: string, askMode: Mode) => {
    const q = question.trim()
    if (!q || busy) return
    setInput('')
    setMessages(list => [...list, { role: 'user', content: q }, { role: 'assistant', content: '' }])
    setBusy(true)
    const abort = new AbortController()
    abortRef.current = abort

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, method: askMode }),
        signal: abort.signal,
      })
      if (!res.ok || !res.body) throw new Error(await res.text())

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let streamed = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        for (let end; (end = buffer.indexOf('\n\n')) !== -1; ) {
          const block = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          const event = /^event: (.+)$/m.exec(block)?.[1]
          const data = /^data: (.+)$/m.exec(block)?.[1]
          if (!event || !data) continue
          const payload = JSON.parse(data)
          if (event === 'answer-chunk') {
            streamed += payload.text
            patchLast({ content: streamed })
          } else if (event === 'answer') {
            patchLast({ content: payload.text, entities: payload.highlights.length })
            onHighlight(payload.highlights)
          } else if (event === 'fault') {
            patchLast({ content: payload.message, error: true })
          }
        }
      }
    } catch (e) {
      if (!abort.signal.aborted) patchLast({ content: e instanceof Error ? e.message : String(e), error: true })
    } finally {
      setMessages(list => list.filter((m, i) => m.content || i < list.length - 1))
      setBusy(false)
    }
  }

  const clear = () => {
    abortRef.current?.abort()
    setMessages([])
    onHighlight([])
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-3 pt-5">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground"><Sparkles className="h-4 w-4" /></div>
        <h2 className="flex-1 text-xl font-semibold">Ask your graph</h2>
        {messages.length > 0 && (
          <button className="rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-white/10 hover:text-foreground" onClick={clear}>Clear</button>
        )}
        <button className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" onClick={onClose} aria-label="Close chat"><X className="h-4 w-4" /></button>
      </div>

      <div className="mx-5 flex gap-1 rounded-full bg-white/[0.06] p-1" role="group" aria-label="Answer style">
        {MODES.map(m => (
          <button
            key={m.id}
            title={m.hint}
            aria-pressed={mode === m.id}
            onClick={() => setMode(m.id)}
            className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${mode === m.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >{m.label}</button>
        ))}
      </div>
      <p className="mx-6 mt-2 text-xs text-muted-foreground">{MODES.find(m => m.id === mode)?.hint}</p>

      <div ref={scrollRef} className="scroll-soft flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Answers come from your documents. Entities they mention light up in the graph.</p>
            {STARTERS.map((s, i) => (
              <button
                key={s.q}
                onClick={() => { setMode(s.mode); ask(s.q, s.mode) }}
                style={{ animationDelay: `${i * 90}ms` }}
                className="rise block w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-[15px] hover:-translate-y-0.5 hover:border-primary/60 hover:bg-white/[0.07]"
              >{s.q}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rise max-w-[92%] rounded-3xl px-4 py-3 text-[15px] leading-relaxed ${
              m.role === 'user' ? 'ml-auto rounded-br-lg bg-primary text-primary-foreground' : m.error ? 'border border-destructive/50 text-destructive' : 'rounded-bl-lg bg-white/[0.07]'
            }`}
          >
            {!m.content ? <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Searching the graph…</span> : m.role === 'assistant' && !m.error ? <Answer text={m.content} /> : m.content}
            {!!m.entities && <div className="mt-2 text-xs text-muted-foreground">{m.entities} entities lit up in the graph</div>}
          </div>
        ))}
      </div>

      <form className="flex items-end gap-2 p-4" onSubmit={e => { e.preventDefault(); ask(input, mode) }}>
        <Textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask a question"
          aria-label="Question"
          rows={1}
          className="max-h-32 min-h-11 resize-none rounded-3xl bg-white/[0.06] px-4"
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input, mode) }
          }}
        />
        {busy ? (
          <Button type="button" size="icon" variant="outline" className="h-11 w-11 shrink-0 rounded-full" onClick={() => abortRef.current?.abort()} aria-label="Stop"><Square className="h-4 w-4" /></Button>
        ) : (
          <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-full" disabled={!input.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>
        )}
      </form>
    </div>
  )
}
