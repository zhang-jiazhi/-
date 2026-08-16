/**
 * dsh-stats-panel — host half.
 *
 * Collects per-call token usage from session events, persists it to
 * ~/.dsh/stats-panel/records.jsonl, and serves aggregated statistics to the
 * browser half over the /api/stats-panel route family (plain same-origin
 * fetch, loopback trust fence — mirrors the dsh-ssh pairing routes).
 */
import type { Context } from '@deepseek-ai/cordis';
/** Stable cordis plugin name. */
export declare const name = "stats-panel";
/** Services required before the stats surfaces can mount. */
export declare const inject: string[];
/** One collected model call. */
export interface UsageRecord {
    /** Unix epoch milliseconds of the recorded assistant message. */
    ts: number;
    /** Durable session event seq — the cross-restart dedupe key (with sessionId). */
    seq: number;
    sessionId: string;
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
}
/** Aggregated statistics served to the browser half. */
export interface StatsSummary {
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCacheWriteTokens: number;
    totalReasoningTokens: number;
    totalTokens: number;
    cacheHitRate: number;
    modelStats: ModelStats[];
    channelStats: ChannelStats[];
    dailyStats: DailyStats[];
    recentRecords: UsageRecord[];
}
export interface ModelStats {
    model: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
    totalTokens: number;
}
/** Per-provider (channel) aggregation. */
export interface ChannelStats {
    channel: string;
    models: string[];
    calls: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
    totalTokens: number;
}
/** One channel's account status (balance or plan quota), fetched by the balances route. */
export interface ChannelBalance {
    channel: string;
    /** 'balance' = pay-as-you-go balance; 'plan' = subscription quota; 'manual' = user-entered. */
    kind: 'balance' | 'plan' | 'manual';
    displayName: string;
    /** Balance amount (balance kind). */
    balance?: string;
    currency?: string;
    /** Plan quota buckets (plan kind): percent used 0-100 and the reset time. */
    quota?: Array<{
        label: string;
        percent: number;
        resetsAt: string;
    }>;
    /** Usage buckets (usage kind): tokens consumed over recent windows (e.g. 5h / 7d / 30d). */
    usage?: Array<{
        label: string;
        inputTokens: number;
        outputTokens: number;
    }>;
    /** Manual note (manual kind). */
    note?: string;
    /** When the account data was fetched (balance/plan/usage kinds). */
    fetchedAt?: number;
    /** Fetch failure message (balance/plan/usage kinds). */
    error?: string;
}
export interface DailyStats {
    date: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
}
/** Compute the summary aggregates. */
export declare function computeSummary(records: readonly UsageRecord[]): StatsSummary;
/**
 * Mount the collector and routes.
 * @param ctx - host plugin context carrying webServer.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map