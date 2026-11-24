import { messagingApi, validateSignature } from '@line/bot-sdk';

const { MessagingApiClient, MessagingApiBlobClient } = messagingApi;

// ─────────────────────────────────────────────────────────────────
// Dual-bot support
// ─────────────────────────────────────────────────────────────────
// The LINE free plan caps push messages at 300/month PER Official Account.
// To roughly double the free capacity for customer notifications we run TWO
// bots and alternate which one sends customer pushes, switching on the 16th of
// each month at 05:00 Asia/Bangkok (see getActiveCustomerBot). Both bots point
// their webhook at the same /api/line/webhook endpoint; the webhook figures out
// which bot an event came from by matching the request signature.
//
// Bot 2 is OPTIONAL: if LINE_CHANNEL_ACCESS_TOKEN_2 / LINE_CHANNEL_SECRET_2 are
// not set, everything transparently falls back to bot 1, so this code is safe to
// deploy before the second Official Account is provisioned.

export type BotIndex = 1 | 2;

function botCreds(botIndex: BotIndex): { token: string; secret: string } {
  if (botIndex === 2) {
    return {
      token: process.env.LINE_CHANNEL_ACCESS_TOKEN_2 || '',
      secret: process.env.LINE_CHANNEL_SECRET_2 || '',
    };
  }
  return {
    token: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    secret: process.env.LINE_CHANNEL_SECRET || '',
  };
}

/** True when the optional second bot is fully configured. */
export function isBot2Configured(): boolean {
  return !!(process.env.LINE_CHANNEL_ACCESS_TOKEN_2 && process.env.LINE_CHANNEL_SECRET_2);
}

/**
 * Which bot should send customer-facing pushes right now.
 *
 * The LINE free quota resets once a month on a per-account day that is NOT
 * necessarily the 1st (it depends when the Official Account started). So the
 * switch is anchored to that reset day via LINE_BOT_RESET_DAY (1–28, default 1):
 * bot 1 owns the first 15 days of each quota cycle, bot 2 owns the rest. This
 * gives each bot ~15 active days per its own cycle regardless of the reset date.
 *
 * The switch happens at 05:00 Asia/Bangkok (the pre-dawn lull when almost no
 * jobs complete). Bangkok is UTC+7, so shifting the instant by +2h of UTC equals
 * (Bangkok − 5h); taking the UTC calendar day of that shifted instant makes the
 * day boundary land at 05:00 Bangkok.
 */
// ─────────────────────────────────────────────────────────────────
// Dynamic Dual-bot Quota Failover Tracking
// ─────────────────────────────────────────────────────────────────
// Tracking quota exhaustion per bot in memory (auto resets at the next month / reset day)
const _botExhaustedUntil: Partial<Record<BotIndex, number>> = {};

function calculateNextQuotaResetTimestamp(): number {
  const resetDay = Math.min(Math.max(parseInt(process.env.LINE_BOT_RESET_DAY || '1', 10) || 1, 1), 28);
  const now = new Date();
  let nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), resetDay, 0, 0, 0));
  if (now.getTime() >= nextReset.getTime()) {
    nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, resetDay, 0, 0, 0));
  }
  return nextReset.getTime();
}

export function isBotExhausted(botIndex: BotIndex): boolean {
  const until = _botExhaustedUntil[botIndex];
  if (!until) return false;
  if (Date.now() >= until) {
    delete _botExhaustedUntil[botIndex];
    return false;
  }
  return true;
}

export function markBotExhausted(botIndex: BotIndex) {
  const nextReset = calculateNextQuotaResetTimestamp();
  _botExhaustedUntil[botIndex] = nextReset;
  console.warn(`[LINE Bot Quota] Bot ${botIndex} hit quota limit (429)! Switched to secondary bot until ${new Date(nextReset).toISOString()}`);
}

function isQuotaExceededError(error: unknown): boolean {
  if (!error) return false;
  const anyErr = error as any;
  if (anyErr.statusCode === 429 || anyErr.status === 429) return true;
  if (anyErr.response?.status === 429 || anyErr.originalError?.response?.status === 429) return true;
  const msg = (anyErr.message || String(error)).toLowerCase();
  return msg.includes('429') || msg.includes('quota') || msg.includes('monthly limit') || msg.includes('rate limit');
}

/**
 * Dynamic bot selection:
 * - Uses Bot 1 as primary.
 * - If Bot 1 hit 429 (quota exceeded), automatically switches to Bot 2.
 * - If Bot 2 also hit 429, falls back to whichever bot resets soonest.
 */
export function getActiveCustomerBot(): BotIndex {
  if (!isBot2Configured()) return 1;
  if (isBotExhausted(1) && !isBotExhausted(2)) return 2;
  if (isBotExhausted(2) && !isBotExhausted(1)) return 1;
  return 1;
}

