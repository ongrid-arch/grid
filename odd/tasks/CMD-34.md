# CMD-34: rooms named in the issue lines of a comparison

## Outcome

The issue lines of `grid diff` and `grid_diff` name rooms the way the rest of the comparison
does, by the names the person gave them (their id only when a room has no name). A door that now
joins other rooms reads `Door "door-bed1" joined "Bedroom 1" and "Hall"; it now joins "Hall" and
"Store"`, not by the rooms' ids, so an agent that passes the line on says the person's own words.
A room that no longer closes and a room that may only have changed its id are named the same
way. The ids stay in the issue's `entities`, as data: a door's issue lists the door and then every
room on either side of it, before and after.

## Design

- `packages/floorplan/src/geometry/diff/building.ts`: the door issue is worded in the comparison
  from the door's faces (`DoorRoomsChange.before` and `after`), each room named from the version
  it stands in, through a new key `diff.issue.doorJoins` and the words for its sides. The
  sentence that `doorsThatChangedRooms` (`geometry/rules/doors.ts`) writes is left as it is: the
  edit answers' `doors` lines read it, and they are not this change.
- `packages/floorplan/src/geometry/diff/rooms.ts`: a room that closed before and no longer does is
  named by its name, through `diff.issue.roomUnclosed`.
- `packages/floorplan/src/geometry/diff/churn.ts`: two rooms that may be one under a new id are
  named by their names, through `diff.issue.roomIdChurn`; walls and openings have no names and
  keep their ids.
- The wordings go into `messages/en.ts` and `es.ts`, so the three files hold fewer English
  sentences of their own (`ownWords.test.ts` counts come down).
- No new code, no new field: the issue codes are as they were; the door issue's `entities` gain
  its rooms.

## Done

- `diff-building.test.ts`, `diff-work.test.ts`: the door issue names rooms by name and lists the
  rooms' ids in its entities; a room that no longer closes and a room's possible id change are
  named by name.
- `packages/cli/src/versions/__tests__/diff.test.ts`: `grid diff` prints the door issue with the
  rooms' names.
- Type check of `floorplan` and `cli`, lint, the diff tests, `ownWords.test.ts` and
  `tolerances.test.ts`.
