# CMD-21: a wrong room or floor id is answered with the nearest ids

## Outcome

An agent that sends a room id the plan does not have is told which ids it most likely meant, not the
plan's first 30 rooms. A plan with hundreds of rooms, where the sent id carries a floor prefix the
rooms do not (`f3-room-310` for `room-310`), gets `room-310` first. The same holds for the room
named by a crop, for walls and openings when no single id is near, and for a floor.

## Design

- `packages/floorplan/src/types/nearest.ts` (MSG-7's one nearest-id helper) gains `nearestIds(id,
  known, count)`: the known ids ranked, best first. An id that holds the other (after `fold`, so
  `f3-room-310` holds `room310`) ranks before any other, the closer in length first; the rest rank
  by edits between folded forms; ties keep the plan's order. It never returns the id sent.
- `roomArg`, `openingArg` and `wallArg` in `packages/cli/src/mcp/toolkit.ts` list the five nearest
  ids (a room with its name) when `likelyId` has no single answer, and say how many rooms the plan
  has. `cropPart` in `readTools.ts` does the same for its floor's rooms. `floorArg` names the
  nearest floor when one is near.
- No new message code: these are tool refusals written where they were. The first-30 lists went
  away; the count of the rest stays ("and N more").
- Decision: a room's name is shown beside its id so a person-readable guess is possible; the id
  sent is never quoted (MS-19).

## Done

- `packages/floorplan/src/types/__tests__/nearest.test.ts`: containment first, edits next, order on
  a tie, the id sent excluded.
- `packages/cli/src/mcp/__tests__/nearestRooms.test.ts`: a plan of 400 rooms, `f3-room-310` names
  `room-310` in the refusal; a far-off id gets five rooms, not thirty.
- Existing refusal tests, the ownWords test, typecheck, lint and the scoreboard still pass.