// Lazy, per-bot client cache. Instantiated at runtime so env vars are read on
// first use (important for serverless cold-start / HMR).
const _clients: Partial<Record<BotIndex, InstanceType<typeof MessagingApiClient>>> = {};
const _blobClients: Partial<Record<BotIndex, InstanceType<typeof MessagingApiBlobClient>>> = {};

export function getLineClient(botIndex: BotIndex = 1) {
  const { token } = botCreds(botIndex);
  if (!token) {
    console.error(`LINE_CHANNEL_ACCESS_TOKEN for bot ${botIndex} is not set`);
    throw new Error(`LINE_CHANNEL_ACCESS_TOKEN for bot ${botIndex} is not set`);
  }
  if (!_clients[botIndex]) {
    _clients[botIndex] = new MessagingApiClient({ channelAccessToken: token });
  }
  return _clients[botIndex]!;
}

export function getLineBlobClient(botIndex: BotIndex = 1) {
  const { token } = botCreds(botIndex);
  if (!token) {
    console.error(`LINE_CHANNEL_ACCESS_TOKEN for bot ${botIndex} is not set`);
    throw new Error(`LINE_CHANNEL_ACCESS_TOKEN for bot ${botIndex} is not set`);
  }
  if (!_blobClients[botIndex]) {
    _blobClients[botIndex] = new MessagingApiBlobClient({ channelAccessToken: token });
  }
  return _blobClients[botIndex]!;
}

/**
 * Determines which bot a webhook request belongs to by matching its signature
 * against each configured channel secret. Returns null if no bot matches
 * (invalid signature). Replaces the old single-secret verifyLineSignature.
 */
export function resolveWebhookBot(body: string, signature: string): BotIndex | null {
  const b1 = botCreds(1);
  if (b1.secret && validateSignature(body, b1.secret, signature)) return 1;
  if (isBot2Configured()) {
    const b2 = botCreds(2);
    if (b2.secret && validateSignature(body, b2.secret, signature)) return 2;
  }
  return null;
}

/**
 * Validates the signature of an incoming LINE webhook request (bot 1 only).
 * Retained for backward compatibility; new code should use resolveWebhookBot.
 */
export function verifyLineSignature(body: string, signature: string): boolean {
  return resolveWebhookBot(body, signature) !== null;
}

/**
 * Fetches binary content (audio, image, etc.) from LINE servers for a given bot.
 */
