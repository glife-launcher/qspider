import { on, off } from './events';
import { readVar, readVarAt, watchVar, exec, execLoc } from './vars';
import { overlay, panels, syncAttributes } from './overlay';
import { content, generation } from './content';
import { actions, execAction, selectAction } from './actions';
import { bindKey, unbindKey } from './keys';
import { refreshSlots, slots } from './saves';
import { installWatchers, isReady } from './watchers';
import { QspiderGl } from './types';

/**
 * The contract number.
 *
 * A theme reads `(window.qspiderGl && window.qspiderGl.contract) || 0` once at
 * boot: 0 is stock qspider. It is one monotonically increasing integer rather
 * than a dozen `typeof` sniffs, so a half-built player cannot present a mixed
 * surface and a theme cannot drift into a dozen independent branches.
 */
export const CONTRACT = 1;

let installed = false;

/**
 * Install the global. Runs at module init — before any game is loaded and
 * before the player renders anything — because a theme's own boot code runs
 * then too, and making it wait for a render is what produces boot-time polling.
 */
export function installBridge(): void {
  if (installed) return;
  installed = true;
  installWatchers();
  // Give CSS a defined starting state, so a rule may key on either value of a
  // panel attribute without a `:not()`.
  syncAttributes();
  const api: QspiderGl = {
    get contract(): number {
      return CONTRACT;
    },
    get ready(): boolean {
      return isReady();
    },
    on,
    off,
    readVar,
    readVarAt,
    watchVar,
    exec,
    execLoc,
    overlay,
    panels,
    content,
    generation,
    actions,
    selectAction,
    execAction,
    bindKey,
    unbindKey,
    slots,
    refreshSlots,
  };
  window.qspiderGl = api;
}
