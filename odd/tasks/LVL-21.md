# LVL-21: write stairs in rooms text and through a tool

## Outcome

An agent that writes a plan of more than one floor, in rooms text or through the tool server,
can put a stair in it without editing `plan.json` by hand, drawing treads as walls or leaving
the stair as an empty room:

- Rooms text takes a stair in a line of its own, laid out in a room:
  `stair <id> ["<name>"] from <floor|room> to <floor|room> in <room>, <width> wide, straight|L|U, runs <north|south|east|west> [then <side>] [along <side>] [risers <n>]`,
  or along a walking line of its own: `stair <id> from <floor> to <floor>, <width> wide, run x,y x,y ...`.
  A room named after `from` or `to` stands for its floor; with no `in`, the stair goes in the
  room `from` (or else `to`) names. `raw stair {...}` takes Grid's own JSON for a stair.
- The stair it writes is the plan's own `stairs` entry, so the drawing's treads and break line,
  the sections, the 3D model, the IFC export and the way-out check read it as they read every
  stair; the answer says where its walking line went and what Grid worked out for it (risers,
  their height, the going and the pitch).
- `grid describe --as rooms` writes every stair back as a `stair` line (in its room when the
  room's words give back the same walking line, along its walking line otherwise, `raw stair`
  when Grid cannot lay it out), so writing the text again keeps it; `grid write` keeps the
  file's stairs when the text writes none, and says so.
- `grid_add_stair` adds a stair by the same words (or its walking line); `grid_change_stair`
  changes one (its room, shape, direction, width, floors, risers, name or walking line) or
  removes it. Both answer with the stair as laid out.

## Design

- `packages/floorplan/src/rooms/stairs.ts` (new): the one reading of a stair's words, for rooms
  text and the tools alike. `layStair(plan, words)` resolves the floors (a floor id, or a room
  whose floor it is), finds the room and lays the walking line in the box of its inside faces,
  with the direction `runs` names (the way the walking line goes from `from` towards `to`):
  - every end of the walking line keeps a landing as deep as the stair is wide inside the room,
    so the end stands in the room (and in the room over it on the other floor) and never on a
    wall's face; that is the same square landing Grid's stairs turn on (`geometry/stairs.ts`);
  - `straight`: one flight, centred across the room, or against the side `along` names;
  - `L`: up against the side away from the turn, a square landing in the far corner, then a
    flight towards the side `then` names (clockwise from `runs` when left out);
  - `U`: two flights against the two sides, joined across the room by a short flight between two
    square landings: Grid's stairs turn only on square landings as wide as the flight, so a U is
    three flights, the middle one crossing the well. The room must be wider than twice the stair.
  A layout that leaves a flight too short, a room the stair does not fit, a floor the plan does
  not have, or a room on another floor is refused naming the room's size and what it needs. The
  result is checked by `planStairs`, so any stair Grid could not lay out is refused, and its
  warnings (an end in no room) are said. `StairLines` reads the lines as they come (the
  compiler calls it at the end, once the rooms are drawn). `stairWordsOf(plan, stair)` finds
  the words that give back a stair's own walking line; `stairLines(plan)` writes the read-back.
- `rooms/compile.ts`: only the dispatch of the `stair` line and `raw stair`, one call in
  `emit`, and the header's grammar. `raw stair` is read with `StairSchema`; it is not laid out
  again, so a stair Grid cannot lay out still reads back and writes again unchanged.
- `rooms/read.ts`: the stair lines after the floors.
- `packages/cli/src/command/write.ts`: the text's stairs replace the file's when it writes any;
  otherwise the file's stay, and the answer says so.
- `packages/cli/src/edit/stairs.ts` (new): `addStair` and `changeStair`, each a `Patch` (the
  plan's `stairs`, or `parts` for a stair changed, so it keeps every field as written).
  A change of the room, shape, direction or width of a stair laid in a room lays it out again
  from its words with the new ones; a stair along a walking line of its own keeps that line
  unless a new one is given.
- `packages/cli/src/mcp/stairTools.ts` (new): the two tools, through `writeChange`, registered
  in `serveTools.ts` after `grid_set_facts` by one line: they change the building, so they come
  before the site's tools and the saved views.
- The grammar's topic for stairs (`mcp/roomsGrammar.ts`), the docs (`docs/rooms-first.md`,
  `docs/tool-server.md`), `AGENTS.md`'s tool count, and `changes/LVL-21.md`.
- No new convention and no new message code: the rooms codes are the compiler's own
  (`rooms/stair`), not in the record.

## Done

- `packages/floorplan/src/rooms/__tests__/stairs.test.ts`: a straight, an L and a U stair
  written in rooms text become the plan's stairs, laid out by `planStairs` with their ends in the
  rooms named; a room as `from`, no `in`, `along`, `then` and `risers`; a walking line of its
  own; refusals (an unknown floor or room, the same floor twice, a room too short or too narrow,
  no width); `raw stair`; and the read-back writes every stair again unchanged.
- `rooms/__tests__/rawInput.test.ts`: `raw stair` is taken; other kinds still refused.
- `packages/cli/src/mcp/__tests__/stairTools.test.ts`: `grid_add_stair` and
  `grid_change_stair` add, change and remove a stair on a two-floor house, refuse what they
  cannot do with nothing written, and `grid_write_rooms` keeps a file's stairs.
- `tools.test.ts`, `server.test.ts`, `everyPath.e2e.test.ts`, `ownWords.test.ts` updated for
  the two tools and the new sentences.
- `npm run typecheck`, `npm run lint`, the floorplan and cli test folders and
  `npm run scoreboard` (no count worse).
