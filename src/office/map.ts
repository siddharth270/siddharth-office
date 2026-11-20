/**
 * Office floor plan, in tiles. Pure data + helpers: no rendering, no React.
 *
 * Coordinates are tile units, origin top-left. Rows 0–1 are the back wall.
 * Agents sit *behind* their desk facing the viewer (seat is one tile above the
 * desk), and visitors talk to them from the tile in front of the desk.
 */

export const TILE = 16
export const COLS = 26
export const ROWS = 15

export type Dir = 'down' | 'up' | 'left' | 'right'
export interface Pt {
  x: number
  y: number
}

export type FurnitureKind =
  | 'desk'
  | 'reception'
  | 'plant'
  | 'bookshelf'
  | 'sofa'
  | 'coffee'
  | 'table'
  | 'window'
  | 'rug'
  | 'whiteboard'
  | 'pingpong'

export interface Furniture {
  kind: FurnitureKind
  x: number
  y: number
  w: number
  h: number
  /** Blocks walking (rugs and wall decor don't). */
  solid: boolean
}

export interface DeskSlot {
  id: string
  /** Where the seated agent is drawn (may be fractional to centre on a wide desk). */
  seat: Pt
  /** Where a visitor stands to talk. */
  front: Pt
  /** Desk furniture footprint. */
  desk: Furniture
}

function desk(id: string, x: number, y: number): DeskSlot {
  return {
    id,
    seat: { x: x + 0.5, y: y - 1 },
    front: { x: x + 1, y: y + 1 },
    desk: { kind: 'desk', x, y, w: 2, h: 1, solid: true },
  }
}

export const DESKS: DeskSlot[] = [
  desk('desk-1', 3, 5),
  desk('desk-2', 9, 5),
  desk('desk-3', 15, 5),
  desk('desk-4', 3, 9),
  desk('desk-5', 9, 9),
  desk('desk-6', 15, 9),
  {
    id: 'reception',
    seat: { x: 12, y: 11 },
    front: { x: 12, y: 13 },
    desk: { kind: 'reception', x: 10, y: 12, w: 5, h: 1, solid: true },
  },
]

export const FURNITURE: Furniture[] = [
  ...DESKS.map((d) => d.desk),
  { kind: 'window', x: 3, y: 0, w: 3, h: 2, solid: false },
  { kind: 'window', x: 10, y: 0, w: 3, h: 2, solid: false },
  { kind: 'whiteboard', x: 15, y: 0, w: 3, h: 2, solid: false },
  { kind: 'bookshelf', x: 20, y: 1, w: 2, h: 2, solid: true },
  { kind: 'coffee', x: 23, y: 2, w: 1, h: 1, solid: true },
  { kind: 'plant', x: 1, y: 2, w: 1, h: 1, solid: true },
  { kind: 'plant', x: 24, y: 2, w: 1, h: 1, solid: true },
  { kind: 'plant', x: 1, y: 13, w: 1, h: 1, solid: true },
  { kind: 'plant', x: 9, y: 12, w: 1, h: 1, solid: true },
  { kind: 'pingpong', x: 20, y: 4, w: 4, h: 2, solid: true },
  { kind: 'rug', x: 20, y: 8, w: 5, h: 5, solid: false },
  { kind: 'sofa', x: 20, y: 8, w: 3, h: 1, solid: true },
  { kind: 'table', x: 21, y: 10, w: 2, h: 1, solid: true },
  { kind: 'plant', x: 24, y: 12, w: 1, h: 1, solid: true },
]

/** Where visitors appear (the door in the bottom wall). */
export const SPAWN: Pt = { x: 18, y: 13 }

function buildWalkable(): boolean[][] {
  const grid: boolean[][] = []
  for (let y = 0; y < ROWS; y++) {
    const row: boolean[] = []
    for (let x = 0; x < COLS; x++) {
      const wall = y < 2 || x === 0 || x === COLS - 1
      row.push(!wall)
    }
    grid.push(row)
  }
  for (const f of FURNITURE) {
    if (!f.solid) continue
    for (let y = f.y; y < f.y + f.h; y++)
      for (let x = f.x; x < f.x + f.w; x++) if (grid[y]?.[x] !== undefined) grid[y][x] = false
  }
  // Seats are occupied by agents.
  for (const d of DESKS) {
    grid[Math.floor(d.seat.y)][Math.floor(d.seat.x)] = false
    grid[Math.floor(d.seat.y)][Math.ceil(d.seat.x)] = false
  }
  return grid
}

export const WALKABLE = buildWalkable()

export function isWalkable(p: Pt): boolean {
  return Boolean(WALKABLE[p.y]?.[p.x])
}

/** BFS shortest path (4-neighbour), excluding the start, or null if unreachable. */
export function findPath(from: Pt, to: Pt): Pt[] | null {
  if (!isWalkable(to)) return null
  const key = (p: Pt) => p.y * COLS + p.x
  const prev = new Map<number, number>()
  const start = key(from)
  const goal = key(to)
  const queue: number[] = [start]
  prev.set(start, -1)
  while (queue.length) {
    const cur = queue.shift()!
    if (cur === goal) break
    const cx = cur % COLS
    const cy = Math.floor(cur / COLS)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = { x: cx + dx, y: cy + dy }
      const k = key(n)
      if (!prev.has(k) && isWalkable(n)) {
        prev.set(k, cur)
        queue.push(k)
      }
    }
  }
  if (!prev.has(goal)) return null
  const path: Pt[] = []
  for (let k = goal; k !== start && k !== -1; k = prev.get(k)!) {
    path.push({ x: k % COLS, y: Math.floor(k / COLS) })
  }
  return path.reverse()
}

/** Nearest walkable tile to `p` (for clicks on furniture). */
export function nearestWalkable(p: Pt): Pt | null {
  if (isWalkable(p)) return p
  for (let r = 1; r < 4; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const q = { x: p.x + dx, y: p.y + dy }
        if (isWalkable(q)) return q
      }
  }
  return null
}

/** Walkable tile beside a desk's seat, where an agent steps out to stand up. */
export function deskExit(d: DeskSlot): Pt {
  return { x: d.desk.x + d.desk.w, y: Math.floor(d.seat.y) }
}

export function deskById(id: string): DeskSlot | undefined {
  return DESKS.find((d) => d.id === id)
}
