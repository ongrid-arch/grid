# 2026-11-27: the plan's geometry as data, and geometry fields for grid_find (VEW-80)

## For people

- `grid export --format geojson` or `--format json` writes the plan's geometry as data a program reads as it is: every floor in one frame (the plan's x and y in metres), each room with its outline, holes, a point on its floor, its centroid and its net area; each door, window and opening with its centre, its directions, its hole, its width and clear width, the rooms on each side, its sill, kind, hinge and swing, the room it opens into and the floor its leaves sweep; each wall's solid runs and centre line; each item's footprint; and every part's facts. A door's state (`door state`: open, closed, automatic or held open) and a keep-out zone (`keep out`) are facts you keep, and the file writes them. `docs/plan-data.md` is the file's contract (VEW-80).

## For agents

- `grid_export` takes `format` `geojson` and `json`, with `floor` as for dxf, glb and obj (left out every floor, one floor, or `all` for a file each); `scale`, `roofs` and `arcSegments` are refused for them by name. A json is written as `<plan>-data.json`. The GeoJSON is one FeatureCollection with the frame in `grid`; its coordinates are plan metres, not longitude and latitude. `grid_fields`, `grid_find` and `grid_count` have the fields `polygon`, `centre` and `centroid` (coordinates; only `is set` and `is missing` test them, and `by` and `sum` refuse them), `clear width` (doors and doorless openings, the width `grid_measure what=access` gives), `glazed` (walls, doors and windows) and `door state` (doors, the fact of that name). The fact `door state` is no longer marked `shadowed`. No new code in the record.
