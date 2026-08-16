/**
 * dsh-stats-panel — host half.
 *
 * Collects per-call token usage from session events, persists it to
 * ~/.dsh/stats-panel/records.jsonl, and serves aggregated statistics to the
 * browser half over the /api/stats-panel route family (plain same-origin
 * fetch, loopback trust fence — mirrors the dsh-ssh pairing routes).
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the dsh-session Events declaration (session/event).
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/** Stable cordis plugin name. */
export const name = 'stats-panel'

/** Services required before the stats surfaces can mount. */
export const inject = ['webServer']

/** Where the durable usage log lives. */
const DATA_DIR = join(homedir(), '.dsh', 'stats-panel')
const RECORDS_FILE = join(DATA_DIR, 'records.jsonl')

/** One collected model call. */
export interface UsageRecord {
  /** Unix epoch milliseconds of the recorded assistant message. */
  ts: number
  /** Durable session event seq — the cross-restart dedupe key (with sessionId). */
  seq: number
  sessionId: string
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
}

/** Aggregated statistics served to the browser half. */
export interface StatsSummary {
  totalCalls: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheWriteTokens: number
  totalReasoningTokens: number
  totalTokens: number
  cacheHitRate: number
  modelStats: ModelStats[]
  channelStats: ChannelStats[]
  dailyStats: DailyStats[]
  recentRecords: UsageRecord[]
}

export interface ModelStats {
  model: string
  calls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  totalTokens: number
}

/** Per-provider (channel) aggregation. */
export interface ChannelStats {
  channel: string
  models: string[]
  calls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  totalTokens: number
}

/** One channel's account status (balance or plan quota), fetched by the balances route. */
export interface ChannelBalance {
  channel: string
  /** 'balance' = pay-as-you-go balance; 'plan' = subscription quota; 'manual' = user-entered. */
  kind: 'balance' | 'plan' | 'manual'
  displayName: string
  /** Balance amount (balance kind). */
  balance?: string
  currency?: string
  /** Plan quota buckets (plan kind): percent used 0-100 and the reset time. */
  quota?: Array<{ label: string; percent: number; resetsAt: string }>
  /** Usage buckets (usage kind): tokens consumed over recent windows (e.g. 5h / 7d / 30d). */
  usage?: Array<{ label: string; inputTokens: number; outputTokens: number }>
  /** Manual note (manual kind). */
  note?: string
  /** When the account data was fetched (balance/plan/usage kinds). */
  fetchedAt?: number
  /** Fetch failure message (balance/plan/usage kinds). */
  error?: string
}

export interface DailyStats {
  date: string
  calls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
}

/** Loopback literal check plus browser same-origin markers (mirrors dsh-ssh). */
function isLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** One JSON response. */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(payload)
}

/* -------------------------------------------------- channel account probes */

/** One configured model provider: how to find its key and endpoint. */
interface ProviderConfig {
  /** Provider id as recorded in UsageRecord.provider (or a stable label). */
  provider: string
  displayName: string
  /** Credential reference name (apiKeyEnv), resolved through ctx.credentials. */
  apiKeyEnv: string
  /** Endpoint base URL (may be undefined → catalog default). */
  baseURL?: string
}

const SETTINGS_PATH = join(homedir(), '.dsh', 'settings.yaml')

/**
 * Read provider configurations from ~/.dsh/settings.yaml (llm-pi-ai.providers
 * and llm-deepseek). Falls back to the well-known local channels when the
 * file is unreadable. YAML parsed conservatively — no external dependency.
 */
