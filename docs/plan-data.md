# The plan as data: GeoJSON and JSON

Read this before you write code that reads the plan's geometry from Grid (a robot's map, a
wayfinding app, a digital twin, a GIS layer): the frame, every member of the file and what it
means, the facts the person keeps for what Grid does not model, and the same values one part at
a time from `grid_find`.

`grid export --format geojson|json` and `grid_export format=geojson|json` write it
([commands](commands.md)). The plan file stays the source of truth: a room in it is a list of
walls and a door a wall and an offset, and this file is that plan worked out into coordinates,
so no reader has to work out a polygon again.

## The frame

- Every floor is in one frame: the plan's own x and y, in metres, as the plan file writes them,
  the same on every floor. y is up as the plan is drawn; north is wherever the plan's `north`
  says. A plan placed far from (0, 0) keeps its coordinates as they are.
- Each part says its `floor` and the floor's `elevation`: metres from the ground floor's floor
  level up to its own, as the 3D view and the IFC stack the floors.
- `grid` (in GeoJSON, a member of the FeatureCollection beside `features`) is the frame:
  `version` (1; raised when a member is taken out or changes its meaning), `units` (`m`),
  `frame` (`plan`) and `floors`, each with its `id`, `name`, `level` and `elevation`, lowest
  first.
- With no floor named, the file holds every floor; `floor` names one, and `floor all` writes one
  file per floor. A JSON is named `<plan>-data.json`, so it is never taken for a plan file.
- The parts are the building after the work, in id order, floor by floor: the same plan writes
  the same bytes. Numbers are to a tenth of a millimetre. A part Grid cannot draw is left out of
  the file and named in the answer, as every export does.
- GeoJSON's coordinates are these metres, not longitude and latitude: a reader that places them
  on a map moves and turns them there.

## What each part carries

Every part has `id`, `part` (`room`, `wall`, `door`, `window`, `opening` for a doorless one,
`fixture`, `furniture` or `point`), `floor`, `elevation`, `facts` (the person's own, as the plan
gives them) and, in a plan with phases, `phase`. A ring is a list of `[x, y]` points, not closed
in the JSON and closed in the GeoJSON, where an outline runs counter-clockwise and a hole
clockwise.

| Part | Members |
|---|---|
| Room (`rooms`; GeoJSON Polygon) | `name`, `number`, `use`, `zoneOf` (a zone's room), `keepOut`, `area` (net, as `grid_areas` measures it), `centre` (a point on its floor, where its name is drawn, never in a hole), `centroid` (the middle of its area, which may lie outside a room that is not convex), `polygon` (its inside outline) and `holes` |
| Door, window, opening (`openings`; GeoJSON Polygon of its hole) | `wall`, `kind` (a door's kind, `single` when it states none; a window's as stated), `centre` (its middle on the wall's centre line), `along` and `across` (unit directions along its wall and across it), `hole` (the opening through the wall), `width` (the hole), `clearWidth`, `sill`, `height`, `rooms` (the room on the side `across` points to, then the other; `outside` where there is none, `nothing drawn` or `a room left out` where Grid cannot say), `hinge`, `swing`, `opensInto` (the room its leaves open into), `sweeps`, `glazed`, `state` and `automatic` |
| Wall (`walls`; GeoJSON MultiPolygon, a dividing line a LineString) | `kind`, `virtual` (a dividing line, no material), `thickness`, `height`, `glazed`, `rooms` (beside it), `centreLine`, `centre` (halfway along it), `centroid` and `polygons`, its solid runs, joined at the corners, with the openings taken out |
| Fixture, furniture, point (`items`; GeoJSON Polygon) | `kind`, `label`, `room` (the one that holds its middle), `size` (width and depth), `turn` (degrees counter-clockwise), `height`, `clearance`, `centre`, `centroid` and `polygon`, its footprint |

- `clearWidth` is what the open door leaves clear, past its open leaf and any fixture standing
  in front of it: the width `grid_measure what=access` and the brief measure, never a second
  one. A doorless opening's is its free width, a window's null. `width` is the hole in the wall.
- `sweeps` is the floor the door's leaves sweep as it opens, each a ring: a quarter disc from
  the hinge for each swinging leaf, a strip for a folding door. It is empty for a door that
  sweeps nothing (sliding, pocket, roller, garage), and null when the plan does not say which
  end the door hangs from or which way it opens: then Grid draws no swing either.
- `glazed` is true for glass: a window unless its type says not, a door or a wall whose type is
  glazed or made of glass. A lidar does not see these.

## Facts the person keeps

Grid does not model a door's state or a zone a robot must not enter. The person keeps them as
facts of their own, with `grid_set_facts` (a room's also with `facts` on its line of rooms text), and Grid checks
nothing against them:

| Fact | On | Written as |
|---|---|---|
| `door state`: `open`, `closed`, `automatic` or `held open` (normally) | a door | `state`, in lower case, and `automatic` (true for `automatic`) |
| `keep out`: true | a room or a zone | `keepOut` |

A zone drawn inside a room (`partOf`) is how a part of a room is kept out: give the zone the
fact.

## One part at a time: `grid_find`

The same values are fields of `grid_fields`, `grid_find` and `grid_count`, so one part's
geometry needs no export: `polygon`, `centre` and `centroid` (coordinates, which only `is set`
and `is missing` test and nothing groups or sums), `clear width`, `glazed` and `door state`.
`grid_find kind=[door] fields=[centre, clear width, rooms]` lists every door's middle, clear
width and the rooms each side; `where=[glazed = yes]` finds the glass.
