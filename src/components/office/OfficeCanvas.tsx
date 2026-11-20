/**
 * The office view: a single <canvas> game loop. React owns *what* exists
 * (agents, peers, activities); this component owns *how it moves*.
 *
 * Rendering is at integer device-pixel scale with smoothing off, so the pixel
 * art stays crisp on any screen. Props are read through a ref inside the loop
 * so presence updates never restart it.
 */

import { useEffect, useRef } from 'react'
import { AGENTS, type OfficeAgent } from '../../office/agents'
import {
  COLS,
  DESKS,
  FURNITURE,
  ROWS,
  SPAWN,
  TILE,
  deskById,
  findPath,
  isWalkable,
  nearestWalkable,
  type Dir,
  type Pt,
} from '../../office/map'
import {
  AGENT_PALETTES,
  characterSprite,
  drawDoor,
  drawFloorTile,
  drawFurniture,
  drawSideWalls,
  drawWall,
  visitorPalette,
  type Hands,
} from '../../office/sprites'
import { settle, type AgentActivity } from '../../office/activity'

export interface VisitorView {
  userId: string
  name: string
  color: string
  x: number
  y: number
  dir: Dir
  talkingTo?: string | null
}

export interface MoveState {
  x: number
  y: number
  dir: Dir
}

export interface OfficeCanvasProps {
  me: { userId: string; name: string; color: string }
  peers: VisitorView[]
  activities: Record<string, AgentActivity>
  selectedAgentId: string | null
  /** Bump `nonce` to make my character walk to an agent (e.g. from the roster list). */
  walkTo: { agentId: string; nonce: number } | null
  onArrive: (agentId: string) => void
  onMove: (s: MoveState) => void
  className?: string
}

const W = COLS * TILE
const H = ROWS * TILE
const WALK_SPEED = 4.5 // tiles per second
const PEER_SPEED = 6

interface Mover {
  x: number
  y: number
  dir: Dir
  moving: boolean
  walkT: number
}

const AGENT_BY_DESK = new Map(AGENTS.map((a) => [a.desk, a]))

function agentAt(wx: number, wy: number): OfficeAgent | null {
  for (const a of AGENTS) {
    const d = deskById(a.desk)
    if (!d) continue
    const left = d.desk.x * TILE
    const right = (d.desk.x + d.desk.w) * TILE
    const top = d.seat.y * TILE - 10
    const bottom = (d.desk.y + 1) * TILE
    if (wx >= left && wx < right && wy >= top && wy < bottom) return a
  }
  return null
}

function dirTowards(from: Pt, to: Pt, fallback: Dir): Dir {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return fallback
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'down' : 'up'
}

