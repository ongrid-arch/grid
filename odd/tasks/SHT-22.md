# SHT-22: write notes, tags, symbols and sketch lines through a tool and rooms text

## Outcome

The plan file already holds writing on the drawing (`annotations`: notes, tags, symbols and the
key) and a sketch layer (`sketch`: lines, shapes, rectangles, arcs and text), and the drawing,
the sheet and the DXF export draw both. Until now nothing but a hand edit of the plan file wrote
them, so an agent making an evacuation map, a marked-up sketch or a clinic's room tags could not
place "you are here", a tag on each extinguisher or the way out, and drew its own picture
instead of Grid's.

When this is done:

- Rooms text takes them in lines of their own, each by floor, by room or at a point:
  `note "<text>" at x,y | in <room>`, `tag "<text>" ...`, `symbol north|entrance ... [turn <deg>]`,
  `key [at x,y]`, `sketch line|shape|rect|arc|text <category> ...`, and `route [<category>] x,y x,y ...`,
  a line drawn with an arrowhead at its end (the way out). `on <floor>` names the floor; with no
  `on`, a line written under a `floor` line is on that floor. `[id <id>]` names it; left out, Grid
  gives `note-1`, `tag-1`, `sketch-1`, `route-1` and so on.
- `grid describe --as rooms` writes the plan's annotations and sketch back as these lines, so
  writing the text again keeps them; `grid write` keeps the file's when the text writes none.
- `grid_annotate` places the same, one at a time from its own arguments (`kind`, `text`, `at`,
  `room`, `floor`, `points`, ...) or many at once as rooms text lines (`lines`), and takes them
  out by id (`remove`). It answers with what it placed, each with its id, kind, place and floor,
  and what the drawing now carries on each floor.
- The rooms text answer lists what its lines placed, the same way.

## Design

- `packages/floorplan/src/rooms/notes.ts` (new): the one reading of these lines and the one
  making of the plan's records, shared by rooms text and the tool.
  - `noteOfWords` / `noteOfLine`: a line's words into `NoteWords`, a plain record of what was
    said (kind, text, symbol, place, floor, turn, points, category, arc figures, id).
  - `placeNotes(plan, entries, ...)`: `NoteWords` into the plan's `Annotation` and `SketchItem`
    records, checked by the schema, with ids given in order (`<kind>-<n>`, the next free), a room
    and a floor checked against the plan, and every refusal naming what to write instead.
  - A route is a sketch `line` whose last three points draw a V-shaped head at its end
    (`routeHead`): the plan format has no arrow, and its sketch is drawn as written, so the head
    is part of the line and every drawing and export shows it with no change of theirs. The
    read-back finds a route by working the head out again from the rest of the line
    (`routeShaft`) and writes it as a `route` line; any other line stays a `sketch line`. The
    head is 0.4 m long at most, half the last leg when that is shorter: a drawing size, not a
    tolerance.
  - `noteLines(plan, lastFloor)`: the read-back, every annotation then every sketch item, each
    with `on <floor>` only when it is not the floor of the block it is written under, and `id`
    only when the id is not the one Grid would give it.
  - `notesSummary`: what the drawing carries, by floor, for the rooms text answer and the tool.
  - `NoteLines`: the compiler's reader, as `SiteLines` and `StairLines` are.
- `rooms/compile.ts`: only the hook lines: the dispatch of the line words with the floor of the
  block, one call at the end (`emitNotes`), the header's grammar and the list of line words.
  Decision: rooms text stays the compiler's shared file; nothing else in it changes.
- `rooms/read.ts`: one hook, the lines after the stairs.
- `packages/cli/src/command/write.ts`: the text's annotations and sketch replace the file's when
  it writes any of each; otherwise the file's stay.
- `packages/cli/src/edit/annotate.ts` (new): `annotate(survey, request)`, a `Patch` of the plan's
  `annotations` and `sketch`: the ids taken out first, then the entries placed after the plan's
  own, refused with nothing written when one cannot be placed.
- `packages/cli/src/mcp/annotateTool.ts` (new): `grid_annotate`, through `writeChange`, registered
  in `serveTools.ts` by one line after the site's tools and before the saved views: it changes
  the drawing only, never the building or the ground.
- Decisions kept to the brief's area: no new symbol (the plan format has `north` and `entrance`;
  an extinguisher or "you are here" is a tag), and no new field in the plan schema (a route is a
  line with its head drawn in). Both are for a person to look at if Grid should draw more symbols
  or a true arrow.

## Done

- `packages/floorplan/src/rooms/__tests__/notes.test.ts`: every line kind written and read back,
  a route's head, ids and floors given and left out, refusals (no text, no place, an unknown room
  or floor, a duplicate id), and a plan with annotations and sketch read as rooms text and
  written again with nothing lost.
- `packages/cli/src/mcp/__tests__/annotate.test.ts`: `grid_annotate` places a tag at a point, a
  note in a room, a symbol, a route on the first floor, lines given as rooms text, removes by id,
  refuses an unknown room with nothing written, and its answer lists each part and the floors;
  the drawing of the plan holds the route as a sketch path.
- `tools.test.ts` with the new tool in its order and its example call; the write command keeps
  the file's annotations when the text writes none.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on `packages/floorplan` and
  `packages/cli`, `ownWords.test.ts`, `tolerances.test.ts` (both), and `npm run scoreboard`.
