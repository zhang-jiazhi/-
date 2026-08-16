import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
import { useState, useEffect, useCallback } from 'react';
/* ------------------------------------------------------------- constants */
const SUMMARY_URL = '/api/stats-panel/summary';
const BALANCES_URL = '/api/stats-panel/balances';
/** localStorage key for manually entered plan quotas (v1). */
const MANUAL_QUOTA_KEY = 'dsh-stats-panel:manual-quota:v1';
/** provider id → friendly channel name. */
const CHANNEL_NAMES = {
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
};
/** Channels billed by subscription quota (套餐) — token cost is covered by the plan. */
const PLAN_CHANNELS = new Set(['opencode-go', 'mimo', 'openai', 'anthropic']);
function channelName(channel) {
    return CHANNEL_NAMES[channel] ?? channel;
}
/** localStorage key for the editable price table (v2 = CNY). */
const PRICES_KEY = 'dsh-stats-panel:prices:v2';
/**
 * DeepSeek official CNY prices, peak hours, effective 2026-08-16
 * (source: https://api-docs.deepseek.com/zh-cn/quick_start/pricing).
 * Off-peak prices are half of these. Cache write is free on DeepSeek.
 */
const DEFAULT_PRICES = {
    'deepseek-v4-flash': { inputPerM: 3.0, outputPerM: 9.0, cacheReadPerM: 0.1, cacheWritePerM: 0 },
    'deepseek-v4-pro': { inputPerM: 9.0, outputPerM: 27.0, cacheReadPerM: 0.3, cacheWritePerM: 0 },
};
const CHART_COLORS = ['#4a9eff', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8', '#20c997', '#ff922b', '#868e96'];
/* ---------------------------------------------------------------- helpers */
function formatTokens(tokens) {
    if (tokens >= 1_000_000)
        return `${(tokens / 1_000_000).toFixed(2)}M`;
    if (tokens >= 1_000)
        return `${(tokens / 1_000).toFixed(1)}K`;
    return String(tokens);
}
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
}
function formatCny(cny) {
    if (cny === 0)
        return '¥0.00';
    if (cny < 0.01)
        return `¥${cny.toFixed(4)}`;
    if (cny < 1)
        return `¥${cny.toFixed(3)}`;
    return `¥${cny.toFixed(2)}`;
}
/** Cost of one model's usage under a price entry, CNY. */
function modelCost(stat, price) {
    if (price === undefined)
        return 0;
    return (stat.inputTokens / 1_000_000 * price.inputPerM
        + stat.outputTokens / 1_000_000 * price.outputPerM
        + stat.cacheReadTokens / 1_000_000 * price.cacheReadPerM
        + stat.cacheWriteTokens / 1_000_000 * price.cacheWritePerM);
}
function loadPrices() {
    try {
        const raw = window.localStorage.getItem(PRICES_KEY);
        if (raw !== null) {
            const parsed = JSON.parse(raw);
            if (typeof parsed === 'object' && parsed !== null)
                return parsed;
        }
    }
    catch {
        // Fall through to defaults.
    }
    return { ...DEFAULT_PRICES };
}
function savePrices(prices) {
    try {
        window.localStorage.setItem(PRICES_KEY, JSON.stringify(prices));
    }
    catch {
        // Ignore persistence failures.
    }
}
/* ------------------------------------------------------------ main section */
/**
 * The settings-sidebar section: full-page stats view. Loads on mount.
 * @param props - section owner props (the shell supplies `close`).
 */
