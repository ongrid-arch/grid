# LVL-23: stack floors per building, each on its own ground floor

## Outcome

An agent that writes a site of several buildings (a housing estate, a campus, a house with a
detached garage, a row of terrace houses stepping up a street) can say which floors are each
building's and where each building's ground is, in rooms text or through a tool, and every
figure and check then reads each building on its own:

- Rooms text takes a building block: `building <id> ["<name>"] [pad <length>]`, then the floors
  that are its own, up to `end` or the next building line. Its floors count their levels from
  its own ground floor (the first is level 0), and stack from its pad. `building <id> ["<name>"]
  [pad <length>] floors <floor> <floor> ...` names floors written anywhere in the text, which is
  how the read-back writes the plan's buildings, so writing the text again keeps them.
  `building <kind>` stays what kind of building the plan is.
- `grid_set_building` adds a building or changes one (its name, its pad, its floors) or takes it
  out, by the same words, through `writeChange`.
- A building's `pad` is the level of its own ground, in metres from the plan's datum (the 0 a
  floor's `elevation` is measured from). Its lowest floor at or above level 0 that states no
  elevation stands on it and the rest of its floors stack from there; its basements hang under it.
- Each building has its own ground: its pad, else the site's stated ground, else its own ground
  floor's floor level. Its ground floor is the floor of its own nearest that ground; a floor stands
  above the ground by its height over its own building's ground. So the way out of every building
  is checked from its own ground floor, a door to the outside opens in mid-air only above its own
  ground, a floor with no stair is said with its own building's ground floor, and a building on a
  pad 0.8 m up, or a terrace house 3 m up the street, is not taken to stand in the air.
- Each building's height is measured from its own ground and says what it is measured from (its
  pad, the site's ground or its ground floor), and its storeys are its own: two identical rows on
  different pads have the same height, and six two-storey houses are six of two storeys, not one
  of twelve.
- The floor-line check sets each floor against the floors of its own building only (kept from
  LVL-11, now held by a test of a site of buildings on their own pads).
- The site measures give each building's own footprint and its distance to each edge of the plot,
  beside the whole site's.
- The IFC export writes one `IfcBuilding` per building, each holding its own storeys; the floors
  no building names stay in one building of the plan's name, as before.

A plan that names no building reads exactly as before, figure for figure.

## Design

- `types/floorplan.ts`: `PlanBuildingSchema` takes an optional `pad` (finite metres). This widens
  C23 (CNT-6), which already holds the buildings; no new convention number.
- `geometry/buildings.ts`: `PlanBuildingRead` carries `pad` (null when unstated).
- `geometry/elevations.ts`: `stackFloors` takes the level its first floor at or above level 0
  stands at (0 by default); `workOutElevations` passes each building's pad.
- `geometry/ground.ts`: `groundLevel` works out a ground per building (`buildingGround`: pad, else
  the site's stated ground, else the floor level of its lowest floor at or above level 0) and
  reads `above`, `aboveGround` and the ground floors per building; the floors no building names
  are read as before. It adds `groundOf(floor)`, the ground under a floor. `level` and `stated`
  stay the site's, so the sections and facades draw the site's ground line as before.
- `geometry/envelope.ts`: a plinth runs down to its own building's ground.
- `geometry/rules/noStair.ts`: the ground floor a floor's stair would rise from is its own
  building's.
- `geometry/storeys.ts`: `buildingHeight` measures from the building's own ground and says from
  what (`from`: `pad`, `site` or `floor`); `buildingHeights` adds each building's storeys.
- `geometry/site.ts`: `siteMeasures` adds `buildings` (only when the plan names some): each
  building's footprint area and its least distance to each edge.
- `geometry/export/ifc.ts`: one `IFCBUILDING` per building, storeys aggregated under their own.
- `rooms/buildings.ts` (new): the building lines, read and written; `compile.ts`, `read.ts` and
  the CLI's `command/write.ts` take only the hook lines (a building line read, a floor written,
  the buildings emitted, the lines written back, the file's buildings kept when the text writes
  none).
- `cli/src/edit/buildings.ts` and `cli/src/mcp/buildingTools.ts` (new): `grid_set_building`,
  registered after the stair tools.
- The answers: `grid_areas`' buildings list gives each building's ground, what it is measured
  from and its storeys; `grid_measure what=site` lists each building's nearest edge.
- Decisions:
  - A floor's stated `elevation` stays measured from the plan's datum, never from its pad, so one
    field means one thing whatever building the floor is in.
  - A building with no pad and no site ground stands on its own ground floor: a stepped terrace
    whose houses state their floors' elevations measures each house from its own street floor.
  - A floor two buildings would hold is refused in rooms text and by the tool; the plan file's
    reading of it (the first building listed keeps it) is unchanged.
  - The block form is the one written by hand; the read-back writes the `floors` form, since the
    read-back writes floors in the plan's order, not grouped by building.

## Done

- Tests that fail before and pass after:
  - `geometry/__tests__/padBuildings.test.ts`: floors stack from a pad; each building's ground
    floor and way out are checked on a site of buildings on pads too high for one ground; the
    heights of two identical rows on different pads are equal and name their pad; a stepped row
    of houses with no pad measures each from its own ground floor; the floor-line check gives no
    note across buildings; a floor with no stair names its own building's ground floor; the IFC
    holds one building each; the site measures each building; a plan with no building is as it was.
  - `rooms/__tests__/buildingLines.test.ts`: the block and `floors` forms, levels counted per
    building, `pad` with a unit, the refusals (a floor in two buildings, an unknown floor, a block
    with no floor, a word near a kind), the read-back writing the buildings and writing again.
  - `cli/src/mcp/__tests__/buildingTool.test.ts`: add, change and remove a building, and refusals.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on `packages/floorplan`,
  `packages/cli` and `packages/rules`, `ownWords.test.ts`, `contract.test.ts`,
  `tolerances.test.ts`, and `npm run scoreboard` no worse than `scoreboard/current.json`.
