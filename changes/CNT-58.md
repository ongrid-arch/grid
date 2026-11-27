# 2026-11-27: the sun's position and the shadows the plan casts (CNT-58)

## For people

- Grid works out where the sun is for a date and time at the site's latitude and longitude, the
  shadows the plan's floors, walls, fences and trees cast, the share of each garden, courtyard,
  terrace or planting bed in sun, and the hours of sun on each face of each building. A plan
  picture can show the shadows at a moment, a 3D picture is lit from the sun then, and a GLB can
  carry the sun as a light and the plan's north (CNT-58).
- In a view from inside a room, "toward south-west" now means the compass south-west once the
  plan states its north (CNT-58).

## For agents

- `grid_measure what=sun` takes `date`, `until`, `time`, `hours`, `utc_offset` and `areas`: with a
  date it answers the sun's `azimuth` and `elevation`, sunrise, solar noon and sunset, each building
  face's way and sun (`faces`: `sun`, `angle`, `footInShade`, or `sunHours` and `clearHours`
  over hours) and each open space's, paving's, pool's and named patch's share in sun (`spaces`:
  `inSun`, `byMoment`). Times are solar unless `utc_offset` is given. A plan with no latitude and
  longitude is refused. Without a date it answers the window-wall table as before; its rule now
  points to the date.
- `grid_view` takes `sun`, a moment (`"YYYY-MM-DD HH:MM"`, with an optional `+HH:MM`): `kind=plan`
  draws the shadow plan, `kind=3d` and `kind=eye` are lit from the sun then.
- `grid_view kind=eye toward=<compass word>` is turned by the plan's north when it states one, and
  says so; with no north, the top of the drawing, and it says that.
- `grid_export format=glb` takes `sun` and writes a `KHR_lights_punctual` directional light node
  named `sun` (`extras.gridSun`); every GLB of a plan stating north or a place has
  `asset.extras.gridNorth`.
- No new code in the record.
