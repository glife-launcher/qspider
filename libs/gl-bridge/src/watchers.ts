import {
  actions$,
  input$,
  mainContent$,
  menu$,
  msg$,
  namedSlots$,
  objects$,
  qspApiInitialized$,
  saveSlots$,
  statsContent$,
  view$,
  wait$,
} from '@qspider/game-state';
import { bumpGeneration } from './content';
import { emitNow, queueChange } from './events';
import { GlChangeKind } from './types';

/**
 * Every atom the bridge reports on, subscribed once at module init.
 *
 * These callbacks run *before* the render they cause, which is exactly why
 * they only queue: `<GlBridge />` drains the queue after the commit. Nothing
 * here reads or writes the DOM.
 */

let installed = false;
let readyEmitted = false;

export function installWatchers(): void {
  if (installed) return;
  installed = true;

  // Every one of these is GATED on the value it announces: the change is not
  // dispatched until `<GlBridge />` has rendered with it. See events.ts rule 2 —
  // `mainContent$` in particular is set from another component's effect, so the
  // commit that is running when this callback fires still shows the old pane.
  const report =
    (what: GlChangeKind, key: string) =>
    (value: unknown): void =>
      queueChange({ what }, { key, value });

  mainContent$.subscribe((value) => {
    bumpGeneration('main');
    queueChange({ what: 'main' }, { key: 'main', value });
  });
  statsContent$.subscribe((value) => {
    bumpGeneration('stats');
    queueChange({ what: 'stats' }, { key: 'stats', value });
  });
  actions$.subscribe(report('actions', 'actions'));
  objects$.subscribe(report('objects', 'objects'));
  view$.subscribe(report('view', 'view'));
  menu$.subscribe(report('menu', 'menu'));
  msg$.subscribe(report('msg', 'msg'));
  input$.subscribe(report('input', 'input'));
  wait$.subscribe(report('wait', 'wait'));
  // The slot list is not rendered by anything the player always mounts, so
  // these are ungated and ride the next commit (or the fallback).
  saveSlots$.subscribe(() => queueChange({ what: 'slots' }));
  namedSlots$.subscribe(() => queueChange({ what: 'slots' }));

  // `ready` is the one change with no DOM behind it: it fires before any
  // player tree exists, so there is no commit to wait for and no frame to be
  // behind. `watch` rather than `subscribe`, because the engine may already
  // have finished initialising by the time this module runs.
  qspApiInitialized$.watch((initialized) => {
    if (!initialized || readyEmitted) return;
    readyEmitted = true;
    emitNow({ what: 'ready' });
  });
}

export function isReady(): boolean {
  return readyEmitted;
}
