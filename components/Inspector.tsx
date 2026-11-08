'use client'

import React from 'react'
import { Building2, Calendar, Circle, MapPin, User, X } from 'lucide-react'
import { Node3D, Link3D } from '../lib/forceSimulation'
import { Community } from '../lib/graphData'
import { CountUp } from './kinetic'

interface InspectorProps {
  selectedNode: Node3D | null
  connectedLinks: Link3D[]
  visibleCommunities: Community[]
  communityMode: 'off' | 'auto' | 'all'
  onClose: () => void
  onNodeSelect: (node: Node3D) => void
  projectName?: string
}

function EntityIcon({ type }: { type: string }) {
  const className = 'h-4 w-4'
  switch (type.toUpperCase()) {
    case 'ORGANIZATION': return <Building2 className={className} />
    case 'PERSON': return <User className={className} />
    case 'GEO': return <MapPin className={className} />
    case 'EVENT': return <Calendar className={className} />
    default: return <Circle className={className} />
  }
}

const typeLabel = (type: string) => type.charAt(0) + type.slice(1).toLowerCase()

export default function Inspector({ selectedNode, connectedLinks, visibleCommunities, communityMode, onClose, onNodeSelect, projectName }: InspectorProps) {
  const hierarchy = React.useMemo(() => {
    if (!selectedNode?.community || communityMode === 'off') return null
    const selected = selectedNode.community
    const parent = selected.parent === null || selected.parent === undefined
      ? undefined
      : visibleCommunities.find(community => String(community.human_readable_id) === String(selected.parent))
    const childIds = new Set((selected.children || []).map(String))
    const children = visibleCommunities
      .filter(community => String(community.parent) === String(selected.human_readable_id) || childIds.has(String(community.human_readable_id)))
      .filter((community, index, all) => all.findIndex(candidate => candidate.id === community.id) === index)
      .sort((a, b) => a.level - b.level)
    return { selected, parent, children }
  }, [selectedNode, visibleCommunities, communityMode])

  const relationships = React.useMemo(
    () => [...connectedLinks].sort((a, b) => b.weight - a.weight),
    [connectedLinks]
  )

  if (!selectedNode) return null

  const stats: [string, number | undefined][] = [
    ['Links', selectedNode.degree],
    ['Mentions', selectedNode.frequency],
    ['Level', selectedNode.community?.level],
    ['Group size', selectedNode.community?.size],
  ]

  return (
    <aside className="glass flex h-full min-h-0 flex-col overflow-hidden" aria-label="Entity details">
      <header className="flex items-start gap-3 px-6 pb-4 pt-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm text-lilac">
            <EntityIcon type={selectedNode.type} />
            {typeLabel(selectedNode.type)}
            {projectName && <span className="truncate text-muted-foreground">in {projectName}</span>}
          </div>
          <h2 key={selectedNode.id} className="rise mt-1 text-3xl font-semibold leading-tight tracking-tight [overflow-wrap:anywhere]">{selectedNode.title}</h2>
        </div>
        <button className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-white/10" onClick={onClose} aria-label="Close details">
          <X className="h-4 w-4" />
        </button>
      </header>

      <section className="mx-6 grid grid-cols-4 gap-2" aria-label="Entity statistics">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-white/[0.06] px-3 py-2.5">
            <div className="font-display text-2xl font-semibold leading-none">{value === undefined ? '–' : <CountUp value={value} />}</div>
            <div className="mt-1 text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </section>

      <div className="scroll-soft mt-4 min-h-0 flex-1 overflow-y-auto px-6 pb-6" data-hmi-scroll>
        <p className="text-[15px] leading-relaxed text-foreground/85">{selectedNode.description || 'No description available.'}</p>

        {hierarchy && communityMode === 'auto' && (
          <section className="mt-6">
            <h3 className="mb-2 text-base font-semibold">Community</h3>
            <ol className="space-y-1 border-l border-white/15 pl-4 text-sm">
              {hierarchy.parent && <li className="truncate text-muted-foreground">{hierarchy.parent.title} <span className="text-xs">level {hierarchy.parent.level}</span></li>}
              <li className="truncate font-semibold text-primary">{hierarchy.selected.title} <span className="text-xs font-normal text-muted-foreground">level {hierarchy.selected.level}</span></li>
              {hierarchy.children.map(community => (
                <li key={community.id} className="truncate pl-4 text-muted-foreground">{community.title} <span className="text-xs">level {community.level}</span></li>
              ))}
            </ol>
          </section>
        )}

        {relationships.length > 0 && (
          <section className="mt-6">
            <h3 className="mb-2 text-base font-semibold">Strongest connections <span className="font-normal text-muted-foreground">({relationships.length})</span></h3>
            <ul className="space-y-1">
              {relationships.slice(0, 8).map((link, i) => {
                const other = link.source.id === selectedNode.id ? link.target : link.source
                return (
                  <li key={link.id} className="rise" style={{ animationDelay: `${i * 50}ms` }}>
                    <button className="group flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-white/[0.07]" onClick={() => onNodeSelect(other)}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium group-hover:text-primary">{other.title}</span>
                        <span className="mt-0.5 block line-clamp-2 text-sm text-muted-foreground">{link.description}</span>
                      </span>
                      <span className="mt-1 h-1.5 shrink-0 rounded-full bg-lilac" style={{ width: `${Math.max(10, Math.min(48, link.weight * 6))}px` }} title={`Strength ${link.weight}`} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
    </aside>
  )
}
