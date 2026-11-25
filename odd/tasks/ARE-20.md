# ARE-20: the gross figures held in order, open courtyards out of both, a building measured apart

## Outcome

- On every floor and in all, the gross external area is never less than the gross internal area,
  and the gross internal area never less than the net area. Where the drawing makes one out of
  order (a room that runs past the walls, so its floor is in the net and in no gross figure), the
  figure is still given, and it is marked not proven, with a sentence that says which figure is
  short of which, by how much and why, so no answer says "proven" over figures that contradict
  each other.
- An outdoor space inside the building's walls (a courtyard, a cloister garth, a light well marked
  as outdoor space) is out of both gross figures, whatever walls bound it: worked-out outside walls
  whose ends meet at a corner, or an open side drawn as a virtual wall (an arcade). Before, gross
  internal kept such a courtyard, so on a cloister it came out above gross external.
- One building can be measured apart from one built against it on the same floor: the caller names
  its rooms, and gets their net area and both gross areas to the middle of each wall they share with
  the rest of the plan, as a flat's area to its party walls is measured.

## Design

- `packages/floorplan/src/geometry/areas.ts`
  - `outerStretches`: a short stretch at a wall's end, inside the corner of the wall it meets, with
    a room on one face only and an outer stretch beside it, goes with the outer stretch. Before, it
    was left in, so the corners of a courtyard's walls joined the courtyard to the rooms round it
    and the courtyard was kept as floor.
  - `insideFace`: a piece of floor that holds rooms keeps them, less any outdoor space inside it
    (a courtyard behind a virtual wall is in the same piece as the rooms), as gross external already
    takes it off.
  - `floorFigures`: after the figures are worked out, each gross figure gets a doubt in words when
    it is below the figure it must hold (`doubts.grossInternal`, `doubts.grossExternal`), with the
    floor that lies on walls or outside them when that is why. `planAreaFigures` gives each total's
    doubt (`AreaFigure.doubt`) from its floors' and from the totals themselves.
  - `AreaOptions.apart`: room ids to measure apart; `PlanAreaFigures.apart` is their net (counted as
    the net counts them) and their area to the party walls (`partyWallArea`, floor by floor), or
    null when none was asked for. Decision: no new plan convention: the rooms are named in the
    request, since a building in the plan is a group of floors (CNT-6) and cannot hold part of one.
- `packages/cli/src/quantities/areas.ts`: a gross figure with a doubt is `not-proven`, and its
  state carries the reason (`why`), on the floor and in all; the doubts are in the notes too. The
  request takes `apart`. `quantities/state.ts` gets an optional `why` on a state, joined by
  `joinStates` and said by `stateText`: the smallest change outside the area that lets a state say
  why without a room to name.
- `packages/cli/src/mcp/readTools.ts` (outside the area, kept small): `grid_areas` takes
  `apart_rooms`, answers `apart` and says it in one line.
- Words in `messages/en.ts` and `es.ts` (MSG-11). Docs: `docs/areas.md`.
- Decision: no new message code: these are states and notes of `grid_areas`, not findings.
- Decision: floor no room claims still counts in both gross figures, as the rule says: only space
  the plan marks as outdoor is taken off, since Grid cannot know an undrawn courtyard is open.

## Done

- `areas.test.ts` (new block): a cloister round a garth marked as a courtyard, with worked-out
  walls, stated outside walls and an open arcade, gives gross internal = the walk's floor plus the
  inner walls, both gross figures without the garth, and gross external ≥ gross internal ≥ net;
  a corridor its walls do not enclose gives gross figures marked with a doubt; a plan in order has
  none.
- The CLI's areas tests: the doubt makes the gross state not proven with its reason; `apart` on two
  buildings that share a wall measures one to the middle of that wall.
- Typecheck, lint, the floorplan and cli folders, `ownWords`, `contract`, the scoreboard.
