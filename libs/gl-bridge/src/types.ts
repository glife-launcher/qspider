import { QspTuple } from '@qsp/wasm-engine';

/** Everything a QSP variable can hold. */
export type GlVarValue = string | number | QspTuple;

/**
 * The kinds of change the bridge reports. One flat vocabulary, so a listener
 * can switch on a string instead of subscribing to twelve channels.
 *
 * `palette` is deliberately absent at contract 1: the palette point (C13) is a
 * separate change to the player's css-variable component and raises the
 * contract when it lands. A listener written today must not assume it exists.
 */
export type GlChangeKind =
  | 'ready'
  | 'game-started'
  | 'main'
  | 'stats'
  | 'actions'
  | 'objects'
  | 'view'
  | 'menu'
  | 'msg'
  | 'input'
  | 'wait'
  | 'overlay'
  | 'panels'
  | 'saved'
  | 'loaded'
  | 'slots';

export interface GlChangeDetail {
  what: GlChangeKind;
  /** Save slot number for `saved`/`loaded`, when the write was slot-addressed. */
  slot?: number;
  /** Save key for `saved`/`loaded`, when the write was key-addressed. */
  path?: string;
  /** Which dialog is on top, for `overlay`. */
  kind?: GlOverlayKind | null;
}

export type GlOverlayKind = 'pause' | 'msg' | 'input' | 'menu' | 'view' | 'wait';

export interface GlOverlayState {
  open: boolean;
  kind: GlOverlayKind | null;
}

export interface GlPanelState {
  stats: boolean;
  actions: boolean;
  objects: boolean;
  cmd: boolean;
}

export interface GlAction {
  index: number;
  name: string;
  image: string;
}

export interface GlSlot {
  slot: number;
  key: string;
  timestamp: number;
}

export interface GlBindKeyOptions {
  /** Also fire while the player is paused (an overlay is up). Default false. */
  whenPaused?: boolean;
}

export type GlListener = (detail: GlChangeDetail) => void;

export interface QspiderGl {
  /** Monotonic. 0 means stock qspider (the global is absent entirely). */
  readonly contract: number;
  /** True once the QSP engine has been initialised. */
  readonly ready: boolean;

  /** Subscribe to one kind, or to `'*'` for all of them. Returns an unsubscribe. */
  on(what: GlChangeKind | '*', cb: GlListener): () => void;
  off(what: GlChangeKind | '*', cb: GlListener): void;

  readVar(name: string, key?: string): GlVarValue;
  readVarAt(name: string, index: number): GlVarValue;
  watchVar(name: string, key: string, cb: (value: GlVarValue) => void): () => void;
  exec(code: string): void;
  execLoc(name: string): void;

  overlay(): GlOverlayState;
  panels(): GlPanelState;

  content(which: 'main' | 'stats'): string;
  generation(which: 'main' | 'stats'): number;

  actions(): GlAction[];
  selectAction(index: number): void;
  execAction(index: number): void;

  bindKey(keys: string | string[], handler: () => void, options?: GlBindKeyOptions): void;
  unbindKey(keys: string | string[]): void;

  slots(): GlSlot[];
  refreshSlots(): Promise<void>;
}

declare global {
  interface Window {
    qspiderGl?: QspiderGl;
  }
}
