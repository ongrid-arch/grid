# Every floor to DXF, at a scale that fits, with typed blocks

## Outcome

- A DXF of a plan with several floors holds every floor unless one is asked for: each floor
  drawn in model space beside the one below it, and a paper layout of its own named after the
  floor (its name, else its id). Nothing is left out without a word: the answer and the file
  say which floors the file holds.
- `--floor all` (`floor: "all"` for `grid_export`) writes one file per floor, each named after
  its floor. `--floor` takes a floor's name as well as its id, and a file of one floor is named
  after that floor, not after its place in the list.
- Each layout shows its floor at the largest standard scale it fits on A3 (1:100, 1:200, 1:500,
  1:1000), or at the scale the person states (`--scale`, `scale`, or the project's
  `dxf-layers.json`). When the floor does not fit at the scale used, the sheet and the answer
  say so and give the scale it fits at. Text and line types are sized for the scale used.
- A door or window block is one schedule type: openings of different heights or types never
  share a block. Each insert carries the attributes MARK, TYPE, WIDTH, HEIGHT and SILL. MARK is
  the opening's mark in the schedules (`D1`, `W1`), and the IFC writes the same mark as the
  door's or window's Tag.
- A door's hand is said one way everywhere: the side its hinges are on, seen from the side it
  opens toward (the room it opens into). The schedule already says it so; the DXF block names
  it (`-LH`, `-RH`) and the IFC door style's name says it, with a note on how IFC's own
  operation type reads it.
- `grid_export` takes `out`, a file inside the project, as `grid export --out` does.

## Design

- `packages/floorplan/src/geometry/export/dxf.ts`: `toDxf` keeps one floor in model space;
  `toDxfFloors` writes several. Both go through one writer that takes a list of floors. A floor
  after the first is moved along X by `Out.shift`, a whole number of 10 m past the one before,
  so every entity is written once and the sheet's viewport looks at the moved floor. Several
  layouts take `*Paper_Space`, `*Paper_Space0` and on, as the format asks: the first layout's
  entities in the entities section, the others' in their block. Each floor's title in model
  space says how far it was moved, so a drafter can put it back.
- The scale: `dxfSheetScale` measures each floor's frame (the drawing with its dimensions) with
  a margin on paper for the label and the notes, and picks the largest standard scale that
  fits the viewport; one scale for the file, the smallest any floor needs, since a set of plans
  is drawn at one scale. A stated scale is used as stated. Grid starts at 1:100, its sheet's
  usual scale; 1:50 is used when stated.
- Opening blocks are keyed by kind, symbol, width, height, wall thickness, hand and schedule
  type. `DxfOptions.openings` gives each opening's mark, type, height and sill; with none given
  the mark is the opening's id and the type its kind and size. The CLI passes the schedule's
  marks and types (`openingSchedule`), and the same marks to the IFC (`IfcOptions.marks`).
- The hand: `sideSeenFrom` in `handing.ts` (the schedule's rule) is the one convention, named
  `doorHand`. The DXF block's suffix and the IFC style's words use it.
- `packages/floorplan/src/export/planExport.ts`: DXF with no floor named holds every floor;
  `exportPlan` answers with `sheets`, one per floor: the scale, whether it was stated, whether
  it fits and the scale it fits at.
- CLI: `command/export.ts` resolves a floor by id or name, writes one file per floor for `all`,
  names each file after its floor (sanitised as the plan's own name is; its place in the list
  when the name cannot be used), and prints the scale line. `export/dxfProfile.ts` says whether
  the profile states its scale. `grid_export` gets `out` and `scale`, and `files` and `sheets`
  in its answer.
- Words go in the message files (`drawing.export.*`, `dxf.*`), English and the Spanish draft.

## Done

- floorplan tests: a two-floor plan gives one DXF with two layouts named by the floors, the
  second floor beside the first, and the file holds together (`dxfProblems`); a 121 m plan is
  drawn at 1:500 and a stated 1:100 says it does not fit and fits at 1:500; two windows of one
  width and different heights are two blocks, with MARK, TYPE, WIDTH, HEIGHT and SILL; a door's
  block hand agrees with the schedule's side; the IFC Tag is the mark given.
- CLI tests: `--floor all` writes a file per floor named after each; `--floor` by name; the
  file of a named floor is named after it; `grid_export` with `out` and with `floor: "all"`.
- The golden DXF is regenerated in this change, its diff read.
- `npm run build`, `typecheck`, `lint`, the floorplan and cli test folders, `ownWords`,
  `contract` and `npm run scoreboard` exit 0.
