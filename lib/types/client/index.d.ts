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
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/** Required services (fiber inject waiting — the runtime must be up first). */
export declare const inject: string[];
/**
 * Mount the stats-panel settings section.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map