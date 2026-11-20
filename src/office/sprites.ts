/**
 * Procedural pixel art — every sprite is drawn from rectangles, so the office
 * ships zero image assets (no licensing questions, ~0 KB of art).
 *
 * Characters are 16×24 px; furniture and tiles are drawn in 16 px tile units.
 * Characters are pre-rendered once per (palette, pose) into small offscreen
 * canvases and blitted with smoothing off.
 */

import { TILE, type Dir, type Furniture } from './map'

export interface Palette {
  skin: string
  hair: string
  shirt: string
  pants: string
  shoes: string
}

const OUTLINE = '#2b2433'

export const AGENT_PALETTES: Palette[] = [
  { skin: '#c68863', hair: '#1e1a1d', shirt: '#2f5d8a', pants: '#2c2c3a', shoes: '#1a1a1f' },
  { skin: '#f0c7a0', hair: '#8a4b2a', shirt: '#7a3fa0', pants: '#33324a', shoes: '#22202a' },
  { skin: '#a86b47', hair: '#2a1d14', shirt: '#2f8a63', pants: '#3a3a2c', shoes: '#1d1a14' },
  { skin: '#e8b48e', hair: '#d9a441', shirt: '#c0533a', pants: '#2d3446', shoes: '#1f1d26' },
  { skin: '#8c5a3c', hair: '#151315', shirt: '#d08a2a', pants: '#2b2b33', shoes: '#151319' },
  { skin: '#f3d2b3', hair: '#4a3a33', shirt: '#3a8aa8', pants: '#3b2f2f', shoes: '#201a1a' },
]

const HAIRS = ['#1e1a1d', '#5a3a22', '#8a4b2a', '#d9a441', '#3b3b44', '#a33b2b']
const SKINS = ['#f0c7a0', '#e8b48e', '#c68863', '#a86b47', '#8c5a3c', '#f3d2b3']

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Visitors get a stable look from their user id; shirt = their presence colour. */
export function visitorPalette(userId: string, shirt: string): Palette {
  const h = hash(userId)
  return {
    skin: SKINS[h % SKINS.length],
    hair: HAIRS[(h >>> 8) % HAIRS.length],
    shirt,
    pants: '#2f3140',
    shoes: '#1b1b22',
  }
}

export type Pose = 'stand' | 'walk' | 'sit'
export type Hands = 'rest' | 'type' | 'read'

interface CharKey {
  pal: Palette
  dir: Dir
  pose: Pose
  frame: number
  hands: Hands
  blink: boolean
}

const cache = new Map<string, HTMLCanvasElement>()

export function characterSprite(k: CharKey): HTMLCanvasElement {
  const id = `${k.pal.skin}${k.pal.hair}${k.pal.shirt}${k.pal.pants}|${k.dir}|${k.pose}|${k.frame}|${k.hands}|${k.blink}`
  let c = cache.get(id)
  if (!c) {
    c = document.createElement('canvas')
    c.width = 16
    c.height = 24
    drawCharacter(c.getContext('2d')!, k)
    cache.set(id, c)
  }
  return c
}

