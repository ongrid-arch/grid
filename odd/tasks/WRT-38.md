# WRT-38: walls placed by a face stay true through Grid's edits

## Outcome

A plan drawn from a survey, its walls placed by the faces the tape ran along (`face`, C1 as
reopened by HND-11), stays as taped through Grid's edits:

- Moving a side of a room carries every wall that ends on that side, also when those walls are
  placed by their faces, so no wall is left short of the moved side and the rooms stay closed.
- The answer of every change (areas, the verdict, the taped lengths against the drawing, the
  brief's lines and the new problems that refuse a change) is measured on the plan as its file
  will be read once written. A wall placed by its face whose thickness changes keeps its face,
  in the file and in the answer, so the taped lengths and the areas the answer gives are the
  ones `grid check` gives afterwards.
- An agent can set one wall's thickness in one call, `grid_change_wall` (`grid edit wall`): a
  wall placed by its face keeps that face and grows or shrinks away from it; any other wall
  keeps its centre line. A wall that ended in the old wall's body and would end short of the
  thinner one is carried onto its new centre line, so it stays joined.

## Design

- `packages/cli/src/edit/edits.ts`
  - `moveRoomSide`: a wall ends on the moved side when its end lies within the side's body
    across and within its own half thickness of the side's ends along it. A wall placed by its
    inside face has its centre-line end half its thickness past the corner, which the old window
    (2 cm along) missed.
  - `readingAfter`: a straight wall the patch changes that is placed by its face, or whose
    patched field was one the reading filled in (`unstated`, `typed`), is changed as its file
    states it (`statedWall`) and read again with the plan's floors and types, the way the
    written file will be read. Before, the patch was applied to the centre line, so a thickness
    change moved the face in the answer while the file kept it.
  - `changeWallThickness`: the new edit. Refuses a dividing line, a curved wall (CNT-32 is
    working on curved walls placed by a face; curved walls stay out of this change), an unknown
    wall and a thickness the wall already has. The patch states the thickness; the walls whose
    ends were inside the old body and fall outside the new one are carried along their own line
    to the new centre line (through `wallWithEnds`, so a follower placed by its face keeps it).
  - `Patch.walls` may set a thickness (a number) as well as take one out (`null`).
- `packages/cli/src/mcp/writeTools.ts`: `grid_change_wall`, after `grid_change_opening`, with
  `plan`, `decimal`, `wall`, `thickness` and `out`, through `writeChange`. One new tool rather
  than an argument on another tool: no other tool changes one wall, and it is the plain way the
  agents asked for. `grid edit wall` is its verb.
- The tool list moves from 35 to 36: the order test, the server's count, `AGENTS.md`,
  `docs/commands.md` and `docs/tool-server.md`.
- The curved refusal's words get one key, `edit.curved.doing.thickness`, in `en.ts` and `es.ts`.
- No new convention, no new message code.

## Done

- `packages/cli/src/edit/__tests__/faceWalls.test.ts`, failing before and passing after:
  - two rooms drawn by their inside faces: moving the east side 0.8 m moves the south and north
    walls' ends with it, the file keeps every face, and the rooms' areas grow by 0.8 m times
    their depth;
  - giving a wall placed by its face a type of another thickness: the answer's reading is the
    file's reading, wall by wall;
  - `grid_change_wall` on a wall placed by its face: the face stays, the taped lengths all
    agree after, the areas the answer gives are the ones `grid_areas` gives on the written
    file; on a centre-line wall the centre stays; a thinner wall carries a wall that ended in
    its body; the refusals.
- `packages/cli/src/taped/__tests__/taped.test.ts` and the edit tests still pass.
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/cli`, `npx vitest run
  packages/floorplan` (for the message files), `ownWords.test.ts`, `tolerances.test.ts` and
  `npm run scoreboard`.