export async function getMessageContent(messageId: string, botIndex: BotIndex = 1): Promise<Buffer> {
  const client = getLineBlobClient(botIndex);
  const stream = await client.getMessageContent(messageId) as any;

  return new Promise((resolve, reject) => {
    const chunks: any[] = [];
    stream.on('data', (chunk: any) => chunks.push(chunk));
    stream.on('error', (err: any) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Sends a reply message to a LINE user via the given bot (default bot 1).
 * Replies must go back through the same bot that received the message.
 */
export async function replyToUser(
  replyToken: string,
  messageOrText: string | Record<string, unknown> | Array<Record<string, unknown>>,
  botIndex: BotIndex = 1
) {
  try {
    const client = getLineClient(botIndex);
    const messages: any = typeof messageOrText === 'string'
      ? [{ type: 'text', text: messageOrText }]
      : Array.isArray(messageOrText)
        ? messageOrText
        : [messageOrText];
    await client.replyMessage({
      replyToken,
      messages
    });
    return { success: true };
  } catch (error) {
    console.error('Error sending LINE reply:', error);
    return { success: false, error };
  }
}

const LINE_TRUNCATION_SUFFIX = '\n...(ข้อความยาวเกินขีดจำกัด LINE กรุณาดูรายละเอียดเพิ่มเติมจากลิงก์)';

/**
 * Splits a long text message into up to `maxChunks` LINE text message objects,
 * each at most `maxLen` characters, preferring newline boundaries.
 */
export function splitLineTextMessages(
  text: string,
  maxLen = 4800,
  maxChunks = 5
): Array<{ type: 'text'; text: string }> {
  if (text.length <= maxLen) {
    return [{ type: 'text', text }];
  }

  const chunks: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (current) {
      chunks.push(current);
      current = '';
    }
  };

  for (const line of text.split('\n')) {
    if (line.length > maxLen) {
      pushCurrent();
      for (let i = 0; i < line.length; i += maxLen) {
        chunks.push(line.slice(i, i + maxLen));
      }
      continue;
    }

    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= maxLen) {
      current = candidate;
    } else {
      pushCurrent();
      current = line;
    }
  }
  pushCurrent();

  if (chunks.length > maxChunks) {
    const capped = chunks.slice(0, maxChunks);
    const lastIdx = capped.length - 1;
    const maxPrefixLen = Math.max(0, maxLen - LINE_TRUNCATION_SUFFIX.length);
    capped[lastIdx] = `${capped[lastIdx].slice(0, maxPrefixLen)}${LINE_TRUNCATION_SUFFIX}`;
    return capped.map((chunk) => ({ type: 'text', text: chunk }));
  }

  return chunks.map((chunk) => ({ type: 'text', text: chunk }));
}

/**
 * Sends a push message to a LINE user via the given bot (default bot 1).
 */
export async function pushToUser(to: string, text: string, botIndex: BotIndex = 1) {
  try {
    const client = getLineClient(botIndex);
    await client.pushMessage({
      to,
      messages: splitLineTextMessages(text)
    });
    return { success: true };
  } catch (error) {
    if (isQuotaExceededError(error)) {
      markBotExhausted(botIndex);
    }
    console.error(`Error sending LINE push (Bot ${botIndex}):`, error);
    return { success: false, error, is429: isQuotaExceededError(error) };
  }
}

/**
 * Sends a push to a customer using the active bot with immediate retry / failover:
 * 1. Checks which bot is currently active (Bot 1 by default, or Bot 2 if Bot 1 is exhausted).
 * 2. Attempts sending to that bot's registered ID.
 * 3. If it fails (either missing ID, error 429, or network failure) and a second ID exists:
 *    Immediately retries sending via the OTHER bot to ensure zero message loss!
 */
export async function pushToCustomerActive(
  cust: { Line_User_ID?: string | null; Line_User_ID_2?: string | null },
  text: string
) {
  const active = getActiveCustomerBot();
  const other: BotIndex = active === 2 ? 1 : 2;
  const activeId = active === 2 ? cust.Line_User_ID_2 : cust.Line_User_ID;
  const otherId = active === 2 ? cust.Line_User_ID : cust.Line_User_ID_2;

  // 1) Try sending with the active bot
  if (activeId) {
    const res = await pushToUser(activeId, text, active);
    if (res.success) return res;
    console.warn(`[LINE Failover] Failed sending via Bot ${active}, retrying via Bot ${other}...`);
  }

  // 2) Immediate Auto-Retry via the other bot
  if (otherId && isBot2Configured()) {
    const res = await pushToUser(otherId, text, other);
    if (res.success) {
      console.log(`[LINE Failover] Successfully sent via failover Bot ${other}!`);
      return res;
    }
  }

  return { success: false, error: 'no LINE id could be reached (missing id or all bots failed)' };
}

/**
 * A LINE recipient row from Customer_Line_Contacts — a single team member or a
 * team group chat, each bound through a specific Official Account (bot).
 */
export type LineContact = {
  Line_Target_ID: string;
  Bot_Index?: number | null;
  Target_Type?: string | null;
  Active?: boolean | null;
};

/**
 * Pushes the same text to every active contact of a customer (LINE groups and
 * individual members alike), each through the bot it was linked with.
 *
 * `skipIds` lets the caller pass ids it has already pushed to (e.g. the legacy
 * Line_User_ID) so a member who is ALSO listed here isn't messaged twice and
 * the limited quota isn't wasted. Returns how many pushes were sent.
 */
export async function pushToContacts(
  contacts: LineContact[],
  text: string,
  skipIds: Array<string | null | undefined> = []
): Promise<{ sent: number }> {
  const skip = new Set(skipIds.filter(Boolean) as string[]);
  const seen = new Set<string>();
  let sent = 0;
  for (const c of contacts) {
    const id = c.Line_Target_ID;
    if (!id || c.Active === false) continue;
    if (skip.has(id) || seen.has(id)) continue;   // de-dupe against legacy + within list
    seen.add(id);
    const bot: BotIndex = c.Bot_Index === 2 ? 2 : 1;
    const res = await pushToUser(id, text, bot);
    if (res.success) sent++;
  }
  return { sent };
}

/**
 * Sends an IP approval template message with buttons to a LINE user.
 * Admin-facing feature — always uses bot 1.
 */
export async function pushIPApprovalToUser(to: string, username: string, ip: string) {
  try {
    const client = getLineClient(1);
    await client.pushMessage({
      to,
      messages: [
        {
          type: "template" as any,
          altText: `🛡️ คำขออนุมัติ IP ของคุณ ${username}`,
          template: {
            type: "buttons",
            title: "🛡️ อนุมัติ IP ใหม่",
            text: `ผู้ใช้: ${username}\nIP: ${ip}\n\nกรุณาเลือกดำเนินการ:`,
            actions: [
              {
                type: "message",
                label: "อนุมัติ IP นี้",
                text: `อนุมัติ IP ${username} ${ip}`
              },
              {
                type: "message",
                label: "บล็อก IP นี้",
                text: `บล็อก IP ${username} ${ip}`
              }
            ]
          } as any
        }
      ]
    });
    return { success: true };
  } catch (error) {
    console.error('Error sending LINE IP approval push:', error);
    return { success: false, error };
  }
}
