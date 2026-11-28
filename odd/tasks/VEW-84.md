# VEW-84: level marks at the building, on a datum line, and staggered

## Outcome

In a section and in an elevation the level marks are read off the building, not off the edge of
the picture:

- Each mark stands just beside the building (a small gap off its outermost part), not beside the
  section line's ends or past the ground line's run, and a thin datum line runs from the part it
  marks out to the mark, so the eye can follow the level back to the drawing.
- A floor's mark stands on the side of the building that floor stands on: a split level's lower
  half is marked beside that half and its upper half beside the other, each with its own datum
  line from its own edge. A floor across the whole building keeps the side it had (a section's
  floors on the left, its roofs and ground on the right; an elevation's marks on the right).
- An elevation marks the ground, each floor, a sloped roof's eaves and ridge, a flat roof's top
  and a parapet's top, as a section does; a section also marks a parapet's top it cuts.
- Levels close together are staggered: their words never print over each other. The tick and its
  triangle stay at the true level; the words of a mark that would touch the one below it step up
  clear of it, joined to their tick by a short leader.

## Design

- Core, `packages/floorplan/src/geometry/section.ts`: `SectionLevel` gains `from` and `to`, where
  the floor's cut parts and rooms stand across the section (left out when the line cuts nothing of
  that floor); `SectionRoof` gains `from`, `to` and `parapet` (the top of a parapet cut on it); the
  section gains `building`, the across-the-section extent of everything drawn of the building (cut,
  glass, items and what lies beyond), or null.
- Core, `packages/floorplan/src/geometry/facade.ts`: the facade gains `marks`, every level it marks
  (`ground`, `floor`, `eaves`, `ridge`, `roof`, `parapet`), each with its level, its floor and the
  stretch `u0` to `u1` of the faces it marks. Eaves and ridge are the same figures a section gives
  (the roof's underside at its eaves and at its top, from the floor's roof shape), so the two
  drawings agree. `levels` stays as it was.
- Viewer, new `packages/viewer/src/picture/levelMarks.ts`: one way to lay out and draw a column of
  level marks for both drawings: the side each goes on (its preferred side unless the part stands
  nearer the other edge of the building), the words stepped up out of each other's way, the datum
  line, tick, triangle and words on paper. `section.ts` and `facade.ts` call it with their own
  parts' names (`section-level`, `section-eaves-level`, ..., `facade-level`, `facade-ground-level`,
  `facade-eaves-level`, `facade-ridge-level`, `facade-roof-level`, `facade-parapet-level`).
- Framing: a section frames the marks beside the building, widening its frame only where they
  reach past the section's own bounds; `facadeFraming` keeps its signature (the sheet sizes
  elevations through it) and adds room on the left only when a mark goes there.
- Words: the mark words already in `messages` (`drawing.section.eaves`, `ridge`, `roof`, `ground`)
  serve both drawings, and one new key, `drawing.section.parapet`, in `en.ts` and `es.ts`.
- Decisions: pixel sizes of the marks (gap, tick, leader) are drawing layout in the viewer, beside
  the ones it already has, not tolerances of the plan. No new convention in `types/floorplan.ts`,
  no change to the rooms-text compiler.

## Done

- `packages/floorplan/src/geometry/__tests__/levelMarks.test.ts`: a section's levels carry their
  extents and the building's; a split-level plan's floors give different extents; a facade's marks
  list ground, floors, eaves and ridge for a gabled house, and roof and parapet for a flat roof
  with a parapet.
- `packages/viewer/src/picture/__tests__/levelMarks.test.ts`: in a section whose line runs well past
  the building the marks stand a few pixels from the building, with a datum line back to it; a
  split level's upper half is marked on the right; an elevation draws ground, eaves and ridge marks;
  two levels 0.1 m apart do not overprint (their words' boxes do not overlap).
- Existing section, facade and sheet tests keep passing (updated where they read the old parts).
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the touched folders, the
  tolerances test, `ownWords.test.ts` and `npm run scoreboard` all exit 0.
