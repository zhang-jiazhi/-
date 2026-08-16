#!/usr/bin/env node
/**
 * 快速验证各渠道余额/用量 API 连通性（开发调试用）。
 *
 * 用法：
 *   node scripts/verify-balances.mjs DEEPSEEK_API_KEY        # 验证指定渠道
 *   node scripts/verify-balances.mjs                          # 验证所有已配置渠道
 *
 * 凭据读取顺序：环境变量 → ~/.dsh/.credentials.yaml
 */
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CREDS = join(homedir(), '.dsh', '.credentials.yaml')

function loadCreds() {
  if (!existsSync(CREDS)) return {}
  const raw = readFileSync(CREDS, 'utf8')
  const out = {}
  for (const line of raw.split('\n')) {
    const m = /^([A-Z0-9_]+):\s*["']?([^"'\s]+)/.exec(line.trim())
    if (m) out[m[1]] = m[2]
  }
  return out
}

/** 渠道 → 验证函数。返回 { ok, detail } */
const PROBES = {
  DEEPSEEK_API_KEY: async (key) => {
    const r = await fetch('https://api.deepseek.com/user/balance', { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) })
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` }
    const d = await r.json()
    return { ok: true, detail: `余额 ${d.balance_infos?.[0]?.total_balance} ${d.balance_infos?.[0]?.currency}` }
  },
  OPENCODE_GO_API_KEY: async (key) => {
    const r = await fetch('https://opencode.ai/zen/go/v1/usage', { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) })
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` }
    const d = await r.json()
    const u = d.usage ?? {}
    return { ok: true, detail: `滚动 ${u.rolling?.percent}% / 周 ${u.weekly?.percent}% / 月 ${u.monthly?.percent}%` }
  },
  XIAOMI_API_KEY: async (key) => {
    const r = await fetch('https://token-plan-cn.xiaomimimo.com/v1/usage', { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) })
    if (r.status === 404) return { ok: false, detail: 'MiMo Token Plan 无公开用量 API（手动填写）' }
    return { ok: r.ok, detail: `HTTP ${r.status}` }
  },
}

async function main() {
  const creds = loadCreds()
  const only = process.argv[2]
  const names = only ? [only] : Object.keys(PROBES)
  for (const name of names) {
    const key = process.env[name] ?? creds[name]
    const probe = PROBES[name]
    if (!probe) { console.log(`✗ ${name}: 未知渠道`); continue }
    if (!key) { console.log(`- ${name}: 未配置凭据`); continue }
    try {
      const r = await probe(key)
      console.log(`${r.ok ? '✓' : '✗'} ${name}: ${r.detail}`)
    } catch (e) {
      console.log(`✗ ${name}: ${e.message}`)
    }
  }
}

main()
