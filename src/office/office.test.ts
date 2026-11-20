import { describe, expect, it } from 'vitest'
import { keywords } from './keywords'
import { IDLE, combine, nextActivity, settle, DONE_MS } from './activity'
import { DESKS, SPAWN, deskById, deskExit, findPath, isWalkable } from './map'
import { AGENTS, OFFICE_REPOS, agentIdFromChatTitle, agentChatTitle } from './agents'
import { paperById } from './papers'
import { OUT_MS, RALLY_MS, SLOT_MS, SPOTS, ballAt, desiredSpot, planSlot } from './hangout'

describe('keywords', () => {
  it('drops stopwords and adds topic hints', () => {
    expect(keywords('What sports does he play?')).toEqual(expect.arrayContaining(['sports', 'play']))
    expect(keywords('What sports does he play?')).not.toContain('what')
    expect(keywords('Where did he study?')).toContain('education')
    expect(keywords('What papers has he published?')).toContain('publications')
  })
  it('caps the number of searches', () => {
    expect(keywords('a b c d e f g h i j k l m n o p q r s t u v w x y z alpha beta gamma delta epsilon zeta eta theta iota kappa').length).toBeLessThanOrEqual(8)
  })
})

describe('activity', () => {
  const now = 1_000
  it('follows the stream lifecycle', () => {
    let a = nextActivity(IDLE, { kind: 'start' }, now)!
    expect(a.mode).toBe('thinking')
    a = nextActivity(a, { kind: 'action', action: { type: 'upsert-tool-call', toolCallId: '1', toolName: 'github_readme', input: {} } as never }, now)!
    expect(a).toMatchObject({ mode: 'reading', label: 'reading README' })
    a = nextActivity(a, { kind: 'action', action: { type: 'append-text', delta: 'hi' } as never }, now)!
    expect(a.mode).toBe('typing')
    expect(nextActivity(a, { kind: 'action', action: { type: 'append-text', delta: '!' } as never }, now)).toBeNull()
    a = nextActivity(a, { kind: 'end', ok: true }, now)!
    expect(a.mode).toBe('done')
    expect(settle(a, now + DONE_MS + 1)).toBe(IDLE)
  })
  it('shows the busiest state across visitors', () => {
    expect(combine([{ mode: 'done', at: 0 }, { mode: 'typing', at: 0 }, { mode: 'thinking', at: 0 }]).mode).toBe('typing')
    expect(combine([]).mode).toBe('idle')
  })
})

describe('office map', () => {
  it('every agent desk is reachable from the door', () => {
    for (const a of AGENTS) {
      const desk = DESKS.find((d) => d.id === a.desk)
      expect(desk, a.id).toBeDefined()
      expect(isWalkable(desk!.front), a.id).toBe(true)
      expect(findPath(SPAWN, desk!.front), a.id).not.toBeNull()
    }
  })
  it('agent desks are unique', () => {
    expect(new Set(AGENTS.map((a) => a.desk)).size).toBe(AGENTS.length)
  })
})

describe('roster', () => {
  it('round-trips the chat title binding', () => {
    expect(agentIdFromChatTitle(agentChatTitle('siddharth'))).toBe('siddharth')
    expect(agentIdFromChatTitle('New chat')).toBeNull()
  })
  it('only project agents contribute repos', () => {
    expect(OFFICE_REPOS.length).toBe(AGENTS.filter((a) => a.kind === 'project').length)
  })
  it('every paper agent points at a known paper', () => {
    for (const a of AGENTS.filter((x) => x.kind === 'paper')) expect(paperById(a.paperId)).toBeDefined()
  })
})

describe('hangout', () => {
  const ids = AGENTS.filter((a) => a.kind !== 'persona').map((a) => a.id)

  it('every break spot and desk exit is walkable and reachable from every other', () => {
    const tiles = [
      ...Object.values(SPOTS).map((s) => s.approach),
      ...AGENTS.flatMap((a) => (a.kind === 'persona' ? [] : [deskExit(deskById(a.desk)!)])),
    ]
    for (const t of tiles) expect(isWalkable(t)).toBe(true)
    for (const a of tiles) for (const b of tiles) if (a !== b) expect(findPath(a, b)).not.toBeNull()
  })

  it('plans are deterministic and never double-book a spot or an agent', () => {
    for (let slot = 0; slot < 200; slot++) {
      const plan = planSlot(slot, ids)
      expect([...plan]).toEqual([...planSlot(slot, ids)])
      expect(new Set(plan.values()).size).toBe(plan.size)
      const paddles = [...plan.values()].filter((s) => s.startsWith('paddle')).length
      expect([0, 2]).toContain(paddles)
    }
  })

  it('a needed agent stays at its desk, and its ping-pong partner comes back too', () => {
    const now = 30_000 // inside the out-window of slot 0
    const plan = planSlot(0, ids, true)
    const [left] = [...plan].find(([, s]) => s === 'paddle-left')!
    const [right] = [...plan].find(([, s]) => s === 'paddle-right')!
    expect(desiredSpot(left, ids, now, new Set(), true)).toBe('paddle-left')
    expect(desiredSpot(left, ids, now, new Set([left]), true)).toBeNull()
    expect(desiredSpot(right, ids, now, new Set([left]), true)).toBeNull()
  })

  it('everyone is back at their desk for the second part of each slot', () => {
    for (const id of ids) expect(desiredSpot(id, ids, SLOT_MS * 7 + OUT_MS + 1, new Set())).toBeNull()
  })

  it('the ball stays between the paddles during a rally', () => {
    for (let t = 0; t < RALLY_MS * 2; t += 37) {
      const b = ballAt(t)
      if (!b.miss) {
        expect(b.u).toBeGreaterThanOrEqual(0)
        expect(b.u).toBeLessThanOrEqual(1)
        expect(b.h).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
