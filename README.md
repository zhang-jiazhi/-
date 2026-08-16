# DSH Token 使用统计（dsh-stats-panel）

DeepSeek Harness (DSH) 的 Token 用量统计面板：模型用量、Token 消耗、缓存命中率、按渠道统计、渠道余额/套餐余量、费用估算（人民币）。集成在设置页侧边菜单（「Token 使用统计」），类似 NewAPI 的统计界面。

## 功能

- **总览卡片**：总调用次数、总 Token、输入/输出 Token、缓存命中率、估算费用（人民币）
- **渠道统计**：按渠道（provider）聚合调用次数与 Token 消耗 —— 自动识别 DeepSeek 官方、OpenCode Go、MiMo、OpenAI、Anthropic、Kimi、硅基流动、阶跃星辰、OpenRouter、Novita 等
- **渠道余额 / 套餐余量**：
  - 自动查询（余额类）：DeepSeek 官方（`/user/balance`）、Kimi 月之暗面（`/v1/users/me/balance`）、硅基流动（`/v1/user/info`）、阶跃星辰（`/v1/accounts`）、OpenRouter（`/api/v1/credits`）、Novita AI（`/v3/user/balance`）
  - 自动查询（用量类）：OpenCode Go（`/zen/go/v1/usage`，滚动/7天/30天配额）、OpenAI（`/v1/usage`，5小时/7天/30天用量）、Anthropic（`/v1/organizations/usage/costs`，同上）
  - 无公开 API 的渠道（MiMo Token Plan 等）：手动填写（存 localStorage）
- **模型统计**：各模型调用/输入/输出/缓存/总 Token/费用
- **可视化**：每日 Token 柱状图、模型占比饼图、最近调用记录
- **费用估算**：可编辑的模型价格表（人民币，元/1M tokens），默认内置 DeepSeek 官方峰谷价（2026-08-16 生效），其他模型可自行填写

## 安装

### 方式一：本地安装（开发）
```bash
cd ~/.dsh/local-plugins
git clone https://github.com/zhang-jiazhi/-.git
cd dsh-stats-panel && pnpm install
# 构建（需按 DSH 官方 clientBundle 流程）
./node_modules/.bin/tsc -p tsconfig.build.json
./node_modules/.bin/tsdown --env.DSH_BUILD_FACE=client
```

### 方式二：作为 profile 依赖
在 `~/.dsh/profiles/web/package.json` 的 `dependencies` 添加：
```json
"@linxin666/dsh-stats-panel": "<git 或 npm 地址>"
```
并加入 `dsh.profile.bundles` 列表，重启 `dsh web` 即可。

## 使用

1. 打开 DSH Web UI → 左下角设置（齿轮）
2. 侧边菜单选择 **Token 使用统计**
3. 查看总览、渠道统计、渠道余额/余量、模型统计、费用估算

渠道余额/余量自动从各平台官方 API 查询（需要你在 DSH 中配置对应渠道的 API Key，读取自 `~/.dsh/.credentials.yaml` 或环境变量）；查询失败或无公开 API 的渠道会显示错误/待配置，可手动填写。

## 支持渠道与查询方式

| 渠道 | 类型 | 查询 API | 币种 |
|---|---|---|---|
| DeepSeek 官方 | 余额 | `api.deepseek.com/user/balance` | CNY |
| Kimi 月之暗面 | 余额 | `api.moonshot.cn/v1/users/me/balance` | CNY |
| 硅基流动 | 余额 | `api.siliconflow.cn/v1/user/info` | CNY |
| 阶跃星辰 StepFun | 余额 | `api.stepfun.com/v1/accounts` | CNY |
| OpenRouter | 余额 | `openrouter.ai/api/v1/credits` | USD |
| Novita AI | 余额 | `api.novita.ai/v3/user/balance` | USD |
| OpenCode Go | 套餐配额 | `opencode.ai/zen/go/v1/usage` | 滚动/7天/30天 |
| OpenAI | 用量（5h/7d/30d） | `api.openai.com/v1/usage` | — |
| Anthropic | 用量（5h/7d/30d） | `api.anthropic.com/v1/organizations/usage/costs` | — |
| MiMo Token Plan 等 | 手动 | 无公开 API | — |

> OpenAI / Anthropic 用量接口需要组织级（admin）API Key，普通项目 Key 可能返回 403。
> 渠道自动发现：读取 `~/.dsh/settings.yaml` 中 `llm-pi-ai.providers` 与 `llm-deepseek` 配置，按 baseURL 匹配查询方式；凭据通过 DSH credentials 服务按 `apiKeyEnv` 解析。

## 计价

- 默认价格表：DeepSeek 官方人民币定价（高峰时段，2026-08-16 生效；空闲时段为高峰价一半），来源：[api-docs.deepseek.com](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)
- 其他模型默认 ¥0（不计费），可在页面「模型价格」中按实际渠道价格填写（存 localStorage）
- 套餐渠道（OpenCode Go / MiMo / OpenAI / Anthropic）建议将模型价格设为 0，避免与套餐额度重复计费

## 开发

```bash
# 类型检查
./node_modules/.bin/tsc -p tsconfig.build.json
# 构建（node half + client bundle）
./node_modules/.bin/tsdown --env.DSH_BUILD_FACE=client
```

数据持久化于 `~/.dsh/stats-panel/records.jsonl`（按 sessionId+seq 去重，跨重启安全）。

## License

Apache-2.0
