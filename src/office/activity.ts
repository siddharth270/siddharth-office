/**
 * What an agent's character is doing, derived from the real chat stream —
 * the same idea as Pixel Agents' transcript → animation mapping, but driven by
 * the AI SDK stream events instead of a local JSONL file:
 *
 *   turn starts            → thinking   ("…" bubble)
 *   tool call starts       → reading    (tool label, e.g. "reading README")
 *   tool result arrives    → thinking
 *   text delta             → typing     (hands + screen lines)
 *   turn ends              → done       ("!" bubble, a few seconds) → idle
 *
 * Unlike Pixel Agents there is no idle-timer heuristic: the stream has
 * explicit start/end events, so "waiting for you" is exact.
 */

import type { ChatActivity } from '../components/ChatPanel.stream'

export type AgentMode = 'idle' | 'thinking' | 'reading' | 'typing' | 'done' | 'error'

export interface AgentActivity {
  mode: AgentMode
  /** Short label for the bubble while reading. */
  label?: string
  /** ms epoch of the last change; `done`/`error` expire after DONE_MS. */
  at: number
}

export const DONE_MS = 4000

const TOOL_LABELS: Record<string, string> = {
  github_readme: 'reading README',
  github_repo_overview: 'checking the repo',
  github_recent_commits: 'reading commits',
  github_issues: 'checking issues',
  github_file_tree: 'browsing files',
  github_read_file: 'reading code',
  github_profile_repos: 'browsing GitHub',
  profile_search: 'checking notes',
}

export function toolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? 'looking it up'
}

export const IDLE: AgentActivity = { mode: 'idle', at: 0 }

/** Next activity given a stream lifecycle event, or null when unchanged. */
export function nextActivity(prev: AgentActivity, event: ChatActivity, now: number): AgentActivity | null {
  switch (event.kind) {
    case 'start':
      return { mode: 'thinking', at: now }
    case 'end':
      return { mode: event.ok ? 'done' : 'error', at: now }
    case 'action': {
      const a = event.action
      switch (a.type) {
        case 'upsert-tool-call':
          return { mode: 'reading', label: toolLabel(a.toolName), at: now }
        case 'finalize-tool-call':
        case 'fail-tool-output':
        case 'fail-tool-input':
          return { mode: 'thinking', at: now }
        case 'append-text':
          return prev.mode === 'typing' ? null : { mode: 'typing', at: now }
        default:
          return null
      }
    }
  }
}

/** `done`/`error` are transient. */
export function settle(a: AgentActivity, now: number): AgentActivity {
  if ((a.mode === 'done' || a.mode === 'error') && now - a.at > DONE_MS) return IDLE
  return a
}

const PRIORITY: Record<AgentMode, number> = {
  typing: 5,
  reading: 4,
  thinking: 3,
  error: 2,
  done: 1,
  idle: 0,
}

/** Several visitors can talk to one agent at once; show the busiest state. */
export function combine(list: AgentActivity[]): AgentActivity {
  return list.reduce((best, a) => (PRIORITY[a.mode] > PRIORITY[best.mode] ? a : best), IDLE)
}
