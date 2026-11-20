/**
 * Office agent tools — read-only GitHub access (owner-billed, restricted to the
 * roster's repos) and search over Siddharth's managed knowledge base.
 *
 * Spread into `buildTools` (src/ai/tools.ts) so there is one tool definition
 * for every surface. The chat route then hands each agent only the subset it
 * needs (`toolNamesFor`). Responses are trimmed hard: raw GitHub payloads are
 * mostly URLs, and every byte we pass is model input the owner pays for.
 */

import { tool } from 'ai'
import type { ToolSet } from 'ai'
import { z } from 'zod/v4'
import { knowledge } from 'deepspace/worker'
import type { AgentToolContext } from 'deepspace/worker'
import { createActionTools } from '../server/action-routes.js'
import { GITHUB_USER, OFFICE_REPOS, type OfficeAgent } from '../office/agents.js'
import type { Env } from '../../worker.js'

const MAX_TEXT = 12_000
export const KNOWLEDGE_FOLDER = 'profile'

const repoParam = z
  .enum(OFFICE_REPOS as [string, ...string[]])
  .describe('Repository as "owner/repo". Only the office repos are allowed.')

function clip(text: string, max = MAX_TEXT): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…[truncated ${text.length - max} chars]`
}

function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''))
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function splitRepo(full: string): { owner: string; repo: string } {
  const [owner, repo] = full.split('/')
  return { owner, repo }
}

type Json = Record<string, unknown>

export function buildOfficeTools(context: AgentToolContext<Env>): ToolSet {
  const { env, userId, request } = context
  const header = request.headers.get('Authorization') ?? ''
  const callerJwt = header.startsWith('Bearer ') ? header.slice(7) : ''
  const actionTools = createActionTools(env, userId, callerJwt)

  // `tools.integration` returns the proxy envelope; accept either the wrapped
  // `{ success, data }` form or a bare payload, and throw on refusal so the
  // model sees a tool error rather than silently empty data.
  async function github<T>(endpoint: string, body: Json): Promise<T> {
    const r = (await actionTools.integration(`github/${endpoint}`, body)) as unknown
    if (r && typeof r === 'object' && 'success' in r) {
      const env = r as { success: boolean; data?: unknown; error?: string }
      if (!env.success) throw new Error(env.error ?? `github/${endpoint} failed`)
      return env.data as T
    }
    return r as T
  }

  return {
    github_repo_overview: tool({
      description:
        'Get a repository overview: description, topics, stars, default branch, last push, and language breakdown.',
      inputSchema: z.object({ repo: repoParam }),
      execute: async ({ repo }) => {
        const ref = splitRepo(repo)
        const [meta, langs] = await Promise.all([
          github<Json>('get-repository', ref),
          github<Record<string, number>>('get-repository-languages', ref).catch(() => ({})),
        ])
        const total = Object.values(langs).reduce((a, b) => a + b, 0) || 1
        return {
          name: meta.full_name,
          description: meta.description,
          homepage: meta.homepage,
          url: meta.html_url,
          topics: meta.topics,
          stars: meta.stargazers_count,
          forks: meta.forks_count,
          openIssues: meta.open_issues_count,
          defaultBranch: meta.default_branch,
          createdAt: meta.created_at,
          pushedAt: meta.pushed_at,
          languages: Object.fromEntries(
            Object.entries(langs).map(([k, v]) => [k, `${Math.round((v / total) * 100)}%`]),
          ),
        }
      },
    }),

    github_readme: tool({
      description: "Read the repository's README (Markdown). Start here to understand a project.",
      inputSchema: z.object({ repo: repoParam }),
      execute: async ({ repo }) => {
        const r = await github<Json>('get-repository-readme', splitRepo(repo))
        const content =
          r.encoding === 'base64' && typeof r.content === 'string'
            ? decodeBase64Utf8(r.content)
            : String(r.content ?? '')
        return { path: r.path, url: r.html_url, content: clip(content) }
      },
    }),

    github_recent_commits: tool({
      description: 'List the most recent commits (message, date, author) to see what changed lately.',
      inputSchema: z.object({
        repo: repoParam,
        count: z.number().int().min(1).max(20).optional().describe('How many commits, default 10'),
      }),
      execute: async ({ repo, count }) => {
        const rows = await github<Json[]>('get-repository-commits', {
          ...splitRepo(repo),
          per_page: count ?? 10,
        })
        return rows.map((c) => {
          const commit = c.commit as { message?: string; author?: { name?: string; date?: string } }
          return {
            sha: String(c.sha).slice(0, 7),
            date: commit.author?.date,
            author: commit.author?.name,
            message: clip(commit.message ?? '', 500),
          }
        })
      },
    }),

    github_issues: tool({
      description: 'List issues and pull requests on the repository (title, state, labels, dates).',
      inputSchema: z.object({
        repo: repoParam,
        state: z.enum(['open', 'closed', 'all']).optional(),
      }),
      execute: async ({ repo, state }) => {
        const rows = await github<Json[]>('get-repository-issues', {
          ...splitRepo(repo),
          state: state ?? 'open',
          per_page: 15,
        })
        return rows.map((i) => ({
          number: i.number,
          title: i.title,
          state: i.state,
          isPullRequest: Boolean(i.pull_request),
          labels: Array.isArray(i.labels)
            ? (i.labels as Json[]).map((l) => l.name)
            : [],
          createdAt: i.created_at,
          body: clip(String(i.body ?? ''), 600),
        }))
      },
    }),

    github_file_tree: tool({
      description: 'List file paths in the repository to understand its structure.',
      inputSchema: z.object({ repo: repoParam }),
      execute: async ({ repo }) => {
        const r = await github<{ tree?: Json[]; truncated?: boolean }>('get-repository-tree', {
          ...splitRepo(repo),
          sha: 'HEAD',
          recursive: true,
        })
        const paths = (r.tree ?? [])
          .filter((n) => n.type === 'blob')
          .map((n) => String(n.path))
          .filter((p) => !/(^|\/)(node_modules|\.git|dist|build|__pycache__)\//.test(p))
        return { count: paths.length, paths: paths.slice(0, 400), truncated: paths.length > 400 }
      },
    }),

    github_read_file: tool({
      description: 'Read one file from the repository by path (use github_file_tree to find paths).',
      inputSchema: z.object({ repo: repoParam, path: z.string().min(1).max(300) }),
      execute: async ({ repo, path }) => {
        const r = await github<Json | Json[]>('get-repository-contents', { ...splitRepo(repo), path })
        if (Array.isArray(r)) {
          return { path, isDirectory: true, entries: r.map((e) => `${e.type}:${e.path}`) }
        }
        if (r.type !== 'file' || typeof r.content !== 'string') {
          return { path, error: `Not a readable file (type ${String(r.type)})` }
        }
        return { path, url: r.html_url, content: clip(decodeBase64Utf8(r.content)) }
      },
    }),

    github_profile_repos: tool({
      description: `List ${GITHUB_USER}'s public GitHub repositories (name, description, language, stars, last push).`,
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await github<Json[]>('get-user-public-repos', {
          username: GITHUB_USER,
          sort: 'pushed',
          per_page: 30,
        })
        return rows
          .filter((r) => !r.fork)
          .map((r) => ({
            name: r.name,
            description: r.description,
            language: r.language,
            stars: r.stargazers_count,
            url: r.html_url,
            pushedAt: r.pushed_at,
          }))
      },
    }),

    profile_search: tool({
      description:
        "Search Siddharth's resume and personal profile (experience, education, projects, publications, skills, hobbies). Always search before answering a question about him.",
      inputSchema: z.object({ query: z.string().min(2).max(500) }),
      execute: async ({ query }) => {
        const result = await knowledge(env).search(query, {
          folder: KNOWLEDGE_FOLDER,
          mode: 'hybrid',
          limit: 6,
        })
        return result.chunks.map((c) => ({ source: c.filename ?? c.key, text: c.text }))
      },
    }),

    // ---- Owner-only maintenance (local agent surface; never given to chat) ----

    profile_upload: tool({
      description:
        "OWNER ONLY. Add or replace a Markdown document in Siddharth's profile knowledge base.",
      inputSchema: z.object({
        filename: z.string().regex(/^[a-z0-9-]+\.md$/, 'lowercase-kebab .md filename'),
        markdown: z.string().min(1).max(200_000),
      }),
      execute: async ({ filename, markdown }) => {
        if (userId !== env.OWNER_USER_ID) throw new Error('Forbidden: owner only')
        const kb = knowledge(env)
        // Replace semantics: drop any earlier upload with the same name first.
        const existing = await kb.list({ folder: KNOWLEDGE_FOLDER, perPage: 50 })
        for (const item of existing.items) {
          if (item.key.endsWith(`/${filename}`) || item.key === filename) await kb.remove(item.id)
        }
        const added = await kb.add(new File([markdown], filename, { type: 'text/markdown' }), {
          folder: KNOWLEDGE_FOLDER,
        })
        return { uploaded: added.items.map((i) => ({ id: i.id, key: i.key, status: i.status })) }
      },
    }),

    profile_list: tool({
      description: 'OWNER ONLY. List documents in the profile knowledge base with indexing status.',
      inputSchema: z.object({}),
      execute: async () => {
        if (userId !== env.OWNER_USER_ID) throw new Error('Forbidden: owner only')
        const r = await knowledge(env).list({ folder: KNOWLEDGE_FOLDER, perPage: 50 })
        return r.items.map((i) => ({ id: i.id, key: i.key, status: i.status, chunks: i.chunksCount }))
      },
    }),
  }
}

/** Office tool names any agent may use, keyed by agent kind. */
const PROJECT_TOOLS = [
  'github_repo_overview',
  'github_readme',
  'github_recent_commits',
  'github_issues',
  'github_file_tree',
  'github_read_file',
]
const PERSONA_TOOLS = ['profile_search', 'github_profile_repos', 'github_repo_overview', 'github_readme']

export function toolNamesFor(agent: OfficeAgent): string[] {
  return agent.kind === 'persona' ? PERSONA_TOOLS : PROJECT_TOOLS
}
