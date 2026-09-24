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

/**
 * C15 — what a theme's `header` function is shown about one top-level node of
 * the stats pane. Plain data: the theme decides without touching React.
 */
export interface GlNodeInfo {
  /**
   * `'#text'` for a run of loose text, otherwise the lowercase tag name as the
   * game wrote it (`'a'`, `'div'`, `'table'`…). Read from the markup; if the
   * player dropped or unwrapped a top-level node the list no longer lines up,
   * and then a node the player renders as a component of its own may say `''`.
   */
  tag: string;
  /** The node's flattened text, as rendered (not trimmed). */
  text: string;
  /** The node's HTML attributes as written, values as strings. */
  attrs: Record<string, unknown>;
}

export interface GlStatsPortals {
  /** A non-empty string starts a section with that key; anything else continues the current one. */
  header: (info: GlNodeInfo) => string | null;
  /** Section key → id of the element the section renders into. */
  targets?: Record<string, string>;
  /** Id of the element every section `targets` does not name renders into. */
  rest?: string;
}

export interface GlPortalSpec {
  stats?: GlStatsPortals;
  /** Id of the element the `<qsp-actions-list>` renders into. */
  actions?: string;
  /** Id of the element the `<qsp-objects-list>` renders into. */
  objects?: string;
}

export interface GlPortals {
  /** Replace the spec; re-renders at once and re-reads every container by id. */
  set(spec: GlPortalSpec): void;
  /** Drop the spec: everything renders in place again. */
  clear(): void;
}

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

  /** C15 (contract 2): render stats sections and the action/object lists into theme-owned elements. */
  readonly portals: GlPortals;
}

declare global {
  interface Window {
    qspiderGl?: QspiderGl;
  }
}
