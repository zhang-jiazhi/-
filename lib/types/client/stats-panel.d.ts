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
import React from 'react';
/**
 * The settings-sidebar section: full-page stats view. Loads on mount.
 * @param props - section owner props (the shell supplies `close`).
 */
export declare function StatsPanelSection(_props: {
    close: () => void;
}): React.ReactElement;
//# sourceMappingURL=stats-panel.d.ts.map