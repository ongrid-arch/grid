# ARE-56: a room wish meets a drawn room by its use when the name differs

## Outcome

A brief wish that gives a name and a use (`{ "name": "Utility", "use": "utility" }`) is met by a
room drawn as "Utility / laundry" when it is used as a utility. The line says no room carries the
name and which rooms it took instead, so the person can confirm the match. Before, such a wish
was missed on every change.

## Design

- `packages/cli/src/brief/lines.ts`: `wishRooms` finds a wish's rooms. By name first (as before,
  numbered names and ids included); only when none carries the name, and the wish gives a use,
  the rooms of that use, flagged `byUse`. A wish with a name alone, or no match by use, is
  unchanged. `roomLines` and the sizes-in-names check (`nameLines`) both read it, so a room the
  wish sizes is not also held to its own name.
- The line's text adds "(no room is named so; taken the room used as <use>: "<name>")". It is the
  question "is this the one?" in Grid's words; the state stays met or missed as the wish asks.
- Decision: no new brief field and no fuzzy name matching; the use is the person's own way of
  saying which room they mean.

## Done

- `packages/cli/src/brief/__tests__/byUse.test.ts`: a name+use wish met by a differently named room
  and says so; a name that matches wins over the use; no match by use stays missed; a sized wish
  measures the room taken by use.
- `ownWords`, `tolerances` tests, the touched package's type check and lint pass.