function readProviderConfigs(): ProviderConfig[] {
  const configs: ProviderConfig[] = []
  try {
    const raw = readFileSync(SETTINGS_PATH, 'utf8')
    const root = parseSimpleYaml(raw) as Record<string, unknown>
    const piAi = root['llm-pi-ai'] as Record<string, unknown> | undefined
    const providers = (piAi?.['providers'] ?? {}) as Record<string, unknown>
    for (const [name, spec] of Object.entries(providers)) {
      const typed = (spec ?? {}) as Record<string, unknown>
      configs.push({
        provider: name,
        displayName: (typeof typed['displayName'] === 'string' ? typed['displayName'] : name) as string,
        apiKeyEnv: typeof typed['apiKeyEnv'] === 'string' ? typed['apiKeyEnv'] : '',
        baseURL: typeof typed['baseURL'] === 'string' ? typed['baseURL'] : undefined,
      })
    }
  } catch {
    // Fall through to the well-known fallback list.
  }
  if (configs.length === 0) {
    configs.push(
      { provider: 'opencode-go', displayName: 'OpenCode Go 套餐', apiKeyEnv: 'OPENCODE_GO_API_KEY' },
      { provider: 'mimo', displayName: '小米 MiMo Token Plan', apiKeyEnv: 'XIAOMI_API_KEY', baseURL: 'https://token-plan-cn.xiaomimimo.com/v1' },
    )
  }
  // The official DeepSeek route always participates when configured.
  configs.push({ provider: 'deepseek-official', displayName: 'DeepSeek 官方', apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: 'https://api.deepseek.com' })
  return configs
}

/** Minimal YAML subset parser for settings.yaml provider maps (indent + key: value). */
function parseSimpleYaml(text: string): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  let current: Record<string, unknown> | undefined
  let currentKey = ''
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('-')) continue
    const indent = line.length - line.trimStart().length
    const match = /^([A-Za-z0-9_.-]+):\s*(.*)$/.exec(trimmed)
    if (match === null) continue
    const key = match[1]
    const value = match[2].trim()
    if (indent === 0) {
      current = {}
      currentKey = key
      root[key] = current
    } else if (current !== undefined && indent >= 2) {
      if (value === '') {
        current[key] = {}
      } else {
        current[key] = value
      }
    }
  }
  return root
}

/** Fetch with a bounded timeout; throws on non-OK or network failure. */
async function probeJson(url: string, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = await response.json() as unknown
  if (typeof body !== 'object' || body === null) throw new Error('invalid JSON response')
  return body as Record<string, unknown>
}