export function OfficeCanvas(props: OfficeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef(props)
  propsRef.current = props

  // Mutable game state (never triggers React renders).
  const meRef = useRef<Mover & { path: Pt[]; pendingAgent: string | null; tile: Pt }>({
    x: SPAWN.x,
    y: SPAWN.y,
    dir: 'up',
    moving: false,
    walkT: 0,
    path: [],
    pendingAgent: null,
    tile: { ...SPAWN },
  })
  const peerPos = useRef(new Map<string, Mover>())
  const hoverRef = useRef<string | null>(null)
  const scaleRef = useRef(3)

  // Walk-to requests from outside (roster buttons).
  const lastNonce = useRef(0)
  useEffect(() => {
    const req = props.walkTo
    if (!req || req.nonce === lastNonce.current) return
    lastNonce.current = req.nonce
    goToAgent(req.agentId)
  }, [props.walkTo])

  function goToAgent(agentId: string) {
    const agent = AGENTS.find((a) => a.id === agentId)
    const desk = agent && deskById(agent.desk)
    if (!desk) return
    const me = meRef.current
    if (me.tile.x === desk.front.x && me.tile.y === desk.front.y && !me.path.length) {
      me.dir = 'up'
      propsRef.current.onArrive(agentId)
      return
    }
    const path = findPath(me.tile, desk.front)
    if (!path) return
    me.path = path
    me.pendingAgent = agentId
  }

  function goToTile(t: Pt) {
    const target = nearestWalkable(t)
    if (!target) return
    const me = meRef.current
    const path = findPath(me.tile, target)
    if (path) {
      me.path = path
      me.pendingAgent = null
    }
  }

  // Resize → integer device-pixel scale.
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const fit = () => {
      const dpr = window.devicePixelRatio || 1
      const cssScale = Math.min(wrap.clientWidth / W, wrap.clientHeight / H)
      const scale = Math.max(1, Math.floor(cssScale * dpr))
      scaleRef.current = scale
      canvas.width = W * scale
      canvas.height = H * scale
      canvas.style.width = `${(W * scale) / dpr}px`
      canvas.style.height = `${(H * scale) / dpr}px`
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // Input.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const toWorld = (e: MouseEvent | PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return {
        x: ((e.clientX - rect.left) / rect.width) * W,
        y: ((e.clientY - rect.top) / rect.height) * H,
      }
    }
    const onClick = (e: PointerEvent) => {
      const w = toWorld(e)
      const agent = agentAt(w.x, w.y)
      if (agent) goToAgent(agent.id)
      else goToTile({ x: Math.floor(w.x / TILE), y: Math.floor(w.y / TILE) })
    }
    const onMoveMouse = (e: PointerEvent) => {
      const w = toWorld(e)
      const agent = agentAt(w.x, w.y)
      hoverRef.current = agent?.id ?? null
      canvas.style.cursor = agent ? 'pointer' : 'default'
    }
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const d: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        w: [0, -1],
        s: [0, 1],
        a: [-1, 0],
        d: [1, 0],
      }
      const step = d[e.key]
      if (!step) return
      e.preventDefault()
      const me = meRef.current
      const base = me.path.length ? me.path[0] : me.tile
      const next = { x: base.x + step[0], y: base.y + step[1] }
      me.pendingAgent = null
      if (isWalkable(next)) me.path = me.path.length ? [me.path[0], next] : [next]
      else me.dir = step[0] ? (step[0] > 0 ? 'right' : 'left') : step[1] > 0 ? 'down' : 'up'
    }
    canvas.addEventListener('pointerup', onClick)
    canvas.addEventListener('pointermove', onMoveMouse)
    window.addEventListener('keydown', onKey)
    return () => {
      canvas.removeEventListener('pointerup', onClick)
      canvas.removeEventListener('pointermove', onMoveMouse)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // Game loop.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const g = canvas.getContext('2d')!
    let raf = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      update(dt)
      render(g, now)
      raf = requestAnimationFrame(tick)
    }

    const update = (dt: number) => {
      const p = propsRef.current
      const me = meRef.current
      // ---- my movement along the path ----
      if (me.path.length) {
        const target = me.path[0]
        me.dir = dirTowards(me, target, me.dir)
        const dx = target.x - me.x
        const dy = target.y - me.y
        const dist = Math.hypot(dx, dy)
        const stepLen = WALK_SPEED * dt
        me.moving = true
        me.walkT += dt
        if (dist <= stepLen) {
          me.x = target.x
          me.y = target.y
          me.tile = { ...target }
          me.path.shift()
          p.onMove({ x: me.tile.x, y: me.tile.y, dir: me.dir })
          if (!me.path.length) {
            me.moving = false
            if (me.pendingAgent) {
              const id = me.pendingAgent
              me.pendingAgent = null
              me.dir = 'up'
              p.onMove({ x: me.tile.x, y: me.tile.y, dir: 'up' })
              p.onArrive(id)
            }
          }
        } else {
          me.x += (dx / dist) * stepLen
          me.y += (dy / dist) * stepLen
        }
      } else {
        me.moving = false
      }

      // ---- peers glide toward their last broadcast tile ----
      const seen = new Set<string>()
      for (const peer of p.peers) {
        seen.add(peer.userId)
        let m = peerPos.current.get(peer.userId)
        if (!m) {
          m = { x: peer.x, y: peer.y, dir: peer.dir, moving: false, walkT: 0 }
          peerPos.current.set(peer.userId, m)
        }
        const dx = peer.x - m.x
        const dy = peer.y - m.y
        const dist = Math.hypot(dx, dy)
        if (dist > 4) {
          m.x = peer.x
          m.y = peer.y
        } else if (dist > 0.01) {
          const s = Math.min(dist, PEER_SPEED * dt)
          m.x += (dx / dist) * s
          m.y += (dy / dist) * s
          m.dir = dirTowards(m, peer, m.dir)
          m.moving = true
          m.walkT += dt
        } else {
          m.moving = false
          m.dir = peer.dir
        }
      }
      for (const id of peerPos.current.keys()) if (!seen.has(id)) peerPos.current.delete(id)
    }

    const render = (g: CanvasRenderingContext2D, now: number) => {
      const p = propsRef.current
      const s = scaleRef.current
      g.setTransform(s, 0, 0, s, 0, 0)
      g.imageSmoothingEnabled = false

      // Floor, walls, flat decor.
      for (let y = 2; y < ROWS; y++) for (let x = 0; x < COLS; x++) drawFloorTile(g, x, y)
      drawWall(g, COLS)
      drawSideWalls(g, COLS, ROWS)
      drawDoor(g, SPAWN.x, ROWS)
      for (const f of FURNITURE) if (f.kind === 'rug' || f.kind === 'window' || f.kind === 'whiteboard') drawFurniture(g, f, now)

      // Depth-sorted drawables.
      type Drawable = { y: number; draw: () => void }
      const list: Drawable[] = []

      for (const f of FURNITURE) {
        if (f.kind === 'rug' || f.kind === 'window' || f.kind === 'whiteboard') continue
        const agent = f.kind === 'desk' || f.kind === 'reception' ? deskAgent(f.x, f.y) : null
        const act = agent ? settle(p.activities[agent.id] ?? { mode: 'idle', at: 0 }, Date.now()) : null
        const glow = act && act.mode !== 'idle' ? 1 : 0
        list.push({ y: f.y + f.h, draw: () => drawFurniture(g, f, now, glow) })
      }

      for (const a of AGENTS) {
        const d = deskById(a.desk)
        if (!d) continue
        const act = settle(p.activities[a.id] ?? { mode: 'idle', at: 0 }, Date.now())
        const hands: Hands = act.mode === 'typing' ? 'type' : act.mode === 'reading' ? 'read' : 'rest'
        const frame = Math.floor(now / (hands === 'type' ? 110 : 450)) % 2
        const blink = (now + a.id.length * 997) % 3800 < 140
        const sprite = characterSprite({
          pal: AGENT_PALETTES[a.skin % AGENT_PALETTES.length],
          dir: 'down',
          pose: 'sit',
          frame,
          hands,
          blink,
        })
        const breathe = act.mode === 'idle' && Math.floor(now / 900) % 2 ? 1 : 0
        list.push({
          y: d.seat.y + 0.99,
          draw: () => g.drawImage(sprite, d.seat.x * TILE, d.seat.y * TILE - 12 + breathe),
        })
      }

      const drawVisitor = (m: Mover, pal: ReturnType<typeof visitorPalette>, isMe: boolean) => {
        const frame = m.moving ? Math.floor(m.walkT * 8) % 2 : 0
        const sprite = characterSprite({
          pal,
          dir: m.dir,
          pose: m.moving ? 'walk' : 'stand',
          frame,
          hands: 'rest',
          blink: false,
        })
        list.push({
          y: m.y + 1,
          draw: () => {
            if (isMe) {
              g.fillStyle = 'rgba(255,255,255,0.35)'
              g.beginPath()
              g.ellipse(m.x * TILE + 8, m.y * TILE + 15, 7, 3, 0, 0, Math.PI * 2)
              g.fill()
            }
            g.drawImage(sprite, m.x * TILE, m.y * TILE - 8)
          },
        })
      }

      const peersById = new Map(p.peers.map((v) => [v.userId, v]))
      for (const [id, m] of peerPos.current) {
        const v = peersById.get(id)
        if (v) drawVisitor(m, visitorPalette(id, v.color), false)
      }
      drawVisitor(meRef.current, visitorPalette(p.me.userId, p.me.color), true)

      list.sort((a, b) => a.y - b.y)
      for (const d of list) d.draw()

      // ---- overlays: name tags and activity bubbles ----
      for (const [id, m] of peerPos.current) {
        const v = peersById.get(id)
        if (v) nameTag(g, m.x * TILE + 8, m.y * TILE - 10, v.name, v.color, false)
      }
      const me = meRef.current
      nameTag(g, me.x * TILE + 8, me.y * TILE - 10, 'You', p.me.color, true)

      for (const a of AGENTS) {
        const d = deskById(a.desk)
        if (!d) continue
        const act = settle(p.activities[a.id] ?? { mode: 'idle', at: 0 }, Date.now())
        const cx = d.seat.x * TILE + 8
        const top = d.seat.y * TILE - 14
        const highlighted = p.selectedAgentId === a.id || hoverRef.current === a.id
        if (act.mode === 'idle') {
          nameTag(g, cx, top, a.name, highlighted ? '#f5d76e' : '#ffffff', highlighted, true)
        } else {
          bubble(g, cx, top, act, now)
        }
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div ref={wrapRef} className={`flex h-full w-full items-center justify-center ${props.className ?? ''}`}>
      <canvas
        ref={canvasRef}
        data-testid="office-canvas"
        role="img"
        aria-label="Pixel-art office. Click an agent's desk to walk over and chat, or use the agent list."
        className="block touch-none select-none rounded-lg shadow-[0_8px_40px_rgba(0,0,0,0.35)]"
      />
    </div>
  )
}

