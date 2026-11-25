# WRT-19: walls whose own figures changed, listed by grid diff

## Outcome

`grid diff` and `grid_diff` list every wall whose thickness, height, kind or line changed, with
its figure before and after, in the text and in the data, whether the plan was drawn wall by
wall or written rooms first. A survey and a proposal written rooms first whose rear walls went
from 0.34 to 0.30 m thick now name both walls, as `grid_compare` does, and the room behind a
wall that grew or shrank because of it says so: `"Living room" 18.48 m² → 18.57 m² (…); because
wall "ext-south" went from 0.30 to 0.26 m thick`. A plan whose outside walls all became thinner
is no longer called "Same building".

## Design

- `packages/floorplan/src/geometry/diff/building.ts`, `compareBuildings`:
  - A plan written rooms first in both versions was compared by its rooms and openings alone, and
    its wall lines were left out, because its walls are worked out from the rooms: a room written
    wider replaces and moves walls, and listing them says nothing the room line does not. But a
    wall's thickness, height, kind, being a dividing line, its curve and its floor are the
    author's own figures (the walls line of rooms text, or an edit of the plan file), and no room
    line says them. So a plan written rooms first now lists the walls whose change holds one of
    those figures, by the same line and grouping a plan drawn wall by wall uses (`9 walls height
    2.60 → 2.70 m: …`, `Wall "ext-south" thickness 0.34 → 0.30 m, by "Living room"`), and its
    floors' changes. A wall whose only change in a plan written rooms first is its line (moved,
    extended, replaced) is still left to the room lines: that is the room text at work.
    Decision: "line" in the card is covered as it was for a plan drawn wall by wall (every wall
    that moved has its line) and, written rooms first, within the line of a wall whose own figure
    changed too (`reshaped; thickness …`).
  - The cause: a room whose area or size changed names the walls on its boundary whose face on its
    side moved, by the wall's thickness or (drawn wall by wall) its line, worked out from the
    wall's centre line and thickness before and after and the side of the wall the room is on.
    The part is added to the room's line, so it is in the verdict, the rooms list and the change
    lines, and `RoomVerdict.walls` lists the walls named, so the data says it by id. Written rooms
    first, only a change of thickness is named as a cause: a line that moved there followed the
    room.
  - The verdict counts these lines as "wall or opening change" in a plan written rooms first when
    there are walls among them, "opening change" when there are none.
- The words: the new sentences are keys in `packages/floorplan/src/messages/en.ts` and `es.ts`
  (`diff.cause.*`), said with `english`, so `building.ts` gains no English sentence of its own.
- `packages/cli/src/versions/diff.ts`: the rooms in the data carry `walls`, the walls named as the
  cause. The text already prints each room and change line.
- No new convention and no new message code.

## Done

- `packages/floorplan/src/geometry/__tests__/diff-building.test.ts`: a plan written rooms first
  whose south wall went from 0.30 to 0.26 m lists that wall with both figures, and the living room
  and bedroom behind it name it as the cause; a plan whose outside walls all became thinner, rooms
  kept to their inside sizes, lists the four walls and is not the same building; a plan drawn wall
  by wall with a thinner wall names it as the cause; the one-number edit of the lab's flat written
  rooms first still has its two lines, with no wall and no cause.
- `packages/cli/src/versions/__tests__/diff.test.ts`: `grid diff --json` on a plan written rooms
  first with a thinner wall lists the wall in `changes` and in the room's `walls`.
- `npm run typecheck`, `npm run lint`, the floorplan, rules and cli test folders,
  `ownWords.test.ts`, the message tests and `npm run scoreboard`.
