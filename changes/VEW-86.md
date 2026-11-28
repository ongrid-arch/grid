# 2026-11-28: sloping and stepped ground drawn as its true profile in sections and elevations (VEW-86)

## For people

- A plan can give the ground's level at points of the site, spot levels: one at each corner of the building, or a line of them down a street or across a terrace, two lines a few centimetres apart for a step. `grid_set_site spot_levels` takes them as `"x,y level"`. The ground then passes through every level instead of one even slope, and every check reads it at each wall (VEW-86).
- Sections and elevations draw that ground as its true profile: the ground line bends at each level and steps where the ground steps, the earth hatch follows it, and the lower floors of a house stepped down a hill show on the low side instead of being cut off at one level. A plan without spot levels draws exactly as before.

## For agents

- The plan file: `site.spotLevels`, a list of `{ at: [x, y], level }` in the ground floor's datum (C7 widened, no new convention number). Two levels at one point are refused, and so is a `fall` beside spot levels.
- `grid_set_site` gains `spot_levels` (each `"x,y level"`; a level at a point already stated replaces it); `remove` takes `spotLevels`. Its answer says the ground's range under the building and that the sections and elevations draw its profile.
- The section's data (`grid_view kind=section`) gives `ground.profile`, `[x, level]` points along the line, in place of `ground.fall`, and its levels line says the ground at the line's two ends, its lowest and its highest, through the spot levels. The facade's data gives `ground.profile`, `[u, level]` points across the face, and its text says the same along the face. `opening_below_ground` and the way-out checks read the ground through the spot levels at each opening and door. No new code in the record.
