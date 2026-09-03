import { SaveData, Storage } from '@qspider/contracts';
import { getStorage } from '@qspider/env';
import { loadSaveList, namedSlots$, saveSlots$ } from '@qspider/game-state';
import { queueChange } from './events';
import { GlSlot } from './types';

/**
 * C14 — save lifecycle.
 *
 * Without it, the only thing that sees a save is the IndexedDB write itself,
 * so a theme that has to know when the player saved ends up wrapping
 * `IDBObjectStore.put` — a browser API, with fallback belts and a
 * once-per-session catch-up scan behind it. The player's own storage service
 * is one level above that and is a singleton, so wrapping it here reports
 * every write and every load-time read, including the ones that never reach
 * the slot list (a quicksave writes without reloading it).
 *
 * `refreshSlots()` exists because the player caches the slot list in memory:
 * a save imported out of band is invisible until something asks for the list
 * again, and nothing in the player's own UI ever does.
 */

const toSlot = (data: SaveData): GlSlot => ({ slot: data.slot, key: data.key, timestamp: data.timestamp });

export function slots(): GlSlot[] {
  return [...saveSlots$.value, ...namedSlots$.value].map(toSlot);
}

export function refreshSlots(): Promise<void> {
  return loadSaveList();
}

let hooked = false;

/**
 * Wrap the storage singleton's four save-addressed methods. Called once, from
 * the mounted component, so the player's own lazy construction of the storage
 * is not brought forward by our module init.
 */
export function installSaveHooks(): void {
  if (hooked) return;
  hooked = true;
  const storage: Storage = getStorage();

  const saveByKey = storage.saveByKey.bind(storage);
  storage.saveByKey = async (game_id: string, key: string, data: ArrayBuffer): Promise<void> => {
    await saveByKey(game_id, key, data);
    queueChange({ what: 'saved', path: key });
  };

  const saveBySlot = storage.saveBySlot.bind(storage);
  storage.saveBySlot = async (game_id: string, slot: number, data: ArrayBuffer): Promise<void> => {
    await saveBySlot(game_id, slot, data);
    queueChange({ what: 'saved', slot });
  };

  // A read of save DATA happens only on a restore, so it is the load signal.
  // A miss is not a load, hence the null check.
  const getSaveDataByKey = storage.getSaveDataByKey.bind(storage);
  storage.getSaveDataByKey = async (game_id: string, key: string): Promise<ArrayBuffer | null> => {
    const data = await getSaveDataByKey(game_id, key);
    if (data) queueChange({ what: 'loaded', path: key });
    return data;
  };

  const getSaveDataBySlot = storage.getSaveDataBySlot.bind(storage);
  storage.getSaveDataBySlot = async (game_id: string, slot: number): Promise<ArrayBuffer | null> => {
    const data = await getSaveDataBySlot(game_id, slot);
    if (data) queueChange({ what: 'loaded', slot });
    return data;
  };
}