function darken(hex: string, amt = 0.18): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.round(v * (1 - amt)))
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`
}

function drawCharacter(g: CanvasRenderingContext2D, k: CharKey) {
  const r = (x: number, y: number, w: number, h: number, c: string) => {
    g.fillStyle = c
    g.fillRect(x, y, w, h)
  }
  const { pal, dir, pose, frame, hands, blink } = k
  const bob = pose === 'walk' && frame % 2 === 1 ? 1 : 0
  const oy = bob

  // ---- legs (hidden behind the desk when sitting) ----
  if (pose !== 'sit') {
    const lift = pose === 'walk' ? (frame % 2 === 0 ? [0, 1] : [1, 0]) : [0, 0]
    r(5, 19 - lift[0] + oy, 2, 4, pal.pants)
    r(9, 19 - lift[1] + oy, 2, 4, pal.pants)
    r(5, 22 - lift[0] + oy, 2, 1, pal.shoes)
    r(9, 22 - lift[1] + oy, 2, 1, pal.shoes)
    r(4, 23, 8, 1, 'rgba(0,0,0,0.18)') // shadow
  }

  // ---- torso ----
  r(3, 13 + oy, 10, 7, OUTLINE)
  r(4, 13 + oy, 8, 6, pal.shirt)
  r(4, 18 + oy, 8, 1, darken(pal.shirt))
  if (dir === 'down') r(7, 13 + oy, 2, 1, darken(pal.shirt, 0.35)) // collar

  // ---- arms / hands ----
  if (pose === 'sit' && hands === 'type') {
    const a = frame % 2
    r(3, 16 + a + oy, 2, 2, pal.skin)
    r(11, 17 - a + oy, 2, 2, pal.skin)
  } else if (pose === 'sit' && hands === 'read') {
    // a sheet of paper held up at chest height
    r(4, 14 + oy, 8, 6, '#f4f1e8')
    r(5, 15 + oy, 6, 1, '#b9b3a3')
    r(5, 17 + oy, frame % 2 ? 4 : 6, 1, '#b9b3a3')
    r(3, 17 + oy, 1, 2, pal.skin)
    r(12, 17 + oy, 1, 2, pal.skin)
  } else if (dir === 'left' || dir === 'right') {
    const swing = pose === 'walk' ? (frame % 2 ? 1 : -1) : 0
    r(dir === 'left' ? 9 : 6, 14 + oy + swing, 2, 4, darken(pal.shirt))
    r(dir === 'left' ? 9 : 6, 18 + oy + swing, 2, 1, pal.skin)
  } else {
    const swing = pose === 'walk' ? (frame % 2 ? 1 : 0) : 0
    r(2, 14 + oy + swing, 2, 4, darken(pal.shirt))
    r(12, 14 + oy + (1 - swing) * (pose === 'walk' ? 1 : 0), 2, 4, darken(pal.shirt))
    r(2, 18 + oy + swing, 2, 1, pal.skin)
    r(12, 18 + oy, 2, 1, pal.skin)
  }

  // ---- head ----
  r(3, 2 + oy, 10, 11, OUTLINE)
  r(4, 3 + oy, 8, 9, pal.skin)
  r(4, 11 + oy, 8, 1, darken(pal.skin, 0.12))

  // hair
  r(4, 2 + oy, 8, 3, pal.hair)
  if (dir === 'up') {
    r(4, 2 + oy, 8, 9, pal.hair)
  } else if (dir === 'down') {
    r(4, 5 + oy, 3, 1, pal.hair) // fringe
    r(4, 3 + oy, 1, 4, pal.hair)
    r(11, 3 + oy, 1, 4, pal.hair)
  } else {
    const back = dir === 'left' ? 9 : 4
    r(back, 3 + oy, 3, 6, pal.hair)
  }

  // face
  if (dir !== 'up') {
    const eye = OUTLINE
    if (dir === 'down') {
      if (blink) {
        r(6, 8 + oy, 1, 1, eye)
        r(9, 8 + oy, 1, 1, eye)
      } else {
        r(6, 7 + oy, 1, 2, eye)
        r(9, 7 + oy, 1, 2, eye)
      }
      r(7, 10 + oy, 2, 1, darken(pal.skin, 0.3))
    } else {
      const ex = dir === 'left' ? 5 : 10
      r(ex, blink ? 8 + oy : 7 + oy, 1, blink ? 1 : 2, eye)
      r(dir === 'left' ? 3 : 12, 8 + oy, 1, 1, pal.skin) // nose
    }
  }
}

// ---------------------------------------------------------------------------
// Tiles & furniture (drawn directly in world px)
// ---------------------------------------------------------------------------

type G = CanvasRenderingContext2D
const px = (g: G, x: number, y: number, w: number, h: number, c: string) => {
  g.fillStyle = c
  g.fillRect(x, y, w, h)
}

export function drawFloorTile(g: G, tx: number, ty: number) {
  const x = tx * TILE
  const y = ty * TILE
  const alt = (tx + ty) % 2 === 0
  px(g, x, y, TILE, TILE, alt ? '#c9a77c' : '#c39f73')
  px(g, x, y + 7, TILE, 1, '#b48f64')
  px(g, x, y + 15, TILE, 1, '#b48f64')
  px(g, x + ((ty % 2) * 8 + 5) % 16, y, 1, 7, '#b48f64')
  px(g, x + ((ty % 2) * 8 + 11) % 16, y + 8, 1, 7, '#b48f64')
}

export function drawWall(g: G, cols: number) {
  px(g, 0, 0, cols * TILE, 2 * TILE, '#e7dfcf')
  px(g, 0, 0, cols * TILE, 3, '#6d5a4b')
  px(g, 0, 2 * TILE - 4, cols * TILE, 4, '#a88a6c')
  px(g, 0, 2 * TILE - 1, cols * TILE, 1, '#6d5a4b')
}

export function drawSideWalls(g: G, cols: number, rows: number) {
  px(g, 0, 2 * TILE, TILE, (rows - 2) * TILE, '#d8cdb8')
  px(g, (cols - 1) * TILE, 2 * TILE, TILE, (rows - 2) * TILE, '#d8cdb8')
  px(g, TILE - 2, 2 * TILE, 2, (rows - 2) * TILE, '#a88a6c')
  px(g, (cols - 1) * TILE, 2 * TILE, 2, (rows - 2) * TILE, '#a88a6c')
}

export function drawDoor(g: G, tx: number, rows: number) {
  px(g, tx * TILE - 4, rows * TILE - 3, TILE + 8, 3, '#6d5a4b')
  px(g, tx * TILE, rows * TILE - 3, TILE, 3, '#8fc1c9')
}

/**
 * @param glow 0..1 screen brightness (busy agents light up their monitor)
 * @param t    ms clock for screen animation
 */
export function drawFurniture(g: G, f: Furniture, t: number, glow = 0) {
  const x = f.x * TILE
  const y = f.y * TILE
  const w = f.w * TILE
  switch (f.kind) {
    case 'desk': {
      px(g, x, y - 4, w, 6, '#8b5e3c')
      px(g, x, y - 4, w, 1, '#a77450')
      px(g, x + 1, y + 2, w - 2, 12, '#734b2f')
      px(g, x + 2, y + 14, 2, 2, '#5a3a24')
      px(g, x + w - 4, y + 14, 2, 2, '#5a3a24')
      // laptop, back of the lid toward us
      const lx = x + w / 2 - 7
      px(g, lx, y - 9, 14, 6, '#4b4f5c')
      px(g, lx + 1, y - 8, 12, 4, '#5d6272')
      px(g, lx + 6, y - 7, 2, 2, glow > 0 ? '#9fe7ff' : '#7d8395')
      if (glow > 0) {
        // light spilling over the lid onto the agent
        g.globalAlpha = 0.25 + 0.15 * Math.sin(t / 120)
        px(g, lx - 1, y - 10, 16, 1, '#bdf0ff')
        g.globalAlpha = 1
      }
      // mug
      px(g, x + w - 6, y - 7, 3, 3, '#e9e2d0')
      break
    }
    case 'reception': {
      px(g, x, y - 6, w, 8, '#5b6b7a')
      px(g, x, y - 6, w, 2, '#7c8d9c')
      px(g, x + 1, y + 2, w - 2, 12, '#46535f')
      px(g, x + 4, y + 5, w - 8, 2, '#d6b25e')
      // bell + monitor back
      px(g, x + w - 10, y - 9, 4, 3, '#d6b25e')
      px(g, x + 6, y - 14, 12, 8, '#3a3f4b')
      px(g, x + 11, y - 6, 2, 2, '#3a3f4b')
      if (glow > 0) {
        g.globalAlpha = 0.3
        px(g, x + 5, y - 15, 14, 1, '#bdf0ff')
        g.globalAlpha = 1
      }
      break
    }
    case 'plant': {
      px(g, x + 4, y + 9, 8, 6, '#b5653d')
      px(g, x + 4, y + 9, 8, 1, '#cf7b50')
      px(g, x + 3, y + 1, 10, 8, '#3f8a4a')
      px(g, x + 5, y - 3, 6, 5, '#4fa35a')
      px(g, x + 1, y + 4, 3, 3, '#4fa35a')
      px(g, x + 12, y + 3, 3, 3, '#3f8a4a')
      break
    }
    case 'bookshelf': {
      px(g, x, y - 8, w, f.h * TILE + 8, '#6d4a30')
      const colors = ['#c0533a', '#2f5d8a', '#d6b25e', '#2f8a63', '#7a3fa0', '#e9e2d0']
      for (let s = 0; s < 3; s++) {
        const sy = y - 6 + s * 12
        px(g, x + 2, sy + 9, w - 4, 2, '#4f3420')
        for (let b = 0; b < 7; b++) px(g, x + 3 + b * 4, sy + 1, 3, 8, colors[(b + s * 2) % colors.length])
      }
      break
    }
    case 'coffee': {
      px(g, x + 2, y - 6, 12, 18, '#3a3f4b')
      px(g, x + 4, y - 4, 8, 4, '#9fe7ff')
      px(g, x + 6, y + 4, 4, 4, '#e9e2d0')
      // steam
      g.globalAlpha = 0.5
      const s = Math.floor(t / 300) % 3
      px(g, x + 7 + (s - 1), y - 10 - s, 1, 3, '#ffffff')
      g.globalAlpha = 1
      break
    }
    case 'table': {
      px(g, x + 1, y + 2, w - 2, 8, '#8b5e3c')
      px(g, x + 1, y + 2, w - 2, 1, '#a77450')
      px(g, x + 3, y + 10, 2, 5, '#5a3a24')
      px(g, x + w - 5, y + 10, 2, 5, '#5a3a24')
      px(g, x + 8, y, 4, 3, '#e9e2d0')
      break
    }
    case 'sofa': {
      px(g, x, y - 2, w, 10, '#2f5d8a')
      px(g, x, y + 8, w, 6, '#264b70')
      px(g, x, y - 2, 4, 16, '#264b70')
      px(g, x + w - 4, y - 2, 4, 16, '#264b70')
      break
    }
    case 'rug': {
      px(g, x + 2, y + 2, w - 4, f.h * TILE - 4, '#b04a3c')
      px(g, x + 5, y + 5, w - 10, f.h * TILE - 10, '#c96a52')
      g.strokeStyle = '#e8c27a'
      g.lineWidth = 1
      g.strokeRect(x + 7.5, y + 7.5, w - 15, f.h * TILE - 15)
      break
    }
    case 'window': {
      px(g, x + 2, y + 4, w - 4, 22, '#6d5a4b')
      const sky = g.createLinearGradient(0, y + 6, 0, y + 24)
      sky.addColorStop(0, '#8fc1e3')
      sky.addColorStop(1, '#cfe7f2')
      g.fillStyle = sky
      g.fillRect(x + 4, y + 6, w - 8, 18)
      px(g, x + w / 2 - 1, y + 6, 2, 18, '#6d5a4b')
      px(g, x + 4, y + 14, w - 8, 1, '#6d5a4b')
      // a drifting cloud
      const cx = x + 4 + ((t / 400) % (w - 14))
      px(g, cx, y + 9, 6, 2, '#ffffff')
      px(g, cx + 2, y + 8, 3, 1, '#ffffff')
      break
    }
    case 'whiteboard': {
      px(g, x + 2, y + 5, w - 4, 20, '#8b8f99')
      px(g, x + 3, y + 6, w - 6, 18, '#f7f7f2')
      px(g, x + 6, y + 9, 14, 1, '#2f5d8a')
      px(g, x + 6, y + 12, 22, 1, '#c0533a')
      px(g, x + 6, y + 15, 10, 1, '#2f8a63')
      px(g, x + 20, y + 15, 8, 6, '#d6b25e')
      break
    }
  }
}
