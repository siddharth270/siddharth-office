/**
 * The office roster — single source of truth for every agent, shared by the
 * client (who sits where, what they look like) and the worker (system prompt,
 * which tools, which repo). Changing the roster is a code change + deploy on
 * purpose: agents are part of the product, not user data.
 */

export const GITHUB_USER = 'siddharth270'

export type AgentKind = 'persona' | 'project' | 'paper'

export interface RepoRef {
  owner: string
  repo: string
}

export interface OfficeAgent {
  /** Stable id; also stored in each chat's title as `agent:<id>`. */
  id: string
  name: string
  /** One-line role shown on the nameplate. */
  title: string
  kind: AgentKind
  /** Project agents only: the GitHub repo this agent "works on". */
  repo?: RepoRef
  /** Paper agents only: id into PAPERS (src/office/papers.ts). */
  paperId?: string
  /** Sprite palette index (see the office renderer). */
  skin: number
  /** Desk slot id in the office map. */
  desk: string
  /** Shown as the first bubble when a visitor opens the chat. */
  greeting: string
  /** Suggested first questions. */
  prompts: string[]
}

export const AGENTS: OfficeAgent[] = [
  {
    id: 'siddharth',
    name: 'Siddharth',
    title: 'Front desk · ask me about my background',
    kind: 'persona',
    skin: 0,
    desk: 'reception',
    greeting:
      "Hi, I'm Siddharth's AI twin. Ask me about my experience, projects, publications, or what I do outside of code.",
    prompts: [
      'What did you build at Opti-Mode?',
      'Tell me about your robotics project',
      'What do you do for fun?',
    ],
  },
  // Provisional project desks — replace with the final 3–5 repos.
  {
    id: 'office',
    name: 'Ada',
    title: 'Works on siddharth-office',
    kind: 'project',
    repo: { owner: GITHUB_USER, repo: 'siddharth-office' },
    skin: 1,
    desk: 'desk-1',
    greeting: "I'm building the office you're standing in. Ask me how it works.",
    prompts: ['How do the characters know what I am doing?', 'What is the tech stack?'],
  },
  {
    id: 'docitron',
    name: 'Milo',
    title: 'Works on Docitron (medconnect)',
    kind: 'project',
    repo: { owner: GITHUB_USER, repo: 'medconnect' },
    skin: 2,
    desk: 'desk-2',
    greeting: 'I work on Docitron — conversations in, clinical notes out.',
    prompts: ['What does Docitron do?', 'What changed recently?'],
  },
  {
    id: 'acoustics',
    name: 'Rhea',
    title: 'Works on blind-room-acoustics',
    kind: 'project',
    repo: { owner: GITHUB_USER, repo: 'blind-room-acoustics' },
    skin: 3,
    desk: 'desk-3',
    greeting: 'I estimate how a room sounds from a single voice recording. Ask away.',
    prompts: ['How does the model work?', 'How small is the deployed model?'],
  },
  // Research desks — one per peer-reviewed paper.
  {
    id: 'paper-journal',
    name: 'Iris',
    title: 'Research · JIKM 2024 journal paper',
    kind: 'paper',
    paperId: 'jikm-2024',
    skin: 4,
    desk: 'desk-4',
    greeting:
      'I look after the 2024 journal paper on finding untagged places from social media with NLP and geospatial clustering.',
    prompts: ['What problem does the paper solve?', 'Which clustering algorithms were used?', 'How is it different from the 2023 paper?'],
  },
  {
    id: 'paper-conference',
    name: 'Kai',
    title: 'Research · Confluence 2023 paper',
    kind: 'paper',
    paperId: 'confluence-2023',
    skin: 5,
    desk: 'desk-5',
    greeting:
      'I look after the 2023 IEEE Confluence paper — the first take on exploring places that have no geotag.',
    prompts: ['Summarise the paper in two lines', 'What is an "unexplored geotag"?', 'Where was it published?'],
  },
]

export const AGENT_CHAT_TITLE_PREFIX = 'agent:'

export function agentById(id: string | null | undefined): OfficeAgent | undefined {
  return AGENTS.find((a) => a.id === id)
}

export function agentChatTitle(agentId: string): string {
  return `${AGENT_CHAT_TITLE_PREFIX}${agentId}`
}

export function agentIdFromChatTitle(title: string | null | undefined): string | null {
  if (!title?.startsWith(AGENT_CHAT_TITLE_PREFIX)) return null
  return title.slice(AGENT_CHAT_TITLE_PREFIX.length)
}

/** Repos the GitHub tools may touch — everything else is refused server-side. */
export const OFFICE_REPOS: string[] = AGENTS.flatMap((a) =>
  a.repo ? [`${a.repo.owner}/${a.repo.repo}`] : [],
)

/** Per-visitor daily cap on chat turns (owner pays). The owner is exempt. */
export const DAILY_TURN_CAP = 30

/** Fixed, owner-billed model; visitors don't pick. */
export const OFFICE_MODEL_ID = 'claude-sonnet-5-5'
