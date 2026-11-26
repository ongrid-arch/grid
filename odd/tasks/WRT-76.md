# WRT-76: open and railing edges on outdoor space

## Outcome

An agent that writes a balcony, a deck, a terrace, a yard, a canopy, a pavement terrace, a
parking deck or an access gallery in rooms text gets outdoor space with the edges it means,
not a room shut in by full-height outside walls:

- An outdoor room (`outdoor <kind>`) is open on every side no room faces: its edges are
  dividing lines (virtual walls), so it adds no wall, no slab edge and no "no way out" finding.
  Two outdoor rooms that touch are open to each other (twelve ferry lanes side by side need no
  `open` on each), and an outdoor room may stand apart from the building by any gap: no filler
  room and no `rooms/gap` refusal.
- A room line takes `edge open|railing <h>|wall [<h>]`, for the sides of the room no other room
  faces: open, a railing (or a balustrade, or a car park's edge barrier) of that height, or a
  wall, at the room's own `walls <t>` (else the floor's outside thickness) and, given, a height
  of its own (a roof terrace's parapet). It works on any room: an indoor room's `edge wall`
  gives its outside walls the room's `walls` thickness, so a summerhouse's `walls 0.1` is used.
- `wall <room> <side> virtual` opens that outside side of any room; `wall <room> <side> ...
  railing height <h>` makes it a railing; any other `wall <room> <side>` line on an outdoor room
  makes that side a wall.
- `open <side>` on a room line (in a unit too, mirrored with it) opens that side onto whatever
  room is there, however many: a unit's rooms, a street, or nothing (an open edge).
- The answer says what `walls` and `height` on a room line applied to when it may not be what
  was meant: an outdoor room's `walls` set its own edges (never the building's wall beside it),
  and nothing when its edges are open; its `height` is its headroom, not its edges'; an indoor
  room's `walls` that set none of its walls says how to give them to its outside walls.
- An outdoor word in the use slot that is no kind of Grid's (patio, deck, veranda, yard, loggia,
  roof terrace, walkway, ...) is refused with the line written `- ... outdoor <kind>`, as
  terrace and balcony already are, so no agent picks `other` and gets a wrong inside area.
- The drawing gives outdoor space its own fill, draws its open edges as thin solid lines (not a
  dividing line's dashes), draws a railing as a thin line and a wall lower than the plan's cut
  as a light outline. Outside stairs and access galleries written as outdoor space draw open.
- `grid describe --as rooms` writes every edge back, so writing the text again loses nothing:
  a solid outside wall of an outdoor room as a `wall <room> <side>` line, a railing with
  `railing`, an open side of an indoor room as `wall <room> <side> virtual`.

## Design

- Schema (`types/floorplan.ts`): one optional wall field, `railing: true` (a railing or
  balustrade: a low, see-through edge, drawn as a line), written into C26's text; no new
  convention. A plan that states none reads exactly as before.
- `packages/floorplan/src/rooms/edges.ts` (new): the room line's `edge` words (`edgeWords`),
  the outdoor words for the use slot (`outdoorWordKind`), and `outsideEdge`, which decides one
  outside stretch of a room from its `edge`, its `wall <room> <side>` line, its `open <side>`
  words and whether it is outdoor. Railing thickness is the room's `walls <t>` or the floor's
  inside thickness, so no new figure.
- `rooms/compile.ts`, hook lines only: the room line reads `edge` and `open <side>` into the
  room draft; `wall <room> <side>` allows `virtual` and `railing`; in `derive` the outside
  stretch asks `outsideEdge`, two touching outdoor rooms (or a side opened by `open <side>`) are
  open, and a gap past a wall's width beside outdoor space is no problem; the answer notes come
  after the walls are built; the use slot asks `outdoorWordKind` before refusing a use.
- `rooms/read.ts`: an outdoor room's solid outside walls and an indoor room's open ones are
  written as `wall <room> <side>` lines; a railing adds `railing`.
- Drawing: `geometry/floorplan.ts` marks a drawn room `outdoor`, a wall `railing`, a wall lower
  than `planCutHeight` `low`, and a dividing line with outdoor space only beside it `edge`; the
  viewer's `picture/scene.ts` paints them with new look entries (an outdoor fill, an edge line).
- Messages in `messages/en.ts` and `es.ts`: no new finding code; the notes are warnings of the
  rooms text (`rooms/walls-unused`, `rooms/outdoor-height`).

## Done

- `rooms/__tests__/outdoorEdges.test.ts`: an outdoor room's outside walls are virtual; `edge
  railing 1.1` gives thin railings of 1.1 m with `railing`; `edge wall 0.45` with `walls 0.15`
  gives a 0.15 m parapet 0.45 m high; `wall t north virtual` on an indoor room opens it; two
  touching outdoor rooms are open; an outdoor room may stand 1 m from the house; `open south`
  opens onto a unit's rooms and onto nothing; the notes for `walls` and `height`; `patio` and
  `deck` in the use slot are refused with `outdoor terrace`; each case reads back as rooms text
  and writes again to the same plan.
- The existing outdoor tests (CNT-7, WRT-31, LVL-12) still pass, changed only where an outdoor
  room's outside wall is now open, and say so.
- Viewer tests: an outdoor room is painted with its own fill, an open edge as a thin solid line,
  a railing as a line and a low wall as an outline.
- `npm run build`, `typecheck`, `lint`, vitest on `packages/floorplan`, `packages/viewer` and
  `packages/cli`, the tolerances test and the scoreboard (no count worse).
