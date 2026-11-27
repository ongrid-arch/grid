/**
 * CNT-9: facts of the person's own on walls, openings, rooms and floors (CNT-52: and items): a fire rating, a
 * department, a head count. Each part may carry them in its own `properties` object, never as
 * loose fields, so a misspelt field of the format is still named (MSG-4). A room may also state
 * its room number, in a field of its own (`number`).
 *
 * A fact is the person's: Grid checks nothing against it, measures nothing by it, and no message
 * says what a fact means for the plan. It is kept through edits, listed in the schedules, written
 * into the IFC and the DXF, and asked about by `grid_fields`, `grid_find` and `grid_count`.
 */

/** A fact's value: text, a number, or yes or no. */
export type FactValue = string | number | boolean

/** A part's facts, by name, in the order the file gives them. */
export type Facts = Readonly<Record<string, FactValue>>

/** The parts of a plan that may carry facts, by the list they are in. */
export const FACT_LISTS = ['walls', 'openings', 'rooms', 'floors'] as const
export type FactList = (typeof FACT_LISTS)[number]

/**
 * The fields CNT-9 adds to the parts of a plan, as `<list>.<field>`. The sheet says what it does
 * with each (`packages/cli/src/sheet/coverage.ts`), and its test holds this list to the schema.
 */
// CNT-59: and what another tool calls a wall, an opening, a room or a floor (`identity`).
export const FACT_FIELDS = ['walls.properties', 'openings.properties', 'rooms.properties', 'rooms.number', 'floors.properties', 'items.properties', 'walls.identity', 'openings.identity', 'rooms.identity', 'floors.identity'] as const
export type FactField = (typeof FACT_FIELDS)[number]

/**
 * A fact's name as Grid matches it: in small letters, with spaces, dashes and underscores taken
 * out, so `Fire rating`, `fire-rating` and `fire_rating` are one fact. One part may not carry
 * two names that match.
 */
export function factKey(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

/** The name a room's stated number goes by where it is written with the facts: the IFC set, the DXF. */
export const ROOM_NUMBER_FACT = 'room number'

/** A fact's value as text: yes or no for true or false, a number as JSON writes it. */
export function factText(value: FactValue): string {
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value)
}

/** What kind of value a fact holds, in words for an answer. */
export function factType(value: FactValue): 'text' | 'number' | 'yes-no' {
  return typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'yes-no' : 'text'
}

/** The facts a part carries, or none. */
export function factsOf(part: { readonly properties?: Facts | undefined }): Facts {
  return part.properties ?? {}
}

/** The value of one fact on a part, matched by `factKey`, or undefined when it carries none. */
export function factOf(part: { readonly properties?: Facts | undefined }, name: string): FactValue | undefined {
  const facts = part.properties
  if (facts === undefined) return undefined
  if (Object.hasOwn(facts, name)) return facts[name]
  const key = factKey(name)
  for (const [own, value] of Object.entries(facts)) if (factKey(own) === key) return value
  return undefined
}
