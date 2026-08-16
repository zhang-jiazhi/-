/**
 * Stats panel settings section for the dsh web GUI.
 *
 * One full-page section in the settings sidebar (`settings.section`). On
 * mount it fetches `/api/stats-panel/summary` (host half) and renders the
 * usage page: overview cards, daily token chart, model share pie, model
 * table, recent records, and a cost estimate driven by an editable per-model
 * price table (persisted in localStorage; defaults are DeepSeek's official
 * CNY peak-hour prices effective 2026-08-16, source:
 * https://api-docs.deepseek.com/zh-cn/quick_start/pricing).
 *
 * All rendering is contained: any fetch/render failure renders an inline
 * error row instead of throwing out of the section.
 */

import React, { useState, useEffect, useCallback } from 'react'

/* ------------------------------------------------------------------ types */

interface UsageRecord {
  ts: number
  sessionId: string
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
}

interface ModelStats {
  model: string
  calls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  totalTokens: number
}

interface DailyStats {
  date: string
  calls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
}

interface ChannelStats {
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

interface ChannelBalance {
  channel: string
  kind: 'balance' | 'plan' | 'manual'
  displayName: string
  balance?: string
  currency?: string
  quota?: Array<{ label: string; percent: number; resetsAt: string }>
  usage?: Array<{ label: string; inputTokens: number; outputTokens: number }>
  note?: string
  fetchedAt?: number
  error?: string
}

interface StatsSummary {
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

/** Per-model price, CNY per 1M tokens. */
interface ModelPrice {
  inputPerM: number
  outputPerM: number
  cacheReadPerM: number
  cacheWritePerM: number
}

type PriceTable = Record<string, ModelPrice>

/* ------------------------------------------------------------- constants */

const SUMMARY_URL = '/api/stats-panel/summary'
const BALANCES_URL = '/api/stats-panel/balances'

/** localStorage key for manually entered plan quotas (v1). */
const MANUAL_QUOTA_KEY = 'dsh-stats-panel:manual-quota:v1'

/** provider id → friendly channel name. */
const CHANNEL_NAMES: Record<string, string> = {
  'deepseek-official': 'DeepSeek 官方',
  'opencode-go': 'OpenCode Go 套餐',
  mimo: '小米 MiMo Token Plan',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  moonshot: 'Kimi 月之暗面',
  kimi: 'Kimi 月之暗面',
  siliconflow: '硅基流动',
  stepfun: '阶跃星辰 StepFun',
  openrouter: 'OpenRouter',
  novita: 'Novita AI',
  unknown: '未知渠道',
}

/** Channels billed by subscription quota (套餐) — token cost is covered by the plan. */
const PLAN_CHANNELS = new Set(['opencode-go', 'mimo', 'openai', 'anthropic'])

function channelName(channel: string): string {
  return CHANNEL_NAMES[channel] ?? channel
}

/** localStorage key for the editable price table (v2 = CNY). */
const PRICES_KEY = 'dsh-stats-panel:prices:v2'

/**
 * DeepSeek official CNY prices, peak hours, effective 2026-08-16
 * (source: https://api-docs.deepseek.com/zh-cn/quick_start/pricing).
 * Off-peak prices are half of these. Cache write is free on DeepSeek.
 */
const DEFAULT_PRICES: PriceTable = {
  'deepseek-v4-flash': { inputPerM: 3.0, outputPerM: 9.0, cacheReadPerM: 0.1, cacheWritePerM: 0 },
  'deepseek-v4-pro': { inputPerM: 9.0, outputPerM: 27.0, cacheReadPerM: 0.3, cacheWritePerM: 0 },
}

const CHART_COLORS = ['#4a9eff', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8', '#20c997', '#ff922b', '#868e96']

/* ---------------------------------------------------------------- helpers */

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return String(tokens)
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function formatCny(cny: number): string {
  if (cny === 0) return '¥0.00'
  if (cny < 0.01) return `¥${cny.toFixed(4)}`
  if (cny < 1) return `¥${cny.toFixed(3)}`
  return `¥${cny.toFixed(2)}`
}

/** Cost of one model's usage under a price entry, CNY. */
function modelCost(stat: ModelStats, price: ModelPrice | undefined): number {
  if (price === undefined) return 0
  return (
    stat.inputTokens / 1_000_000 * price.inputPerM
    + stat.outputTokens / 1_000_000 * price.outputPerM
    + stat.cacheReadTokens / 1_000_000 * price.cacheReadPerM
    + stat.cacheWriteTokens / 1_000_000 * price.cacheWritePerM
  )
}

function loadPrices(): PriceTable {
  try {
    const raw = window.localStorage.getItem(PRICES_KEY)
    if (raw !== null) {
      const parsed = JSON.parse(raw) as PriceTable
      if (typeof parsed === 'object' && parsed !== null) return parsed
    }
  } catch {
    // Fall through to defaults.
  }
  return { ...DEFAULT_PRICES }
}

function savePrices(prices: PriceTable): void {
  try {
    window.localStorage.setItem(PRICES_KEY, JSON.stringify(prices))
  } catch {
    // Ignore persistence failures.
  }
}

/* ------------------------------------------------------------ main section */

/**
 * The settings-sidebar section: full-page stats view. Loads on mount.
 * @param props - section owner props (the shell supplies `close`).
 */
export function StatsPanelSection(_props: { close: () => void }): React.ReactElement {
  const [stats, setStats] = useState<StatsSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(SUMMARY_URL)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = await response.json() as StatsSummary
      setStats(body)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && stats === null) {
    return <div style={styles.page}><p style={styles.muted}>加载统计中…</p></div>
  }
  if (error !== null) {
    return (
      <div style={styles.page}>
        <div style={styles.pageHead}>
          <span style={styles.pageTitle}>Token 使用统计</span>
          <span style={styles.pageSub}>模型用量 · Token 消耗 · 缓存命中率 · 费用估算（人民币）</span>
        </div>
        <p style={styles.error} role="status">
          无法加载统计数据：{error}。请确认 dsh 服务运行正常后重试。
          <button type="button" style={styles.retry} onClick={() => { void load() }}>重试</button>
        </p>
      </div>
    )
  }
  return (
    <div style={styles.page}>
      <div style={styles.pageHead}>
        <span style={styles.pageTitle}>Token 使用统计</span>
        <span style={styles.pageSub}>模型用量 · Token 消耗 · 缓存命中率 · 费用估算（人民币）</span>
      </div>
      {stats !== null ? <StatsPage stats={stats} /> : null}
    </div>
  )
}

/* ------------------------------------------------------------- stats page */

function StatsPage({ stats }: { stats: StatsSummary }): React.ReactElement {
  const [prices, setPrices] = useState<PriceTable>(() => loadPrices())
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<PriceTable>(() => loadPrices())

  const applyDraft = (): void => {
    setPrices(draft)
    savePrices(draft)
    setEditing(false)
  }

  const totalCost = stats.modelStats.reduce((sum, m) => sum + modelCost(m, prices[m.model]), 0)
  const unconfigured = stats.modelStats.filter(m => prices[m.model] === undefined)

  return (
    <div>
      <div style={styles.grid}>
        <OverviewCard label="总调用次数" value={String(stats.totalCalls)} />
        <OverviewCard label="总 Token 消耗" value={formatTokens(stats.totalTokens)} sub="输入 + 输出 + 缓存" />
        <OverviewCard label="输入 Token" value={formatTokens(stats.totalInputTokens)} sub={pct(stats.totalInputTokens, stats.totalTokens)} />
        <OverviewCard label="输出 Token" value={formatTokens(stats.totalOutputTokens)} sub={pct(stats.totalOutputTokens, stats.totalTokens)} />
        <OverviewCard label="缓存命中率" value={`${stats.cacheHitRate.toFixed(1)}%`} sub={`读 ${formatTokens(stats.totalCacheReadTokens)} / 写 ${formatTokens(stats.totalCacheWriteTokens)}`} />
        <OverviewCard label="估算费用" value={formatCny(totalCost)} sub={unconfigured.length > 0 ? `${unconfigured.length} 个模型价格待配置` : '按价格表计算'} />
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHead}>
          <span style={styles.sectionTitle}>模型价格（人民币，元 / 1M tokens）</span>
          {editing
            ? (
              <span>
                <button type="button" style={styles.smallButton} onClick={() => { setDraft(prices); setEditing(false) }}>取消</button>
                <button type="button" style={styles.smallButtonPrimary} onClick={applyDraft}>保存</button>
              </span>
            )
            : <button type="button" style={styles.smallButton} onClick={() => { setDraft(prices); setEditing(true) }}>编辑</button>}
        </div>
        <p style={styles.hint}>
          默认价格为 DeepSeek 官方人民币定价（高峰时段，2026-08-16 生效；空闲时段为高峰价一半，来源：
          <a href="https://api-docs.deepseek.com/zh-cn/quick_start/pricing" target="_blank" rel="noreferrer" style={styles.link}>api-docs.deepseek.com</a>）。
          其他模型默认 ¥0，可按实际渠道价格自行填写；未配置价格的模型不计入费用。\n          套餐渠道（OpenCode Go / MiMo / OpenAI / Anthropic）的模型建议将价格设为 0，避免与套餐额度重复计费。
        </p>
        {editing
          ? <PriceEditor prices={draft} onChange={setDraft} models={stats.modelStats.map(m => m.model)} />
          : <PriceTable rows={stats.modelStats.map(m => m.model)} prices={prices} />}
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHead}>
          <span style={styles.sectionTitle}>渠道余量 / 余额</span>
        </div>
        <ChannelBalances />
      </div>

