# Changelog

本插件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式。

## [0.2.0] - 2026-08-16

### 新增

- 渠道统计：按 provider 聚合调用次数与 Token 消耗，自动识别主流渠道
- 渠道余额 / 套餐余量（自动查询）：
  - 余额类：DeepSeek 官方、Kimi 月之暗面、硅基流动、阶跃星辰 StepFun、OpenRouter、Novita AI
  - 用量类（5小时/7天/30天）：OpenCode Go（配额百分比）、OpenAI、Anthropic
  - 无公开 API 的渠道（MiMo Token Plan 等）支持手动填写
- 费用估算改为人民币（元 / 1M tokens），内置 DeepSeek 官方峰谷定价（2026-08-16 生效）
- 每日 Token 柱状图、模型占比饼图、最近调用记录

### 修复

- 历史补扫重复累加导致总 Token 虚高（改为 `(sessionId, seq)` 跨重启去重）
- 渠道余量查询增加 60 秒内存缓存，避免频繁刷新打爆渠道账户 API
- OpenAI/Anthropic 用量桶改为并发查询，缩短刷新耗时
- 渠道统计表格窄屏溢出（精简列 + 横向滚动兜底）

## [0.1.0] - 2026-08-16

### 新增

- 设置侧菜单「Token 使用统计」入口（`settings.section`）
- 总览卡片：调用次数、总 Token、输入/输出、缓存命中率、费用
- Token 使用数据持久化（`~/.dsh/stats-panel/records.jsonl`）
