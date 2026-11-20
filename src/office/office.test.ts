import { describe, expect, it } from 'vitest'
import { keywords } from './keywords'
import { IDLE, combine, nextActivity, settle, DONE_MS } from './activity'
import { DESKS, SPAWN, findPath, isWalkable } from './map'
import { AGENTS, OFFICE_REPOS, agentIdFromChatTitle, agentChatTitle } from './agents'

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
})
