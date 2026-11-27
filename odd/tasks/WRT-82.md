# WRT-82: curved walls by their ends and a point, a radius or a bulge; the sweep in the fix

## Outcome

An agent that knows a curved wall by what a drawing gives it writes it as that, and Grid works
out the centre and the sweep (C21's `arc`):

- `raw wall {"id": "bay", "start": [0, 0], "end": [6, 0], "arc": {"through": [3, 1.5]}, ...}`:
  the two ends and any point on the curve between them.
- `"arc": {"radius": 4, "side": "left"}`: the two ends and the radius, the curve bowing to that
  side going from start to end, the shorter way (for more than half a circle, give `through`).
- `"arc": {"bulge": 0.4}`: the bulge as CAD drawings store it, the tangent of a quarter of the
  sweep, positive counter-clockwise; a bulge of 0 is a straight wall.
- `"from"` and `"to"` are read as `start` and `end`, on the wall or inside its `arc`.
- `"centre"` and `"sweep"` stay as they were. One form an arc; two at once, or a form that names
  no curve (three points in a line, a radius under half the chord, a side that is no side), is
  refused with its line and what each form takes.

The plan file still holds only `centre` and `sweep`: rooms text works them out and writes them.

When a curved wall's end lies on its circle but the sweep does not reach it (the wrong sign, a
sweep in radians), `wall/arc-ends-apart` names the sweep that does, to four decimals, so the
agent can copy it. `grid_write_rooms` (and `grid write`) list the drawing's new problems by code
and part, with their sentences, instead of only counting them.

## Design

- `packages/floorplan/src/rooms/curves.ts`: `arcOfEnds`, pure: start, end and one form in,
  `{ centre, sweep }` or the reason it names no curve out.
- `packages/floorplan/src/rooms/compile.ts`, `rawPart`: before the fields are checked, a raw
  wall's `from`/`to` become `start`/`end` and its `arc` of another form becomes centre and sweep
  (`rooms/raw` with its line when it cannot). The words are in `messages/en.ts` (and `es.ts`).
- `packages/floorplan/src/geometry/arc.ts`, `curveFault`: with the end on the circle, the sweep
  that reaches it, the stated way round or the other, whichever is nearer the stated size, said
  in a second sentence of the same code (`issue.wall/arc-ends-apart.reach`). No new code.
- `packages/cli/src/command/write.ts`: the drawing's problems after the write that were not
  there before, matched by code and part, listed after the count (at most five, then how many
  more), and in the tool's data as `drawingProblems.new`.
- The served grammar (`packages/cli/src/mcp/roomsGrammar.ts`) and `docs/rooms-first.md` name the
  forms. No new convention and no new tolerance: the forms use `noLength` and `joint`.

## Done

- `rooms/__tests__/arcForms.test.ts`: each form writes the same wall as its centre and sweep;
  `from`/`to`; refusals for mixed forms, collinear points, a short radius and a bad side.
- `geometry/__tests__/curvedWalls.test.ts`: the wrong-sign sweep names +102.68 (to four
  decimals); a sweep given in radians names the degrees.
- `cli/src/mcp/__tests__/curvedWalls.test.ts`: `grid_write_rooms` lists `wall/arc-ends-apart`
  with its wall among the new problems.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders changed, the
  tolerances test, `ownWords.test.ts` and `contract.test.ts`.
