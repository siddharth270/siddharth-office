/**
 * Break-time schedule: when agents aren't working they sometimes leave their
 * desks to play ping-pong or sit on the sofa. Pure and clock-driven — every
 * visitor computes the same plan from the same wall-clock slot, so the whole
 * room sees the same game without any shared state.
 *
 * An agent that is needed (a visitor is talking to it, or it is mid-turn)
 * always goes back to its desk; if one ping-pong player is needed, the game
 * ends for both.
 */

import type { Dir, Pt } from './map'

export type Spot = 'paddle-left' | 'paddle-right' | 'sofa-a' | 'sofa-b'

export interface SpotDef {
  /** Where the character rests (may be fractional). */
  at: Pt
  /** Walkable tile used to get there and leave. */
  approach: Pt
  dir: Dir
  pose: 'stand' | 'sit'
}

// Ping-pong table spans tiles x 20–23, y 4–5 (see map.ts); sofa is x 20–22, y 8.
export const SPOTS: Record<Spot, SpotDef> = {
  'paddle-left': { at: { x: 19, y: 4.5 }, approach: { x: 19, y: 5 }, dir: 'right', pose: 'stand' },
  'paddle-right': { at: { x: 24, y: 4.5 }, approach: { x: 24, y: 5 }, dir: 'left', pose: 'stand' },
  'sofa-a': { at: { x: 20.3, y: 8 }, approach: { x: 20, y: 9 }, dir: 'down', pose: 'sit' },
  'sofa-b': { at: { x: 21.7, y: 8 }, approach: { x: 22, y: 9 }, dir: 'down', pose: 'sit' },
}

/** One schedule slot; agents are out for the first OUT_MS of it at most. */
export const SLOT_MS = 120_000
export const OUT_MS = 55_000
/** Max random delay before an agent gets up, so they don't move in unison. */
const STAGGER_MS = 4_000

function rng(seed: number): () => number {
  // mulberry32
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Who goes where during `slot`. ~50% of slots have a game (plus 0–2 people on
 * the sofa), ~20% just a sofa chat, the rest everyone stays at their desk.
 * `forceGame` (the `?hangout` URL flag) always plans a game, for demos.
 */
export function planSlot(slot: number, ids: string[], forceGame = false): Map<string, Spot> {
  const r = rng(slot * 2654435761)
  const order = [...ids]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const roll = r()
  const plan = new Map<string, Spot>()
  if (order.length >= 2 && (forceGame || roll < 0.5)) {
    plan.set(order[0], 'paddle-left')
    plan.set(order[1], 'paddle-right')
    const sofa = Math.floor(r() * 3) // 0, 1 or 2 watchers
    if (sofa >= 1 && order[2]) plan.set(order[2], 'sofa-a')
    if (sofa >= 2 && order[3]) plan.set(order[3], 'sofa-b')
  } else if (order.length >= 2 && roll < 0.7) {
    plan.set(order[0], 'sofa-a')
    plan.set(order[1], 'sofa-b')
  }
  return plan
}

function stagger(id: string, slot: number): number {
  let h = slot
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % STAGGER_MS
}

/** Where `id` should be right now, or null for its desk. */
export function desiredSpot(
  id: string,
  ids: string[],
  now: number,
  needed: ReadonlySet<string>,
  forceGame = false,
): Spot | null {
  const slot = Math.floor(now / SLOT_MS)
  const t = forceGame ? OUT_MS / 2 : now % SLOT_MS
  if (t >= OUT_MS) return null
  if (!forceGame && t < stagger(id, slot)) return null
  if (needed.has(id)) return null
  const plan = planSlot(slot, ids, forceGame)
  const spot = plan.get(id)
  if (!spot) return null
  if (spot.startsWith('paddle')) {
    const partner = [...plan].find(([other, s]) => other !== id && s.startsWith('paddle'))?.[0]
    if (partner && needed.has(partner)) return null
  }
  return spot
}

// ---- the rally (also clock-driven, so every viewer sees the same ball) ----

const HIT_MS = 750
const HITS = 6
const MISS_MS = 1_500
export const RALLY_MS = HITS * HIT_MS + MISS_MS

export interface BallState {
  /** 0 at the left paddle, 1 at the right paddle (beyond while a miss flies out). */
  u: number
  /** Height above the table in px. */
  h: number
  /** True between points: ball is out, `misser` reacts. */
  miss: boolean
  misser: 'left' | 'right'
  /** Which paddle just hit (for a little swing), if any. */
  hitter: 'left' | 'right' | null
}

export function ballAt(now: number): BallState {
  const cycle = Math.floor(now / RALLY_MS)
  const t = now % RALLY_MS
  const startLeft = cycle % 2 === 0
  // The receiver of the last shot misses; with an even number of hits that's the server.
  const misser = startLeft ? 'left' : 'right'
  const k = Math.floor(t / HIT_MS)
  if (k >= HITS) {
    const v = (t - HITS * HIT_MS) / MISS_MS
    // ball sails past the misser and drops
    const past = Math.min(1, v * 3) * 0.35
    return {
      u: misser === 'left' ? -past : 1 + past,
      h: Math.max(-14, 6 - v * 3 * 20),
      miss: true,
      misser,
      hitter: null,
    }
  }
  const fromLeft = (k % 2 === 0) === startLeft
  const p = (t % HIT_MS) / HIT_MS
  // Arc down to a bounce at 70% of the way, then up to the receiver.
  let h: number
  if (p < 0.7) {
    const v = p / 0.7
    h = 6 * (1 - v) + 6 * Math.sin(Math.PI * v)
  } else {
    const v = (p - 0.7) / 0.3
    h = 6 * v + 3 * Math.sin(Math.PI * v)
  }
  return {
    u: fromLeft ? p : 1 - p,
    h,
    miss: false,
    misser,
    hitter: p < 0.15 ? (fromLeft ? 'left' : 'right') : null,
  }
}
