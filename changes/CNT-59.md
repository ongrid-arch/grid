# 2026-11-27: another tool's GlobalId, name and tag kept on walls, openings, rooms and floors (CNT-59)

## For people

- A plan written from a consultant's IFC model keeps each wall's, door's, window's, space's and storey's own GlobalId, name and tag, and the IFC and DXF Grid exports give them back, so the consultant's tools see the same elements, not new ones. Grid's ids do not change (CNT-59).
- Building a room against a surveyed wall, or merging two rooms across part of one, keeps the wall's id and GlobalId on its longest piece; before, the wall was retired and every piece was a new wall.

## For agents

- The plan file: a wall, an opening, a room and a floor MAY state `identity`, `{ guid, name, tag }`, each optional (C9 widened, no new convention number). `guid` is an IFC GlobalId (22 characters) or a UUID; other text, or a misspelt field, is left out with `plan/value-left-out`. `grid_set` sets it on a wall, room or floor.
- `grid write --from <model>.ifc` and `grid_write_rooms` with `from` set each part's identity from its element (a wall's, door's, window's and opening's GlobalId, Name and Tag; a space's and storey's GlobalId and Name); a drawn wall Grid writes as several keeps it on the longest. The `guid` facts stay as they were. A DXF import sets none. Writing rooms text again keeps identities by id, and a wall the text cuts gives its identity to its longest piece on its line.
- `grid_add_room` and `grid_merge_rooms`: a wall they cut keeps its id on its longest piece (`n1` where the answer named `n1-b`); the other pieces are `<id>-a`, `<id>-c` as before, with the wall's facts and no identity. In a plan with phases, those pieces stay existing.
- `grid_export`: the IFC writes a kept GlobalId, Name and Tag on the wall, door, window, opening, space or storey (a door's or window's tag in place of its schedule mark; a space's or storey's tag as the fact `tag` in `Grid_Properties`), issues no other element a kept GlobalId, and writes one two parts state once. The DXF writes a door's or window's tag as its block's MARK, a room's as its tag's NUMBER, and each identity on `GRID-FACTS` as `GUID`, `name` and `tag` lines. No new code in the record.
