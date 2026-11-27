# WRT-78: curved rooms and walls in rooms text

## Outcome

An agent writes a round pavilion, an oval hall, an apse, a bowed bay or a ring of rooms in a
few words of rooms text, and Grid works out true curved walls (C21's `arc`), their kinds and
the rooms' boundaries, as it does for straight rooms. No 72-sided polygon, no rectangle for an
apse, no hand-edited JSON:

- `room pav "Pavilion" - circle 12 at 20,6`: a round room 12 m across its inside faces, centred
  at 20,6; `circle radius 6` says the same by its radius. One curved wall goes round it.
- `room hall "Hall" - oval 60 x 36 at 0,0`: an oval 60 m by 36 m inside, centred there, drawn as
  four arcs that meet without a kink (the four-centred oval masons set out), four curved walls.
- `room apse "Apse" - arc 180 east of nave`: a round end on the nave's east side: the straight
  side is a chord along the nave's east wall (as long as that side unless a length follows the
  sweep, `arc 120 6`), and the curve turns 180 degrees, or what is written, out to the east.
- `wall hall east curve radius 18`: the hall's east side, an outside side, bows out as an arc of
  radius 18 (`inward` bows it in). The wall line's other words (thickness, kind, height) still
  apply to it.
- `room ring "Ring" - band 6.2 to 10 from 0 sweep 180 at 20,6`: the floor between two radii
  round a centre, for the sweep written (a whole ring is two bands).
- Circles and ovals may be placed `<side> of <room>` too; a curved room's size is always to its
  inside faces.
- Rooms beside one another on a curve share one curved wall; doors and windows are written on
  them like any other room: `door d1 in pav east, centred, 1.2 wide` stands at the circle's east
  point, `<m> from <side>` is measured along the curve, `between pav and ring` on their shared
  curve.
- The answer gives each curved room's true inside area, and the plan measures the same.

## Design

- `packages/floorplan/src/rooms/curves.ts` (new): the shapes as outlines whose curved stretches
  are traced by short straight pieces at a fixed turn from east (so two rooms on one centre have
  their pieces at the same angles and face each other piece by piece), each room keeping the
  circles its curves lie on; the true area of such an outline; and `curveWalls`, which, once the
  walls are worked out, joins the pieces of one curve between the same rooms into one curved
  wall with `arc` (its ends moved exactly onto the circle, with the straight walls that meet
  them), so the plan holds true arcs.
- `rooms/compile.ts`, hook lines only: the room line reads `circle`, `oval`, `arc` and `band`
  and makes the outline after its place is known; `wall <room> <side> curve radius <r>` bends the
  side; after `buildWalls` the pieces are joined (`curveWalls`) before the rooms' boundaries are
  listed; an opening on a curved side is placed along the curve (its offset along the arc, as C21
  measures it), with its swing and hinge from the curve's direction there; wall lengths and room
  areas in the answer are the true ones.
- Messages in `messages/en.ts` (and `es.ts`), no new finding code: the refusals are
  `rooms/syntax`, `rooms/size` and `rooms/no-side`, as for any room line.
- Reading back: a floor with a curved wall stays in Grid's own terms (`raw`), as before; writing
  curved walls back as these words is left for a later change and said here.
- No new convention: C21 already holds the arc.

## Done

- `rooms/__tests__/curves.test.ts`: a circle, an oval, an apse, a bowed side and a band write
  curved walls (`arc`) whose rooms measure their true area within `areaReported`; two rooms on
  one curve share one curved wall; doors and windows on a curved side land where written, along
  the arc; refusals for a whole-ring band, a radius shorter than half the side and a curved word
  with a place it cannot take; `grid check` finds no error on any of them.
- `npm run typecheck`, `npm run lint`, the floorplan and cli test folders, `ownWords.test.ts`,
  `contract.test.ts` and `npm run scoreboard` (no count worse).
