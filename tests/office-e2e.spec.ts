/**
 * Office end-to-end: two real signed-in visitors.
 *
 * - presence: each sees the other in the room
 * - roster click walks you to the desk and opens that agent's chat
 * - (opt-in, costs credits) a real turn streams and animates the agent:
 *   OFFICE_LIVE_CHAT=1 npx deepspace test run all --grep "live turn"
 */

import { test, expect } from 'deepspace/testing'

const SHOTS = process.env.OFFICE_SHOTS_DIR

test.describe('office', () => {
  test('two visitors see each other and can open an agent chat', async ({ users }) => {
    const [alice, bob] = await users(2)
    await alice.page.goto('/home')
    await bob.page.goto('/home')
    await expect(alice.page.getByTestId('office-canvas')).toBeVisible()
    await expect(bob.page.getByTestId('office-canvas')).toBeVisible()

    // Presence: both count each other.
    await expect(alice.page.getByTestId('online-count')).toHaveText(/2 here now/, { timeout: 15000 })
    await expect(bob.page.getByTestId('online-count')).toHaveText(/2 here now/, { timeout: 15000 })

    // Roster → walk to Milo's desk → chat opens on arrival.
    await alice.page.getByTestId('agent-roster').getByRole('button', { name: /Milo/ }).click()
    const chat = alice.page.getByTestId('agent-chat')
    await expect(chat).toBeVisible({ timeout: 15000 })
    await expect(chat.getByRole('heading', { name: 'Milo' })).toBeVisible()
    await expect(chat.getByPlaceholder('Ask Milo…')).toBeVisible()

    // Bob sees that someone is chatting with Milo.
    await expect(
      bob.page.getByTestId('agent-roster').getByRole('button', { name: /Milo/ }),
    ).toContainText('1 chatting', { timeout: 15000 })

    if (SHOTS) {
      await alice.page.screenshot({ path: `${SHOTS}/alice-chat.png` })
      await bob.page.screenshot({ path: `${SHOTS}/bob-view.png` })
    }

    await alice.page.keyboard.press('Escape')
    await expect(chat).toBeHidden()
  })

  test('live turn streams and the agent animates', async ({ users }) => {
    test.skip(!process.env.OFFICE_LIVE_CHAT, 'Spends owner credits; opt in with OFFICE_LIVE_CHAT=1')
    test.setTimeout(120_000)
    const [alice, bob] = await users(2)
    await alice.page.goto('/home')
    await bob.page.goto('/home')
    await expect(alice.page.getByTestId('online-count')).toHaveText(/2 here now/, { timeout: 15000 })

    await alice.page.getByTestId('agent-roster').getByRole('button', { name: /Siddharth/ }).click()
    const chat = alice.page.getByTestId('agent-chat')
    const box = chat.getByPlaceholder('Ask Siddharth…')
    await expect(box).toBeVisible({ timeout: 15000 })
    await box.fill('What sports do you play? One sentence.')
    await box.press('Enter')

    // Bob's roster pulses while the agent works (busy animation class).
    const bobButton = bob.page.getByTestId('agent-roster').getByRole('button', { name: /Siddharth/ })
    await expect(bobButton.locator('.animate-pulse')).toBeVisible({ timeout: 30000 })
    if (SHOTS) await bob.page.screenshot({ path: `${SHOTS}/bob-sees-busy.png` })

    // The answer is grounded in the profile (football/hockey/tennis).
    await expect(chat.getByRole('log')).toContainText(/football|hockey|tennis/i, { timeout: 90000 })
    if (SHOTS) await alice.page.screenshot({ path: `${SHOTS}/alice-answer.png` })
  })
})
