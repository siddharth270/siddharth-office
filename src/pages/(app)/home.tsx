/**
 * The office. Everyone in it shares one PresenceRoom (`office:main`):
 *
 *   my presence state = { x, y, dir, talkingTo, act }
 *
 * `act` is what the agent I'm talking to is doing *right now* (from my chat
 * stream). Every client folds all peers' `act`s together, so when anyone's
 * question makes Milo read a README, everyone sees Milo reading. No server
 * writes, no polling — presence is the broadcast channel.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getUserColor, useAuthProfileReady, usePresenceRoom, useQuery } from 'deepspace'
import { OfficeCanvas, type MoveState, type VisitorView } from '../../components/office/OfficeCanvas'
import { AgentChat } from '../../components/office/AgentChat'
import type { ChatActivity } from '../../components/ChatPanel.stream'
import { AGENTS, agentById } from '../../office/agents'
import { SPAWN, type Dir } from '../../office/map'
import { AGENT_PALETTES } from '../../office/sprites'
import {
  IDLE,
  combine,
  nextActivity,
  settle,
  type AgentActivity,
} from '../../office/activity'

const ROOM = 'office:main'
const DIRS: Dir[] = ['down', 'up', 'left', 'right']

interface PeerState {
  x?: number
  y?: number
  dir?: Dir
  talkingTo?: string | null
  act?: AgentActivity | null
}

function readPeer(state: Record<string, unknown>): PeerState {
  const s = state as PeerState
  return {
    x: typeof s.x === 'number' ? s.x : undefined,
    y: typeof s.y === 'number' ? s.y : undefined,
    dir: DIRS.includes(s.dir as Dir) ? s.dir : 'down',
    talkingTo: typeof s.talkingTo === 'string' ? s.talkingTo : null,
    act: s.act && typeof s.act === 'object' ? (s.act as AgentActivity) : null,
  }
}

export default function OfficePage() {
  const { isSignedIn, user, userId } = useAuthProfileReady({ requireUser: true })
  const { peers, connected, updateState } = usePresenceRoom(ROOM)

  const [selected, setSelected] = useState<string | null>(null)
  const [walkTo, setWalkTo] = useState<{ agentId: string; nonce: number } | null>(null)
  const [myAct, setMyAct] = useState<{ agentId: string; act: AgentActivity } | null>(null)
  const [, forceTick] = useState(0)

  const me = useMemo(
    () => ({
      userId: userId ?? 'guest',
      name: user?.name ?? 'You',
      color: getUserColor(userId ?? 'guest'),
    }),
    [userId, user?.name],
  )

  // ---- presence out ----
  const lastMove = useRef<MoveState>({ x: SPAWN.x, y: SPAWN.y, dir: 'up' })
  const onMove = useCallback(
    (s: MoveState) => {
      lastMove.current = s
      updateState({ x: s.x, y: s.y, dir: s.dir })
    },
    [updateState],
  )
  // The room can forget or blank our state: on reconnect, when it wakes from
  // hibernation (peers are recovered with empty state), or when this account
  // opens a second tab (the new socket resets the shared peer entry). So
  // re-announce the full state on connect, whenever someone new appears, and
  // on a slow heartbeat. Each message is ~100 bytes.
  const talkState = useRef<Record<string, unknown>>({})
  talkState.current = { talkingTo: selected, act: myAct?.act ?? null }
  // Position lives in a ref (moves don't re-render), so merge it at send time.
  const announce = useCallback(
    () => updateState({ ...lastMove.current, ...talkState.current }),
    [updateState],
  )
  const peerIds = peers.map((p) => p.userId).sort().join(',')
  useEffect(() => {
    if (connected) announce()
  }, [connected, peerIds, announce])
  useEffect(() => {
    if (!connected) return
    const t = setInterval(announce, 10_000)
    return () => clearInterval(t)
  }, [connected, announce])
  useEffect(() => {
    updateState({ talkingTo: selected })
  }, [selected, updateState])

  const onActivity = useCallback(
    (agentId: string, event: ChatActivity) => {
      setMyAct((prev) => {
        const base = prev && prev.agentId === agentId ? prev.act : IDLE
        const next = nextActivity(base, event, Date.now())
        if (!next) return prev
        updateState({ act: next, talkingTo: agentId })
        return { agentId, act: next }
      })
    },
    [updateState],
  )

  // Transient bubbles (done/error) expire on a timer even with no new events.
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // ---- presence in ----
  const visitors: VisitorView[] = useMemo(
    () =>
      peers
        .filter((p) => p.userId !== userId) // my own second tab
        .map((p): VisitorView | null => {
          const s = readPeer(p.state)
          if (s.x === undefined || s.y === undefined) return null
          return {
            userId: p.userId,
            name: p.userId.startsWith('anon') ? 'Guest' : p.userName || 'Visitor',
            color: getUserColor(p.userId),
            x: s.x,
            y: s.y,
            dir: s.dir ?? 'down',
            talkingTo: s.talkingTo,
          }
        })
        .filter((v): v is VisitorView => v !== null),
    [peers, userId],
  )

  const now = Date.now()
  const activities = useMemo(() => {
    const out: Record<string, AgentActivity> = {}
    for (const a of AGENTS) {
      const list: AgentActivity[] = []
      if (myAct?.agentId === a.id) list.push(settle(myAct.act, now))
      for (const p of peers) {
        const s = readPeer(p.state)
        if (s.talkingTo === a.id && s.act) list.push(settle(s.act, now))
      }
      out[a.id] = combine(list)
    }
    return out
  }, [peers, myAct, now])

  // ---- daily quota (own row only; RBAC 'own') ----
  const today = new Date().toISOString().slice(0, 10)
  const usageWhere = useMemo(() => ({ userId: userId ?? '__none__', day: today }), [userId, today])
  const { records: usage } = useQuery<{ turns: number }>('chat-usage', { where: usageWhere })
  const turnsUsed = usage[0]?.data.turns ?? 0

  const selectedAgent = agentById(selected)
  const talkingCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const v of visitors) if (v.talkingTo) m[v.talkingTo] = (m[v.talkingTo] ?? 0) + 1
    return m
  }, [visitors])

  // Escape closes the chat.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="office-room flex h-full min-h-0 flex-col lg:flex-row">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 pb-2">
          <h1 className="font-pixel text-[15px] text-foreground">Siddharth&apos;s Office</h1>
          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground" data-testid="online-count">
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
            {visitors.length + 1} here now
          </span>
          {!isSignedIn && (
            <span className="text-[12px] text-muted-foreground">Sign in (top right) to chat.</span>
          )}
        </div>

        <div className="min-h-0 flex-1 px-3 pb-2">
          <OfficeCanvas
            me={me}
            peers={visitors}
            activities={activities}
            selectedAgentId={selected}
            walkTo={walkTo}
            onArrive={setSelected}
            onMove={onMove}
          />
        </div>

        <nav aria-label="Agents" className="flex gap-2 overflow-x-auto px-4 pb-3" data-testid="agent-roster">
          {AGENTS.map((a) => {
            const act = activities[a.id]
            const busy = act && act.mode !== 'idle'
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setWalkTo({ agentId: a.id, nonce: Date.now() })}
                aria-pressed={selected === a.id}
                className={`flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-left text-[12px] transition-colors ${
                  selected === a.id
                    ? 'border-foreground/40 bg-muted text-foreground'
                    : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 rounded-[2px] ${busy ? 'animate-pulse' : ''}`}
                  style={{ background: AGENT_PALETTES[a.skin % AGENT_PALETTES.length].shirt }}
                />
                <span className="font-medium">{a.name}</span>
                <span className="hidden sm:inline">· {a.kind === 'persona' ? 'about me' : a.repo?.repo}</span>
                {talkingCounts[a.id] ? (
                  <span className="rounded bg-muted px-1 text-[10px]">{talkingCounts[a.id]} chatting</span>
                ) : null}
              </button>
            )
          })}
        </nav>
      </div>

      {selectedAgent && (
        <aside className="fixed inset-x-0 bottom-0 z-30 h-[70vh] border-t border-border shadow-2xl lg:static lg:z-auto lg:h-auto lg:w-[420px] lg:border-t-0 lg:border-l lg:shadow-none">
          <AgentChat
            agent={selectedAgent}
            userId={isSignedIn ? userId : null}
            turnsUsed={turnsUsed}
            onClose={() => setSelected(null)}
            onActivity={onActivity}
          />
        </aside>
      )}
    </div>
  )
}
