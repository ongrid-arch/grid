# ARE-40: outdoor spaces no door reaches, and routes when nothing leads out

## Outcome

- An outdoor space (a yard, a courtyard, a terrace) that no door, doorless opening, open side or
  stair reaches is said, as a room with no door is (`room/no-door`). Before, outdoor spaces were
  left out of that check, so a fenced yard with no gate passed.
- On a floor with no way out, every room that has some door fails the route check
  (`room/no-route-out`), not only the floor (`floor/no-exit`). A room with no door at all keeps its
  own, more specific finding. Outdoor spaces and voids need no route.

## Design

- `packages/floorplan/src/geometry/rules/check.ts`: `floorFindings` takes the floor's outdoor
  spaces and no longer leaves them out of the "room without a door" finding; `routeFindings`
  adds a `no_route_to_exit` for each room with a door when there is no exit at all.
- No new code and no new words: both findings use existing codes and sentences.
- Decision: the per-room finding is added beside `floor/no-exit`, which stays.
- A void stays exempt; only outdoor space is now asked for a door.

## Done

- Tests in `packages/floorplan/src/geometry/__tests__/outdoorNoDoor.test.ts`: a yard with no
  door is said; the same yard with a gate is not; a flat with no doors, and one with doors but no
  way out, fail every room's route.
- Floorplan and rules test folders, typecheck, lint, scoreboard.
