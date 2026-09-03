import { qspApi$ } from '@qspider/game-state';
import { GlVarValue } from './types';

/**
 * C3 — read, watch and execute without rendering anything.
 *
 * A theme's only read channel on stock qspider is a rendered `<qsp-variable>`
 * element whose text it scrapes, which costs a React component per key and
 * makes a fast-moving key expensive enough to change how a theme is written.
 * These four functions are the same engine calls the player already makes for
 * that element, with no element in the way.
 *
 * The engine's own default is applied here so a bridge read and a rendered
 * probe answer the same thing for the same key: `useQspVariable` renders
 * `value || defaultValue`, and so does `readVar`.
 */

function defaultFor(name: string): GlVarValue {
  return name.startsWith('$') ? '' : 0;
}

export function readVar(name: string, key?: string): GlVarValue {
  const api = qspApi$.value;
  if (!api) return defaultFor(name);
  const value = key ? api.readVariableByKey(name, key) : api.readVariable(name);
  return (value as GlVarValue) || defaultFor(name);
}

export function readVarAt(name: string, index: number): GlVarValue {
  const api = qspApi$.value;
  if (!api) return defaultFor(name);
  const value = api.readVariableByIndex(name, index);
  return (value as GlVarValue) || defaultFor(name);
}

interface VarWatch {
  name: string;
  key: string;
  forward: (value: unknown) => void;
  detach?: () => void;
  stopWatching?: () => void;
}

/** Every live watch, so `reattachVars()` can move them all to a new game. */
const watches = new Set<VarWatch>();

function attach(watch: VarWatch): void {
  watch.detach?.();
  watch.detach = undefined;
  const api = qspApi$.value;
  if (!api) return;
  watch.detach = watch.key
    ? api.watchVariableByKey(watch.name, watch.key, watch.forward)
    : api.watchVariable(watch.name, watch.forward);
}

/**
 * Watch one key. An empty `key` watches the whole variable.
 *
 * The engine may not exist yet when a theme boots, so this attaches through
 * `qspApi$.watch` rather than failing silently — the same shape the player's
 * own `createVariableAtom` uses.
 *
 * That alone is not enough, and the failure it leaves is silent. `qspApi$`
 * holds the engine, and the engine outlives a game: opening one does not
 * replace the atom, so nothing re-runs the callback above — while the engine
 * itself builds a fresh variable table for the new game and drops every
 * watcher registered against the old one. A watch made at theme-boot time
 * therefore delivered its first value and then went quiet for the rest of the
 * session. `reattachVars()` is the missing half; `<GlBridge />` calls it on
 * the game-open transition it is mounted by.
 */
export function watchVar(name: string, key: string, cb: (value: GlVarValue) => void): () => void {
  const watch: VarWatch = {
    name,
    key,
    forward: (value: unknown): void => cb((value as GlVarValue) || defaultFor(name)),
  };
  watches.add(watch);
  watch.stopWatching = qspApi$.watch(() => attach(watch));
  return (): void => {
    watches.delete(watch);
    watch.stopWatching?.();
    watch.detach?.();
    watch.detach = undefined;
  };
}

/**
 * Re-attach every live watch to the engine's current variable table.
 *
 * Called once per game open. Re-attaching delivers the key's current value
 * again, which is what a listener registered before the game existed was
 * missing: without it, the first change after the game loads never arrives.
 */
export function reattachVars(): void {
  for (const watch of watches) attach(watch);
}

/**
 * Run QSP code.
 *
 * Making a write easy does not make it safe: QSP saves carry every variable,
 * including the game's own interface settings, so anything written here
 * persists into the player's saves exactly as if the game had written it.
 */
export function exec(code: string): void {
  qspApi$.value?.execCode(code);
}

export function execLoc(name: string): void {
  qspApi$.value?.execLoc(name);
}
