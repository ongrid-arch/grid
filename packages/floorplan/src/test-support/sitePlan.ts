/**
 * VEW-85: an invented site for the site plan's tests: a house of two storeys, a garden studio
 * behind it and a garage beside it on a 40 × 30 m plot, a street to the south, set-backs the
 * person asked for, north stated, an old oak and a paved assembly point, each labelled.
 */
import { compileRoomsText } from '../rooms/compile'
import { parseFloorPlan, type FloorPlan } from '../types/floorplan'

export const SITE_PLAN_TEXT = `plan "Garden"
plot 40 x 30 at 0,0
street south
setback street 4
setback edge 2 2
north 10
site name "Garden Court"
site address "1 Example Lane"
site tree oak at 30,24 canopy 6 "Old oak"
site paving yard 20,20 24,20 24,24 20,24 "Assembly point"
floor house "House" level 0
room liv "Living" living 10 x 8 at 5,4
door d1 in liv south, centred, 0.9 wide
floor up "House upper" level 1
room bed "Bedroom" bedroom 10 x 8 at 5,4
floor studio "Studio" level 0
room stu "Studio" office 4 x 4 at 8,20
door d2 in stu south, centred, 0.9 wide
floor garage "Garage" level 0
room gar "Garage" garage 4 x 5 at 26,4
door d3 in gar south, centred, 0.9 wide
`

export const SITE_PLAN_BUILDINGS = [
  { id: 'house', name: 'House', floors: ['house', 'up'] },
  { id: 'studio', name: 'Studio', floors: ['studio'] },
  { id: 'garage', name: 'Garage', floors: ['garage'] },
]

/** The site as a plan, with its three buildings named unless `named` is false. Throws when the text no longer compiles. */
export function sitePlanFixture(named = true): FloorPlan {
  const made = compileRoomsText(SITE_PLAN_TEXT)
  if (made.problems.length > 0) throw new Error(made.problems.map((p) => p.message).join('; '))
  return parseFloorPlan({ ...(made.plan as object), ...(named ? { buildings: SITE_PLAN_BUILDINGS } : {}) })
}
