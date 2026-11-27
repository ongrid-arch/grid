# CMD-49: a curved or angled side is reported as one side

## Outcome

An agent or a person asking about a room with a curved side, or a room turned on the drawing,
reads its sides as a person would name them:

- `grid_measure what=room` on a round room 35.40 m across lists one side, `a curved side all the
  way round, radius 17.70 m, 111.21 m long`, not the 144 straight pieces the curve is traced by.
  A room with a bowed side or a round end lists its straight sides and each curve as one side,
  facing the way its middle faces, with its radius and its length along the curve. The answer's
  data gives each side its `curve` (centre, radius, sweep) or `null`, and its perimeter is
  measured along the curves.
- A room of four sides turned 7 degrees on the drawing is given by its own sides, `5.00 m × 3.00 m,
  turned 7° on the drawing`, in `grid_measure` and in `grid describe`, not by the box round it.
  A four-sided room that is not a rectangle gives its four sides going round.
- `grid describe` reads a round room as round and its width across, a curved band (a room
  between two curves on one centre) by its length along its middle and its width, and any other
  room with a curved side with each curve's radius and length, with the unit on every length.
  The walk says the same of a round room and a band at its stop. `--for agent` adds a token for
  each form after the room's size.

## Design

- `packages/cli/src/describe/sides.ts` (new, pure): `ringSides` reads a ring of points (a room's
  outline or a hole) as sides. A run of at least three pieces that turn the same way by a small
  angle at each corner (at most 10 degrees) and whose corners lie on one circle (within 5 mm) is
  one curved side: its centre, radius, sweep and its length along the circle. Every other piece is a
  straight side. A ring with no corner is read from its first point, and a curve that runs across
  that point is joined back into one. A caller may split runs where its own key changes (the wall
  a piece lies on). `roomForm` reads a room's whole outline: `round`, `band`, `turned` (a rectangle
  not square to the drawing), `four` (four straight sides, not a rectangle), `curved` (any other
  outline with a curved side), or null (rooms read by across and up as before).
- Decision: the sides are found from the outline's geometry, not from the walls' `arc`, so a curve
  drawn as many short straight walls (a hand-made plan, a scan) is read as one side too, and
  `grid describe`, which reads outlines only, says the same as `grid_measure`.
- Decision: `grid_measure` splits a curve where the wall under it changes, so a round room half on
  a wall to the band round it and half on an outside wall gives two curved sides, each with its
  wall; `grid describe` reads the room's shape and calls it round.
- `packages/cli/src/quantities/measure.ts`: `RoomSide` gains `curve`, `sidesOf` groups the survey's
  edges with `ringSides`, the perimeter is the sides' lengths, and the room measure carries its
  `form`. `packages/cli/src/mcp/readTools.ts` words the sides and the size of a turned or
  four-sided room from the message files.
- `packages/cli/src/describe/facts.ts`: `RoomShape` gains `form`; `describe/card.ts` and
  `describe/walk.ts` say it, with new keys in `en.ts` and `es.ts`.
- Not here: the rooms-text compiler and reading a plan back as rooms text (`compile.ts`,
  `read.ts`), pictures, finishes and point items. The edit answers name sides by the compass
  (`moveRoomSide`) and are unchanged.

## Done

- `packages/cli/src/describe/__tests__/sides.test.ts`: a circle, an oval, a band, a bowed side, a
  turned rectangle, a trapezoid and a plain rectangle read as the sides above; a curve traced by
  hand as short straight pieces is one side.
- `packages/cli/src/mcp/__tests__/curvedSides.test.ts`: `grid_measure what=room` and
  `grid_describe` (person, agent, walk) on a plan written from rooms text with a round room, a band,
  a hall with a bowed side and a turned studio, failing before the change.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders changed,
  `ownWords.test.ts`, the messages tests, and `npm run scoreboard`.
