import { StatsPanelSection } from './stats-panel';
/** Required services (fiber inject waiting — the runtime must be up first). */
export const inject = ['slots'];
/**
 * Mount the stats-panel settings section.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'stats-panel',
        order: 30,
        label: () => 'Token 使用统计',
    }, StatsPanelSection));
}
//# sourceMappingURL=index.js.map