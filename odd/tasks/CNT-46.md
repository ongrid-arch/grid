# CNT-46: write parking bays and ramps in rooms text and through tools

## Outcome

An agent asked for a car park (a basement, a podium, a spiral car park) writes its bays and ramps
the way it writes the rooms, never by hand-writing hundreds of bays into `plan.json` and never by
drawing a helix ramp as a square room:

- Rooms text takes a bay, a row of bays and a ramp in lines of their own, after the rooms:
  - `bay <id> at x,y, <width> x <length> [turn <deg>] [number <n>] [on <floor>]`: one bay, on the
    floor of the floor line above it unless `on` says another.
  - `bays <group> in <room> along <side>, <width> x <length> [count <n>] [offset <m>] [from <end>] [inset <m>] [numbered <first>]`:
    one row against a side of a room, as many as fit unless `count` says.
  - `bays <group> in <room> fill, <width> x <length> [aisle <m>] [rows east-west|north-south] [from <side>] [count <n>] [numbered <first>]`:
    the room filled with rows of bays and the aisles between them (a row, an aisle, two rows back
    to back, an aisle, ...).
  - `bays <group> at x,y, <width> x <length>, count <n>, runs <way> [pitch <m>] [turn <deg>] [first <k>] [numbered <first>] [on <floor>]`:
    a row by its first bay's middle, the read-back's own form.
  - A kind word (`car`, `small`, `accessible`, `motorcycle`) in place of the size gives Grid's own
    size for that kind, said as Grid's and not a code figure.
  - `ramp <id> ["<name>"] from <floor|room> to <floor|room> [in <room>], <width> wide, straight, runs <way> [along <side>] [slope <%>]`,
    `..., run x,y x,y ...` (its middle line) or `..., helix [at x,y] [radius <m>] [turns <n>] [starts <side|deg>] [clockwise]`:
    a straight ramp laid in its room, one along its own middle line, or a helix, whose middle line
    Grid writes as the points of the circle.
  - `raw bay {...}` and `raw ramp {...}` take the plan file's own JSON.
- What they write is the plan's own `bays` and `ramps` (C29, CNT-19), so the drawing, the counts,
  the takeoff, the slab openings and the checks read them as they read every bay and ramp. The
  answer says how many bays each line placed, their numbers, and each ramp's rise, run and slope.
- `grid describe --as rooms` writes them back: bays in rows where they make one, else one line
  each, else raw; ramps as a helix, in their room, along their middle line, else raw. `grid write`
  keeps the file's bays and ramps when the text writes none, and says so.
- `grid_place_bays` places rows of bays in a room by the same words (module: bay size or kind,
  aisle, which way the rows run, where they start, numbering, how many), and `grid_add_ramp` adds a
  ramp by the same words as the line. The guide for agents has a car-park section.

## Design

- `packages/floorplan/src/rooms/parking.ts` (new, the lines' one reading, for rooms text and the
  tools alike): the words of a bay, a row and a ramp (`bayOfWords`, `rampOfWords`), laying them out
  (`layBays`, `layRamp`), the module fill (`fillRows`), the read-back (`parkingLines`) and
  `ParkingLines`, which the compiler calls at the end, once the rooms are drawn, as `StairLines`.
  - A row is always laid out by one function from its explicit words (first bay's middle, the way
    it runs, the pitch, the turn), so a row in a room, a fill and the read-back give the very same
    numbers, and the read-back's grouping is checked by laying the row out again.
  - Numbering: `numbered <first>` counts on from the last digits of `first`, keeping their width
    (`B1-07`, `B1-08`, ...). The tool numbers on from the floor's highest number when it is not
    told.
  - A helix is stored as the points of its middle line (C29 holds a polyline): 24 a full turn, at
    most the schema's 64 points; the read-back finds the circle and gives it back as a helix only
    when laying it out again gives the same points.
  - A ramp is checked by `planRamps` (CNT-19): a fault it would leave the ramp out for refuses the
    line (`rooms/ramp`). A bay row that would leave its room, or a fill with no room for one row and
    its aisle, refuses the line (`rooms/bay`).
- Hook lines only in the shared files: `rooms/compile.ts` (dispatch of `bay`, `bays`, `ramp`, the
  raw kinds, one call in `emit`, the header's grammar), `rooms/read.ts` (the lines after the
  floors), `rooms/index.ts` (exports), `command/write.ts` (the file's bays and ramps kept or
  replaced), `mcp/serveTools.ts` (the two tools' registration), `mcp/roomsGrammar.ts` (a `parking`
  topic), `guide/guide.ts` (the car-park section) and the messages for `raw`.
- `packages/cli/src/edit/parking.ts` (new): the patches for `grid_place_bays` and `grid_add_ramp`;
  `packages/cli/src/mcp/parkingTools.ts` (new): the two tools.
- Decisions:
  - A bay's kind is not recorded: C29 has no field for it, and a new field is a change to the
    convention for a person to decide. A kind gives the bay its size only, and the answer says so.
  - Bay ids in a row are `<group>-<k>`; a fill numbers its bays across its rows in one run.
  - The fill leaves bays out that would leave the room or stand on a column or another bay; it
    does not keep doors clear or check that a car can turn in (a swept-path check, which Grid does
    not make).

## Done

- `packages/floorplan/src/rooms/__tests__/parking.test.ts`: each line writes the bays and ramps it
  says; a fill gives rows and aisles; numbering counts on; kinds give Grid's sizes; the helix's
  points lie on its circle and its slope comes from the floors' levels; refusals name the room and
  what it needs; raw lines are kept; the read-back writes rows, helices and in-room ramps and
  writing it again gives the same bays and ramps.
- `packages/cli/src/mcp/__tests__/parkingTools.test.ts`: `grid_place_bays` fills a room, numbers
  on, replaces its group; `grid_add_ramp` adds a helix and a straight ramp and refuses a bad one.
- `tools.test.ts` (calls, order), `roomsGrammar.test.ts`, the guide's tests, `ownWords.test.ts`,
  the tolerance tests; `npm run build`, `typecheck`, `lint`, the touched packages' tests and the
  scoreboard.
