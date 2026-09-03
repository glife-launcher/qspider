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

/**
 * Watch one key. An empty `key` watches the whole variable.
 *
 * The engine may not exist yet when a theme boots, so this re-attaches through
 * `qspApi$.watch` rather than failing silently — the same shape the player's
 * own `createVariableAtom` uses.
 */
export function watchVar(name: string, key: string, cb: (value: GlVarValue) => void): () => void {
  let detach: (() => void) | undefined;
  const stopWatching = qspApi$.watch((api) => {
    detach?.();
    detach = undefined;
    if (!api) return;
    const forward = (value: unknown): void => cb((value as GlVarValue) || defaultFor(name));
    detach = key ? api.watchVariableByKey(name, key, forward) : api.watchVariable(name, forward);
  });
  return (): void => {
    stopWatching();
    detach?.();
    detach = undefined;
  };
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
