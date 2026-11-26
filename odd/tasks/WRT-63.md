# WRT-63: refuse a place written on a polygon room

## Outcome

A room drawn as a polygon in rooms text stands where its points say: in metres (or their units)
from the drawing's origin, or from the unit's own origin in a unit, as the agent guide says. A
place written on the same line, `at x,y` before or after the points, or `north of <room>` or
`inside <room> corner <c>`, is refused on its line, never read silently. Until now `at 1,1` moved
the polygon by (1, 1) and a side or a corner was dropped without a word, so the room was drawn
somewhere the person never wrote and nothing said so. The refusal says why and how to write it:
for `at`, the polygon's points already moved by that much, ready to copy; for a side or corner,
the points where the room stands, or a size instead of the polygon.

## Design

- `packages/floorplan/src/rooms/compile.ts`, `readRoom`: once the line is read, a polygon with any
  place in `placedBy` (the list WRT-55 keeps of a line's places) is refused as `rooms/syntax`, in
  a unit as well as on a floor. The polygon is no longer moved by `place.at`, so the code that
  mirrored that offset in a unit goes.
- `packages/floorplan/src/messages/en.ts` and `es.ts`: two new sentences, `rooms.room.polygonAt`
  (offers the points moved by the `at`, written in metres) and `rooms.room.polygonPlaced` (a side
  or corner). The Spanish is a draft, as the rest of `es.ts`.
- The header of `compile.ts` and `docs/rooms-first.md` say that a polygon's points are its place.
- Decision: refuse, not read as an offset with a note. Nothing Grid writes (the read-back, the
  samples, the fixtures) puts a place on a polygon, the guide says the points are from the
  origin, and a refusal that hands back the moved points costs the agent one call and leaves no
  plan drawn in the wrong place. Reading it as an offset with a warning is the other way, and the
  easiest to switch to: the moved points are already worked out for the message.
- Decision: a side or a corner on a polygon is refused too; it was dropped silently, the same
  fault.
- No new message code (`rooms/syntax` already exists) and no new convention.

## Done

- `packages/floorplan/src/rooms/__tests__/refusalsAndEdges.test.ts`: `at` after and before a
  polygon's points is refused as `rooms/syntax`, and the message holds the moved points; `north
  of` and `inside … corner` on a polygon are refused; a polygon with no place is written where its
  points say; the same in a unit.
- Type check of `packages/floorplan`, lint, the rooms and messages tests, `ownWords.test.ts` and
  `tolerances.test.ts`.
