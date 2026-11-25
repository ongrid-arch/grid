# CNT-27: one rule for counting the rooms a building's net area counts

## Outcome

Every tool that counts rooms or adds up their areas counts them as `grid_areas`' net does, and
says which rooms it leaves out and why. A stair or a lift drawn as a room on floor after floor
(one over the other, as rooms text writes a room `through` floors) is one shaft: counted once, on
the floor it rises from.

- `grid_count`: a room the net counts in no figure is in no group and no total: a zone (as
  before), a stair or lift room over the lowest room of its shaft, a void and an outdoor space.
  Each is listed in `notCounted` with why (and, for a shaft, the room it is counted with), and the
  text names them. So `sum: ["area"]` over the rooms adds up to `grid_areas`' net, and a stair on
  90 floors is one room, not 90. `stairs: "per floor"` counts each floor's stair and lift rooms
  instead, with their areas, and says the area sum then holds them on every floor.
- `grid_schedule of=rooms`: every room is still a row, and a row whose room is in no total says
  so (`notCounted`, and in the text and CSV), so the rows that count add up to each floor's total
  and the total of all floors. A total's room count counts those rows only.
- `grid_areas`: a void is marked as counted in no figure in the text and the CSV's `counted`
  column, as the other rooms left out already are, and a lift over a lift says "lift".
- The brief: a wish for a number of rooms by name or use counts a stair or lift shaft once, so a
  brief asking for 2 lifts on a two-floor building with 2 shafts drawn is met, not "drawn 4".
- `grid_compare` and the verdict every change gives: the option table's room count counts rooms as
  `grid_count` does, and the verdict's "N rooms differ in size", "added" and "taken out" count a
  shaft once, on the floor it rises from. Net and net to gross are `grid_areas`' own (unchanged).

## Design

- `packages/cli/src/quantities/areas.ts`: the one rule. `notCounted(room)` gives why a room of
  `planAreas` is in no total (`outside`, `outdoor`, `void`, `zone`, `shaft`) or null; `inTotals`
  reads it. `notCountedRooms(areas)` gives them by floor and id, with the room a shaft room is
  counted with. Every reader below goes through it, so the rule is written once.
- `packages/cli/src/quantities/query.ts`: `Asked.counting(part)` reads the rule for a room part;
  a room's area is found by its floor and id. `grid_count` (`packages/cli/src/mcp/readTools.ts`)
  leaves those rooms out, lists them, and takes the new `stairs` argument.
- `packages/cli/src/quantities/schedule.ts`: `RoomScheduleRow.notCounted` on a row in no total,
  totals' `rooms` count the rest; the CSV gains a `not in totals` column only when a row has one,
  so every other schedule's CSV is as it was.
- `packages/cli/src/brief/lines.ts`: the rooms a count wish counts leave out shaft rooms.
- `packages/cli/src/quantities/compare.ts`: `optionRow`'s `rooms` and `roomChanges`' counts read
  the rule; a shaft room's change is the change of its shaft's lowest room, counted once.
- Decisions: outdoor spaces and voids leave `grid_count` too, because its area sums must be the
  net's; they are listed with why, and `grid_find` still finds them. The brief leaves out only
  shaft rooms, because a wish for "1 terrace" means the outdoor room. `stairs: "per floor"` is on
  `grid_count` only: the schedule and `grid_areas` are the net's own tables. No new convention,
  no new message code.

## Done

- Tests in `packages/cli/src/quantities/__tests__/countedOnce.test.ts`, on the three-floor house
  with a stair (or a lift) drawn on each floor: `grid_count`'s area sum equals `grid_areas`' net;
  the stair is one room by default and three with `stairs: "per floor"`; the schedule's counted
  rows add up to its totals and the rows over the stair are marked; a brief asking for 1 lift is
  met; `optionRow` counts the shaft once; a change that grows the shaft on every floor says one
  room differs in size. A void is marked in `grid_areas`' CSV.
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/cli`, the own-words test, the
  contract test and `npm run scoreboard`.
