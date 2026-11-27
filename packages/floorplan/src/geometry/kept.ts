/**
 * CMD-51: what is worked out from a plan that cannot change, kept with it. The tool server keeps
 * each plan version it read frozen (`packages/cli/src/mcp/planCache.ts`), so what is worked out
 * from one (its index, a floor's slice, its validation, its survey, its check) holds as long as the
 * plan does, and is kept against the plan object itself: a new version is a new object, and what
 * was kept for the old one goes with it. Every cache the geometry keeps against a plan's index or
 * parts (`WeakMap`s) then lasts between calls too.
 *
 * A plan that is not frozen may still change, so nothing is kept for it: `keptFor` works it out
 * every time, as before. Nor is anything kept or read back while the tolerance table is changed
 * for a call (`withTolerances`): what is worked out then holds for that call only.
 */
import { tolerancesChanged } from './tolerances'

/** How many answers are kept per frozen plan, the oldest dropped first. */
export const KEPT_PER_PLAN = 32

/** A store of answers kept against frozen owners, each owner's answers in the order kept. */
export type KeptStore = WeakMap<object, Map<string, unknown>>

const kept: KeptStore = new WeakMap()

/**
 * SHT-25: what the drawings of a whole building are made from (its envelope, its facades and
 * sections) and the sheet's pictures of them, kept apart from `keptFor`'s store, so a tall plan's many floor slices never push them
 * out between one drawing of a sheet and the next.
 */
export const KEPT_DRAWN: KeptStore = new WeakMap()

/**
 * SHT-25: how many answers `KEPT_DRAWN` keeps per frozen plan: a sheet tries its elevations and
 * sections at several scales before one fits, and each try's pictures are kept.
 */
export const KEPT_DRAWN_PER_PLAN = 96

/** `value` and everything it holds, frozen; a set or a map is left as it is. */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  if (value instanceof Set || value instanceof Map || ArrayBuffer.isView(value)) return value
  Object.freeze(value)
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    // A getter (a loaded plan's issues) is left to freeze what it gives itself.
    if (descriptor !== undefined && 'value' in descriptor) deepFreeze(descriptor.value)
  }
  return value
}

/**
 * What `work` gives for the frozen `owner` and `key`, worked out once and kept with it, frozen
 * unless `freeze` is false (an index whose lists other caches key on); for an owner that is not
 * frozen, worked out afresh every time.
 */
export function keptFor<T>(owner: object, key: string, work: () => T, freeze = true): T {
  return keptIn(kept, owner, key, work, freeze)
}

/** `keptFor` in a store of its own (SHT-25: `KEPT_DRAWN`), with the same rules. */
export function keptIn<T>(store: KeptStore, owner: object, key: string, work: () => T, freeze = true): T {
  const most = store === KEPT_DRAWN ? KEPT_DRAWN_PER_PLAN : KEPT_PER_PLAN
  if (!Object.isFrozen(owner) || tolerancesChanged()) return work()
  let mine = store.get(owner)
  if (mine === undefined) {
    mine = new Map()
    store.set(owner, mine)
  }
  if (mine.has(key)) return mine.get(key) as T
  const value = freeze ? deepFreeze(work()) : work()
  mine.set(key, value)
  if (mine.size > most) mine.delete(mine.keys().next().value!)
  return value
}
