/**
 * Chat with one office agent. Each visitor keeps one ongoing conversation per
 * agent (found by the server-set `agent:<id>` title), so walking away and
 * coming back resumes it.
 */

import { useMemo, useState } from 'react'
import { AuthOverlay, useQuery } from 'deepspace'
import { X } from 'lucide-react'
import { ChatPanel } from '../ChatPanel'
import type { ChatActivity } from '../ChatPanel.stream'
import { agentChatTitle, DAILY_TURN_CAP, type OfficeAgent } from '../../office/agents'
import { AGENT_PALETTES } from '../../office/sprites'

interface AgentChatProps {
  agent: OfficeAgent
  userId: string | null
  turnsUsed: number
  onClose: () => void
  onActivity: (agentId: string, activity: ChatActivity) => void
}

type ChatData = { title: string; userId: string }

export function AgentChat({ agent, userId, turnsUsed, onClose, onActivity }: AgentChatProps) {
  const accent = AGENT_PALETTES[agent.skin % AGENT_PALETTES.length].shirt
  return (
    <section
      aria-label={`Chat with ${agent.name}`}
      data-testid="agent-chat"
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <header className="flex items-start gap-3 border-b border-border px-4 py-3">
        <span
          aria-hidden="true"
          className="mt-1 h-3 w-3 shrink-0 rounded-[3px]"
          style={{ background: accent }}
        />
        <div className="min-w-0 flex-1">
          <h2 className="font-pixel text-[15px] leading-tight text-foreground">{agent.name}</h2>
          <p className="truncate text-[12px] text-muted-foreground">
            {agent.title}
            {agent.repo && (
              <>
                {' · '}
                <a
                  className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                  href={`https://github.com/${agent.repo.owner}/${agent.repo.repo}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  repo
                </a>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {userId ? (
        <SignedInChat
          key={agent.id}
          agent={agent}
          userId={userId}
          turnsUsed={turnsUsed}
          onActivity={onActivity}
        />
      ) : (
        <SignedOut agent={agent} />
      )}
    </section>
  )
}

function SignedInChat({
  agent,
  userId,
  turnsUsed,
  onActivity,
}: {
  agent: OfficeAgent
  userId: string
  turnsUsed: number
  onActivity: (agentId: string, activity: ChatActivity) => void
}) {
  const where = useMemo(() => ({ title: agentChatTitle(agent.id), userId }), [agent.id, userId])
  const { records, status } = useQuery<ChatData>('ai-chats', {
    where,
    orderBy: 'createdAt',
    orderDir: 'desc',
  })
  const existing = records[0]?.recordId ?? null
  const handleActivity = useMemo(
    () => (a: ChatActivity) => onActivity(agent.id, a),
    [agent.id, onActivity],
  )

  if (status !== 'ready' && records.length === 0) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Pulling up a chair…</div>
  }

  const left = Math.max(0, DAILY_TURN_CAP - turnsUsed)
  return (
    <>
      <ChatPanel
        chatId={existing}
        userId={userId}
        agentId={agent.id}
        models={[]}
        compact
        className="flex-1"
        onActivity={handleActivity}
        placeholder={`Ask ${agent.name}…`}
        emptyStatePrompts={agent.prompts}
        emptyStateIntro={
          <div className="space-y-1">
            <h3 className="font-pixel text-[14px] text-foreground">Hi, I&apos;m {agent.name}</h3>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{agent.greeting}</p>
          </div>
        }
      />
      <p className="border-t border-border/60 px-4 py-1.5 text-[11px] text-muted-foreground">
        {left} of {DAILY_TURN_CAP} messages left today · answers come from live tools, not memory
      </p>
    </>
  )
}

function SignedOut({ agent }: { agent: OfficeAgent }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="max-w-xs text-[14px] leading-relaxed text-foreground">{agent.greeting}</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Sign in to chat with {agent.name}
      </button>
      <p className="max-w-xs text-[12px] text-muted-foreground">
        Signing in keeps your conversations and lets other visitors see you in the office.
      </p>
      {open && <AuthOverlay onClose={() => setOpen(false)} />}
    </div>
  )
}