function deskAgent(x: number, y: number): OfficeAgent | null {
  const d = DESKS.find((s) => s.desk.x === x && s.desk.y === y)
  return d ? (AGENT_BY_DESK.get(d.id) ?? null) : null
}

const FONT = '600 5px ui-monospace, SFMono-Regular, Menlo, monospace'

function nameTag(
  g: CanvasRenderingContext2D,
  cx: number,
  y: number,
  text: string,
  color: string,
  strong: boolean,
  agent = false,
) {
  g.font = FONT
  const w = Math.ceil(g.measureText(text).width) + 6
  const x = Math.round(cx - w / 2)
  g.fillStyle = strong ? 'rgba(20,16,28,0.9)' : 'rgba(20,16,28,0.62)'
  g.fillRect(x, y - 7, w, 8)
  if (agent) {
    g.fillStyle = color
    g.fillRect(x, y, w, 1)
  }
  g.fillStyle = agent ? color : '#ffffff'
  if (!agent) {
    g.fillStyle = color
    g.fillRect(x, y - 7, 2, 8)
    g.fillStyle = '#ffffff'
  }
  g.textBaseline = 'alphabetic'
  g.fillText(text, x + 3, y - 1.5)
}

function bubble(g: CanvasRenderingContext2D, cx: number, y: number, act: AgentActivity, now: number) {
  let text: string
  switch (act.mode) {
    case 'thinking':
      text = '.'.repeat(1 + (Math.floor(now / 300) % 3)).padEnd(3, ' ')
      break
    case 'reading':
      text = act.label ?? 'reading'
      break
    case 'typing':
      text = 'typing' + '.'.repeat(1 + (Math.floor(now / 250) % 3)).padEnd(3, ' ')
      break
    case 'done':
      text = 'done!'
      break
    case 'error':
      text = 'hmm?'
      break
    default:
      return
  }
  g.font = FONT
  const w = Math.max(14, Math.ceil(g.measureText(text).width) + 8)
  const x = Math.round(cx - w / 2)
  const top = y - 12 + (act.mode === 'done' ? Math.round(Math.sin(now / 120)) : 0)
  g.fillStyle = OUTLINE_BUBBLE
  g.fillRect(x - 1, top - 1, w + 2, 11)
  g.fillStyle = act.mode === 'done' ? '#f5d76e' : act.mode === 'error' ? '#f2a39a' : '#ffffff'
  g.fillRect(x, top, w, 9)
  // tail
  g.fillRect(cx - 1, top + 9, 3, 2)
  g.fillStyle = OUTLINE_BUBBLE
  g.fillRect(cx - 2, top + 10, 1, 1)
  g.fillRect(cx + 2, top + 10, 1, 1)
  g.fillRect(cx - 1, top + 11, 3, 1)
  g.fillStyle = '#231d2b'
  g.textBaseline = 'alphabetic'
  g.fillText(text, x + 4, top + 6.5)
}

const OUTLINE_BUBBLE = '#231d2b'
