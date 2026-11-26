# CMD-38: the whole rooms grammar where agents read it

## Outcome

An agent that has only Grid's tool texts knows everything rooms text can write: floors with
their elevation, copied floors and rooms that rise `through` floors; rooms drawn as polygons and
corners cut out; a curved wall written raw with its centre and its sweep in degrees; a raw room
named by its walls; outdoor rooms; a room's own height and its floor set lower or higher; rooms
open to each other; a floor's roof written raw; and a room type written once and placed many
times (`unit`, `place`, `repeat`, `mirror`, `fill`). Each comes with one short example that
Grid writes without a problem. A long building need not be pasted into a call: `grid_write_rooms`
takes the rooms text from a file in the project (`roomsFile`).

## Design

- `packages/cli/src/mcp/roomsGrammar.ts`: the grammar as topics (rooms, openings, floors,
  shapes, curves, raw parts, outdoor, heights, open sides, roofs, repeats, other lines), each
  with its lines and one example. One source, three readers:
  - the `rooms` argument of `grid_write_rooms` carries every topic, so `tools/list` shows it; the
    tool's own description names the topics in one sentence and says where the grammar is;
  - a resource, `grid://guide/rooms`, serves it as markdown beside the guide;
  - `docs/rooms-first.md` holds the same markdown under "The whole grammar"; a test holds the
    two equal, as the guide's page is held to `agentGuide()`.
- `roomsFile` on `grid_write_rooms`: a path inside the project, read through the project's files
  as `grid write` reads its rooms file (`readRoomsFile`), in place of `rooms`. Passing both, or
  it with `layout` or `scan`, is refused as the other ways in are.
- No new tool: the fixed list of 37 tools stays, and a tool an agent must call first to learn
  the grammar would be missed as the guide resource is. No new convention or message code.

## Done

- `packages/cli/src/mcp/__tests__/roomsGrammar.test.ts`: every topic's example compiles with no
  problem; the `rooms` argument and the resource carry every topic; the words agents never found
  (arc, sweep, polygon, elevation, copy, through, outdoor, unit, repeat, mirror, raw floor, roof)
  are in the tool text; `docs/rooms-first.md` holds the markdown word for word; `roomsFile`
  writes a plan from a file in the project and is refused with `rooms`.
- `everyPath.e2e.test.ts` lists `grid_write_rooms roomsFile`.
- Type check of `packages/cli`, lint, the `packages/cli` mcp and guide tests, `ownWords.test.ts`
  and `tolerances.test.ts`.
