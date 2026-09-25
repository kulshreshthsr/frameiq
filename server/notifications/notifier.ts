import type { AppContext } from '../context.ts'
import { query, run, type Executor } from '../db/client.ts'
import { maskMobile } from '../../shared/customer.ts'

/**
 * COMMUNICATION CHANNELS.
 *
 * The order in the database is the source of truth. A channel such as
 * WhatsApp is only a way of TELLING the customer about it: when something
 * worth a message happens (payment confirmed, production started…) a row is
 * added to the outbox, and a `Notifier` delivers it. Losing or delaying a
 * message never changes what an order is.
 *
 * Templates today: `order_confirmed`. Future ones (clarification request,
 * production update, ready-to-deliver) are added as new template names — no
 * schema change.
 */

export type NotificationTemplate = 'order_confirmed'

export interface OutboxMessage {
  id: number
  orderId: number
  channel: string
  template: string
  payload: Record<string, unknown>
  attempts: number
}

export interface SendResult {
  /** True only if the message really reached the channel's provider. */
  delivered: boolean
  note?: string
}

export interface Notifier {
  readonly channel: string
  send(message: OutboxMessage): Promise<SendResult>
}

/**
 * Development notifier: writes what WOULD be sent to the log. It does not
 * contact anyone — a real WhatsApp Business integration needs a business
 * account and approved templates, which is a deliberate later step.
 */
export class LogNotifier implements Notifier {
  readonly channel = 'whatsapp'
  private readonly log: AppContext['log']

  constructor(log: AppContext['log']) {
    this.log = log
  }

  async send(message: OutboxMessage): Promise<SendResult> {
    this.log.event('notification.logged', {
      channel: this.channel,
      template: message.template,
      orderId: message.orderId,
      mobile: typeof message.payload.mobile === 'string' ? maskMobile(message.payload.mobile) : undefined,
    })
    return { delivered: false, note: 'logged only — no message was sent' }
  }
}

/** Queues a message. Queuing the same (order, channel, template) twice is a no-op. */
export async function enqueueNotification(
  ex: Executor,
  now: Date,
  input: { orderId: number; channel: string; template: NotificationTemplate; payload: Record<string, unknown> },
): Promise<void> {
  await run(
    ex,
    `INSERT OR IGNORE INTO notification_outbox (order_id, channel, template, payload_json, status, attempts, created_at)
     VALUES (?, ?, ?, ?, 'pending', 0, ?)`,
    [input.orderId, input.channel, input.template, JSON.stringify(input.payload), now.toISOString()],
  )
}

const MAX_ATTEMPTS = 5

/** Delivers queued messages. Safe to call any time, and repeatedly. */
export async function processOutbox(ctx: Pick<AppContext, 'db' | 'notifier' | 'log' | 'now'>, limit = 20): Promise<number> {
  const rows = await query(
    ctx.db,
    `SELECT * FROM notification_outbox WHERE status = 'pending' AND channel = ? AND attempts < ? ORDER BY id LIMIT ?`,
    [ctx.notifier.channel, MAX_ATTEMPTS, limit],
  )
  let handled = 0
  for (const row of rows) {
    const message: OutboxMessage = {
      id: Number(row.id),
      orderId: Number(row.order_id),
      channel: String(row.channel),
      template: String(row.template),
      payload: JSON.parse(String(row.payload_json)) as Record<string, unknown>,
      attempts: Number(row.attempts),
    }
    try {
      const result = await ctx.notifier.send(message)
      await run(ctx.db, 'UPDATE notification_outbox SET status = ?, attempts = attempts + 1, sent_at = ?, last_error = NULL WHERE id = ?', [
        result.delivered ? 'sent' : 'logged',
        ctx.now().toISOString(),
        message.id,
      ])
    } catch (error) {
      const attempts = message.attempts + 1
      await run(ctx.db, 'UPDATE notification_outbox SET status = ?, attempts = ?, last_error = ? WHERE id = ?', [
        attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        attempts,
        String((error as Error).message).slice(0, 200),
        message.id,
      ])
      ctx.log.warn('notification.failed', { orderId: message.orderId, attempts })
    }
    handled += 1
  }
  return handled
}
