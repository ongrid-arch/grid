# SHT-21: fit the client sheet to the building's kind and size

## Outcome
A client sheet of a station, an airport, a hospital, a warehouse, a concert hall, a school or a
tower leads with the figures that building is judged by, never with "0 bedrooms" or a floor to
floor taken from a mezzanine. Its room lists are short enough to read: sixty bedrooms of one size
are one row, "60 × Bedroom", with the size of each and their sum. A tower whose floors are alike
prints that floor once, says which floors it stands for, and adds an area schedule by floor and by
use, so a 40-floor sheet is a few pages and is made in seconds, not minutes.

## Design
- `packages/cli/src/sheet/coverFigures.ts` (new): the cover's figures, worked out from code that
  exists (`planAreas`, `floorElevations`, `flatSchedule`, `roomSchedule`, the plan's items, bays and
  openings), never measured here.
  - The building's kinds: the plan's `building` and each floor's own. With none stated, each count
    is shown only where it is more than none, so a plan that says nothing never reads "0 of"
    anything. A home or a block of flats shows its bedrooms even at none (a studio).
  - One list of figures per kind, in order: homes and bedrooms for homes and flats; guest rooms for
    a hotel; beds, operating theatres and bedrooms for health; platforms and gates for transport;
    classrooms for a school; seats and the clear height of the tallest hall for culture and
    assembly; roller doors in outside walls and the clear height of the tallest room for a
    warehouse or industry; cells for custody; parking spaces for a car park. A plan of mixed kinds
    shows each kind's figures, in the order of its floors.
  - Every plan: the headline area (gross internal, or ARE-60's pair), the floors, the floor to
    floor or the height to the roof, the gross external area and, with a site boundary, the floor
    area ratio (gross external over the site's area).
  - Floor to floor is taken between whole storeys only: a floor that stands inside another
    storey's height (a mezzanine in a shed, a terrace in a hall) is set aside, so it never gives a
    step of its own. Floors are counted the same way, by whole storey levels.
  - The cover holds six figures; any more go in one line under them. One rounding rule, said
    once: areas to 0.1 m² (whole square feet), lengths to the centimetre, a ratio to two places,
    counts whole. It is the rule the sheet's other figures already use (`rounding.ts`).
- `packages/cli/src/sheet/roomGroups.ts` (new): a client floor's room list grouped. Rooms of one
  use whose names differ only by a number at the end, of the same net area to the centimetre
  squared, are one row: "60 × Bedroom", the area of each in the detail and their sum as the row's
  area. The rows still add up to the floor's net area (`sumText`). Rooms not counted in the sum
  (outdoor, counted below, not measured) stay rows of their own. The check sheet keeps one row
  per room, with ids.
- `packages/cli/src/sheet/typicalFloors.ts` (new): floors that are alike, by a signature of their
  walls, rooms (use, name less its number, area), openings and items, worked out in the plan's own
  coordinates. A client sheet prints a set of alike floors once, as "Typical floor", with the
  floors it stands for as its subtitle and its table for each floor; a floor with its own words in
  `sheet.json` is never folded into another. When any floors were folded, an area schedule follows
  the floors: one row per floor page (a typical floor's row counts all its floors) and their uses,
  adding up to the net area, then the whole building by use.
- `packages/cli/src/sheet/pages.ts`: `clientBodies` reads the three above. The words are new keys
  in `en.ts` and `es.ts` (draft), next to the sheet's others.
- Decisions: no new field in the plan (no convention taken); a room count is read from uses and
  items, a dock from a roller or garage door in an outside wall; the area schedule is added only
  when floors were folded, so a two-floor house keeps its three pages; the check sheet keeps every
  floor, since its findings name each floor's own ids.
- Left for later: a page per zone or household, a site layout, a slot for the agent's own
  measured tables, and the venue map layout (numbers in small rooms, colour by field, index,
  locator grid and symbols).

## Done
- `sheet/__tests__/kindCover.test.ts`: a station, a hospital, a warehouse with a mezzanine, a
  concert hall, a kindergarten and an office cover show their kind's figures and no "bedrooms";
  a home still shows bedrooms; a warehouse's floor to floor is not the mezzanine's step; a plan
  with a site boundary shows its floor area ratio; a cover never holds more than six figures.
- `sheet/__tests__/roomGroups.test.ts`: sixty alike bedrooms are one row of 60 with their sum, the
  rows add up to the net area, rooms of other sizes stay apart.
- `sheet/__tests__/typicalFloors.test.ts`: a ten-floor tower of alike floors is a cover, the ground
  floor, one typical floor naming its nine floors and the area schedule; a floor with its own words
  stays its own page; floors that differ are not folded.
- `pages.test.ts`, `ownWords.test.ts`, the sheet's other tests, typecheck, lint, the cli tests and
  the scoreboard.