function numField(obj: Record<string, unknown>, field: string): number | undefined {
  const value = obj[field]
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

/**
 * One channel's account probe. Returns the ChannelBalance or throws.
 * Adapts the well-known provider endpoints (community-verified by cc-switch
 * plus OpenCode Go / OpenAI / Anthropic usage APIs).
 */
async function probeChannel(ctx: Context, config: ProviderConfig, resolveKey: (name: string) => Promise<string | undefined>): Promise<ChannelBalance> {
  const base = config.baseURL ?? ''
  const url = base.toLowerCase()
  const now = Date.now()

  if (url.includes('opencode.ai/zen/go') || config.provider === 'opencode-go') {
    // Plan quota: rolling / weekly / monthly (percent used + reset time).
    const key = await resolveKey(config.apiKeyEnv)
    if (key === undefined) return { channel: config.provider, kind: 'plan', displayName: config.displayName, error: `未找到 ${config.apiKeyEnv} 凭据` }
    const body = await probeJson('https://opencode.ai/zen/go/v1/usage', { authorization: `Bearer ${key}` })
    const usage = body['usage'] as Record<string, unknown> | undefined
    const quota: Array<{ label: string; percent: number; resetsAt: string }> = []
    const push = (label: string, bucket: unknown): void => {
      const typed = bucket as Record<string, unknown> | undefined
      if (typed === undefined) return
      quota.push({
        label,
        percent: numField(typed, 'percent') ?? 0,
        resetsAt: typeof typed['resetsAt'] === 'string' ? typed['resetsAt'] : '',
      })
    }
    push('滚动', usage?.['rolling'])
    push('7天', usage?.['weekly'])
    push('30天', usage?.['monthly'])
    return { channel: config.provider, kind: 'plan', displayName: config.displayName, quota, fetchedAt: now }
  }

  if (url.includes('api.deepseek.com')) {
    const key = await resolveKey(config.apiKeyEnv)
    if (key === undefined) return { channel: config.provider, kind: 'balance', displayName: config.displayName, error: `未找到 ${config.apiKeyEnv} 凭据` }
    const body = await probeJson('https://api.deepseek.com/user/balance', { authorization: `Bearer ${key}` })
    const infos = body['balance_infos'] as Array<Record<string, unknown>> | undefined
    const info = infos?.[0]
    return {
      channel: config.provider,
      kind: 'balance',
      displayName: config.displayName,
      balance: info !== undefined ? String(numField(info, 'total_balance') ?? '0') : '0',
      currency: typeof info?.['currency'] === 'string' ? info['currency'] as string : 'CNY',
      fetchedAt: now,
    }
  }

  if (url.includes('api.moonshot.cn') || url.includes('api.kimi.ai')) {
    // Kimi / Moonshot balance.
    const key = await resolveKey(config.apiKeyEnv)
    if (key === undefined) return { channel: config.provider, kind: 'balance', displayName: config.displayName, error: `未找到 ${config.apiKeyEnv} 凭据` }
    const host = url.includes('api.kimi.ai') ? 'https://api.kimi.ai' : 'https://api.moonshot.cn'
    const body = await probeJson(`${host}/v1/users/me/balance`, { authorization: `Bearer ${key}` })
    const data = body['data'] as Record<string, unknown> | undefined
    const available = numField(data ?? {}, 'available_balance')
    return {
      channel: config.provider,
      kind: 'balance',
      displayName: config.displayName,
      balance: available !== undefined ? String(available) : undefined,
      currency: typeof data?.['currency'] === 'string' ? data['currency'] as string : 'CNY',
      fetchedAt: now,
    }
  }

  if (url.includes('api.siliconflow.cn') || url.includes('api.siliconflow.com')) {
    const key = await resolveKey(config.apiKeyEnv)
    if (key === undefined) return { channel: config.provider, kind: 'balance', displayName: config.displayName, error: `未找到 ${config.apiKeyEnv} 凭据` }
    const isCn = url.includes('.cn')
    const host = isCn ? 'https://api.siliconflow.cn' : 'https://api.siliconflow.com'
    const body = await probeJson(`${host}/v1/user/info`, { authorization: `Bearer ${key}` })
    const data = body['data'] as Record<string, unknown> | undefined
    const total = numField(data ?? {}, 'totalBalance')
    return {
      channel: config.provider,
      kind: 'balance',
      displayName: config.displayName,
      balance: total !== undefined ? String(total) : undefined,
      currency: isCn ? 'CNY' : 'USD',
      fetchedAt: now,
    }
  }

  if (url.includes('api.stepfun.com') || url.includes('api.stepfun.ai')) {
    const key = await resolveKey(config.apiKeyEnv)
    if (key === undefined) return { channel: config.provider, kind: 'balance', displayName: config.displayName, error: `未找到 ${config.apiKeyEnv} 凭据` }
    const body = await probeJson('https://api.stepfun.com/v1/accounts', { authorization: `Bearer ${key}` })
    const balance = numField(body, 'balance')
    return {
      channel: config.provider,
      kind: 'balance',
      displayName: config.displayName,
      balance: balance !== undefined ? String(balance) : undefined,
      currency: 'CNY',
      fetchedAt: now,
    }
  }

  if (url.includes('openrouter.ai')) {
    const key = await resolveKey(config.apiKeyEnv)
    if (key === undefined) return { channel: config.provider, kind: 'balance', displayName: config.displayName, error: `未找到 ${config.apiKeyEnv} 凭据` }
    const body = await probeJson('https://openrouter.ai/api/v1/credits', { authorization: `Bearer ${key}` })
    const data = body['data'] as Record<string, unknown> | undefined
    const total = numField(data ?? {}, 'total_credits') ?? 0
    const used = numField(data ?? {}, 'total_usage') ?? 0
    return {
      channel: config.provider,
      kind: 'balance',
      displayName: config.displayName,
      balance: String(Math.max(0, total - used)),
      currency: 'USD',
      fetchedAt: now,
    }
  }

  if (url.includes('api.novita.ai')) {
    const key = await resolveKey(config.apiKeyEnv)
    if (key === undefined) return { channel: config.provider, kind: 'balance', displayName: config.displayName, error: `未找到 ${config.apiKeyEnv} 凭据` }
    const body = await probeJson('https://api.novita.ai/v3/user/balance', { authorization: `Bearer ${key}` })
    const available = (numField(body, 'availableBalance') ?? 0) / 10000
    return {
      channel: config.provider,
      kind: 'balance',
      displayName: config.displayName,
      balance: String(available),
      currency: 'USD',
      fetchedAt: now,
    }
  }

  if (url.includes('api.openai.com')) {
    // OpenAI usage API: tokens over the last 5h / 7d / 30d (org-level key required).
    const key = await resolveKey(config.apiKeyEnv)
    if (key === undefined) return { channel: config.provider, kind: 'plan', displayName: config.displayName, error: `未找到 ${config.apiKeyEnv} 凭据` }
    const day = 86_400_000
    const buckets: Array<{ label: string; windowMs: number }> = [
      { label: '5小时', windowMs: 5 * 3_600_000 },
      { label: '7天', windowMs: 7 * day },
      { label: '30天', windowMs: 30 * day },
    ]
    const usage: Array<{ label: string; inputTokens: number; outputTokens: number }> = []
    for (const bucket of buckets) {
      const start = Math.floor((now - bucket.windowMs) / 1000)
      const body = await probeJson(
        `https://api.openai.com/v1/usage?start_time=${start}&bucket_width=1d`,
        { authorization: `Bearer ${key}` },
      )
      const rows = body['data'] as Array<Record<string, unknown>> | undefined ?? []
      let input = 0
      let output = 0
      for (const row of rows) {
        input += numField(row, 'input_tokens') ?? 0
        output += numField(row, 'output_tokens') ?? 0
      }
      usage.push({ label: bucket.label, inputTokens: input, outputTokens: output })
    }
    return { channel: config.provider, kind: 'plan', displayName: config.displayName, usage, fetchedAt: now }
  }

  if (url.includes('api.anthropic.com')) {
    // Anthropic organization usage costs (admin key required).
    const key = await resolveKey(config.apiKeyEnv)
    if (key === undefined) return { channel: config.provider, kind: 'plan', displayName: config.displayName, error: `未找到 ${config.apiKeyEnv} 凭据` }
    const day = 86_400_000
    const buckets: Array<{ label: string; windowMs: number }> = [
      { label: '5小时', windowMs: 5 * 3_600_000 },
      { label: '7天', windowMs: 7 * day },
      { label: '30天', windowMs: 30 * day },
    ]
    const usage: Array<{ label: string; inputTokens: number; outputTokens: number }> = []
    for (const bucket of buckets) {
      const start = new Date(now - bucket.windowMs).toISOString()
      const body = await probeJson(
        `https://api.anthropic.com/v1/organizations/usage/costs?start_time=${start}&bucket_width=1h`,
        { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      )
      const rows = body['data'] as Array<Record<string, unknown>> | undefined ?? []
      let input = 0
      let output = 0
      for (const row of rows) {
        const usagePart = row['usage'] as Record<string, unknown> | undefined
        input += numField(usagePart ?? {}, 'input_tokens') ?? 0
        output += numField(usagePart ?? {}, 'output_tokens') ?? 0
      }
      usage.push({ label: bucket.label, inputTokens: input, outputTokens: output })
    }
    return { channel: config.provider, kind: 'plan', displayName: config.displayName, usage, fetchedAt: now }
  }

  // No public API: the browser half lets the user enter the status manually.
  return { channel: config.provider, kind: 'manual', displayName: config.displayName }
}

/** Load the durable usage log (best effort). Records without a seq (pre-fix data) are dropped. */
function loadRecords(): UsageRecord[] {
  try {
    if (!existsSync(RECORDS_FILE)) return []
    const lines = readFileSync(RECORDS_FILE, 'utf8').split('\n').filter(line => line.trim() !== '')
    const records: UsageRecord[] = []
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as UsageRecord
        if (typeof parsed === 'object' && parsed !== null
          && typeof parsed.ts === 'number'
          && typeof parsed.seq === 'number'
          && typeof parsed.sessionId === 'string') {
          records.push(parsed)
        }
      } catch {
        // Skip corrupt lines.
      }
    }
    return records
  } catch {
    return []
  }
}

