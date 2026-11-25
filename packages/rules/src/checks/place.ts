/**
 * COD-3: the place the figure checks are for. The plan states it (`site.country`); a caller may
 * name another for one check (`--country`, `grid_check`'s `country`), and that one is used. Every
 * place is read through Grid's own list (`@ongrid/floorplan/types/places`), and a report names it
 * from the list, never from the text it was given.
 *
 * With no place stated, no figure is applied (lab W-12), until the owner decides who the figure
 * checks are for (COD-1). `WITHOUT_PLACE` is the one switch back to the behaviour before COD-3:
 * with `us-figures`, a plan that states no place is checked against the US figures, and the
 * report says the place was assumed.
 *
 * Pure: a plan in, plain data out.
 */

import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { countryName, countryOf, PLACE_TEXT_MAX } from '@ongrid/floorplan/types/places'
import type { Said } from '@ongrid/floorplan/messages'
import { messages, saids } from './messages'

/** Where the place came from: the caller's request, the plan, or assumed when neither states one. */
export type PlaceFrom = 'request' | 'plan' | 'assumed'

/** The place a check used: its two-letter code, Grid's name for it, and where it came from. */
export interface PlaceUsed {
  readonly country: string
  readonly name: string
  readonly from: PlaceFrom
}

/** What a check does when no place is stated: apply no figure (COD-3), or the US figures (before it). */
export type WithoutPlace = 'no-figures' | 'us-figures'

/**
 * The default with no place stated. COD-3 ships lab W-12's: no figure is applied. `us-figures`
 * restores the behaviour before COD-3; it waits on COD-1, the owner's decision.
 */
export const WITHOUT_PLACE: WithoutPlace = 'no-figures'

/** A place given to a check that is not on Grid's list. Its message names the argument and the rule, never the text. */
export class PlaceRefused extends Error {
  constructor(argument = 'country') {
    super(placeRefusalText(argument))
    this.name = 'PlaceRefused'
  }
}

/** Why a place given as `argument` was refused, without the text it was given (MSG-9). */
export function placeRefusalText(argument: string): string {
  return `${argument} names no place Grid knows: give a country's name or its two- or three-letter code (ISO 3166-1), such as US, USA, United States or Spain, in at most ${PLACE_TEXT_MAX} characters`
}

/** The place on Grid's list a caller named, or null when none was named. Throws `PlaceRefused` for text that names none. */
export function requestedPlace(text: string | undefined, argument = 'country'): PlaceUsed | null {
  if (text === undefined || text.trim() === '') return null
  const country = countryOf(text)
  if (country === null) throw new PlaceRefused(argument)
  return { country: country.code, name: country.name, from: 'request' }
}

/** The place the plan states, or null. A place the schema would refuse is read as not stated. */
export function planPlace(plan: Pick<FloorPlan, 'site'>): PlaceUsed | null {
  const text = plan.site?.country
  const country = typeof text === 'string' ? countryOf(text) : null
  return country === null ? null : { country: country.code, name: country.name, from: 'plan' }
}

/**
 * The place a check is for: the caller's, else the plan's, else the United States when
 * `withoutPlace` is `us-figures`, else null. Throws `PlaceRefused` when the caller named no place
 * Grid knows.
 */
export function placeFor(
  plan: Pick<FloorPlan, 'site'>,
  options: { readonly country?: string; readonly withoutPlace?: WithoutPlace } = {}
): PlaceUsed | null {
  const place = requestedPlace(options.country) ?? planPlace(plan)
  if (place !== null) return place
  return (options.withoutPlace ?? WITHOUT_PLACE) === 'us-figures' ? { country: 'US', name: countryName('US'), from: 'assumed' } : null
}

/** COD-3: what a report says when no place is stated: no figure was applied. The count the US figures would have given stays in the record, not in the sentence. */
export function noPlaceText(): string {
  return messages.noPlace()
}

/** The same, by its key and values (MSG-11), to say in any language. */
export function noPlaceSaid(): Said {
  return saids.noPlace()
}
