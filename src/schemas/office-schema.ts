/**
 * Office collections.
 *
 * `chat-usage` — one row per visitor per UTC day (recordId `<userId>:<date>`),
 * counting chat turns against DAILY_TURN_CAP. Only the worker writes it (via
 * RBAC-bypassing action tools inside the chat route), so a visitor can read
 * their own count but can never reset it.
 */

import type { CollectionSchema } from 'deepspace/schema'

export const chatUsageSchema: CollectionSchema = {
  name: 'chat-usage',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain' },
    { name: 'day', storage: 'text', interpretation: 'plain' },
    { name: 'turns', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    viewer: { read: 'own', create: false, update: false, delete: false },
    member: { read: 'own', create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: true },
  },
}

export const officeSchemas: CollectionSchema[] = [chatUsageSchema]
