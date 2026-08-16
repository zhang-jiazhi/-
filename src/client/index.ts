/**
 * Browser-half entry for the dsh-stats-panel plugin — runs inside the dsh
 * web GUI.
 *
 * Registers one settings-sidebar section (`settings.section`): the nav row
 * "Token 使用统计" opens a full-page usage statistics view, reading data from
 * the host half over plain same-origin fetch (`/api/stats-panel/summary`).
 * Failure policy: rendering problems are contained inside the section, never
 * thrown — an external plugin must not take the GUI down.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the settings-surface SlotMap declaration (settings.section).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { StatsPanelSection } from './stats-panel'

/** Required services (fiber inject waiting — the runtime must be up first). */
export const inject = ['slots']

/**
 * Mount the stats-panel settings section.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'stats-panel',
    order: 30,
    label: () => 'Token 使用统计',
  }, StatsPanelSection))
}
