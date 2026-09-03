import {
  input$,
  isActsVisible$,
  isCmdVisible$,
  isObjsVisible$,
  isPauseScreenVisible$,
  isStatsVisible$,
  menu$,
  msg$,
  view$,
  wait$,
} from '@qspider/game-state';
import { GlOverlayKind, GlOverlayState, GlPanelState } from './types';

/**
 * C4 + C10 — the state CSS needs, published where CSS can read it.
 *
 * CSS cannot read a global, so the same contract has a second face: attributes
 * on `<html>`. A theme that has to answer "is a dialog open" from geometry
 * ("any portal child with client rects") is guessing at something the player
 * knows exactly.
 *
 * `data-qsp-overlay` is present (value `"1"`) only while a dialog is up, so a
 * theme can select on the attribute's presence; `data-qsp-overlay-kind` names
 * which one. The panel attributes are always present and always `"0"` or
 * `"1"`, so a rule can key off either value without a `:not()`.
 */

const OVERLAY_ATTR = 'data-qsp-overlay';
const OVERLAY_KIND_ATTR = 'data-qsp-overlay-kind';

/**
 * Priority order, top dialog first. A non-modal view does not count: it is
 * rendered in the page like game content and takes no input away, which is the
 * same distinction the player's own Escape handler makes.
 */
export function overlay(): GlOverlayState {
  let kind: GlOverlayKind | null = null;
  if (isPauseScreenVisible$.value) kind = 'pause';
  else if (msg$.value.isOpen) kind = 'msg';
  else if (input$.value.isOpen) kind = 'input';
  else if (menu$.value.isOpen) kind = 'menu';
  else if (view$.value.isOpen && view$.value.isModal) kind = 'view';
  else if (wait$.value) kind = 'wait';
  return { open: kind !== null, kind };
}

export function panels(): GlPanelState {
  return {
    stats: isStatsVisible$.value,
    actions: isActsVisible$.value,
    objects: isObjsVisible$.value,
    cmd: isCmdVisible$.value,
  };
}

const flag = (on: boolean): string => (on ? '1' : '0');

/** Write both faces of the state onto `<html>`. Returns what changed. */
export function syncAttributes(): { overlayChanged: boolean; panelsChanged: boolean } {
  const root = document.documentElement;
  const { open, kind } = overlay();
  const hadOverlay = root.getAttribute(OVERLAY_ATTR);
  const hadKind = root.getAttribute(OVERLAY_KIND_ATTR);
  if (open) {
    root.setAttribute(OVERLAY_ATTR, '1');
    root.setAttribute(OVERLAY_KIND_ATTR, kind as string);
  } else {
    root.removeAttribute(OVERLAY_ATTR);
    root.removeAttribute(OVERLAY_KIND_ATTR);
  }
  const overlayChanged = hadOverlay !== root.getAttribute(OVERLAY_ATTR) || hadKind !== root.getAttribute(OVERLAY_KIND_ATTR);

  const state = panels();
  let panelsChanged = false;
  const write = (attr: string, value: boolean): void => {
    const next = flag(value);
    if (root.getAttribute(attr) !== next) {
      root.setAttribute(attr, next);
      panelsChanged = true;
    }
  };
  write('data-qsp-stats', state.stats);
  write('data-qsp-actions', state.actions);
  write('data-qsp-objects', state.objects);
  write('data-qsp-cmd', state.cmd);

  return { overlayChanged, panelsChanged };
}