/** Persist one record (best effort; a failed write must never take the GUI down). */
function appendRecord(record: UsageRecord): void {
  try {
    appendFileSync(RECORDS_FILE, JSON.stringify(record) + '\n')
  } catch {
    // Ignore persistence failures.
  }
}

/** Compute the summary aggregates. */
export function computeSummary(records: readonly UsageRecord[]): StatsSummary {
  let totalCalls = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheReadTokens = 0
  let totalCacheWriteTokens = 0
  let totalReasoningTokens = 0

  const modelMap = new Map<string, ModelStats>()
  const channelMap = new Map<string, ChannelStats>()
  const dailyMap = new Map<string, DailyStats>()

  for (const record of records) {
    totalCalls++
    totalInputTokens += record.inputTokens
    totalOutputTokens += record.outputTokens
    totalCacheReadTokens += record.cacheReadTokens
    totalCacheWriteTokens += record.cacheWriteTokens
    totalReasoningTokens += record.reasoningTokens
    const recordTotal = record.inputTokens + record.outputTokens + record.cacheReadTokens + record.cacheWriteTokens

    const existing = modelMap.get(record.model)
    if (existing !== undefined) {
      existing.calls++
      existing.inputTokens += record.inputTokens
      existing.outputTokens += record.outputTokens
      existing.cacheReadTokens += record.cacheReadTokens
      existing.cacheWriteTokens += record.cacheWriteTokens
      existing.reasoningTokens += record.reasoningTokens
      existing.totalTokens += recordTotal
    } else {
      modelMap.set(record.model, {
        model: record.model,
        calls: 1,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        cacheReadTokens: record.cacheReadTokens,
        cacheWriteTokens: record.cacheWriteTokens,
        reasoningTokens: record.reasoningTokens,
        totalTokens: recordTotal,
      })
    }

    const channel = record.provider === '' ? 'unknown' : record.provider
    const channelEntry = channelMap.get(channel)
    if (channelEntry !== undefined) {
      channelEntry.calls++
      channelEntry.inputTokens += record.inputTokens
      channelEntry.outputTokens += record.outputTokens
      channelEntry.cacheReadTokens += record.cacheReadTokens
      channelEntry.cacheWriteTokens += record.cacheWriteTokens
      channelEntry.reasoningTokens += record.reasoningTokens
      channelEntry.totalTokens += recordTotal
      if (!channelEntry.models.includes(record.model)) channelEntry.models.push(record.model)
    } else {
      channelMap.set(channel, {
        channel,
        models: [record.model],
        calls: 1,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        cacheReadTokens: record.cacheReadTokens,
        cacheWriteTokens: record.cacheWriteTokens,
        reasoningTokens: record.reasoningTokens,
        totalTokens: recordTotal,
      })
    }

    const date = new Date(record.ts).toISOString().slice(0, 10)
    const day = dailyMap.get(date)
    if (day !== undefined) {
      day.calls++
      day.inputTokens += record.inputTokens
      day.outputTokens += record.outputTokens
      day.cacheReadTokens += record.cacheReadTokens
      day.cacheWriteTokens += record.cacheWriteTokens
      day.totalTokens += recordTotal
    } else {
      dailyMap.set(date, {
        date,
        calls: 1,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        cacheReadTokens: record.cacheReadTokens,
        cacheWriteTokens: record.cacheWriteTokens,
        totalTokens: recordTotal,
      })
    }
  }

  const totalTokens = totalInputTokens + totalOutputTokens + totalCacheReadTokens + totalCacheWriteTokens
  const cacheHitRate = totalTokens > 0 ? ((totalCacheReadTokens + totalCacheWriteTokens) / totalTokens) * 100 : 0

  return {
    totalCalls,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheWriteTokens,
    totalReasoningTokens,
    totalTokens,
    cacheHitRate,
    modelStats: Array.from(modelMap.values()),
    channelStats: Array.from(channelMap.values()).sort((a, b) => b.totalTokens - a.totalTokens),
    dailyStats: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    recentRecords: records.slice(-100).reverse(),
  }
}

