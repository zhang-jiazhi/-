window.__ModuleLoader__.load({
	id: "@linxin666/dsh-stats-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region lib/types/client/stats-panel.js
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
		const SUMMARY_URL = "/api/stats-panel/summary";
		const BALANCES_URL = "/api/stats-panel/balances";
		/** localStorage key for manually entered plan quotas (v1). */
		const MANUAL_QUOTA_KEY = "dsh-stats-panel:manual-quota:v1";
		/** provider id → friendly channel name. */
		const CHANNEL_NAMES = {
			"deepseek-official": "DeepSeek 官方",
			"opencode-go": "OpenCode Go 套餐",
			mimo: "小米 MiMo Token Plan",
			openai: "OpenAI",
			anthropic: "Anthropic",
			moonshot: "Kimi 月之暗面",
			kimi: "Kimi 月之暗面",
			siliconflow: "硅基流动",
			stepfun: "阶跃星辰 StepFun",
			openrouter: "OpenRouter",
			novita: "Novita AI",
			unknown: "未知渠道"
		};
		function channelName(channel) {
			return CHANNEL_NAMES[channel] ?? channel;
		}
		/** localStorage key for the editable price table (v2 = CNY). */
		const PRICES_KEY = "dsh-stats-panel:prices:v2";
		/**
		* DeepSeek official CNY prices, peak hours, effective 2026-08-16
		* (source: https://api-docs.deepseek.com/zh-cn/quick_start/pricing).
		* Off-peak prices are half of these. Cache write is free on DeepSeek.
		*/
		const DEFAULT_PRICES = {
			"deepseek-v4-flash": {
				inputPerM: 3,
				outputPerM: 9,
				cacheReadPerM: .1,
				cacheWritePerM: 0
			},
			"deepseek-v4-pro": {
				inputPerM: 9,
				outputPerM: 27,
				cacheReadPerM: .3,
				cacheWritePerM: 0
			}
		};
		const CHART_COLORS = [
			"#4a9eff",
			"#ff6b6b",
			"#51cf66",
			"#ffd43b",
			"#cc5de8",
			"#20c997",
			"#ff922b",
			"#868e96"
		];
		function formatTokens(tokens) {
			if (tokens >= 1e6) return `${(tokens / 1e6).toFixed(2)}M`;
			if (tokens >= 1e3) return `${(tokens / 1e3).toFixed(1)}K`;
			return String(tokens);
		}
		function formatDate(dateStr) {
			const date = new Date(dateStr);
			return `${date.getMonth() + 1}/${date.getDate()}`;
		}
		function formatCny(cny) {
			if (cny === 0) return "¥0.00";
			if (cny < .01) return `¥${cny.toFixed(4)}`;
			if (cny < 1) return `¥${cny.toFixed(3)}`;
			return `¥${cny.toFixed(2)}`;
		}
		/** Cost of one model's usage under a price entry, CNY. */
		function modelCost(stat, price) {
			if (price === void 0) return 0;
			return stat.inputTokens / 1e6 * price.inputPerM + stat.outputTokens / 1e6 * price.outputPerM + stat.cacheReadTokens / 1e6 * price.cacheReadPerM + stat.cacheWriteTokens / 1e6 * price.cacheWritePerM;
		}
		function loadPrices() {
			try {
				const raw = window.localStorage.getItem(PRICES_KEY);
				if (raw !== null) {
					const parsed = JSON.parse(raw);
					if (typeof parsed === "object" && parsed !== null) return parsed;
				}
			} catch {}
			return { ...DEFAULT_PRICES };
		}
		function savePrices(prices) {
			try {
				window.localStorage.setItem(PRICES_KEY, JSON.stringify(prices));
			} catch {}
		}
		/**
		* The settings-sidebar section: full-page stats view. Loads on mount.
		* @param props - section owner props (the shell supplies `close`).
		*/
		function StatsPanelSection(_props) {
			const [stats, setStats] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const load = (0, react.useCallback)(async () => {
				setLoading(true);
				setError(null);
				try {
					const response = await fetch(SUMMARY_URL);
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					const body = await response.json();
					setStats(body);
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
					setStats(null);
				} finally {
					setLoading(false);
				}
			}, []);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			if (loading && stats === null) return (0, react_jsx_runtime.jsx)("div", {
				style: styles.page,
				children: (0, react_jsx_runtime.jsx)("p", {
					style: styles.muted,
					children: "加载统计中…"
				})
			});
			if (error !== null) return (0, react_jsx_runtime.jsxs)("div", {
				style: styles.page,
				children: [(0, react_jsx_runtime.jsxs)("div", {
					style: styles.pageHead,
					children: [(0, react_jsx_runtime.jsx)("span", {
						style: styles.pageTitle,
						children: "Token 使用统计"
					}), (0, react_jsx_runtime.jsx)("span", {
						style: styles.pageSub,
						children: "模型用量 · Token 消耗 · 缓存命中率 · 费用估算（人民币）"
					})]
				}), (0, react_jsx_runtime.jsxs)("p", {
					style: styles.error,
					role: "status",
					children: [
						"无法加载统计数据：",
						error,
						"。请确认 dsh 服务运行正常后重试。",
						(0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: styles.retry,
							onClick: () => {
								load();
							},
							children: "重试"
						})
					]
				})]
			});
			return (0, react_jsx_runtime.jsxs)("div", {
				style: styles.page,
				children: [(0, react_jsx_runtime.jsxs)("div", {
					style: styles.pageHead,
					children: [(0, react_jsx_runtime.jsx)("span", {
						style: styles.pageTitle,
						children: "Token 使用统计"
					}), (0, react_jsx_runtime.jsx)("span", {
						style: styles.pageSub,
						children: "模型用量 · Token 消耗 · 缓存命中率 · 费用估算（人民币）"
					})]
				}), stats !== null ? (0, react_jsx_runtime.jsx)(StatsPage, { stats }) : null]
			});
		}
		function StatsPage({ stats }) {
			const [prices, setPrices] = (0, react.useState)(() => loadPrices());
			const [editing, setEditing] = (0, react.useState)(false);
			const [draft, setDraft] = (0, react.useState)(() => loadPrices());
			const applyDraft = () => {
				setPrices(draft);
				savePrices(draft);
				setEditing(false);
			};
			const totalCost = stats.modelStats.reduce((sum, m) => sum + modelCost(m, prices[m.model]), 0);
			const unconfigured = stats.modelStats.filter((m) => prices[m.model] === void 0);
			return (0, react_jsx_runtime.jsxs)("div", { children: [
				(0, react_jsx_runtime.jsxs)("div", {
					style: styles.grid,
					children: [
						(0, react_jsx_runtime.jsx)(OverviewCard, {
							label: "总调用次数",
							value: String(stats.totalCalls)
						}),
						(0, react_jsx_runtime.jsx)(OverviewCard, {
							label: "总 Token 消耗",
							value: formatTokens(stats.totalTokens),
							sub: "输入 + 输出 + 缓存"
						}),
						(0, react_jsx_runtime.jsx)(OverviewCard, {
							label: "输入 Token",
							value: formatTokens(stats.totalInputTokens),
							sub: pct(stats.totalInputTokens, stats.totalTokens)
						}),
						(0, react_jsx_runtime.jsx)(OverviewCard, {
							label: "输出 Token",
							value: formatTokens(stats.totalOutputTokens),
							sub: pct(stats.totalOutputTokens, stats.totalTokens)
						}),
						(0, react_jsx_runtime.jsx)(OverviewCard, {
							label: "缓存命中率",
							value: `${stats.cacheHitRate.toFixed(1)}%`,
							sub: `读 ${formatTokens(stats.totalCacheReadTokens)} / 写 ${formatTokens(stats.totalCacheWriteTokens)}`
						}),
						(0, react_jsx_runtime.jsx)(OverviewCard, {
							label: "估算费用",
							value: formatCny(totalCost),
							sub: unconfigured.length > 0 ? `${unconfigured.length} 个模型价格待配置` : "按价格表计算"
						})
					]
				}),
				(0, react_jsx_runtime.jsxs)("div", {
					style: styles.section,
					children: [
						(0, react_jsx_runtime.jsxs)("div", {
							style: styles.sectionHead,
							children: [(0, react_jsx_runtime.jsx)("span", {
								style: styles.sectionTitle,
								children: "模型价格（人民币，元 / 1M tokens）"
							}), editing ? (0, react_jsx_runtime.jsxs)("span", { children: [(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: styles.smallButton,
								onClick: () => {
									setDraft(prices);
									setEditing(false);
								},
								children: "取消"
							}), (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: styles.smallButtonPrimary,
								onClick: applyDraft,
								children: "保存"
							})] }) : (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: styles.smallButton,
								onClick: () => {
									setDraft(prices);
									setEditing(true);
								},
								children: "编辑"
							})]
						}),
						(0, react_jsx_runtime.jsxs)("p", {
							style: styles.hint,
							children: [
								"默认价格为 DeepSeek 官方人民币定价（高峰时段，2026-08-16 生效；空闲时段为高峰价一半，来源：",
								(0, react_jsx_runtime.jsx)("a", {
									href: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing",
									target: "_blank",
									rel: "noreferrer",
									style: styles.link,
									children: "api-docs.deepseek.com"
								}),
								"）。 其他模型默认 ¥0，可按实际渠道价格自行填写；未配置价格的模型不计入费用。\\n          套餐渠道（OpenCode Go / MiMo / OpenAI / Anthropic）的模型建议将价格设为 0，避免与套餐额度重复计费。"
							]
						}),
						editing ? (0, react_jsx_runtime.jsx)(PriceEditor, {
							prices: draft,
							onChange: setDraft,
							models: stats.modelStats.map((m) => m.model)
						}) : (0, react_jsx_runtime.jsx)(PriceTable, {
							rows: stats.modelStats.map((m) => m.model),
							prices
						})
					]
				}),
				(0, react_jsx_runtime.jsxs)("div", {
					style: styles.section,
					children: [(0, react_jsx_runtime.jsx)("div", {
						style: styles.sectionHead,
						children: (0, react_jsx_runtime.jsx)("span", {
							style: styles.sectionTitle,
							children: "渠道余量 / 余额"
						})
					}), (0, react_jsx_runtime.jsx)(ChannelBalances, {})]
				}),
				stats.channelStats.length > 0 ? (0, react_jsx_runtime.jsxs)("div", {
					style: styles.section,
					children: [(0, react_jsx_runtime.jsx)("div", {
						style: styles.sectionTitle,
						children: "渠道统计"
					}), (0, react_jsx_runtime.jsx)(ChannelTable, { data: stats.channelStats })]
				}) : null,
				stats.dailyStats.length > 0 ? (0, react_jsx_runtime.jsxs)("div", {
					style: styles.section,
					children: [(0, react_jsx_runtime.jsx)("div", {
						style: styles.sectionTitle,
						children: "每日 Token 消耗"
					}), (0, react_jsx_runtime.jsx)(DailyChart, { data: stats.dailyStats })]
				}) : null,
				stats.modelStats.length > 0 ? (0, react_jsx_runtime.jsxs)("div", {
					style: styles.section,
					children: [(0, react_jsx_runtime.jsx)("div", {
						style: styles.sectionTitle,
						children: "模型使用分布"
					}), (0, react_jsx_runtime.jsxs)("div", {
						style: styles.pieRow,
						children: [(0, react_jsx_runtime.jsx)(ModelPie, { data: stats.modelStats }), (0, react_jsx_runtime.jsx)(ModelTable, {
							data: stats.modelStats,
							prices
						})]
					})]
				}) : null,
				stats.recentRecords.length > 0 ? (0, react_jsx_runtime.jsxs)("div", {
					style: styles.section,
					children: [(0, react_jsx_runtime.jsx)("div", {
						style: styles.sectionTitle,
						children: "最近调用记录"
					}), (0, react_jsx_runtime.jsx)(RecordsTable, {
						data: stats.recentRecords,
						prices
					})]
				}) : null
			] });
		}
		function pct(part, total) {
			if (total <= 0) return "";
			return `${(part / total * 100).toFixed(1)}%`;
		}
		/** Format a millisecond span as "X天 X小时 X分钟" (omitting empty units). */
		function formatDuration(ms) {
			if (ms <= 0) return "已过期";
			const totalMinutes = Math.floor(ms / 6e4);
			const days = Math.floor(totalMinutes / 1440);
			const hours = Math.floor(totalMinutes % 1440 / 60);
			const minutes = totalMinutes % 60;
			const parts = [];
			if (days > 0) parts.push(`${days}天`);
			if (hours > 0) parts.push(`${hours}小时`);
			if (minutes > 0 && days === 0) parts.push(`${minutes}分钟`);
			return parts.length > 0 ? parts.join(" ") : `${totalMinutes}分钟`;
		}
		/** Manual quota storage (mimo Token Plan and other plan channels without a public API). */
		function loadManualQuota() {
			try {
				const raw = window.localStorage.getItem(MANUAL_QUOTA_KEY);
				if (raw !== null) {
					const parsed = JSON.parse(raw);
					if (typeof parsed === "object" && parsed !== null) return parsed;
				}
			} catch {}
			return {};
		}
		/**
		* Channel account statuses: auto-fetched balances/quotas plus manual entries
		* for channels without a public API. Renders inline status rows.
		*/
		function ChannelBalances() {
			const [balances, setBalances] = (0, react.useState)([]);
			const [loading, setLoading] = (0, react.useState)(false);
			const [manual, setManual] = (0, react.useState)(() => loadManualQuota());
			const [editing, setEditing] = (0, react.useState)(null);
			const [draftNote, setDraftNote] = (0, react.useState)("");
			const load = (0, react.useCallback)(async () => {
				setLoading(true);
				try {
					const response = await fetch(BALANCES_URL);
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					const body = await response.json();
					setBalances(body.balances ?? []);
				} catch (e) {
					setBalances([{
						channel: "error",
						kind: "manual",
						displayName: "查询失败",
						error: e instanceof Error ? e.message : String(e)
					}]);
				} finally {
					setLoading(false);
				}
			}, []);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			const saveManual = (channel) => {
				const next = {
					...manual,
					[channel]: draftNote.trim()
				};
				setManual(next);
				try {
					window.localStorage.setItem(MANUAL_QUOTA_KEY, JSON.stringify(next));
				} catch {}
				setEditing(null);
			};
			const rows = [...balances];
			const manualNames = new Set(balances.filter((b) => b.kind === "manual").map((b) => b.channel));
			for (const channel of Object.keys(manual)) manualNames.add(channel);
			for (const channel of manualNames) {
				if (balances.some((b) => b.channel === channel)) continue;
				rows.push({
					channel,
					kind: "manual",
					displayName: channelName(channel),
					note: manual[channel]
				});
			}
			if (rows.length === 0 && !loading) rows.push({
				channel: "none",
				kind: "manual",
				displayName: "未发现渠道",
				note: "请先配置模型渠道（设置 → 模型）"
			});
			return (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsxs)("div", {
				style: styles.balanceActions,
				children: [loading ? (0, react_jsx_runtime.jsx)("span", {
					style: styles.mutedInline,
					children: "查询中…"
				}) : null, (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					style: styles.smallButton,
					onClick: () => {
						load();
					},
					disabled: loading,
					children: "刷新"
				})]
			}), (0, react_jsx_runtime.jsx)("div", {
				style: styles.balanceGrid,
				children: rows.map((row) => (0, react_jsx_runtime.jsxs)("div", {
					style: styles.balanceCard,
					children: [(0, react_jsx_runtime.jsx)("div", {
						style: styles.balanceName,
						children: row.displayName
					}), row.error !== void 0 ? (0, react_jsx_runtime.jsx)("div", {
						style: styles.balanceError,
						children: row.error
					}) : row.kind === "balance" ? (0, react_jsx_runtime.jsxs)("div", {
						style: styles.balanceValue,
						children: [
							row.currency === "CNY" ? "¥" : row.currency === "USD" ? "$" : "",
							row.balance ?? "—",
							row.fetchedAt !== void 0 ? (0, react_jsx_runtime.jsxs)("span", {
								style: styles.mutedInline,
								children: [" · ", new Date(row.fetchedAt).toLocaleTimeString()]
							}) : null
						]
					}) : row.kind === "plan" && row.quota !== void 0 ? (0, react_jsx_runtime.jsx)("div", { children: row.quota.map((q) => {
						const remainingMs = q.resetsAt !== "" ? new Date(q.resetsAt).getTime() - Date.now() : 0;
						return (0, react_jsx_runtime.jsxs)("div", {
							style: styles.quotaRow,
							title: `重置于 ${q.resetsAt}`,
							children: [
								(0, react_jsx_runtime.jsx)("span", {
									style: styles.quotaLabel,
									children: q.label
								}),
								(0, react_jsx_runtime.jsx)("span", {
									style: styles.quotaBar,
									children: (0, react_jsx_runtime.jsx)("span", { style: {
										...styles.quotaFill,
										width: `${Math.min(100, Math.max(0, q.percent))}%`
									} })
								}),
								(0, react_jsx_runtime.jsxs)("span", {
									style: styles.quotaText,
									children: [
										"已用 ",
										q.percent,
										"% · 剩余 ",
										q.resetsAt !== "" ? formatDuration(remainingMs) : "—"
									]
								})
							]
						}, q.label);
					}) }) : row.kind === "plan" && row.usage !== void 0 ? (0, react_jsx_runtime.jsx)("div", { children: row.usage.map((u) => (0, react_jsx_runtime.jsxs)("div", {
						style: styles.usageRow,
						children: [(0, react_jsx_runtime.jsx)("span", {
							style: styles.quotaLabel,
							children: u.label
						}), (0, react_jsx_runtime.jsxs)("span", {
							style: styles.usageText,
							children: [
								"输入 ",
								formatTokens(u.inputTokens),
								" · 输出 ",
								formatTokens(u.outputTokens),
								" · 合计 ",
								formatTokens(u.inputTokens + u.outputTokens)
							]
						})]
					}, u.label)) }) : row.kind === "manual" ? (0, react_jsx_runtime.jsxs)("div", { children: [editing === row.channel ? (0, react_jsx_runtime.jsxs)("span", {
						style: styles.manualEdit,
						children: [
							(0, react_jsx_runtime.jsx)("input", {
								style: styles.input,
								type: "text",
								placeholder: "如：剩余 18天 3小时 或 4100M Credits",
								value: draftNote,
								onChange: (e) => {
									setDraftNote(e.target.value);
								}
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: styles.smallButtonPrimary,
								onClick: () => {
									saveManual(row.channel);
								},
								children: "保存"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: styles.smallButton,
								onClick: () => {
									setEditing(null);
								},
								children: "取消"
							})
						]
					}) : (0, react_jsx_runtime.jsxs)("span", { children: [(0, react_jsx_runtime.jsx)("span", {
						style: styles.balanceValue,
						children: row.note !== void 0 ? row.note : "待配置"
					}), (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: styles.smallButton,
						onClick: () => {
							setDraftNote(row.note ?? "");
							setEditing(row.channel);
						},
						children: row.note !== void 0 ? "修改" : "配置"
					})] }), (0, react_jsx_runtime.jsx)("div", {
						style: styles.mutedInline,
						children: "无公开查询 API，请到平台控制台查看后填写"
					})] }) : null]
				}, row.channel))
			})] });
		}
		/** Per-channel token usage table. */
		function ChannelTable({ data }) {
			const sorted = [...data].sort((a, b) => b.totalTokens - a.totalTokens);
			return (0, react_jsx_runtime.jsx)("div", {
				style: styles.tableScroll,
				children: (0, react_jsx_runtime.jsxs)("table", {
					style: styles.table,
					children: [(0, react_jsx_runtime.jsx)("thead", { children: (0, react_jsx_runtime.jsxs)("tr", { children: [
						(0, react_jsx_runtime.jsx)("th", {
							style: styles.th,
							children: "渠道"
						}),
						(0, react_jsx_runtime.jsx)("th", {
							style: styles.th,
							children: "调用"
						}),
						(0, react_jsx_runtime.jsx)("th", {
							style: styles.th,
							children: "输入"
						}),
						(0, react_jsx_runtime.jsx)("th", {
							style: styles.th,
							children: "输出"
						}),
						(0, react_jsx_runtime.jsx)("th", {
							style: styles.th,
							children: "缓存"
						}),
						(0, react_jsx_runtime.jsx)("th", {
							style: styles.th,
							children: "总 Token"
						})
					] }) }), (0, react_jsx_runtime.jsx)("tbody", { children: sorted.map((c) => (0, react_jsx_runtime.jsxs)("tr", { children: [
						(0, react_jsx_runtime.jsxs)("td", {
							style: styles.td,
							children: [(0, react_jsx_runtime.jsx)("div", {
								style: styles.channelCellName,
								children: channelName(c.channel)
							}), (0, react_jsx_runtime.jsx)("div", {
								style: styles.channelCellModels,
								title: c.models.join(", "),
								children: c.models.join(", ")
							})]
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							children: c.calls
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							children: formatTokens(c.inputTokens)
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							children: formatTokens(c.outputTokens)
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							children: formatTokens(c.cacheReadTokens + c.cacheWriteTokens)
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							children: formatTokens(c.totalTokens)
						})
					] }, c.channel)) })]
				})
			});
		}
		function OverviewCard({ label, value, sub }) {
			return (0, react_jsx_runtime.jsxs)("div", {
				style: styles.overviewCard,
				children: [
					(0, react_jsx_runtime.jsx)("div", {
						style: styles.overviewLabel,
						children: label
					}),
					(0, react_jsx_runtime.jsx)("div", {
						style: styles.overviewValue,
						children: value
					}),
					sub !== void 0 && sub !== "" ? (0, react_jsx_runtime.jsx)("div", {
						style: styles.overviewSub,
						children: sub
					}) : null
				]
			});
		}
		function DailyChart({ data }) {
			const days = data.slice(-14);
			const max = Math.max(...days.map((d) => d.totalTokens), 1);
			return (0, react_jsx_runtime.jsx)("div", {
				style: styles.barRow,
				children: days.map((day, i) => (0, react_jsx_runtime.jsxs)("div", {
					style: styles.barCol,
					title: `${day.date}: ${formatTokens(day.totalTokens)} tokens`,
					children: [(0, react_jsx_runtime.jsx)("div", { style: {
						...styles.bar,
						height: `${Math.max(4, day.totalTokens / max * 140)}px`
					} }), (0, react_jsx_runtime.jsx)("div", {
						style: styles.barLabel,
						children: formatDate(day.date)
					})]
				}, day.date))
			});
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
				const startRad = start * Math.PI / 180;
				const endRad = end * Math.PI / 180;
				const x1 = 16 + 16 * Math.cos(startRad);
				const y1 = 16 + 16 * Math.sin(startRad);
				const x2 = 16 + 16 * Math.cos(endRad);
				const y2 = 16 + 16 * Math.sin(endRad);
				const large = pct > .5 ? 1 : 0;
				arcs.push((0, react_jsx_runtime.jsx)("path", {
					d: `M16 16 L${x1.toFixed(3)} ${y1.toFixed(3)} A16 16 0 ${large} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`,
					fill: CHART_COLORS[i % CHART_COLORS.length],
					stroke: "#1a1a1a",
					strokeWidth: .5
				}, i));
				angle = end;
			}
			return (0, react_jsx_runtime.jsxs)("div", {
				style: styles.pieBlock,
				children: [(0, react_jsx_runtime.jsx)("svg", {
					viewBox: "0 0 32 32",
					width: 150,
					height: 150,
					children: arcs
				}), (0, react_jsx_runtime.jsx)("div", {
					style: styles.legend,
					children: top.map((m, i) => (0, react_jsx_runtime.jsxs)("div", {
						style: styles.legendRow,
						children: [
							(0, react_jsx_runtime.jsx)("span", { style: {
								...styles.legendDot,
								background: CHART_COLORS[i % CHART_COLORS.length]
							} }),
							(0, react_jsx_runtime.jsx)("span", {
								style: styles.legendModel,
								title: m.model,
								children: m.model
							}),
							(0, react_jsx_runtime.jsx)("span", {
								style: styles.legendPct,
								children: total > 0 ? `${(m.totalTokens / total * 100).toFixed(1)}%` : "0%"
							})
						]
					}, m.model))
				})]
			});
		}
		function ModelTable({ data, prices }) {
			const sorted = [...data].sort((a, b) => b.totalTokens - a.totalTokens);
			return (0, react_jsx_runtime.jsx)("div", {
				style: styles.tableScroll,
				children: (0, react_jsx_runtime.jsxs)("table", {
					style: styles.table,
					children: [(0, react_jsx_runtime.jsx)("thead", { children: (0, react_jsx_runtime.jsxs)("tr", { children: [
						(0, react_jsx_runtime.jsx)("th", {
							style: styles.th,
							children: "模型"
						}),
						(0, react_jsx_runtime.jsx)("th", {
							style: styles.th,
							children: "调用"
						}),
						(0, react_jsx_runtime.jsx)("th", {
							style: styles.th,
							children: "输入"
						}),
						(0, react_jsx_runtime.jsx)("th", {
							style: styles.th,
							children: "输出"
						}),
						(0, react_jsx_runtime.jsx)("th", {
							style: styles.th,
							children: "缓存读"
						}),
						(0, react_jsx_runtime.jsx)("th", {
							style: styles.th,
							children: "缓存写"
						}),
						(0, react_jsx_runtime.jsx)("th", {
							style: styles.th,
							children: "总 Token"
						}),
						(0, react_jsx_runtime.jsx)("th", {
							style: styles.th,
							children: "费用"
						})
					] }) }), (0, react_jsx_runtime.jsx)("tbody", { children: sorted.map((m) => (0, react_jsx_runtime.jsxs)("tr", { children: [
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							title: m.model,
							children: m.model
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							children: m.calls
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							children: formatTokens(m.inputTokens)
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							children: formatTokens(m.outputTokens)
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							children: formatTokens(m.cacheReadTokens)
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							children: formatTokens(m.cacheWriteTokens)
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							children: formatTokens(m.totalTokens)
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							children: formatCny(modelCost(m, prices[m.model]))
						})
					] }, m.model)) })]
				})
			});
		}
		function RecordsTable({ data, prices }) {
			return (0, react_jsx_runtime.jsx)("div", {
				style: styles.tableScroll,
				children: (0, react_jsx_runtime.jsx)("div", {
					style: {
						maxHeight: 320,
						overflow: "auto"
					},
					children: (0, react_jsx_runtime.jsxs)("table", {
						style: styles.table,
						children: [(0, react_jsx_runtime.jsx)("thead", { children: (0, react_jsx_runtime.jsxs)("tr", { children: [
							(0, react_jsx_runtime.jsx)("th", {
								style: styles.th,
								children: "时间"
							}),
							(0, react_jsx_runtime.jsx)("th", {
								style: styles.th,
								children: "模型"
							}),
							(0, react_jsx_runtime.jsx)("th", {
								style: styles.th,
								children: "输入"
							}),
							(0, react_jsx_runtime.jsx)("th", {
								style: styles.th,
								children: "输出"
							}),
							(0, react_jsx_runtime.jsx)("th", {
								style: styles.th,
								children: "缓存"
							}),
							(0, react_jsx_runtime.jsx)("th", {
								style: styles.th,
								children: "总 Token"
							}),
							(0, react_jsx_runtime.jsx)("th", {
								style: styles.th,
								children: "费用"
							})
						] }) }), (0, react_jsx_runtime.jsx)("tbody", { children: data.slice(0, 100).map((r, i) => (0, react_jsx_runtime.jsxs)("tr", { children: [
							(0, react_jsx_runtime.jsx)("td", {
								style: styles.td,
								children: new Date(r.ts).toLocaleString()
							}),
							(0, react_jsx_runtime.jsx)("td", {
								style: styles.td,
								title: r.model,
								children: r.model
							}),
							(0, react_jsx_runtime.jsx)("td", {
								style: styles.td,
								children: formatTokens(r.inputTokens)
							}),
							(0, react_jsx_runtime.jsx)("td", {
								style: styles.td,
								children: formatTokens(r.outputTokens)
							}),
							(0, react_jsx_runtime.jsx)("td", {
								style: styles.td,
								children: formatTokens(r.cacheReadTokens + r.cacheWriteTokens)
							}),
							(0, react_jsx_runtime.jsx)("td", {
								style: styles.td,
								children: formatTokens(r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens)
							}),
							(0, react_jsx_runtime.jsx)("td", {
								style: styles.td,
								children: formatCny(modelCost({
									model: r.model,
									calls: 1,
									inputTokens: r.inputTokens,
									outputTokens: r.outputTokens,
									cacheReadTokens: r.cacheReadTokens,
									cacheWriteTokens: r.cacheWriteTokens,
									reasoningTokens: r.reasoningTokens,
									totalTokens: r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens
								}, prices[r.model]))
							})
						] }, `${r.sessionId}-${i}`)) })]
					})
				})
			});
		}
		function PriceTable({ rows, prices }) {
			if (rows.length === 0) return (0, react_jsx_runtime.jsx)("p", {
				style: styles.muted,
				children: "暂无模型数据"
			});
			return (0, react_jsx_runtime.jsxs)("table", {
				style: styles.table,
				children: [(0, react_jsx_runtime.jsx)("thead", { children: (0, react_jsx_runtime.jsxs)("tr", { children: [
					(0, react_jsx_runtime.jsx)("th", {
						style: styles.th,
						children: "模型"
					}),
					(0, react_jsx_runtime.jsx)("th", {
						style: styles.th,
						children: "输入 元/1M"
					}),
					(0, react_jsx_runtime.jsx)("th", {
						style: styles.th,
						children: "输出 元/1M"
					}),
					(0, react_jsx_runtime.jsx)("th", {
						style: styles.th,
						children: "缓存命中 元/1M"
					}),
					(0, react_jsx_runtime.jsx)("th", {
						style: styles.th,
						children: "缓存写入 元/1M"
					})
				] }) }), (0, react_jsx_runtime.jsx)("tbody", { children: rows.map((model) => {
					const p = prices[model];
					return (0, react_jsx_runtime.jsxs)("tr", { children: [(0, react_jsx_runtime.jsx)("td", {
						style: styles.td,
						title: model,
						children: model
					}), p === void 0 ? (0, react_jsx_runtime.jsx)("td", {
						style: styles.td,
						colSpan: 4,
						children: (0, react_jsx_runtime.jsx)("span", {
							style: styles.pending,
							children: "价格待配置（不计入费用）"
						})
					}) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							children: p.inputPerM
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							children: p.outputPerM
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							children: p.cacheReadPerM
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							children: p.cacheWritePerM
						})
					] })] }, model);
				}) })]
			});
		}
		function PriceEditor({ prices, onChange, models }) {
			const set = (model, field, value) => {
				const num = Number(value);
				const next = { ...prices };
				next[model] = {
					...next[model] ?? {
						inputPerM: 0,
						outputPerM: 0,
						cacheReadPerM: 0,
						cacheWritePerM: 0
					},
					[field]: Number.isFinite(num) ? num : 0
				};
				onChange(next);
			};
			return (0, react_jsx_runtime.jsxs)("table", {
				style: styles.table,
				children: [(0, react_jsx_runtime.jsx)("thead", { children: (0, react_jsx_runtime.jsxs)("tr", { children: [
					(0, react_jsx_runtime.jsx)("th", {
						style: styles.th,
						children: "模型"
					}),
					(0, react_jsx_runtime.jsx)("th", {
						style: styles.th,
						children: "输入 元/1M"
					}),
					(0, react_jsx_runtime.jsx)("th", {
						style: styles.th,
						children: "输出 元/1M"
					}),
					(0, react_jsx_runtime.jsx)("th", {
						style: styles.th,
						children: "缓存命中 元/1M"
					}),
					(0, react_jsx_runtime.jsx)("th", {
						style: styles.th,
						children: "缓存写入 元/1M"
					})
				] }) }), (0, react_jsx_runtime.jsx)("tbody", { children: models.map((model) => {
					const p = prices[model] ?? {
						inputPerM: 0,
						outputPerM: 0,
						cacheReadPerM: 0,
						cacheWritePerM: 0
					};
					return (0, react_jsx_runtime.jsxs)("tr", { children: [
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							title: model,
							children: model
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							children: (0, react_jsx_runtime.jsx)("input", {
								style: styles.input,
								type: "number",
								step: "0.001",
								min: "0",
								value: p.inputPerM,
								onChange: (e) => set(model, "inputPerM", e.target.value)
							})
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							children: (0, react_jsx_runtime.jsx)("input", {
								style: styles.input,
								type: "number",
								step: "0.001",
								min: "0",
								value: p.outputPerM,
								onChange: (e) => set(model, "outputPerM", e.target.value)
							})
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							children: (0, react_jsx_runtime.jsx)("input", {
								style: styles.input,
								type: "number",
								step: "0.001",
								min: "0",
								value: p.cacheReadPerM,
								onChange: (e) => set(model, "cacheReadPerM", e.target.value)
							})
						}),
						(0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							children: (0, react_jsx_runtime.jsx)("input", {
								style: styles.input,
								type: "number",
								step: "0.001",
								min: "0",
								value: p.cacheWritePerM,
								onChange: (e) => set(model, "cacheWritePerM", e.target.value)
							})
						})
					] }, model);
				}) })]
			});
		}
		const styles = {
			page: { padding: "4px 0 16px" },
			pageHead: { marginBottom: 14 },
			pageTitle: {
				fontSize: 18,
				fontWeight: 700,
				color: "var(--ds-text, #fff)"
			},
			pageSub: {
				display: "block",
				fontSize: 12,
				color: "var(--ds-text-secondary, #999)",
				marginTop: 4
			},
			grid: {
				display: "grid",
				gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
				gap: 10,
				margin: "12px 0"
			},
			overviewCard: {
				background: "var(--ds-card-bg, #1a1a1a)",
				border: "1px solid var(--ds-border, #333)",
				borderRadius: 8,
				padding: "10px 12px"
			},
			overviewLabel: {
				fontSize: 11,
				color: "var(--ds-text-secondary, #999)",
				textTransform: "uppercase",
				letterSpacing: .4
			},
			overviewValue: {
				fontSize: 20,
				fontWeight: 700,
				marginTop: 4,
				color: "var(--ds-text, #fff)"
			},
			overviewSub: {
				fontSize: 11,
				color: "var(--ds-text-secondary, #999)",
				marginTop: 2
			},
			section: {
				background: "var(--ds-card-bg, #1a1a1a)",
				border: "1px solid var(--ds-border, #333)",
				borderRadius: 8,
				padding: 12,
				marginTop: 12
			},
			sectionHead: {
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: 8
			},
			sectionTitle: {
				fontSize: 13,
				fontWeight: 600,
				color: "var(--ds-text, #fff)"
			},
			hint: {
				fontSize: 11,
				color: "var(--ds-text-secondary, #999)",
				margin: "6px 0"
			},
			link: { color: "var(--ds-primary, #4a9eff)" },
			muted: {
				fontSize: 12,
				color: "var(--ds-text-secondary, #999)",
				margin: "8px 0"
			},
			error: {
				fontSize: 12,
				color: "#ff6b6b",
				margin: "8px 0"
			},
			retry: {
				marginLeft: 8,
				padding: "2px 10px",
				borderRadius: 4,
				border: "1px solid #555",
				background: "transparent",
				color: "inherit",
				cursor: "pointer",
				fontSize: 12
			},
			smallButton: {
				padding: "3px 10px",
				borderRadius: 4,
				border: "1px solid #555",
				background: "transparent",
				color: "var(--ds-text, #eee)",
				cursor: "pointer",
				fontSize: 12
			},
			smallButtonPrimary: {
				padding: "3px 10px",
				borderRadius: 4,
				border: "1px solid var(--ds-primary, #4a9eff)",
				background: "var(--ds-primary, #4a9eff)",
				color: "#fff",
				cursor: "pointer",
				fontSize: 12,
				marginLeft: 6
			},
			barRow: {
				display: "flex",
				gap: 4,
				alignItems: "flex-end",
				height: 170,
				paddingTop: 8
			},
			barCol: {
				flex: 1,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: 4,
				minWidth: 0
			},
			bar: {
				width: "100%",
				background: "linear-gradient(to top, #4a9eff, #6bb5ff)",
				borderRadius: "4px 4px 0 0",
				transition: "height 0.3s ease"
			},
			barLabel: {
				fontSize: 10,
				color: "var(--ds-text-secondary, #999)",
				whiteSpace: "nowrap"
			},
			pieRow: {
				display: "flex",
				gap: 16,
				alignItems: "center",
				flexWrap: "wrap"
			},
			pieBlock: {
				display: "flex",
				gap: 12,
				alignItems: "center"
			},
			legend: {
				display: "flex",
				flexDirection: "column",
				gap: 4,
				minWidth: 140
			},
			legendRow: {
				display: "flex",
				alignItems: "center",
				gap: 6,
				fontSize: 12
			},
			legendDot: {
				width: 10,
				height: 10,
				borderRadius: 2,
				flexShrink: 0
			},
			legendModel: {
				color: "var(--ds-text, #fff)",
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
				maxWidth: 140
			},
			legendPct: {
				color: "var(--ds-text-secondary, #999)",
				marginLeft: "auto"
			},
			table: {
				width: "100%",
				borderCollapse: "collapse",
				fontSize: 12,
				marginTop: 8
			},
			th: {
				padding: "6px 8px",
				textAlign: "left",
				borderBottom: "1px solid var(--ds-border, #333)",
				color: "var(--ds-text-secondary, #999)",
				fontWeight: 500,
				whiteSpace: "nowrap"
			},
			td: {
				padding: "6px 8px",
				borderBottom: "1px solid var(--ds-border, #333)",
				color: "var(--ds-text, #eee)",
				maxWidth: 180,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap"
			},
			tableScroll: {
				overflowX: "auto",
				maxWidth: "100%"
			},
			channelCellName: {
				fontSize: 12,
				fontWeight: 600,
				color: "var(--ds-text, #fff)"
			},
			channelCellModels: {
				fontSize: 11,
				color: "var(--ds-text-secondary, #999)",
				maxWidth: 170,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap"
			},
			pending: {
				color: "#ffd43b",
				fontSize: 11
			},
			input: {
				width: 84,
				padding: "2px 6px",
				borderRadius: 4,
				border: "1px solid #555",
				background: "var(--ds-card-bg, #111)",
				color: "var(--ds-text, #fff)",
				fontSize: 12
			},
			balanceActions: {
				display: "flex",
				gap: 8,
				alignItems: "center",
				justifyContent: "flex-end",
				marginBottom: 8
			},
			balanceGrid: {
				display: "grid",
				gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
				gap: 10,
				width: "100%"
			},
			balanceCard: {
				background: "var(--ds-card-bg, #151515)",
				border: "1px solid var(--ds-border, #333)",
				borderRadius: 8,
				padding: "10px 12px"
			},
			balanceName: {
				fontSize: 12,
				fontWeight: 600,
				color: "var(--ds-text, #fff)",
				marginBottom: 6
			},
			balanceValue: {
				fontSize: 16,
				fontWeight: 700,
				color: "var(--ds-text, #fff)"
			},
			balanceError: {
				fontSize: 12,
				color: "#ff6b6b"
			},
			mutedInline: {
				fontSize: 11,
				color: "var(--ds-text-secondary, #999)"
			},
			quotaRow: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				fontSize: 12,
				margin: "4px 0"
			},
			quotaLabel: {
				flexShrink: 0,
				color: "var(--ds-text-secondary, #999)",
				width: 32
			},
			quotaBar: {
				flex: 1,
				height: 6,
				borderRadius: 3,
				background: "var(--ds-border, #333)",
				overflow: "hidden"
			},
			quotaFill: {
				display: "block",
				height: "100%",
				background: "var(--ds-primary, #4a9eff)"
			},
			quotaText: {
				flexShrink: 0,
				color: "var(--ds-text, #eee)",
				fontSize: 11
			},
			usageRow: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				fontSize: 12,
				margin: "4px 0"
			},
			usageText: {
				color: "var(--ds-text, #eee)",
				fontSize: 11
			},
			manualEdit: {
				display: "flex",
				gap: 6,
				alignItems: "center",
				flexWrap: "wrap"
			}
		};
		//#endregion
		//#region lib/types/client/index.js
		/** Required services (fiber inject waiting — the runtime must be up first). */
		const inject = ["slots"];
		/**
		* Mount the stats-panel settings section.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "stats-panel",
				order: 30,
				label: () => "Token 使用统计"
			}, StatsPanelSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map