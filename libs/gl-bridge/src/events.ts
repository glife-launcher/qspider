import { GlChangeDetail, GlChangeKind, GlListener } from './types';

/**
 * The event channel.
 *
 * Three rules shape this file:
 *
 * 1. **Nothing is dispatched from an atom subscription.** An xoid
 *    `subscribe()` callback runs *before* the React re-render it causes, so a
 *    listener driven off it would read the previous frame's DOM. Producers
 *    call `queueChange()`; `<GlBridge />` calls `drainChanges()` from a
 *    `useEffect`, which runs after a commit.
 * 2. **After a commit is not the same as after the RIGHT commit.** One atom in
 *    the player — `mainContent$` — is set from inside another component's
 *    `useEffect`, i.e. during the effect pass of a commit that has already
 *    rendered the *previous* value. Draining in that same pass hands the
 *    listener a pane that is exactly one frame behind, which is the failure
 *    this whole design exists to avoid and which measured as 12 events out of
 *    12 before the gate was added. So a queued change may carry a **gate**: the
 *    value the bridge is announcing. It is dispatched only once the component
 *    has actually rendered that value, which its own `useAtom` guarantees will
 *    happen on the very next commit.
 * 3. **A queued change carries no payload a listener could fetch itself.** No
 *    HTML string, no variable value — those are `content()` and `readVar()`,
 *    on demand. A listener that ignores an event costs nothing.
 *
 * The one exception to rule 1 is `ready`, which fires before any React tree
 * exists and has no DOM to be behind.
 */

export const CHANGE_EVENT = 'qspider:changed';

/**
 * If no commit shows a gated value in this long, dispatch anyway. A gate that
 * is still closed after a quarter second means React is idle, not late.
 */
const FLUSH_FALLBACK_MS = 250;

/** "the bridge is announcing `value`, and `key` is where the component reports what it rendered". */
export interface ChangeGate {
  key: string;
  value: unknown;
}

interface QueuedChange {
  detail: GlChangeDetail;
  gate?: ChangeGate;
}

/** What the mounted component rendered with, keyed the same way the gates are. */
export type RenderedSnapshot = Record<string, unknown>;

const listeners = new Map<string, Set<GlListener>>();
let queue: QueuedChange[] = [];
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

export function on(what: GlChangeKind | '*', cb: GlListener): () => void {
  let set = listeners.get(what);
  if (!set) {
    set = new Set();
    listeners.set(what, set);
  }
  set.add(cb);
  return (): void => off(what, cb);
}

export function off(what: GlChangeKind | '*', cb: GlListener): void {
  listeners.get(what)?.delete(cb);
}

function notify(detail: GlChangeDetail): void {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail }));
  for (const key of [detail.what, '*']) {
    const set = listeners.get(key);
    if (!set) continue;
    for (const cb of Array.from(set)) {
      try {
        cb(detail);
      } catch (e) {
        console.error('qspiderGl listener failed', detail.what, e);
      }
    }
  }
}

function armFallback(): void {
  if (fallbackTimer !== null) return;
  fallbackTimer = setTimeout(() => {
    fallbackTimer = null;
    flush(queue.splice(0));
  }, FLUSH_FALLBACK_MS);
}

function flush(items: QueuedChange[]): void {
  for (const item of items) notify(item.detail);
}

/** Dispatch immediately. Only for changes with no DOM of their own. */
export function emitNow(detail: GlChangeDetail): void {
  notify(detail);
}

/** Queue a change for the commit that shows it. */
export function queueChange(detail: GlChangeDetail, gate?: ChangeGate): void {
  // A bare change (no payload) coalesces: three stats writes inside one batch
  // are one notification, because the listener reads the current value anyway.
  // The surviving entry takes the NEWEST gate, or it would wait on a value the
  // player has already replaced.
  const bare = detail.slot === undefined && detail.path === undefined && detail.kind === undefined;
  if (bare) {
    const existing = queue.find(
      (q) => q.detail.what === detail.what && q.detail.slot === undefined && q.detail.path === undefined,
    );
    if (existing) {
      existing.gate = gate;
      armFallback();
      return;
    }
  }
  queue.push({ detail, gate });
  armFallback();
}

/**
 * Dispatch everything the given commit is allowed to announce.
 * `rendered` is what the mounted component rendered with; a gated change waits
 * until its value is in there.
 */
export function drainChanges(rendered: RenderedSnapshot): void {
  if (fallbackTimer !== null) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  if (!queue.length) return;
  const ready: QueuedChange[] = [];
  const held: QueuedChange[] = [];
  for (const item of queue) {
    if (!item.gate || rendered[item.gate.key] === item.gate.value) ready.push(item);
    else held.push(item);
  }
  queue = held;
  if (held.length) armFallback();
  flush(ready);
}
