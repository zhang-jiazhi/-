# 渠道适配器说明

插件按渠道（provider）聚合用量，并自动查询各渠道的余额或套餐余量。
渠道由 `~/.dsh/settings.yaml` 中的模型配置自动发现（`llm-pi-ai.providers` 与 `llm-deepseek`），
凭据按 `apiKeyEnv` 通过 DSH 的 credentials 服务解析（`~/.dsh/.credentials.yaml` 或环境变量）。

## 查询方式

| 渠道（baseURL 匹配） | 类型 | 端点 | 说明 |
|---|---|---|---|
| `api.deepseek.com` | 余额 | `GET /user/balance` | 官方余额（CNY） |
| `api.moonshot.cn` / `api.kimi.ai` | 余额 | `GET /v1/users/me/balance` | Kimi 官方余额（CNY） |
| `api.siliconflow.cn` / `.com` | 余额 | `GET /v1/user/info` | 硅基流动余额（CNY/USD） |
| `api.stepfun.com` / `.ai` | 余额 | `GET /v1/accounts` | 阶跃星辰余额（CNY） |
| `openrouter.ai` | 余额 | `GET /api/v1/credits` | OpenRouter 额度（USD） |
| `api.novita.ai` | 余额 | `GET /v3/user/balance` | Novita 余额（USD，0.0001 精度） |
| `opencode.ai/zen/go` | 套餐配额 | `GET /zen/go/v1/usage` | 滚动 / 7天 / 30天 配额百分比与重置时间 |
| `api.openai.com` | 用量 | `GET /v1/usage` | 5小时 / 7天 / 30天 Token 用量（需组织级 Key） |
| `api.anthropic.com` | 用量 | `GET /v1/organizations/usage/costs` | 同上（需管理员 Key） |
| 其余渠道 | 手动 | — | 无公开 API，在页面手动填写（存 localStorage） |

## 新增渠道适配器

在 `src/index.ts` 的 `probeChannel()` 中按 baseURL 前缀添加分支即可：

1. 按渠道实际返回结构构造 `ChannelBalance`（`balance` / `quota` / `usage` 三选一）
2. 凭据一律通过 `resolveKey(apiKeyEnv)` 获取，禁止硬编码

> OpenAI / Anthropic 用量接口需要组织级权限，普通项目 Key 可能返回 403（页面会显示查询失败）。