export function StatsPanelSection(_props) {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(SUMMARY_URL);
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            const body = await response.json();
            setStats(body);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setStats(null);
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        void load();
    }, [load]);
    if (loading && stats === null) {
        return _jsx("div", { style: styles.page, children: _jsx("p", { style: styles.muted, children: "\u52A0\u8F7D\u7EDF\u8BA1\u4E2D\u2026" }) });
    }
    if (error !== null) {
        return (_jsxs("div", { style: styles.page, children: [_jsxs("div", { style: styles.pageHead, children: [_jsx("span", { style: styles.pageTitle, children: "Token \u4F7F\u7528\u7EDF\u8BA1" }), _jsx("span", { style: styles.pageSub, children: "\u6A21\u578B\u7528\u91CF \u00B7 Token \u6D88\u8017 \u00B7 \u7F13\u5B58\u547D\u4E2D\u7387 \u00B7 \u8D39\u7528\u4F30\u7B97\uFF08\u4EBA\u6C11\u5E01\uFF09" })] }), _jsxs("p", { style: styles.error, role: "status", children: ["\u65E0\u6CD5\u52A0\u8F7D\u7EDF\u8BA1\u6570\u636E\uFF1A", error, "\u3002\u8BF7\u786E\u8BA4 dsh \u670D\u52A1\u8FD0\u884C\u6B63\u5E38\u540E\u91CD\u8BD5\u3002", _jsx("button", { type: "button", style: styles.retry, onClick: () => { void load(); }, children: "\u91CD\u8BD5" })] })] }));
    }
    return (_jsxs("div", { style: styles.page, children: [_jsxs("div", { style: styles.pageHead, children: [_jsx("span", { style: styles.pageTitle, children: "Token \u4F7F\u7528\u7EDF\u8BA1" }), _jsx("span", { style: styles.pageSub, children: "\u6A21\u578B\u7528\u91CF \u00B7 Token \u6D88\u8017 \u00B7 \u7F13\u5B58\u547D\u4E2D\u7387 \u00B7 \u8D39\u7528\u4F30\u7B97\uFF08\u4EBA\u6C11\u5E01\uFF09" })] }), stats !== null ? _jsx(StatsPage, { stats: stats }) : null] }));
}
/* ------------------------------------------------------------- stats page */
function StatsPage({ stats }) {
    const [prices, setPrices] = useState(() => loadPrices());
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(() => loadPrices());
    const applyDraft = () => {
        setPrices(draft);
        savePrices(draft);
        setEditing(false);
    };
    const totalCost = stats.modelStats.reduce((sum, m) => sum + modelCost(m, prices[m.model]), 0);
    const unconfigured = stats.modelStats.filter(m => prices[m.model] === undefined);
    return (_jsxs("div", { children: [_jsxs("div", { style: styles.grid, children: [_jsx(OverviewCard, { label: "\u603B\u8C03\u7528\u6B21\u6570", value: String(stats.totalCalls) }), _jsx(OverviewCard, { label: "\u603B Token \u6D88\u8017", value: formatTokens(stats.totalTokens), sub: "\u8F93\u5165 + \u8F93\u51FA + \u7F13\u5B58" }), _jsx(OverviewCard, { label: "\u8F93\u5165 Token", value: formatTokens(stats.totalInputTokens), sub: pct(stats.totalInputTokens, stats.totalTokens) }), _jsx(OverviewCard, { label: "\u8F93\u51FA Token", value: formatTokens(stats.totalOutputTokens), sub: pct(stats.totalOutputTokens, stats.totalTokens) }), _jsx(OverviewCard, { label: "\u7F13\u5B58\u547D\u4E2D\u7387", value: `${stats.cacheHitRate.toFixed(1)}%`, sub: `读 ${formatTokens(stats.totalCacheReadTokens)} / 写 ${formatTokens(stats.totalCacheWriteTokens)}` }), _jsx(OverviewCard, { label: "\u4F30\u7B97\u8D39\u7528", value: formatCny(totalCost), sub: unconfigured.length > 0 ? `${unconfigured.length} 个模型价格待配置` : '按价格表计算' })] }), _jsxs("div", { style: styles.section, children: [_jsxs("div", { style: styles.sectionHead, children: [_jsx("span", { style: styles.sectionTitle, children: "\u6A21\u578B\u4EF7\u683C\uFF08\u4EBA\u6C11\u5E01\uFF0C\u5143 / 1M tokens\uFF09" }), editing
                                ? (_jsxs("span", { children: [_jsx("button", { type: "button", style: styles.smallButton, onClick: () => { setDraft(prices); setEditing(false); }, children: "\u53D6\u6D88" }), _jsx("button", { type: "button", style: styles.smallButtonPrimary, onClick: applyDraft, children: "\u4FDD\u5B58" })] }))
                                : _jsx("button", { type: "button", style: styles.smallButton, onClick: () => { setDraft(prices); setEditing(true); }, children: "\u7F16\u8F91" })] }), _jsxs("p", { style: styles.hint, children: ["\u9ED8\u8BA4\u4EF7\u683C\u4E3A DeepSeek \u5B98\u65B9\u4EBA\u6C11\u5E01\u5B9A\u4EF7\uFF08\u9AD8\u5CF0\u65F6\u6BB5\uFF0C2026-08-16 \u751F\u6548\uFF1B\u7A7A\u95F2\u65F6\u6BB5\u4E3A\u9AD8\u5CF0\u4EF7\u4E00\u534A\uFF0C\u6765\u6E90\uFF1A", _jsx("a", { href: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing", target: "_blank", rel: "noreferrer", style: styles.link, children: "api-docs.deepseek.com" }), "\uFF09\u3002 \u5176\u4ED6\u6A21\u578B\u9ED8\u8BA4 \u00A50\uFF0C\u53EF\u6309\u5B9E\u9645\u6E20\u9053\u4EF7\u683C\u81EA\u884C\u586B\u5199\uFF1B\u672A\u914D\u7F6E\u4EF7\u683C\u7684\u6A21\u578B\u4E0D\u8BA1\u5165\u8D39\u7528\u3002\\n          \u5957\u9910\u6E20\u9053\uFF08OpenCode Go / MiMo / OpenAI / Anthropic\uFF09\u7684\u6A21\u578B\u5EFA\u8BAE\u5C06\u4EF7\u683C\u8BBE\u4E3A 0\uFF0C\u907F\u514D\u4E0E\u5957\u9910\u989D\u5EA6\u91CD\u590D\u8BA1\u8D39\u3002"] }), editing
                        ? _jsx(PriceEditor, { prices: draft, onChange: setDraft, models: stats.modelStats.map(m => m.model) })
                        : _jsx(PriceTable, { rows: stats.modelStats.map(m => m.model), prices: prices })] }), _jsxs("div", { style: styles.section, children: [_jsx("div", { style: styles.sectionHead, children: _jsx("span", { style: styles.sectionTitle, children: "\u6E20\u9053\u4F59\u91CF / \u4F59\u989D" }) }), _jsx(ChannelBalances, {})] }), stats.channelStats.length > 0 ? (_jsxs("div", { style: styles.section, children: [_jsx("div", { style: styles.sectionTitle, children: "\u6E20\u9053\u7EDF\u8BA1" }), _jsx(ChannelTable, { data: stats.channelStats })] })) : null, stats.dailyStats.length > 0 ? (_jsxs("div", { style: styles.section, children: [_jsx("div", { style: styles.sectionTitle, children: "\u6BCF\u65E5 Token \u6D88\u8017" }), _jsx(DailyChart, { data: stats.dailyStats })] })) : null, stats.modelStats.length > 0 ? (_jsxs("div", { style: styles.section, children: [_jsx("div", { style: styles.sectionTitle, children: "\u6A21\u578B\u4F7F\u7528\u5206\u5E03" }), _jsxs("div", { style: styles.pieRow, children: [_jsx(ModelPie, { data: stats.modelStats }), _jsx(ModelTable, { data: stats.modelStats, prices: prices })] })] })) : null, stats.recentRecords.length > 0 ? (_jsxs("div", { style: styles.section, children: [_jsx("div", { style: styles.sectionTitle, children: "\u6700\u8FD1\u8C03\u7528\u8BB0\u5F55" }), _jsx(RecordsTable, { data: stats.recentRecords, prices: prices })] })) : null] }));
}
function pct(part, total) {
    if (total <= 0)
        return '';
    return `${((part / total) * 100).toFixed(1)}%`;
}
/* ------------------------------------------------------- channel balances */
/** Format a millisecond span as "X天 X小时 X分钟" (omitting empty units). */
function formatDuration(ms) {
    if (ms <= 0)
        return '已过期';
    const totalMinutes = Math.floor(ms / 60_000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const parts = [];
    if (days > 0)
        parts.push(`${days}天`);
    if (hours > 0)
        parts.push(`${hours}小时`);
    if (minutes > 0 && days === 0)
        parts.push(`${minutes}分钟`);
    return parts.length > 0 ? parts.join(' ') : `${totalMinutes}分钟`;
}
/** Manual quota storage (mimo Token Plan and other plan channels without a public API). */
function loadManualQuota() {
    try {
        const raw = window.localStorage.getItem(MANUAL_QUOTA_KEY);
        if (raw !== null) {
            const parsed = JSON.parse(raw);
            if (typeof parsed === 'object' && parsed !== null)
                return parsed;
        }
    }
    catch {
        // Fall through.
    }
    return {};
}
/**
 * Channel account statuses: auto-fetched balances/quotas plus manual entries
 * for channels without a public API. Renders inline status rows.
 */
function ChannelBalances() {
    const [balances, setBalances] = useState([]);
    const [loading, setLoading] = useState(false);
    const [manual, setManual] = useState(() => loadManualQuota());
    const [editing, setEditing] = useState(null);
    const [draftNote, setDraftNote] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(BALANCES_URL);
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            const body = await response.json();
            setBalances(body.balances ?? []);
        }
        catch (e) {
            setBalances([{ channel: 'error', kind: 'manual', displayName: '查询失败', error: e instanceof Error ? e.message : String(e) }]);
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        void load();
    }, [load]);
    const saveManual = (channel) => {
        const next = { ...manual, [channel]: draftNote.trim() };
        setManual(next);
        try {
            window.localStorage.setItem(MANUAL_QUOTA_KEY, JSON.stringify(next));
        }
        catch {
            // Ignore.
        }
        setEditing(null);
    };
    // Merge auto results with manual entries (channels without a public API:
    // those the host reported as `manual`, plus any previously entered ones).
    const rows = [...balances];
    const manualNames = new Set(balances.filter(b => b.kind === 'manual').map(b => b.channel));
    for (const channel of Object.keys(manual))
        manualNames.add(channel);
    for (const channel of manualNames) {
        if (balances.some(b => b.channel === channel))
            continue;
        rows.push({ channel, kind: 'manual', displayName: channelName(channel), note: manual[channel] });
    }
    if (rows.length === 0 && !loading) {
        rows.push({ channel: 'none', kind: 'manual', displayName: '未发现渠道', note: '请先配置模型渠道（设置 → 模型）' });
    }
    return (_jsxs("div", { children: [_jsxs("div", { style: styles.balanceActions, children: [loading ? _jsx("span", { style: styles.mutedInline, children: "\u67E5\u8BE2\u4E2D\u2026" }) : null, _jsx("button", { type: "button", style: styles.smallButton, onClick: () => { void load(); }, disabled: loading, children: "\u5237\u65B0" })] }), _jsx("div", { style: styles.balanceGrid, children: rows.map(row => (_jsxs("div", { style: styles.balanceCard, children: [_jsx("div", { style: styles.balanceName, children: row.displayName }), row.error !== undefined ? (_jsx("div", { style: styles.balanceError, children: row.error })) : row.kind === 'balance' ? (_jsxs("div", { style: styles.balanceValue, children: [row.currency === 'CNY' ? '¥' : row.currency === 'USD' ? '$' : '', row.balance ?? '—', row.fetchedAt !== undefined ? _jsxs("span", { style: styles.mutedInline, children: [" \u00B7 ", new Date(row.fetchedAt).toLocaleTimeString()] }) : null] })) : row.kind === 'plan' && row.quota !== undefined ? (_jsx("div", { children: row.quota.map(q => {
                                const remainingMs = q.resetsAt !== '' ? new Date(q.resetsAt).getTime() - Date.now() : 0;
                                return (_jsxs("div", { style: styles.quotaRow, title: `重置于 ${q.resetsAt}`, children: [_jsx("span", { style: styles.quotaLabel, children: q.label }), _jsx("span", { style: styles.quotaBar, children: _jsx("span", { style: { ...styles.quotaFill, width: `${Math.min(100, Math.max(0, q.percent))}%` } }) }), _jsxs("span", { style: styles.quotaText, children: ["\u5DF2\u7528 ", q.percent, "% \u00B7 \u5269\u4F59 ", q.resetsAt !== '' ? formatDuration(remainingMs) : '—'] })] }, q.label));
                            }) })) : row.kind === 'plan' && row.usage !== undefined ? (_jsx("div", { children: row.usage.map(u => (_jsxs("div", { style: styles.usageRow, children: [_jsx("span", { style: styles.quotaLabel, children: u.label }), _jsxs("span", { style: styles.usageText, children: ["\u8F93\u5165 ", formatTokens(u.inputTokens), " \u00B7 \u8F93\u51FA ", formatTokens(u.outputTokens), " \u00B7 \u5408\u8BA1 ", formatTokens(u.inputTokens + u.outputTokens)] })] }, u.label))) })) : row.kind === 'manual' ? (_jsxs("div", { children: [editing === row.channel
                                    ? (_jsxs("span", { style: styles.manualEdit, children: [_jsx("input", { style: styles.input, type: "text", placeholder: "\u5982\uFF1A\u5269\u4F59 18\u5929 3\u5C0F\u65F6 \u6216 4100M Credits", value: draftNote, onChange: e => { setDraftNote(e.target.value); } }), _jsx("button", { type: "button", style: styles.smallButtonPrimary, onClick: () => { saveManual(row.channel); }, children: "\u4FDD\u5B58" }), _jsx("button", { type: "button", style: styles.smallButton, onClick: () => { setEditing(null); }, children: "\u53D6\u6D88" })] }))
                                    : (_jsxs("span", { children: [_jsx("span", { style: styles.balanceValue, children: row.note !== undefined ? row.note : '待配置' }), _jsx("button", { type: "button", style: styles.smallButton, onClick: () => { setDraftNote(row.note ?? ''); setEditing(row.channel); }, children: row.note !== undefined ? '修改' : '配置' })] })), _jsx("div", { style: styles.mutedInline, children: "\u65E0\u516C\u5F00\u67E5\u8BE2 API\uFF0C\u8BF7\u5230\u5E73\u53F0\u63A7\u5236\u53F0\u67E5\u770B\u540E\u586B\u5199" })] })) : null] }, row.channel))) })] }));
}
/** Per-channel token usage table. */
function ChannelTable({ data }) {
    const sorted = [...data].sort((a, b) => b.totalTokens - a.totalTokens);
    return (_jsx("div", { style: styles.tableScroll, children: _jsxs("table", { style: styles.table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: styles.th, children: "\u6E20\u9053" }), _jsx("th", { style: styles.th, children: "\u8C03\u7528" }), _jsx("th", { style: styles.th, children: "\u8F93\u5165" }), _jsx("th", { style: styles.th, children: "\u8F93\u51FA" }), _jsx("th", { style: styles.th, children: "\u7F13\u5B58" }), _jsx("th", { style: styles.th, children: "\u603B Token" })] }) }), _jsx("tbody", { children: sorted.map(c => (_jsxs("tr", { children: [_jsxs("td", { style: styles.td, children: [_jsx("div", { style: styles.channelCellName, children: channelName(c.channel) }), _jsx("div", { style: styles.channelCellModels, title: c.models.join(', '), children: c.models.join(', ') })] }), _jsx("td", { style: styles.td, children: c.calls }), _jsx("td", { style: styles.td, children: formatTokens(c.inputTokens) }), _jsx("td", { style: styles.td, children: formatTokens(c.outputTokens) }), _jsx("td", { style: styles.td, children: formatTokens(c.cacheReadTokens + c.cacheWriteTokens) }), _jsx("td", { style: styles.td, children: formatTokens(c.totalTokens) })] }, c.channel))) })] }) }));
}
/* -------------------------------------------------------------- overview */
function OverviewCard({ label, value, sub }) {
    return (_jsxs("div", { style: styles.overviewCard, children: [_jsx("div", { style: styles.overviewLabel, children: label }), _jsx("div", { style: styles.overviewValue, children: value }), sub !== undefined && sub !== '' ? _jsx("div", { style: styles.overviewSub, children: sub }) : null] }));
}
/* --------------------------------------------------------------- charts */
function DailyChart({ data }) {
    const days = data.slice(-14);
    const max = Math.max(...days.map(d => d.totalTokens), 1);
    return (_jsx("div", { style: styles.barRow, children: days.map((day, i) => (_jsxs("div", { style: styles.barCol, title: `${day.date}: ${formatTokens(day.totalTokens)} tokens`, children: [_jsx("div", { style: { ...styles.bar, height: `${Math.max(4, (day.totalTokens / max) * 140)}px` } }), _jsx("div", { style: styles.barLabel, children: formatDate(day.date) })] }, day.date))) }));
}
function ModelPie({ data }) {
    const total = data.reduce((sum, m) => sum + m.totalTokens, 0);
    const top = [...data].sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 8);
    let angle = -90;
    const arcs = [];
    for (let i = 0; i < top.length; i++) {
        const pct = total > 0 ? top[i].totalTokens / total : 0;
        const start = angle;
        const end = angle + pct * 360;
        const startRad = (start * Math.PI) / 180;
        const endRad = (end * Math.PI) / 180;
        const x1 = 16 + 16 * Math.cos(startRad);
        const y1 = 16 + 16 * Math.sin(startRad);
        const x2 = 16 + 16 * Math.cos(endRad);
        const y2 = 16 + 16 * Math.sin(endRad);
        const large = pct > 0.5 ? 1 : 0;
        arcs.push(_jsx("path", { d: `M16 16 L${x1.toFixed(3)} ${y1.toFixed(3)} A16 16 0 ${large} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`, fill: CHART_COLORS[i % CHART_COLORS.length], stroke: "#1a1a1a", strokeWidth: 0.5 }, i));
        angle = end;
    }
    return (_jsxs("div", { style: styles.pieBlock, children: [_jsx("svg", { viewBox: "0 0 32 32", width: 150, height: 150, children: arcs }), _jsx("div", { style: styles.legend, children: top.map((m, i) => (_jsxs("div", { style: styles.legendRow, children: [_jsx("span", { style: { ...styles.legendDot, background: CHART_COLORS[i % CHART_COLORS.length] } }), _jsx("span", { style: styles.legendModel, title: m.model, children: m.model }), _jsx("span", { style: styles.legendPct, children: total > 0 ? `${((m.totalTokens / total) * 100).toFixed(1)}%` : '0%' })] }, m.model))) })] }));
}
/* ---------------------------------------------------------------- tables */
function ModelTable({ data, prices }) {
    const sorted = [...data].sort((a, b) => b.totalTokens - a.totalTokens);
    return (_jsx("div", { style: styles.tableScroll, children: _jsxs("table", { style: styles.table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: styles.th, children: "\u6A21\u578B" }), _jsx("th", { style: styles.th, children: "\u8C03\u7528" }), _jsx("th", { style: styles.th, children: "\u8F93\u5165" }), _jsx("th", { style: styles.th, children: "\u8F93\u51FA" }), _jsx("th", { style: styles.th, children: "\u7F13\u5B58\u8BFB" }), _jsx("th", { style: styles.th, children: "\u7F13\u5B58\u5199" }), _jsx("th", { style: styles.th, children: "\u603B Token" }), _jsx("th", { style: styles.th, children: "\u8D39\u7528" })] }) }), _jsx("tbody", { children: sorted.map(m => (_jsxs("tr", { children: [_jsx("td", { style: styles.td, title: m.model, children: m.model }), _jsx("td", { style: styles.td, children: m.calls }), _jsx("td", { style: styles.td, children: formatTokens(m.inputTokens) }), _jsx("td", { style: styles.td, children: formatTokens(m.outputTokens) }), _jsx("td", { style: styles.td, children: formatTokens(m.cacheReadTokens) }), _jsx("td", { style: styles.td, children: formatTokens(m.cacheWriteTokens) }), _jsx("td", { style: styles.td, children: formatTokens(m.totalTokens) }), _jsx("td", { style: styles.td, children: formatCny(modelCost(m, prices[m.model])) })] }, m.model))) })] }) }));
}
function RecordsTable({ data, prices }) {
    return (_jsx("div", { style: styles.tableScroll, children: _jsx("div", { style: { maxHeight: 320, overflow: 'auto' }, children: _jsxs("table", { style: styles.table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: styles.th, children: "\u65F6\u95F4" }), _jsx("th", { style: styles.th, children: "\u6A21\u578B" }), _jsx("th", { style: styles.th, children: "\u8F93\u5165" }), _jsx("th", { style: styles.th, children: "\u8F93\u51FA" }), _jsx("th", { style: styles.th, children: "\u7F13\u5B58" }), _jsx("th", { style: styles.th, children: "\u603B Token" }), _jsx("th", { style: styles.th, children: "\u8D39\u7528" })] }) }), _jsx("tbody", { children: data.slice(0, 100).map((r, i) => (_jsxs("tr", { children: [_jsx("td", { style: styles.td, children: new Date(r.ts).toLocaleString() }), _jsx("td", { style: styles.td, title: r.model, children: r.model }), _jsx("td", { style: styles.td, children: formatTokens(r.inputTokens) }), _jsx("td", { style: styles.td, children: formatTokens(r.outputTokens) }), _jsx("td", { style: styles.td, children: formatTokens(r.cacheReadTokens + r.cacheWriteTokens) }), _jsx("td", { style: styles.td, children: formatTokens(r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens) }), _jsx("td", { style: styles.td, children: formatCny(modelCost({
                                        model: r.model,
                                        calls: 1,
                                        inputTokens: r.inputTokens,
                                        outputTokens: r.outputTokens,
                                        cacheReadTokens: r.cacheReadTokens,
                                        cacheWriteTokens: r.cacheWriteTokens,
                                        reasoningTokens: r.reasoningTokens,
                                        totalTokens: r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens,
                                    }, prices[r.model])) })] }, `${r.sessionId}-${i}`))) })] }) }) }));
}
/* ----------------------------------------------------------- price table */
function PriceTable({ rows, prices }) {
    if (rows.length === 0)
        return _jsx("p", { style: styles.muted, children: "\u6682\u65E0\u6A21\u578B\u6570\u636E" });
    return (_jsxs("table", { style: styles.table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: styles.th, children: "\u6A21\u578B" }), _jsx("th", { style: styles.th, children: "\u8F93\u5165 \u5143/1M" }), _jsx("th", { style: styles.th, children: "\u8F93\u51FA \u5143/1M" }), _jsx("th", { style: styles.th, children: "\u7F13\u5B58\u547D\u4E2D \u5143/1M" }), _jsx("th", { style: styles.th, children: "\u7F13\u5B58\u5199\u5165 \u5143/1M" })] }) }), _jsx("tbody", { children: rows.map(model => {
                    const p = prices[model];
                    return (_jsxs("tr", { children: [_jsx("td", { style: styles.td, title: model, children: model }), p === undefined
                                ? _jsx("td", { style: styles.td, colSpan: 4, children: _jsx("span", { style: styles.pending, children: "\u4EF7\u683C\u5F85\u914D\u7F6E\uFF08\u4E0D\u8BA1\u5165\u8D39\u7528\uFF09" }) })
                                : (_jsxs(_Fragment, { children: [_jsx("td", { style: styles.td, children: p.inputPerM }), _jsx("td", { style: styles.td, children: p.outputPerM }), _jsx("td", { style: styles.td, children: p.cacheReadPerM }), _jsx("td", { style: styles.td, children: p.cacheWritePerM })] }))] }, model));
                }) })] }));
}
function PriceEditor({ prices, onChange, models }) {
    const set = (model, field, value) => {
        const num = Number(value);
        const next = { ...prices };
        const current = next[model] ?? { inputPerM: 0, outputPerM: 0, cacheReadPerM: 0, cacheWritePerM: 0 };
        next[model] = { ...current, [field]: Number.isFinite(num) ? num : 0 };
        onChange(next);
    };
    return (_jsxs("table", { style: styles.table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: styles.th, children: "\u6A21\u578B" }), _jsx("th", { style: styles.th, children: "\u8F93\u5165 \u5143/1M" }), _jsx("th", { style: styles.th, children: "\u8F93\u51FA \u5143/1M" }), _jsx("th", { style: styles.th, children: "\u7F13\u5B58\u547D\u4E2D \u5143/1M" }), _jsx("th", { style: styles.th, children: "\u7F13\u5B58\u5199\u5165 \u5143/1M" })] }) }), _jsx("tbody", { children: models.map(model => {
                    const p = prices[model] ?? { inputPerM: 0, outputPerM: 0, cacheReadPerM: 0, cacheWritePerM: 0 };
                    return (_jsxs("tr", { children: [_jsx("td", { style: styles.td, title: model, children: model }), _jsx("td", { style: styles.td, children: _jsx("input", { style: styles.input, type: "number", step: "0.001", min: "0", value: p.inputPerM, onChange: e => set(model, 'inputPerM', e.target.value) }) }), _jsx("td", { style: styles.td, children: _jsx("input", { style: styles.input, type: "number", step: "0.001", min: "0", value: p.outputPerM, onChange: e => set(model, 'outputPerM', e.target.value) }) }), _jsx("td", { style: styles.td, children: _jsx("input", { style: styles.input, type: "number", step: "0.001", min: "0", value: p.cacheReadPerM, onChange: e => set(model, 'cacheReadPerM', e.target.value) }) }), _jsx("td", { style: styles.td, children: _jsx("input", { style: styles.input, type: "number", step: "0.001", min: "0", value: p.cacheWritePerM, onChange: e => set(model, 'cacheWritePerM', e.target.value) }) })] }, model));
                }) })] }));
}
/* ----------------------------------------------------------------- styles */
const styles = {
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
};
//# sourceMappingURL=stats-panel.js.map