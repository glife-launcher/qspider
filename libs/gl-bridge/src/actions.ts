import { actions$, canSelectAction, execSelectedAction, selectAction as selectActionByIndex } from '@qspider/game-state';
import { GlAction } from './types';

/**
 * C9 — the action list as data, and a way to run one.
 *
 * The player renders every game exec link as a bare `<a href="#">` and keeps
 * the action in its own React handler, so a theme that reads what a link does
 * reads `"#"` forever and fails open with no error. Anything that wants to
 * drive the game therefore matches action *text* and synthesises clicks. With
 * the engine's own list and index, a step is one call.
 */

export function actions(): GlAction[] {
  return actions$.value.map((action, index) => ({
    index,
    name: action.name,
    image: action.image,
  }));
}

export function selectAction(index: number): void {
  if (!canSelectAction(index)) return;
  selectActionByIndex(index);
}

export function execAction(index: number): void {
  if (!canSelectAction(index)) return;
  selectActionByIndex(index);
  execSelectedAction();
}
