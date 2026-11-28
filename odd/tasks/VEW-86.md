# VEW-86: sloping and stepped ground drawn as its true profile in sections and elevations

## Outcome

A plan can give the ground's level at points of the site (spot levels: one at each corner of the
building, or a line of them down a street or across a terrace), and every section and elevation
draws the ground through them as it is: a line that bends at each level, steps where two lines of
levels stand close, and carries the earth hatch under it. A terrace on a slope stands on a falling
ground line, not over a flat one, and the lower floors of a house stepped down a hill show above
the ground on the low side instead of being cut off at one level.

- `grid_set_site spot_levels=[{at:[x,y], level}]` states them; the plan file keeps them in
  `site.spotLevels`.
- The section and facade answers say the ground from its lowest to its highest along the line,
  through the spot levels, and give the profile's points.
- A plan without spot levels reads exactly as before, figure for figure: one level, or CNT-49's
  one even slope.

## Design

- `packages/floorplan/src/types/floorplan.ts`: `SiteSchema` takes `spotLevels`, a list of
  `{ at: [x, y], level }`. This widens C7 (the site, where LVL-4 put `ground` and CNT-49 the
  slope); no new convention number. Two levels at one point, or spot levels with a `fall` (two
  ways of stating the ground's shape that disagree), are refused by name.
- `packages/floorplan/src/geometry/groundSurface.ts`: with spot levels stated, the ground is no
  longer one plane. Every stated level (the spots, the plot edges' corners, the sides' ends, the
  site's ground at the middle) is a point of a triangulated ground (Delaunay, worked out once per
  plan), read linearly inside each triangle and, outside them, at the nearest point of their
  outer edges; levels along one line alone are read along that line and level across it. `at`
  reads it, so the checks (openings below the ground, doors in mid-air, the ground under each
  floor) read the true ground too; `gradient` and `slope` stay the even slope that fits best, for
  the words. A new `along(a, b)` gives the profile between two points of the plan: its level at
  each place the line crosses an edge of the triangles or passes a stated level, the straight runs
  between them merged. `profileAt` and `profileTop` read a profile.
- `geometry/section.ts`: `ground.profile` (`[x, level]` points along the line) when the ground
  follows spot levels; `sectionGroundAt` reads it, and the earth band, the building's part below
  the ground (cut at the highest ground over each stretch, so a lower floor under the high side
  is shown in its hole), the ground line and the bounds follow every point of it.
- `geometry/facade.ts`: `ground.profile` along the side's front face, in `u`; `facadeGroundAt`
  reads it and the silhouette is cut at it, so the floors below the high side show where the
  ground falls away from them.
- `packages/viewer/src/picture/section.ts` and `facade.ts`: the ground line, the paper under a
  facade's ground and the earth follow the profile's points.
- `packages/cli`: `grid_set_site` takes `spot_levels` (`edit/site.ts`, `mcp/siteTools.ts`); the
  section and facade answers word the profile.
- Rooms text keeps its ground lines as they are; spot levels are set by the tool (left for later
  in the rooms text, which another change owns).
- No new tolerance: the merging of straight runs and the dedupe of points use `sameFloorLevel`
  and `noLength`, already in the table.

## Done

- `packages/floorplan/src/geometry/__tests__/groundProfile.test.ts`: the surface meets every spot
  level, is linear between them, level across a single line of them, and flat beyond its edges;
  a section across a stepped site has a ground line that bends at each level and steps; a facade
  of a house stepped down a hill shows its lower floor above the ground on the low side; a plan
  with no spot levels gives the same section and facade as before.
- Schema tests: two levels at one point and spot levels with a fall are refused.
- Viewer tests: the ground line and the earth follow the profile's points.
- CLI: `grid_set_site spot_levels` writes them; the section answer words the profile.
- `npm run build`, `typecheck`, `lint`, vitest on the folders touched plus `packages/cli/src/mcp`,
  `packages/cli/src/command`, `packages/cli/src/sheet`, `npm run scoreboard`.
