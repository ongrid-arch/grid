# MSG-20: a plan with one bad note or trace image still reads

## Outcome

A plan whose writing on the drawing, sketch or facts hold one bad entry, or whose trace image
cannot be followed, is read, drawn, measured and checked like any other. The bad part alone is
left out, with one line that says where it is and why:

- A note, tag or sketch text longer than a name may be (or holding a line break or another
  character the text rule refuses) leaves out that note or sketch item, not the plan. The same
  for a fact of the person's own whose name or value breaks the text rule: that fact alone is
  left out, as a fact the format cannot read already was.
- One entry of a list the reader did not read part by part (a sketch item written with `from`
  and `to` where a line takes `points`, a stair, a saved view) leaves out that entry, with its
  own line, and the rest of the list is kept. Before, the whole list went, in one line that did
  not say how many entries it held.
- A trace image whose path leads out of the project folder, through a link out of it, is not a
  picture by its ending, or names a picture that is not in the folder yet is not followed or
  drawn. The plan reads; `grid check` and `grid_check` say so in one `plan/trace-left-out` line,
  and a picture says why it is not drawn. No file outside the project is ever read.

## Design

- `packages/cli/src/command/planText.ts`: `planTextProblem(raw, { leaveOut: true })` leaves to the
  reader the texts it can leave out alone: every text of the notes (`annotations`) and sketch
  items, the names and values of facts, and the trace image's path. Counts of entries are still
  refused. `loadPlan` reads with it; `write`, `scan` and the problem report keep refusing, since
  what they check is a plan Grid is about to write.
- `packages/floorplan/src/types/readParts.ts` (outside the stated area, one small branch):
  the plan's other lists of parts lose only their bad entries, all of one list in one turn, each
  with its own `plan/value-left-out` line at its place, positions counted in the file.
- `packages/cli/src/command/plan.ts`: `traceImageCheck` no longer throws. It says what stops the
  trace image being followed (`refused`, `ending`, `missing`), returned as `LoadedPlan.trace`.
  The plan keeps `referenceImage` as stated, so a command that writes it back loses nothing.
- `packages/cli/src/trace/traceImage.ts`: `readTrace` never throws for a refused path or an
  ending that is no picture: it says why the image is not drawn.
- `packages/cli/src/command/check.ts` passes `LoadedPlan.trace` to `inspectPlan`, whose new
  option `trace` writes the one `plan/trace-left-out` line (`worth-a-look`, about the plan),
  worded in the message files and named in the catalogue and the fragment's code table.
- Decisions: the names and ids of walls, rooms, openings, floors and the other building parts
  are still refused as MSG-9 decided; only writing on the drawing and facts are left out, since
  nothing else rests on them. A missing picture is said in the check too, as the same line,
  because the person needs to know the trace is not drawn. The fit-out's `base` path is still
  refused: a fit-out without its base is not the plan written.

## Done

- `planReading.test.ts`: a plan with a 147-character note, a note with a line break and a fact of
  150 characters is read; the note or fact is left out with one line; MSG-9's refusals of a long
  room name or id stay.
- `readParts.test.ts`: one sketch line written with `from` and `to` among twenty good items leaves
  out that item alone, with one line at its place; two bad entries in one list give two lines.
- `traceImage.test.ts` and `everyPath.e2e.test.ts`: every trace path the path tests hold reads the plan, never
  reads the file outside, and says why in `grid check`, `grid_check` and the picture; a missing
  picture says so in the check.
- `contract.test.ts` with the fragment's code row; `ownWords.test.ts`; type check, lint, the
  touched packages' tests and the scoreboard.
