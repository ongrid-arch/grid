# SHT-27: access answers on the drawing, on a sheet and found first

## Outcome
An agent asked about wheelchair access, a step-free way in or whether rooms are accessible finds
`grid_measure what=access` from the first words of the tool's description, and never has to put
it together from many `route`, `use` and `fit` calls. The numbers it gives can be handed on:

- `grid draw --marks access` and `grid_view kind=plan marks=[access]` draw on the floor plan what
  `what=access` measured: each way in and each marked route as a line from room to room through
  its doors, each room's turning circle at its size and place, each door's clear width and its
  sill beside it, and each step on a way with its height. A number under (or, for a step, over)
  one of the person's own figures carries that figure in its label ("0.75 under your 0.80"), so a
  shortfall is never an unlabelled highlight.
- `grid sheet --layout access` and `grid_sheet layout=access` print an access sheet: a page per
  floor with those marks, then the person's own figures with their quotes from the brief, the
  tables of doors, corridors, turning spaces and the ways in with their steps, each number set
  against the person's figure where there is one, and the list of what Grid did not look at.

Nothing says a room, a route or the plan is accessible; the measures are CNT-17's, unchanged.

## Design
- `packages/floorplan/src/geometry/drawingMarks.ts`: `DrawingMarksAsked.access`, given by the
  caller by part id (as ARE-15's schedule marks are): the routes' stops (room and door ids), the
  turning circles (room, centre, diameter), the doors (id) and the steps (the opening they are at),
  each with its label and whether it falls short of the person's figure. `drawingMarks` places
  them on the drawn floor (a room's label point, an opening's middle) and keeps those not on it out.
  Pure, no words of its own.
- `packages/viewer/src/picture/drawingMarks.ts`: draws them: a route as a dashed line with an
  arrow at its end, a turning circle as a dashed circle with its diameter, a door's and a step's
  label in SHT-7's tag beside the opening, heavier when short. No geometry of its own.
- `packages/cli/src/quantities/accessMarks.ts` (new): `accessMarkLabels` turns `accessAnswer`'s
  data into those marks, read with the brief beside the plan, its labels said from message keys.
  `command/section.ts`'s `MARK_WORDS` gains `access`; `grid draw` and `grid_view` add the marks
  once the plan is read, as they add the schedule's.
- `packages/cli/src/sheet/`: `SheetLayout` gains `access`. `accessSheet.ts` (new) builds its
  bodies from the same `accessAnswer` data; `pages.ts` routes the layout to it; `sheetFile.ts`
  reads the brief for it. Its tables are SheetTables, so `pdf.ts` lays them out unchanged.
- `grid_measure`'s description starts with wheelchair, step-free and accessible, naming
  `what=access` first.
- Words in `packages/floorplan/src/messages/en.ts` (and `es.ts` drafts), none in the code.
- No new convention, no tolerance, no message code.

## Done
- Tests: floorplan marks placed by id and off-floor parts left out; viewer draws each kind with
  its label; `grid draw --marks access` SVG carries the route, circles and door labels with the
  person's figure; `grid_sheet layout=access` pages hold the tables, quotes and the not-looked-at
  list; the measure description's first sentence names wheelchair, step-free and accessible.
- `npm run build`, `typecheck`, `lint`, vitest on the folders touched plus the floorplan
  `__tests__`, `cli/src/mcp`, `cli/src/command`; `npm run scoreboard` no worse.
