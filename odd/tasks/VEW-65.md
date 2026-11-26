# VEW-65: the earth under the ground line in sections

## Outcome

A section reads as a building standing in the ground, not boxes hanging under a line:

- the earth below the ground line is hatched, in the cut, down to a metre below the lowest thing
  the section cuts under the ground (a metre below the ground where nothing is), so a basement,
  a car park's levels or a sunken room is dug into it;
- the building's own part below the ground (from the underside of its lowest slab, or a sunken
  room's slab, up to the ground, inside its outside walls) is left out of the earth: the basement
  stands in its hole, its outside walls holding the earth back. A wall cut below the ground with
  the outside on one face is marked `retaining` in the section's parts;
- over a basement that reaches past the floor above it (under a garden) the earth lies on it and
  the ground line runs on over it: the ground line stops only where the building stands through
  the ground;
- the ground line and the earth run to the edges of the picture, not 1 m past the building and no
  further; at an end of the line that stops inside the building's part below the ground, they stop
  at the cut's own end, where its break line is, because Grid does not know what is past it;
- `grid_view kind=section` gives the earth's lowest level and the walls that hold it back in its
  data.

## Design

- `packages/floorplan/src/geometry/section.ts`:
  - the ground line's stretches run over `[0, length]`, the cut's own extent, less the stretches
    where a floor stands through the ground: its slab's underside at or under the ground (no
    plinth) and its storey's top over it. `sectionGroundRun` goes from the table.
  - `ground.earth`: `bottom` (its lowest level), `dug` (the building's part below the ground, as
    pieces: along the line, from the lowest foot of the floors standing there, a slab's underside
    or a sunken room's, up to the highest top of their storeys, cut off at the ground, joined with
    every cut part below the ground), `pieces` (the earth in the cut, `[0, length]` from `bottom` to
    the ground, less `dug`) and `open` (whether each end of the line is clear of `dug`, so the earth
    may run on past it).
  - `sectionEarth(section, from, to)`: the earth and the ground line run out to `from` and `to`
    at each open end, for the picture to reach its edges. The picture never works the earth out
    itself.
  - `retaining: true` on a wall part cut below the ground with the outside on one face.
  - The section's bounds take the earth's bottom in.
- `packages/floorplan/src/geometry/detail.ts`: `hatchRings`, `hatchLines` over several rings,
  even-odd, so a hatch keeps out of a piece's holes; `hatchLines` is it for one ring.
- `packages/floorplan/src/geometry/tolerances.ts` and `docs/tolerances.md`: `sectionEarthBelow`
  (1 m, a limit: how far the earth is drawn below the lowest thing cut under the ground); the
  `sectionGroundRun` row goes.
- `packages/viewer/src/picture/section.ts`: after what lies beyond and before the cut, the earth
  over the picture's whole width, filled with paper (it is in the cut, so it hides what lies beyond
  it) and hatched at 45°, a material's hatch, with the finest pen; the ground line over the
  picture's width. Each level mark's words stand on a strip of paper so they read over the
  hatch.
- `packages/cli/src/mcp/sectionAnswer.ts`: the answer's data gives `ground.earthBottom` and
  `ground.retaining`, no new sentence.
- `docs/commands.md`: the section's ground paragraph.

Decisions:

- One ground level for the whole site, as the schema has it: the ground on each side of a house on
  a slope, or a terrace stepping down a street, needs a ground per side or per point, a convention
  of its own, and is not here.
- A courtyard or light well below the ground (a hole in a floor's outline) is taken as earth: the
  plan does not say it is dug.
- The earth is hatched, unlike what Grid takes, which is tinted and dashed: earth is a material.

## Done

- `packages/floorplan/src/geometry/__tests__/earthSection.test.ts`: a house with a basement and a
  basement reaching under the garden; the earth stops at the basement's outside walls and under
  its slab, lies over the part under the garden, runs to the line's ends, its bottom a metre under
  the basement's slab; the ground line runs over the garden basement; retaining walls marked; a
  line ending inside the basement is not open there; a house on its plinth keeps its earth whole
  under it; `sectionEarth` reaches the edges asked.
- `packages/viewer/src/picture/__tests__/section.test.ts`: the earth hatch is drawn, the ground
  line reaches the picture's edges, the hatch lies inside the earth.
- The existing section, plinth, sunken and void section tests pass unchanged in what they hold.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on `packages/floorplan`,
  `packages/viewer` and `packages/cli`, `npm run scoreboard`.
