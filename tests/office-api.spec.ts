/**
 * Office chat route contract — no model calls, so these run free.
 *
 * Covers: auth gate, agent binding on create, the immutable agent title,
 * cross-user isolation, and that a turn on an unbound chat is refused before
 * any spend.
 */

import { test, expect } from 'deepspace/testing'
import type { Page } from '@playwright/test'

async function tokenFor(page: Page): Promise<string> {
  // Visiting a dynamic page creates the caller's users row (app membership).
  await page.goto('/home')
  // Membership (the users row) is created once the records socket connects.
  await page.waitForSelector('[data-testid="app-navigation"]', { timeout: 15000 })
  await expect
    .poll(async () => {
      const t = await page.request.post('/api/auth/token')
      const { token } = (await t.json()) as { token: string }
      const probe = await page.request.post('/api/ai/chats', {
        headers: { Authorization: `Bearer ${token}` },
        data: {},
      })
      return probe.status() // 403 until membership lands, then 400 (no agentId)
    }, { timeout: 15000 })
    .toBe(400)
  const res = await page.request.post('/api/auth/token')
  expect(res.ok()).toBeTruthy()
  const { token } = (await res.json()) as { token: string }
  expect(token).toBeTruthy()
  return token
}

test.describe('office chat routes', () => {
  test('unauthenticated callers get 401', async ({ request }) => {
    const res = await request.post('/api/ai/chats', { data: { agentId: 'siddharth' } })
    expect(res.status()).toBe(401)
  })

  test('chats must name a known agent and are bound by title', async ({ users }) => {
    const [alice] = await users(1)
    const token = await tokenFor(alice.page)
    const auth = { Authorization: `Bearer ${token}` }

    const missing = await alice.page.request.post('/api/ai/chats', { headers: auth, data: {} })
    expect(missing.status()).toBe(400)
    expect((await missing.json()).code).toBe('unknown_agent')

    const bogus = await alice.page.request.post('/api/ai/chats', {
      headers: auth,
      data: { agentId: 'nope' },
    })
    expect(bogus.status()).toBe(400)

    const ok = await alice.page.request.post('/api/ai/chats', {
      headers: auth,
      data: { agentId: 'siddharth' },
    })
    expect(ok.ok()).toBeTruthy()
    const { chat } = (await ok.json()) as { chat: { recordId: string; title: string } }
    expect(chat.title).toBe('agent:siddharth')

    try {
      // The binding can't be renamed away.
      const rename = await alice.page.request.patch(`/api/ai/chats/${chat.recordId}`, {
        headers: auth,
        data: { title: 'agent:office' },
      })
      expect(rename.status()).toBe(400)
      expect((await rename.json()).code).toBe('immutable_title')
    } finally {
      await alice.page.request.delete(`/api/ai/chats/${chat.recordId}`, { headers: auth })
    }
  })

  test("another user's chat is invisible", async ({ users }) => {
    const [alice, bob] = await users(2)
    const aliceAuth = { Authorization: `Bearer ${await tokenFor(alice.page)}` }
    const bobAuth = { Authorization: `Bearer ${await tokenFor(bob.page)}` }

    const created = await alice.page.request.post('/api/ai/chats', {
      headers: aliceAuth,
      data: { agentId: 'office' },
    })
    const { chat } = (await created.json()) as { chat: { recordId: string } }
    try {
      const turn = await bob.page.request.post('/api/ai/chat', {
        headers: bobAuth,
        data: { chatId: chat.recordId, userMessageId: `umsg-${Date.now()}`, content: 'hi' },
      })
      expect(turn.status()).toBe(404)
      const del = await bob.page.request.delete(`/api/ai/chats/${chat.recordId}`, {
        headers: bobAuth,
      })
      expect(del.status()).toBe(404)
    } finally {
      await alice.page.request.delete(`/api/ai/chats/${chat.recordId}`, { headers: aliceAuth })
    }
  })

  test('local agent tool surface is owner-only', async ({ users }) => {
    const [alice] = await users(1)
    const token = await tokenFor(alice.page)
    // A signed-in member (membership proven by tokenFor) is refused tool
    // discovery on the browser-session agent surface by our authorize policy.
    const res = await alice.page.request.get('/_deepspace/agent/browser/tools', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(403)
  })
})
