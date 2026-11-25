# VEW-35: a balcony's low walls are drawn at their own height in a facade

## Outcome

A balcony with low walls under another floor is drawn in a facade at the height its walls have,
so the sliding doors behind it show above it, and the facade's list of openings counts every
opening the side shows. Before, a balcony wall that stated no height, or was as tall as its
floor's tallest wall, rose to the slab over it (VEW-33) as a white box that hid the doors.

## Design

- `packages/floorplan/src/geometry/facade.ts`: `planFacade` reads the walls that bound outdoor
  space and no room (`outdoorOnlyWalls`: a balcony's edge, a terrace's parapet, a fence) and does
  not raise those to the slab or roof over them. They keep their own top, as `wallTopsUnder`
  already does for a dwarf wall. The building's own walls rise as before.
- Not done in `elevations.ts`/`section.ts`: another change works in the section, and the facade
  is the only place this was reported. The section may need the same later.

## Done

- `facade.test.ts`: a balcony under a floor above, its walls with no stated height and with a
  stated 1.10 m: the walls' top is their own, both sliding doors are listed in `facade.openings`,
  and the house wall above still rises to the slab. Fails before, passes after.
- Floorplan test folder, typecheck, lint, ownWords and tolerances tests, scoreboard.
