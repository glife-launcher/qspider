import Mousetrap from 'mousetrap';
import { overlay } from './overlay';
import { GlBindKeyOptions } from './types';

/**
 * C8 — register a hotkey through the arbiter the player already owns.
 *
 * The player binds `1`-`9`, `space`, `F5`, `F9`, `mod+r`, `mod+s`, `mod+o`,
 * `pageup`, `pagedown`, `home` and `end` on the same Mousetrap instance. A
 * theme that installs its own capture-phase `window` listener to get in front
 * of that is not resolving a conflict, it is winning a race; going through the
 * same instance means one place knows what is taken.
 *
 * A bound handler suppresses the browser default (Mousetrap treats a `false`
 * return that way), which is what a game key almost always wants.
 *
 * By default a binding stands down while a dialog is up, using the same
 * overlay state C4 publishes. The player's own `isPaused$` is the closer
 * analogue but is not part of `@qspider/game-state`'s public surface, and
 * reaching past it would put a second deep import into the merge surface for
 * a flag that is a strict subset of this one.
 *
 * Known limit, and the reason a theme should re-bind on `game-started`:
 * stopping a game calls the player's `clearHotkeys()`, which is
 * `Mousetrap.reset()` and drops every binding, ours included.
 */

export function bindKey(keys: string | string[], handler: () => void, options?: GlBindKeyOptions): void {
  const whenPaused = Boolean(options?.whenPaused);
  Mousetrap.bind(Array.isArray(keys) ? keys : [keys], (): boolean | undefined => {
    if (!whenPaused && overlay().open) return undefined;
    try {
      handler();
    } catch (e) {
      console.error('qspiderGl hotkey handler failed', keys, e);
    }
    return false;
  });
}

export function unbindKey(keys: string | string[]): void {
  Mousetrap.unbind(Array.isArray(keys) ? keys : [keys]);
}
