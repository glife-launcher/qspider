import {
  actions$,
  input$,
  isActsVisible$,
  isCmdVisible$,
  isObjsVisible$,
  isPauseScreenVisible$,
  isStatsVisible$,
  mainContent$,
  menu$,
  msg$,
  namedSlots$,
  objects$,
  saveSlots$,
  statsContent$,
  view$,
  wait$,
} from '@qspider/game-state';
import { useAtom } from '@xoid/react';
import { useEffect } from 'react';
import { drainChanges, queueChange } from './events';
import { overlay, syncAttributes } from './overlay';
import { installSaveHooks } from './saves';
import { reattachVars } from './vars';
import { installBridge } from './install';

installBridge();

/**
 * The bridge's one mounted component, and the whole reason the design pays for
 * a React file at all.
 *
 * It reads every watched atom with `useAtom` — not to render them, but so that
 * a change re-renders THIS component in the same batch as the panel that
 * carries it. The effect below has no dependency array, so it runs after every
 * one of those commits: at that point the DOM already shows the change, and
 * only then is the queue drained. An event dispatched from the atom
 * subscription instead would reach a listener a frame early, which is the
 * exact failure a theme cannot see and cannot debug.
 *
 * It renders nothing. It is mounted inside `<qsp-game-root>`, so it exists
 * only while a game does.
 */
export const GlBridge: React.FC = () => {
  // Read, not to render, but so a change re-renders THIS component in the same
  // batch as the panel that carries it — and so the drain can tell which values
  // this commit actually shows.
  const main = useAtom(mainContent$);
  const stats = useAtom(statsContent$);
  const actions = useAtom(actions$);
  const objects = useAtom(objects$);
  const view = useAtom(view$);
  const menu = useAtom(menu$);
  const msg = useAtom(msg$);
  const input = useAtom(input$);
  const wait = useAtom(wait$);
  useAtom(isPauseScreenVisible$);
  useAtom(isStatsVisible$);
  useAtom(isActsVisible$);
  useAtom(isObjsVisible$);
  useAtom(isCmdVisible$);
  useAtom(saveSlots$);
  useAtom(namedSlots$);

  useEffect(() => {
    installSaveHooks();
    // This component is mounted inside `<qsp-game-root>`, so its first effect
    // IS the game-open transition — and the engine has already opened and
    // restarted the game by the time `currentGameEntry$` is set, which is what
    // renders us. Any watch registered before that (a theme's boot code, for
    // instance) is attached to the variable table the engine has just replaced,
    // so it is moved here, before `game-started` tells anyone to look.
    reattachVars();
    queueChange({ what: 'game-started' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No dependency array on purpose: this must run after EVERY commit.
  useEffect(() => {
    const { overlayChanged, panelsChanged } = syncAttributes();
    if (overlayChanged) queueChange({ what: 'overlay', kind: overlay().kind });
    if (panelsChanged) queueChange({ what: 'panels' });
    drainChanges({ main, stats, actions, objects, view, menu, msg, input, wait });
  });

  return null;
};
