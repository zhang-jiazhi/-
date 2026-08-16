import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
//#region src/index.ts
/** Stable cordis plugin name. */
const name = "stats-panel";
/** Services required before the stats surfaces can mount. */
const inject = ["webServer"];
/** Where the durable usage log lives. */
const DATA_DIR = join(homedir(), ".dsh", "stats-panel");
const RECORDS_FILE = join(DATA_DIR, "records.jsonl");
/** Loopback literal check plus browser same-origin markers (mirrors dsh-ssh). */
function isLoopbackRequest(request) {
	const address = request.socket.remoteAddress;
	if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
	const host = request.headers.host;
	if (typeof host !== "string") return false;
	let hostUrl;
	try {
		hostUrl = new URL(`http://${host}`);
	} catch {
		return false;
	}
	if (hostUrl.hostname !== "127.0.0.1" && hostUrl.hostname !== "localhost" && hostUrl.hostname !== "[::1]") return false;
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = request.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
/** One JSON response. */
function writeJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"referrer-policy": "no-referrer"
	});
	res.end(payload);
}
const SETTINGS_PATH = join(homedir(), ".dsh", "settings.yaml");
/**
* Read provider configurations from ~/.dsh/settings.yaml (llm-pi-ai.providers
* and llm-deepseek). Falls back to the well-known local channels when the
* file is unreadable. YAML parsed conservatively — no external dependency.
*/
function readProviderConfigs() {
	const configs = [];
	try {
		const providers = parseSimpleYaml(readFileSync(SETTINGS_PATH, "utf8"))["llm-pi-ai"]?.["providers"] ?? {};
		for (const [name, spec] of Object.entries(providers)) {
			const typed = spec ?? {};
			configs.push({
				provider: name,
				displayName: typeof typed["displayName"] === "string" ? typed["displayName"] : name,
				apiKeyEnv: typeof typed["apiKeyEnv"] === "string" ? typed["apiKeyEnv"] : "",
				baseURL: typeof typed["baseURL"] === "string" ? typed["baseURL"] : void 0
			});
		}
	} catch {}
	if (configs.length === 0) configs.push({
		provider: "opencode-go",
		displayName: "OpenCode Go 套餐",
		apiKeyEnv: "OPENCODE_GO_API_KEY"
	}, {
		provider: "mimo",
		displayName: "小米 MiMo Token Plan",
		apiKeyEnv: "XIAOMI_API_KEY",
		baseURL: "https://token-plan-cn.xiaomimimo.com/v1"
	});
	configs.push({
		provider: "deepseek-official",
		displayName: "DeepSeek 官方",
		apiKeyEnv: "DEEPSEEK_API_KEY",
		baseURL: "https://api.deepseek.com"
	});
	return configs;
}
/** Minimal YAML subset parser for settings.yaml provider maps (indent + key: value). */
function parseSimpleYaml(text) {
	const root = {};
	let current;
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
		const indent = line.length - line.trimStart().length;
		const match = /^([A-Za-z0-9_.-]+):\s*(.*)$/.exec(trimmed);
		if (match === null) continue;
		const key = match[1];
		const value = match[2].trim();
		if (indent === 0) {
			current = {};
			root[key] = current;
		} else if (current !== void 0 && indent >= 2) if (value === "") current[key] = {};
		else current[key] = value;
	}
	return root;
}
/** Fetch with a bounded timeout; throws on non-OK or network failure. */
async function probeJson(url, headers) {
	const response = await fetch(url, {
		headers,
		signal: AbortSignal.timeout(1e4)
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const body = await response.json();
	if (typeof body !== "object" || body === null) throw new Error("invalid JSON response");
	return body;
}
function numField(obj, field) {
	const value = obj[field];
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : void 0;
	}
}
/**
* One channel's account probe. Returns the ChannelBalance or throws.
* Adapts the well-known provider endpoints (community-verified by cc-switch
* plus OpenCode Go / OpenAI / Anthropic usage APIs).
*/
async function probeChannel(ctx, config, resolveKey) {
	const url = (config.baseURL ?? "").toLowerCase();
	const now = Date.now();
	if (url.includes("opencode.ai/zen/go") || config.provider === "opencode-go") {
		const key = await resolveKey(config.apiKeyEnv);
		if (key === void 0) return {
			channel: config.provider,
			kind: "plan",
			displayName: config.displayName,
			error: `未找到 ${config.apiKeyEnv} 凭据`
		};
		const usage = (await probeJson("https://opencode.ai/zen/go/v1/usage", { authorization: `Bearer ${key}` }))["usage"];
		const quota = [];
		const push = (label, bucket) => {
			const typed = bucket;
			if (typed === void 0) return;
			quota.push({
				label,
				percent: numField(typed, "percent") ?? 0,
				resetsAt: typeof typed["resetsAt"] === "string" ? typed["resetsAt"] : ""
			});
		};
		push("滚动", usage?.["rolling"]);
		push("7天", usage?.["weekly"]);
		push("30天", usage?.["monthly"]);
		return {
			channel: config.provider,
			kind: "plan",
			displayName: config.displayName,
			quota,
			fetchedAt: now
		};
	}
	if (url.includes("api.deepseek.com")) {
		const key = await resolveKey(config.apiKeyEnv);
		if (key === void 0) return {
			channel: config.provider,
			kind: "balance",
			displayName: config.displayName,
			error: `未找到 ${config.apiKeyEnv} 凭据`
		};
		const info = (await probeJson("https://api.deepseek.com/user/balance", { authorization: `Bearer ${key}` }))["balance_infos"]?.[0];
		return {
			channel: config.provider,
			kind: "balance",
			displayName: config.displayName,
			balance: info !== void 0 ? String(numField(info, "total_balance") ?? "0") : "0",
			currency: typeof info?.["currency"] === "string" ? info["currency"] : "CNY",
			fetchedAt: now
		};
	}
	if (url.includes("api.moonshot.cn") || url.includes("api.kimi.ai")) {
		const key = await resolveKey(config.apiKeyEnv);
		if (key === void 0) return {
			channel: config.provider,
			kind: "balance",
			displayName: config.displayName,
			error: `未找到 ${config.apiKeyEnv} 凭据`
		};
		const data = (await probeJson(`${url.includes("api.kimi.ai") ? "https://api.kimi.ai" : "https://api.moonshot.cn"}/v1/users/me/balance`, { authorization: `Bearer ${key}` }))["data"];
		const available = numField(data ?? {}, "available_balance");
		return {
			channel: config.provider,
			kind: "balance",
			displayName: config.displayName,
			balance: available !== void 0 ? String(available) : void 0,
			currency: typeof data?.["currency"] === "string" ? data["currency"] : "CNY",
			fetchedAt: now
		};
	}
	if (url.includes("api.siliconflow.cn") || url.includes("api.siliconflow.com")) {
		const key = await resolveKey(config.apiKeyEnv);
		if (key === void 0) return {
			channel: config.provider,
			kind: "balance",
			displayName: config.displayName,
			error: `未找到 ${config.apiKeyEnv} 凭据`
		};
		const isCn = url.includes(".cn");
		const data = (await probeJson(`${isCn ? "https://api.siliconflow.cn" : "https://api.siliconflow.com"}/v1/user/info`, { authorization: `Bearer ${key}` }))["data"];
		const total = numField(data ?? {}, "totalBalance");
		return {
			channel: config.provider,
			kind: "balance",
			displayName: config.displayName,
			balance: total !== void 0 ? String(total) : void 0,
			currency: isCn ? "CNY" : "USD",
			fetchedAt: now
		};
	}
	if (url.includes("api.stepfun.com") || url.includes("api.stepfun.ai")) {
		const key = await resolveKey(config.apiKeyEnv);
		if (key === void 0) return {
			channel: config.provider,
			kind: "balance",
			displayName: config.displayName,
			error: `未找到 ${config.apiKeyEnv} 凭据`
		};
		const balance = numField(await probeJson("https://api.stepfun.com/v1/accounts", { authorization: `Bearer ${key}` }), "balance");
		return {
			channel: config.provider,
			kind: "balance",
			displayName: config.displayName,
			balance: balance !== void 0 ? String(balance) : void 0,
			currency: "CNY",
			fetchedAt: now
		};
	}
	if (url.includes("openrouter.ai")) {
		const key = await resolveKey(config.apiKeyEnv);
		if (key === void 0) return {
			channel: config.provider,
			kind: "balance",
			displayName: config.displayName,
			error: `未找到 ${config.apiKeyEnv} 凭据`
		};
		const data = (await probeJson("https://openrouter.ai/api/v1/credits", { authorization: `Bearer ${key}` }))["data"];
		const total = numField(data ?? {}, "total_credits") ?? 0;
		const used = numField(data ?? {}, "total_usage") ?? 0;
		return {
			channel: config.provider,
			kind: "balance",
			displayName: config.displayName,
			balance: String(Math.max(0, total - used)),
			currency: "USD",
			fetchedAt: now
		};
	}
	if (url.includes("api.novita.ai")) {
		const key = await resolveKey(config.apiKeyEnv);
		if (key === void 0) return {
			channel: config.provider,
			kind: "balance",
			displayName: config.displayName,
			error: `未找到 ${config.apiKeyEnv} 凭据`
		};
		const available = (numField(await probeJson("https://api.novita.ai/v3/user/balance", { authorization: `Bearer ${key}` }), "availableBalance") ?? 0) / 1e4;
		return {
			channel: config.provider,
			kind: "balance",
			displayName: config.displayName,
			balance: String(available),
			currency: "USD",
			fetchedAt: now
		};
	}
	if (url.includes("api.openai.com")) {
		const key = await resolveKey(config.apiKeyEnv);
		if (key === void 0) return {
			channel: config.provider,
			kind: "plan",
			displayName: config.displayName,
			error: `未找到 ${config.apiKeyEnv} 凭据`
		};
		const day = 864e5;
		const buckets = [
			{
				label: "5小时",
				windowMs: 5 * 36e5
			},
			{
				label: "7天",
				windowMs: 7 * day
			},
			{
				label: "30天",
				windowMs: 30 * day
			}
		];
		const usage = [];
		for (const bucket of buckets) {
			const rows = (await probeJson(`https://api.openai.com/v1/usage?start_time=${Math.floor((now - bucket.windowMs) / 1e3)}&bucket_width=1d`, { authorization: `Bearer ${key}` }))["data"] ?? [];
			let input = 0;
			let output = 0;
			for (const row of rows) {
				input += numField(row, "input_tokens") ?? 0;
				output += numField(row, "output_tokens") ?? 0;
			}
			usage.push({
				label: bucket.label,
				inputTokens: input,
				outputTokens: output
			});
		}
		return {
			channel: config.provider,
			kind: "plan",
			displayName: config.displayName,
			usage,
			fetchedAt: now
		};
	}
	if (url.includes("api.anthropic.com")) {
		const key = await resolveKey(config.apiKeyEnv);
		if (key === void 0) return {
			channel: config.provider,
			kind: "plan",
			displayName: config.displayName,
			error: `未找到 ${config.apiKeyEnv} 凭据`
		};
		const day = 864e5;
		const buckets = [
			{
				label: "5小时",
				windowMs: 5 * 36e5
			},
			{
				label: "7天",
				windowMs: 7 * day
			},
			{
				label: "30天",
				windowMs: 30 * day
			}
		];
		const usage = [];
		for (const bucket of buckets) {
			const rows = (await probeJson(`https://api.anthropic.com/v1/organizations/usage/costs?start_time=${new Date(now - bucket.windowMs).toISOString()}&bucket_width=1h`, {
				"x-api-key": key,
				"anthropic-version": "2023-06-01"
			}))["data"] ?? [];
			let input = 0;
			let output = 0;
			for (const row of rows) {
				const usagePart = row["usage"];
				input += numField(usagePart ?? {}, "input_tokens") ?? 0;
				output += numField(usagePart ?? {}, "output_tokens") ?? 0;
			}
			usage.push({
				label: bucket.label,
				inputTokens: input,
				outputTokens: output
			});
		}
		return {
			channel: config.provider,
			kind: "plan",
			displayName: config.displayName,
			usage,
			fetchedAt: now
		};
	}
	return {
		channel: config.provider,
		kind: "manual",
		displayName: config.displayName
	};
}
/** Load the durable usage log (best effort). Records without a seq (pre-fix data) are dropped. */
function loadRecords() {
	try {
		if (!existsSync(RECORDS_FILE)) return [];
		const lines = readFileSync(RECORDS_FILE, "utf8").split("\n").filter((line) => line.trim() !== "");
		const records = [];
		for (const line of lines) try {
			const parsed = JSON.parse(line);
			if (typeof parsed === "object" && parsed !== null && typeof parsed.ts === "number" && typeof parsed.seq === "number" && typeof parsed.sessionId === "string") records.push(parsed);
		} catch {}
		return records;
	} catch {
		return [];
	}
}
/** Persist one record (best effort; a failed write must never take the GUI down). */
function appendRecord(record) {
	try {
		appendFileSync(RECORDS_FILE, JSON.stringify(record) + "\n");
	} catch {}
}
/** Compute the summary aggregates. */
function computeSummary(records) {
	let totalCalls = 0;
	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	let totalCacheReadTokens = 0;
	let totalCacheWriteTokens = 0;
	let totalReasoningTokens = 0;
	const modelMap = /* @__PURE__ */ new Map();
	const channelMap = /* @__PURE__ */ new Map();
	const dailyMap = /* @__PURE__ */ new Map();
	for (const record of records) {
		totalCalls++;
		totalInputTokens += record.inputTokens;
		totalOutputTokens += record.outputTokens;
		totalCacheReadTokens += record.cacheReadTokens;
		totalCacheWriteTokens += record.cacheWriteTokens;
		totalReasoningTokens += record.reasoningTokens;
		const recordTotal = record.inputTokens + record.outputTokens + record.cacheReadTokens + record.cacheWriteTokens;
		const existing = modelMap.get(record.model);
		if (existing !== void 0) {
			existing.calls++;
			existing.inputTokens += record.inputTokens;
			existing.outputTokens += record.outputTokens;
			existing.cacheReadTokens += record.cacheReadTokens;
			existing.cacheWriteTokens += record.cacheWriteTokens;
			existing.reasoningTokens += record.reasoningTokens;
			existing.totalTokens += recordTotal;
		} else modelMap.set(record.model, {
			model: record.model,
			calls: 1,
			inputTokens: record.inputTokens,
			outputTokens: record.outputTokens,
			cacheReadTokens: record.cacheReadTokens,
			cacheWriteTokens: record.cacheWriteTokens,
			reasoningTokens: record.reasoningTokens,
			totalTokens: recordTotal
		});
		const channel = record.provider === "" ? "unknown" : record.provider;
		const channelEntry = channelMap.get(channel);
		if (channelEntry !== void 0) {
			channelEntry.calls++;
			channelEntry.inputTokens += record.inputTokens;
			channelEntry.outputTokens += record.outputTokens;
			channelEntry.cacheReadTokens += record.cacheReadTokens;
			channelEntry.cacheWriteTokens += record.cacheWriteTokens;
			channelEntry.reasoningTokens += record.reasoningTokens;
			channelEntry.totalTokens += recordTotal;
			if (!channelEntry.models.includes(record.model)) channelEntry.models.push(record.model);
		} else channelMap.set(channel, {
			channel,
			models: [record.model],
			calls: 1,
			inputTokens: record.inputTokens,
			outputTokens: record.outputTokens,
			cacheReadTokens: record.cacheReadTokens,
			cacheWriteTokens: record.cacheWriteTokens,
			reasoningTokens: record.reasoningTokens,
			totalTokens: recordTotal
		});
		const date = new Date(record.ts).toISOString().slice(0, 10);
		const day = dailyMap.get(date);
		if (day !== void 0) {
			day.calls++;
			day.inputTokens += record.inputTokens;
			day.outputTokens += record.outputTokens;
			day.cacheReadTokens += record.cacheReadTokens;
			day.cacheWriteTokens += record.cacheWriteTokens;
			day.totalTokens += recordTotal;
		} else dailyMap.set(date, {
			date,
			calls: 1,
			inputTokens: record.inputTokens,
			outputTokens: record.outputTokens,
			cacheReadTokens: record.cacheReadTokens,
			cacheWriteTokens: record.cacheWriteTokens,
			totalTokens: recordTotal
		});
	}
	const totalTokens = totalInputTokens + totalOutputTokens + totalCacheReadTokens + totalCacheWriteTokens;
	const cacheHitRate = totalTokens > 0 ? (totalCacheReadTokens + totalCacheWriteTokens) / totalTokens * 100 : 0;
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
		recentRecords: records.slice(-100).reverse()
	};
}
/**
* Mount the collector and routes.
* @param ctx - host plugin context carrying webServer.
*/
function apply(ctx) {
	mkdirSync(DATA_DIR, { recursive: true });
	const records = loadRecords();
	const seen = /* @__PURE__ */ new Set();
	for (const record of records) if (typeof record.seq === "number" && typeof record.sessionId === "string") seen.add(`${record.sessionId}:${record.seq}`);
	let currentModel = "unknown";
	let currentProvider = "unknown";
	const collect = (sessionId, seq, model, provider, usage, ts) => {
		const key = `${sessionId}:${seq}`;
		if (seen.has(key)) return;
		seen.add(key);
		const record = {
			ts,
			seq,
			sessionId,
			model,
			provider,
			inputTokens: usage.inputTokens ?? 0,
			outputTokens: usage.outputTokens ?? 0,
			cacheReadTokens: usage.cacheReadTokens ?? 0,
			cacheWriteTokens: usage.cacheWriteTokens ?? 0,
			reasoningTokens: usage.reasoningTokens ?? 0
		};
		records.push(record);
		appendRecord(record);
	};
	ctx.on("session/event", (session, event) => {
		if (event.type === "request/header") {
			currentModel = event.data.header.config.model;
			currentProvider = event.data.header.config.provider;
		} else if (event.type === "assistant/message" && event.data.usage !== void 0) collect(session.id, event.seq, currentModel, currentProvider, event.data.usage, event.time);
	});
	(async () => {
		try {
			const query = ctx.get("sessionQuery");
			if (query === void 0) return;
			const sessions = await query.listSessions();
			for (const entry of sessions) {
				if (entry.live) continue;
				try {
					const log = await query.readSession(entry.header.id);
					let model = "unknown";
					let provider = "unknown";
					for (const event of log.events) if (event.type === "request/header") {
						model = event.data.header.config.model;
						provider = event.data.header.config.provider;
					} else if (event.type === "assistant/message" && event.data.usage !== void 0) collect(entry.header.id, event.seq, model, provider, event.data.usage, event.time);
				} catch {}
			}
		} catch {}
	})();
	ctx.webServer.register({
		kind: "exact",
		path: "/api/stats-panel/summary",
		handler: async (req, res) => {
			if (!isLoopbackRequest(req)) {
				writeJson(res, 403, { error: "forbidden: loopback-only" });
				return;
			}
			if (req.method !== "GET" && req.method !== void 0) {
				writeJson(res, 405, { error: `method not allowed: ${req.method}` });
				return;
			}
			writeJson(res, 200, computeSummary(records));
		}
	});
	ctx.webServer.register({
		kind: "exact",
		path: "/api/stats-panel/balances",
		handler: async (req, res) => {
			if (!isLoopbackRequest(req)) {
				writeJson(res, 403, { error: "forbidden: loopback-only" });
				return;
			}
			if (req.method !== "GET" && req.method !== void 0) {
				writeJson(res, 405, { error: `method not allowed: ${req.method}` });
				return;
			}
			const credentials = ctx.get("credentials");
			const resolveKey = async (name) => {
				if (credentials === void 0 || name === "") return void 0;
				try {
					return (await credentials.resolve(name))?.value;
				} catch {
					return;
				}
			};
			const results = [];
			const seen = /* @__PURE__ */ new Set();
			for (const config of readProviderConfigs()) {
				if (seen.has(config.provider)) continue;
				seen.add(config.provider);
				try {
					results.push(await probeChannel(ctx, config, resolveKey));
				} catch (e) {
					results.push({
						channel: config.provider,
						kind: "plan",
						displayName: config.displayName,
						error: `查询失败：${e instanceof Error ? e.message : String(e)}`
					});
				}
			}
			writeJson(res, 200, { balances: results });
		}
	});
}
//#endregion
export { apply, computeSummary, inject, name };