      {stats.channelStats.length > 0 ? (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>渠道统计</div>
          <ChannelTable data={stats.channelStats} />
        </div>
      ) : null}

      {stats.dailyStats.length > 0 ? (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>每日 Token 消耗</div>
          <DailyChart data={stats.dailyStats} />
        </div>
      ) : null}

      {stats.modelStats.length > 0 ? (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>模型使用分布</div>
          <div style={styles.pieRow}>
            <ModelPie data={stats.modelStats} />
            <ModelTable data={stats.modelStats} prices={prices} />
          </div>
        </div>
      ) : null}

      {stats.recentRecords.length > 0 ? (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>最近调用记录</div>
          <RecordsTable data={stats.recentRecords} prices={prices} />
        </div>
      ) : null}
    </div>
  )
}

function pct(part: number, total: number): string {
  if (total <= 0) return ''
  return `${((part / total) * 100).toFixed(1)}%`
}

/* ------------------------------------------------------- channel balances */

/** Format a millisecond span as "X天 X小时 X分钟" (omitting empty units). */
function formatDuration(ms: number): string {
  if (ms <= 0) return '已过期'
  const totalMinutes = Math.floor(ms / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days}天`)
  if (hours > 0) parts.push(`${hours}小时`)
  if (minutes > 0 && days === 0) parts.push(`${minutes}分钟`)
  return parts.length > 0 ? parts.join(' ') : `${totalMinutes}分钟`
}

/** Manual quota storage (mimo Token Plan and other plan channels without a public API). */
function loadManualQuota(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(MANUAL_QUOTA_KEY)
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Record<string, string>
      if (typeof parsed === 'object' && parsed !== null) return parsed
    }
  } catch {
    // Fall through.
  }
  return {}
}

/**
 * Channel account statuses: auto-fetched balances/quotas plus manual entries
 * for channels without a public API. Renders inline status rows.
 */
function ChannelBalances(): React.ReactElement {
  const [balances, setBalances] = useState<ChannelBalance[]>([])
  const [loading, setLoading] = useState(false)
  const [manual, setManual] = useState<Record<string, string>>(() => loadManualQuota())
  const [editing, setEditing] = useState<string | null>(null)
  const [draftNote, setDraftNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(BALANCES_URL)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = await response.json() as { balances: ChannelBalance[] }
      setBalances(body.balances ?? [])
    } catch (e) {
      setBalances([{ channel: 'error', kind: 'manual', displayName: '查询失败', error: e instanceof Error ? e.message : String(e) }])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const saveManual = (channel: string): void => {
    const next = { ...manual, [channel]: draftNote.trim() }
    setManual(next)
    try {
      window.localStorage.setItem(MANUAL_QUOTA_KEY, JSON.stringify(next))
    } catch {
      // Ignore.
    }
    setEditing(null)
  }

  // Merge auto results with manual entries (channels without a public API:
  // those the host reported as `manual`, plus any previously entered ones).
  const rows: ChannelBalance[] = [...balances]
  const manualNames = new Set<string>(balances.filter(b => b.kind === 'manual').map(b => b.channel))
  for (const channel of Object.keys(manual)) manualNames.add(channel)
  for (const channel of manualNames) {
    if (balances.some(b => b.channel === channel)) continue
    rows.push({ channel, kind: 'manual', displayName: channelName(channel), note: manual[channel] })
  }
  if (rows.length === 0 && !loading) {
    rows.push({ channel: 'none', kind: 'manual', displayName: '未发现渠道', note: '请先配置模型渠道（设置 → 模型）' })
  }

  return (
    <div>
      <div style={styles.balanceActions}>
        {loading ? <span style={styles.mutedInline}>查询中…</span> : null}
        <button type="button" style={styles.smallButton} onClick={() => { void load() }} disabled={loading}>刷新</button>
      </div>
      <div style={styles.balanceGrid}>
        {rows.map(row => (
          <div key={row.channel} style={styles.balanceCard}>
            <div style={styles.balanceName}>{row.displayName}</div>
            {row.error !== undefined ? (
              <div style={styles.balanceError}>{row.error}</div>
            ) : row.kind === 'balance' ? (
              <div style={styles.balanceValue}>
                {row.currency === 'CNY' ? '¥' : row.currency === 'USD' ? '$' : ''}{row.balance ?? '—'}
                {row.fetchedAt !== undefined ? <span style={styles.mutedInline}> · {new Date(row.fetchedAt).toLocaleTimeString()}</span> : null}
              </div>
            ) : row.kind === 'plan' && row.quota !== undefined ? (
              <div>
                {row.quota.map(q => {
                  const remainingMs = q.resetsAt !== '' ? new Date(q.resetsAt).getTime() - Date.now() : 0
                  return (
                    <div key={q.label} style={styles.quotaRow} title={`重置于 ${q.resetsAt}`}>
                      <span style={styles.quotaLabel}>{q.label}</span>
                      <span style={styles.quotaBar}>
                        <span style={{ ...styles.quotaFill, width: `${Math.min(100, Math.max(0, q.percent))}%` }} />
                      </span>
                      <span style={styles.quotaText}>
                        已用 {q.percent}% · 剩余 {q.resetsAt !== '' ? formatDuration(remainingMs) : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : row.kind === 'plan' && row.usage !== undefined ? (
              <div>
                {row.usage.map(u => (
                  <div key={u.label} style={styles.usageRow}>
                    <span style={styles.quotaLabel}>{u.label}</span>
                    <span style={styles.usageText}>
                      输入 {formatTokens(u.inputTokens)} · 输出 {formatTokens(u.outputTokens)} · 合计 {formatTokens(u.inputTokens + u.outputTokens)}
                    </span>
                  </div>
                ))}
              </div>
            ) : row.kind === 'manual' ? (
              <div>
                {editing === row.channel
                  ? (
                    <span style={styles.manualEdit}>
                      <input
                        style={styles.input}
                        type="text"
                        placeholder="如：剩余 18天 3小时 或 4100M Credits"
                        value={draftNote}
                        onChange={e => { setDraftNote(e.target.value) }}
                      />
                      <button type="button" style={styles.smallButtonPrimary} onClick={() => { saveManual(row.channel) }}>保存</button>
                      <button type="button" style={styles.smallButton} onClick={() => { setEditing(null) }}>取消</button>
                    </span>
                  )
                  : (
                    <span>
                      <span style={styles.balanceValue}>{row.note !== undefined ? row.note : '待配置'}</span>
                      <button type="button" style={styles.smallButton} onClick={() => { setDraftNote(row.note ?? ''); setEditing(row.channel) }}>
                        {row.note !== undefined ? '修改' : '配置'}
                      </button>
                    </span>
                  )}
                <div style={styles.mutedInline}>无公开查询 API，请到平台控制台查看后填写</div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Per-channel token usage table. */
function ChannelTable({ data }: { data: ChannelStats[] }): React.ReactElement {
  const sorted = [...data].sort((a, b) => b.totalTokens - a.totalTokens)
  return (
    <div style={styles.tableScroll}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>渠道</th>
            <th style={styles.th}>调用</th>
            <th style={styles.th}>输入</th>
            <th style={styles.th}>输出</th>
            <th style={styles.th}>缓存</th>
            <th style={styles.th}>总 Token</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(c => (
            <tr key={c.channel}>
              <td style={styles.td}>
                <div style={styles.channelCellName}>{channelName(c.channel)}</div>
                <div style={styles.channelCellModels} title={c.models.join(', ')}>{c.models.join(', ')}</div>
              </td>
              <td style={styles.td}>{c.calls}</td>
              <td style={styles.td}>{formatTokens(c.inputTokens)}</td>
              <td style={styles.td}>{formatTokens(c.outputTokens)}</td>
              <td style={styles.td}>{formatTokens(c.cacheReadTokens + c.cacheWriteTokens)}</td>
              <td style={styles.td}>{formatTokens(c.totalTokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* -------------------------------------------------------------- overview */

function OverviewCard({ label, value, sub }: { label: string; value: string; sub?: string }): React.ReactElement {
  return (
    <div style={styles.overviewCard}>
      <div style={styles.overviewLabel}>{label}</div>
      <div style={styles.overviewValue}>{value}</div>
      {sub !== undefined && sub !== '' ? <div style={styles.overviewSub}>{sub}</div> : null}
    </div>
  )
}

/* --------------------------------------------------------------- charts */

function DailyChart({ data }: { data: DailyStats[] }): React.ReactElement {
  const days = data.slice(-14)
  const max = Math.max(...days.map(d => d.totalTokens), 1)
  return (
    <div style={styles.barRow}>
      {days.map((day, i) => (
        <div key={day.date} style={styles.barCol} title={`${day.date}: ${formatTokens(day.totalTokens)} tokens`}>
          <div style={{ ...styles.bar, height: `${Math.max(4, (day.totalTokens / max) * 140)}px` }} />
          <div style={styles.barLabel}>{formatDate(day.date)}</div>
        </div>
      ))}
    </div>
  )
}

function ModelPie({ data }: { data: ModelStats[] }): React.ReactElement {
  const total = data.reduce((sum, m) => sum + m.totalTokens, 0)
  const top = [...data].sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 8)
  let angle = -90
  const arcs: React.ReactElement[] = []
  for (let i = 0; i < top.length; i++) {
    const pct = total > 0 ? top[i].totalTokens / total : 0
    const start = angle
    const end = angle + pct * 360
    const startRad = (start * Math.PI) / 180
    const endRad = (end * Math.PI) / 180
    const x1 = 16 + 16 * Math.cos(startRad)
    const y1 = 16 + 16 * Math.sin(startRad)
    const x2 = 16 + 16 * Math.cos(endRad)
    const y2 = 16 + 16 * Math.sin(endRad)
    const large = pct > 0.5 ? 1 : 0
    arcs.push(
      <path
        key={i}
        d={`M16 16 L${x1.toFixed(3)} ${y1.toFixed(3)} A16 16 0 ${large} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`}
        fill={CHART_COLORS[i % CHART_COLORS.length]}
        stroke="#1a1a1a"
        strokeWidth={0.5}
      />,
    )
    angle = end
  }
  return (
    <div style={styles.pieBlock}>
      <svg viewBox="0 0 32 32" width={150} height={150}>{arcs}</svg>
      <div style={styles.legend}>
        {top.map((m, i) => (
          <div key={m.model} style={styles.legendRow}>
            <span style={{ ...styles.legendDot, background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span style={styles.legendModel} title={m.model}>{m.model}</span>
            <span style={styles.legendPct}>{total > 0 ? `${((m.totalTokens / total) * 100).toFixed(1)}%` : '0%'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- tables */

function ModelTable({ data, prices }: { data: ModelStats[]; prices: PriceTable }): React.ReactElement {
  const sorted = [...data].sort((a, b) => b.totalTokens - a.totalTokens)
  return (
    <div style={styles.tableScroll}>
      <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>模型</th>
          <th style={styles.th}>调用</th>
          <th style={styles.th}>输入</th>
          <th style={styles.th}>输出</th>
          <th style={styles.th}>缓存读</th>
          <th style={styles.th}>缓存写</th>
          <th style={styles.th}>总 Token</th>
          <th style={styles.th}>费用</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(m => (
          <tr key={m.model}>
            <td style={styles.td} title={m.model}>{m.model}</td>
            <td style={styles.td}>{m.calls}</td>
            <td style={styles.td}>{formatTokens(m.inputTokens)}</td>
            <td style={styles.td}>{formatTokens(m.outputTokens)}</td>
            <td style={styles.td}>{formatTokens(m.cacheReadTokens)}</td>
            <td style={styles.td}>{formatTokens(m.cacheWriteTokens)}</td>
            <td style={styles.td}>{formatTokens(m.totalTokens)}</td>
            <td style={styles.td}>{formatCny(modelCost(m, prices[m.model]))}</td>
          </tr>
        ))}
      </tbody>
      </table>
    </div>
  )
}

function RecordsTable({ data, prices }: { data: UsageRecord[]; prices: PriceTable }): React.ReactElement {
  return (
    <div style={styles.tableScroll}>
      <div style={{ maxHeight: 320, overflow: 'auto' }}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>时间</th>
            <th style={styles.th}>模型</th>
            <th style={styles.th}>输入</th>
            <th style={styles.th}>输出</th>
            <th style={styles.th}>缓存</th>
            <th style={styles.th}>总 Token</th>
            <th style={styles.th}>费用</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 100).map((r, i) => (
            <tr key={`${r.sessionId}-${i}`}>
              <td style={styles.td}>{new Date(r.ts).toLocaleString()}</td>
              <td style={styles.td} title={r.model}>{r.model}</td>
              <td style={styles.td}>{formatTokens(r.inputTokens)}</td>
              <td style={styles.td}>{formatTokens(r.outputTokens)}</td>
              <td style={styles.td}>{formatTokens(r.cacheReadTokens + r.cacheWriteTokens)}</td>
              <td style={styles.td}>{formatTokens(r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens)}</td>
              <td style={styles.td}>
                {formatCny(modelCost(
                  {
                    model: r.model,
                    calls: 1,
                    inputTokens: r.inputTokens,
                    outputTokens: r.outputTokens,
                    cacheReadTokens: r.cacheReadTokens,
                    cacheWriteTokens: r.cacheWriteTokens,
                    reasoningTokens: r.reasoningTokens,
                    totalTokens: r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens,
                  },
                  prices[r.model],
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- price table */

function PriceTable({ rows, prices }: { rows: string[]; prices: PriceTable }): React.ReactElement {
  if (rows.length === 0) return <p style={styles.muted}>暂无模型数据</p>
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>模型</th>
          <th style={styles.th}>输入 元/1M</th>
          <th style={styles.th}>输出 元/1M</th>
          <th style={styles.th}>缓存命中 元/1M</th>
          <th style={styles.th}>缓存写入 元/1M</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(model => {
          const p = prices[model]
          return (
            <tr key={model}>
              <td style={styles.td} title={model}>{model}</td>
              {p === undefined
                ? <td style={styles.td} colSpan={4}><span style={styles.pending}>价格待配置（不计入费用）</span></td>
                : (
                  <>
                    <td style={styles.td}>{p.inputPerM}</td>
                    <td style={styles.td}>{p.outputPerM}</td>
                    <td style={styles.td}>{p.cacheReadPerM}</td>
                    <td style={styles.td}>{p.cacheWritePerM}</td>
                  </>
                )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function PriceEditor({ prices, onChange, models }: {
  prices: PriceTable
  onChange: (p: PriceTable) => void
  models: string[]
}): React.ReactElement {
  const set = (model: string, field: keyof ModelPrice, value: string): void => {
    const num = Number(value)
    const next: PriceTable = { ...prices }
    const current: ModelPrice = next[model] ?? { inputPerM: 0, outputPerM: 0, cacheReadPerM: 0, cacheWritePerM: 0 }
    next[model] = { ...current, [field]: Number.isFinite(num) ? num : 0 }
    onChange(next)
  }
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>模型</th>
          <th style={styles.th}>输入 元/1M</th>
          <th style={styles.th}>输出 元/1M</th>
          <th style={styles.th}>缓存命中 元/1M</th>
          <th style={styles.th}>缓存写入 元/1M</th>
        </tr>
      </thead>
      <tbody>
        {models.map(model => {
          const p = prices[model] ?? { inputPerM: 0, outputPerM: 0, cacheReadPerM: 0, cacheWritePerM: 0 }
          return (
            <tr key={model}>
              <td style={styles.td} title={model}>{model}</td>
              <td style={styles.td}><input style={styles.input} type="number" step="0.001" min="0" value={p.inputPerM} onChange={e => set(model, 'inputPerM', e.target.value)} /></td>
              <td style={styles.td}><input style={styles.input} type="number" step="0.001" min="0" value={p.outputPerM} onChange={e => set(model, 'outputPerM', e.target.value)} /></td>
              <td style={styles.td}><input style={styles.input} type="number" step="0.001" min="0" value={p.cacheReadPerM} onChange={e => set(model, 'cacheReadPerM', e.target.value)} /></td>
              <td style={styles.td}><input style={styles.input} type="number" step="0.001" min="0" value={p.cacheWritePerM} onChange={e => set(model, 'cacheWritePerM', e.target.value)} /></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/* ----------------------------------------------------------------- styles */

const styles: Record<string, React.CSSProperties> = {
  page: { padding: '4px 0 16px' },
  pageHead: { marginBottom: 14 },
  pageTitle: { fontSize: 18, fontWeight: 700, color: 'var(--ds-text, #fff)' },
  pageSub: { display: 'block', fontSize: 12, color: 'var(--ds-text-secondary, #999)', marginTop: 4 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, margin: '12px 0' },
  overviewCard: {
    background: 'var(--ds-card-bg, #1a1a1a)',
    border: '1px solid var(--ds-border, #333)',
    borderRadius: 8,
    padding: '10px 12px',
  },
  overviewLabel: { fontSize: 11, color: 'var(--ds-text-secondary, #999)', textTransform: 'uppercase', letterSpacing: 0.4 },
  overviewValue: { fontSize: 20, fontWeight: 700, marginTop: 4, color: 'var(--ds-text, #fff)' },
  overviewSub: { fontSize: 11, color: 'var(--ds-text-secondary, #999)', marginTop: 2 },
  section: {
    background: 'var(--ds-card-bg, #1a1a1a)',
    border: '1px solid var(--ds-border, #333)',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  sectionHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: 'var(--ds-text, #fff)' },
  hint: { fontSize: 11, color: 'var(--ds-text-secondary, #999)', margin: '6px 0' },
  link: { color: 'var(--ds-primary, #4a9eff)' },
  muted: { fontSize: 12, color: 'var(--ds-text-secondary, #999)', margin: '8px 0' },
  error: { fontSize: 12, color: '#ff6b6b', margin: '8px 0' },
  retry: {
    marginLeft: 8, padding: '2px 10px', borderRadius: 4, border: '1px solid #555',
    background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 12,
  },
  smallButton: {
    padding: '3px 10px', borderRadius: 4, border: '1px solid #555',
    background: 'transparent', color: 'var(--ds-text, #eee)', cursor: 'pointer', fontSize: 12,
  },
  smallButtonPrimary: {
    padding: '3px 10px', borderRadius: 4, border: '1px solid var(--ds-primary, #4a9eff)',
    background: 'var(--ds-primary, #4a9eff)', color: '#fff', cursor: 'pointer', fontSize: 12, marginLeft: 6,
  },
  barRow: { display: 'flex', gap: 4, alignItems: 'flex-end', height: 170, paddingTop: 8 },
  barCol: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 },
  bar: {
    width: '100%',
    background: 'linear-gradient(to top, #4a9eff, #6bb5ff)',
    borderRadius: '4px 4px 0 0',
    transition: 'height 0.3s ease',
  },
  barLabel: { fontSize: 10, color: 'var(--ds-text-secondary, #999)', whiteSpace: 'nowrap' },
  pieRow: { display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' },
  pieBlock: { display: 'flex', gap: 12, alignItems: 'center' },
  legend: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 },
  legendRow: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 },
  legendDot: { width: 10, height: 10, borderRadius: 2, flexShrink: 0 },
  legendModel: { color: 'var(--ds-text, #fff)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 },
  legendPct: { color: 'var(--ds-text-secondary, #999)', marginLeft: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 },
  th: {
    padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--ds-border, #333)',
    color: 'var(--ds-text-secondary, #999)', fontWeight: 500, whiteSpace: 'nowrap',
  },
  td: {
    padding: '6px 8px', borderBottom: '1px solid var(--ds-border, #333)',
    color: 'var(--ds-text, #eee)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  tableScroll: { overflowX: 'auto', maxWidth: '100%' },
  channelCellName: { fontSize: 12, fontWeight: 600, color: 'var(--ds-text, #fff)' },
  channelCellModels: {
    fontSize: 11, color: 'var(--ds-text-secondary, #999)', maxWidth: 170,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  pending: { color: '#ffd43b', fontSize: 11 },
  input: {
    width: 84, padding: '2px 6px', borderRadius: 4, border: '1px solid #555',
    background: 'var(--ds-card-bg, #111)', color: 'var(--ds-text, #fff)', fontSize: 12,
  },
  balanceActions: { display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 },
  balanceGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, width: '100%' },
  balanceCard: {
    background: 'var(--ds-card-bg, #151515)', border: '1px solid var(--ds-border, #333)',
    borderRadius: 8, padding: '10px 12px',
  },
  balanceName: { fontSize: 12, fontWeight: 600, color: 'var(--ds-text, #fff)', marginBottom: 6 },
  balanceValue: { fontSize: 16, fontWeight: 700, color: 'var(--ds-text, #fff)' },
  balanceError: { fontSize: 12, color: '#ff6b6b' },
  mutedInline: { fontSize: 11, color: 'var(--ds-text-secondary, #999)' },
  quotaRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, margin: '4px 0' },
  quotaLabel: { flexShrink: 0, color: 'var(--ds-text-secondary, #999)', width: 32 },
  quotaBar: { flex: 1, height: 6, borderRadius: 3, background: 'var(--ds-border, #333)', overflow: 'hidden' },
  quotaFill: { display: 'block', height: '100%', background: 'var(--ds-primary, #4a9eff)' },
  quotaText: { flexShrink: 0, color: 'var(--ds-text, #eee)', fontSize: 11 },
  usageRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, margin: '4px 0' },
  usageText: { color: 'var(--ds-text, #eee)', fontSize: 11 },
  manualEdit: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
}