/**
 * Mount the collector and routes.
 * @param ctx - host plugin context carrying webServer.
 */
export function apply(ctx: Context): void {
  mkdirSync(DATA_DIR, { recursive: true })
  const records = loadRecords()
  // (sessionId, seq) of every event already collected — dedupes the
  // asynchronous backfill against live listeners AND against previous
  // process runs (records persisted in earlier boots carry their seq).
  const seen = new Set<string>()
  for (const record of records) {
    if (typeof record.seq === 'number' && typeof record.sessionId === 'string') {
      seen.add(`${record.sessionId}:${record.seq}`)
    }
  }

  let currentModel = 'unknown'
  let currentProvider = 'unknown'

  const collect = (
    sessionId: string,
    seq: number,
    model: string,
    provider: string,
    usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number; reasoningTokens?: number },
    ts: number,
  ): void => {
    const key = `${sessionId}:${seq}`
    if (seen.has(key)) return
    seen.add(key)
    const record: UsageRecord = {
      ts,
      seq,
      sessionId,
      model,
      provider,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      cacheReadTokens: usage.cacheReadTokens ?? 0,
      cacheWriteTokens: usage.cacheWriteTokens ?? 0,
      reasoningTokens: usage.reasoningTokens ?? 0,
    }
    records.push(record)
    appendRecord(record)
  }

  // Live collection.
  ctx.on('session/event', (session, event) => {
    if (event.type === 'request/header') {
      currentModel = event.data.header.config.model
      currentProvider = event.data.header.config.provider
    } else if (event.type === 'assistant/message' && event.data.usage !== undefined) {
      collect(session.id, event.seq, currentModel, currentProvider, event.data.usage, event.time)
    }
  })

  // Historical backfill over persisted sessions (async, best effort, never
  // blocks or fails the plugin).
  void (async () => {
    try {
      const query = ctx.get('sessionQuery')
      if (query === undefined) return
      const sessions = await query.listSessions()
      for (const entry of sessions) {
        if (entry.live) continue // live sessions are covered by the listener
        try {
          const log = await query.readSession(entry.header.id)
          let model = 'unknown'
          let provider = 'unknown'
          for (const event of log.events) {
            if (event.type === 'request/header') {
              model = event.data.header.config.model
              provider = event.data.header.config.provider
            } else if (event.type === 'assistant/message' && event.data.usage !== undefined) {
              collect(entry.header.id, event.seq, model, provider, event.data.usage, event.time)
            }
          }
        } catch {
          // One bad session must not stop the sweep.
        }
      }
    } catch {
      // No sessionQuery service (or a query failure): live-only collection.
    }
  })()

  // The /api/stats-panel route family.
  const route = {
    kind: 'exact' as const,
    path: '/api/stats-panel/summary',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (!isLoopbackRequest(req)) {
        writeJson(res, 403, { error: 'forbidden: loopback-only' })
        return
      }
      if (req.method !== 'GET' && req.method !== undefined) {
        writeJson(res, 405, { error: `method not allowed: ${req.method}` })
        return
      }
      writeJson(res, 200, computeSummary(records))
    },
  }
  ctx.webServer.register(route)

  // Channel account statuses: balance channels (DeepSeek / Kimi / SiliconFlow
  // / StepFun / OpenRouter / Novita), plan-quota channels (OpenCode Go) and
  // usage-window channels (OpenAI / Anthropic). Channels without a public API
  // (MiMo Token Plan etc.) come back as `manual` for the browser half.
  const balancesRoute = {
    kind: 'exact' as const,
    path: '/api/stats-panel/balances',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (!isLoopbackRequest(req)) {
        writeJson(res, 403, { error: 'forbidden: loopback-only' })
        return
      }
      if (req.method !== 'GET' && req.method !== undefined) {
        writeJson(res, 405, { error: `method not allowed: ${req.method}` })
        return
      }
      const credentials = ctx.get('credentials')
      const resolveKey = async (name: string): Promise<string | undefined> => {
        if (credentials === undefined || name === '') return undefined
        try {
          const resolved = await credentials.resolve(name)
          return resolved?.value
        } catch {
          return undefined
        }
      }
      const results: ChannelBalance[] = []
      const seen = new Set<string>()
      for (const config of readProviderConfigs()) {
        if (seen.has(config.provider)) continue
        seen.add(config.provider)
        try {
          results.push(await probeChannel(ctx, config, resolveKey))
        } catch (e) {
          results.push({
            channel: config.provider,
            kind: 'plan',
            displayName: config.displayName,
            error: `查询失败：${e instanceof Error ? e.message : String(e)}`,
          })
        }
      }
      writeJson(res, 200, { balances: results })
    },
  }
  ctx.webServer.register(balancesRoute)
}
