# CNT-58: the sun's position and the shadows it casts, worked out from the plan

## Outcome

A plan that states where it is (`site.latitude`, `site.longitude`) and its north gets the sun
worked out by Grid, so no agent works the noon sun out by hand and two agents on one plan tell
the person the same thing:

- `grid_measure what=sun` with a `date` (and a `time`, or `hours` from one time to another, and
  a second date `until` for a range of days) answers where the sun is: its compass bearing
  (azimuth) and its height above the horizon (elevation), the way it shines on the drawing, how
  long a 1 m post's shadow is, and that day's sunrise, solar noon and sunset. Times are the
  plan's local solar time (12:00 is when the sun is highest) unless `utc_offset` gives the
  clock's offset from UTC.
- The same answer gives every face of every building, worked out from the floors' outlines (so a
  massing plan of outlines alone has faces too, and a courtyard's faces look into it): the way it
  faces by the north the plan states and, at the time asked, whether the sun is on it, at what
  angle, and how much of its foot lies in the shadow of another building or wall; over hours,
  how long the sun is on it.
- It gives the share of each open outdoor space (a garden, a courtyard, a terrace, a balcony on
  its own floor's level), each paved area or pool of the site, and any patch the call names
  (`areas`: a planting bed, as points, with no room drawn for it) that is in sun: at the time
  asked, and averaged over the hours and days asked, with each sample time's share.
- `grid_view kind=plan` with `sun` draws the shadow plan: the shadows cast on the ground (and on
  an open space on an upper floor) at that moment, shaded over the floor drawn, with the sun's
  bearing in the answer and the key.
- `grid_view kind=3d` and `kind=eye` with `sun` light the model from the sun at that moment, so
  a golden-hour still is lit from the low west and not from Grid's fixed light; a sun below the
  horizon leaves only the sky's light, and the answer says so.
- `grid_export` of a GLB writes north into the file (`asset.extras.gridNorth`: the plan's north,
  its y direction, latitude and longitude when stated) and, with `sun`, a directional light node
  named `sun` (glTF's `KHR_lights_punctual`) shining the way the sun shines then, with its
  bearing and elevation in the node's `extras`.
- `grid_view kind=eye toward=south-west` looks to the compass south-west once the plan states its
  north, and says so; with no north stated, the top of the drawing is north, as before, and the
  answer says that too.

No line says a room or a space has enough daylight or sunlight: it is the sun's geometry and the
shadows of the plan's own walls, floors and site things, and the answer says what it leaves out
(pitched roofs taken flat at the storey top, no terrain, no neighbouring buildings the plan does
not hold, no trees without a height and a canopy).

## Design

- `packages/floorplan/src/astronomy/sunPosition.ts`: the sun's position for a moment and a place,
  from the low-precision solar series (the sun's mean longitude and anomaly, the equation of
  centre, the obliquity, the equation of time), worked to about 0.01°. It is astronomy and not a
  check on the drawing, so its series' coefficients live with it rather than in the tolerance
  table; it is outside the folders the tolerance-literal test reads on purpose, and says so in
  its header. Pure: a date, a time, a latitude, a longitude and an optional UTC offset in; the
  azimuth, the elevation, sunrise, solar noon and sunset out.
- `packages/floorplan/src/geometry/sunShade.ts`: what the sun does to the plan. Casters are each
  floor's slab outline at or above the ground with open outdoor space taken out, extruded from
  its floor level to its storey top; the walls that bound outdoor space and no room (garden
  walls, parapets, fences drawn as walls) at their own heights; and the site's fences with a
  height and trees with a height and a canopy (a crown from part way up). A prism's shadow on a
  level plane is exact: its two caps moved away from the sun and the quad each edge sweeps,
  joined. Shadows are cast on the ground (the site's level) and on each upper open space's own
  level, by what stands above it. Faces come from each building's footprint outline, collinear
  pieces joined, their outward normal turned to a compass bearing by the plan's north. Shares are
  areas of polygons (space minus shadow), the same method at one time or many, so a moment and a
  range never disagree.
- Defaults: the minutes between sample times, the days between sample dates, how far out of a
  face its foot is sampled, a tree crown's base as a share of its height and the sides a canopy
  disc is drawn with go in the tolerance table (`geometry/tolerances.ts`, `docs/tolerances.md`).
- `packages/cli/src/quantities/sunPath.ts` words the answer for `grid_measure what=sun`; the
  existing table (no date) is kept as it is, and its rule now points to the date for the sun path.
- `packages/cli/src/mcp/readTools.ts`: `grid_measure` takes `date`, `until`, `time`, `hours`,
  `utc_offset` and `areas` for what=sun; `grid_view` takes `sun` for plan, 3d and eye. Kept to
  argument plumbing; the work is in the new files.
- Viewer: the plan picture takes shadows to shade (`PictureShow.shade`), drawn over the floors
  and under the walls; the 3D scene takes the sun's direction and strength for its directional
  light (`BuildingScene`'s `sun`), which the still passes through. The viewer computes nothing.
- GLB: `toBuildingGlb` takes `north` and `sun` options; the light is `KHR_lights_punctual`
  directional, its node turned so its -Z runs along the sun's rays.
- Eye: `eyeAnswer.ts` turns a compass word into a drawing heading with `drawingBearing` when the
  plan states north.
- No new convention in `types/floorplan.ts`: the patch for a bed is passed in the call, and the
  time is solar unless an offset is given, so the plan file gains no field. A time zone stored with
  the site would need a convention number; that is left to whoever coordinates them.

## Done

- `astronomy/__tests__/sunPosition.test.ts`: known positions (an equinox noon at the equator, a
  solstice noon at 51.5° N, a winter afternoon in the southern hemisphere) within 0.1°, sunrise
  and sunset at the equinox near 06:00 and 18:00 solar time, a polar day and night.
- `geometry/__tests__/sunShade.test.ts`: a 3 m box's shadow at a 45° sun is the box moved 3 m away
  from the sun, joined; a courtyard surrounded by walls is half in shade when the wall height
  equals half its width at 45°; faces of an outline-only floor and of a courtyard's hole face the
  right ways by north; an upper terrace is shaded only by what stands above it.
- CLI: `grid_measure what=sun` with a date and a time, with hours and days, with an area; a plan
  with no latitude refused with how to set it; `grid_view` with `sun` for plan, 3d and eye; eye
  `toward=south-west` turned by north; GLB extras and the light node.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders changed, the
  tolerance test, `ownWords.test.ts`, the contract test, and `npm run scoreboard` not worse.
