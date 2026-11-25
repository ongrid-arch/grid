# ARE-18: routes and walks agree with the areas and the check

## Outcome

- `grid_measure what=route` gives the walked length on every room Grid measures the area of.
  When it cannot, the answer names the room and the reason (no outline, a doorway not found on
  its side, no line across its floor), never only "grid_check says why".
- A door in a curved wall is walked from either side of the wall: the room on the curve's
  outside finds the doorway as the room inside it does.
- A route to the outside follows the way-out check: up and down the stairs it reads (a stair
  the plan states, stair rooms one over the other), and out only through a door on a floor that
  does not stand above the ground. A room the check says has a way out has a route out, with a
  length; a room on an upper floor or in a basement goes by the stair.
- The walk goes through every way the way-out check reads: an open side, a door or an opening
  is always a way on, so a room joined by one is never "not reached".
- Standing in the middle of a room (where the walk starts with no doorway) you face square to
  the room, and the room is said by its whole size: a 3.00 × 16.10 m stair is 3 m across and
  16.1 m deep, 1.5 m to each side.
- A fixture that stands clear of the walls (an island, a table) is said where it stands, with
  how far ahead its near side is and whether it is across your way, not on the nearest wall.
- `grid describe` says a door leads in from outside whenever the check reads it as a way out,
  not only when its wall is stated exterior; an open side to the outside is a way in too.

## Design

- `packages/cli/src/quantities/walked.ts`
  - `crossingOf`: for a door in a curved wall whose hole face the core's mouth test misses (the
    room on the convex side), the doorway is found from the curve's own frame at the hole's
    middle: the face on the room's side, the other face across. The point is set on the room's
    outline, so the line across the floor starts on it.
  - `lengthAcross` starts and ends on the floor: a point a hair off it (a chord's sag) is taken
    to the nearest point of the outline first.
  - `walkRoute` returns the walked length or the first gap: the room and why
    (`no outline`, `doorway`, `no line`), and `walkedLength` keeps its answer.
  - A stair between floors is walked to the foot of its walking line, along it on plan, and on
    from its head (`stairPassage`); a stair drawn as a room on each floor is walked to the room's
    middle and on from the middle of the room over it. The climb is never in the length; the
    rule says so.
- `packages/cli/src/quantities/measure.ts`: `routeBetween(…, 'outside')` searches floor by
  floor as the check does (`wayGraph` per floor, `floorJoins` with the check's outlines, exits
  only on floors not above the ground, `groundLevel`). Its steps say `stair` for a stair, and
  each room on the route carries its floor (`floors`). A route between two rooms stays on one
  floor, as before.
- `packages/cli/src/mcp/readTools.ts` (the route branch of `grid_measure` only): the gap's room
  and reason in words and in `answer.gap`.
- `packages/cli/src/describe/walk.ts`: every way of `wayGraph` is a way on (those that are not a
  thing in the room go last); facing and size from the middle are square to the room's own sides;
  fixtures clear of the walls (`AGAINST_WALL`, 0.3 m: Grid's own figure for the walk's words, not
  a check) go in their own group, `inRoom`, said from their near side.
- `packages/cli/src/describe/facts.ts` and `card.ts`: an opening's side with no room is
  `outside` when the floor's graph (`floorGraph`, the check's) lists it as an exit; the old rule
  stays for windows and everything else. A floor's open sides to the outside are listed
  (`edgesOut`) and said as a way in.
- New words in `packages/floorplan/src/messages/en.ts` and `es.ts` (draft), outside this card's
  area but where every sentence goes (MSG-11).
- No new convention in `types/floorplan.ts`, no new message code.

Decisions: a route between two rooms on different floors stays refused (the tool's wording
says so); only the way out crosses floors, because that is what the check reads. A flat whose
way out is not drawn (a door onto a landing) still has no route out: the check calls that
"not checked", and the route says no way.

## Done

- `packages/cli/src/quantities/__tests__/routesAgree.test.ts`: a door in a curved wall walked
  from its convex side; an upper floor and a basement whose rooms reach the outside by a stated
  stair and by stair rooms, with lengths, and no route out through a balcony door upstairs; a
  gap named with its room and reason; the tool's text and data.
- `packages/cli/src/describe/__tests__/walkAgrees.test.ts`: a room joined only by an open side
  is walked; the long stair from its middle; an island said where it stands; describe saying a
  door leads in from outside through a wall not stated exterior, and an open side to outside.
- The existing walk, route, describe and curved-wall tests still pass.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run scoreboard`.
