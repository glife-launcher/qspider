import { mainContent$, statsContent$ } from '@qspider/game-state';

/**
 * C6 — the panel string, before the player parses it.
 *
 * The stats pane is one opaque HTML string produced by the game; the player
 * cannot slot parts of it into a theme, and a theme that wants to re-present
 * it has to mark up the player's own rendered nodes in place, because
 * inserting a node into that React subtree feeds the observer that watches it.
 * Handing over the string lets a theme parse it once and render whatever it
 * likes inside its own template island, where React never reconciles.
 *
 * `generation()` counts parses, so a consumer can tell "the same string again"
 * from "no change" without diffing it.
 */

const generations: Record<'main' | 'stats', number> = { main: 0, stats: 0 };

export function bumpGeneration(which: 'main' | 'stats'): void {
  generations[which] += 1;
}

export function content(which: 'main' | 'stats'): string {
  return which === 'stats' ? statsContent$.value : mainContent$.value;
}

export function generation(which: 'main' | 'stats'): number {
  return generations[which];
}
