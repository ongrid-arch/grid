# 2026-11-25: a section line that misses the building, or ends inside it, says so (VEW-38)

## For people

- A section line that crosses no part of the building now says so under the drawing and on
  standard error, instead of giving an empty picture in silence. A line that starts or ends
  inside the building is drawn with a break line (a zigzag) at that end, with a note that the cut
  stops there. The file is still written and the command still exits 0 (VEW-38).

## For agents

- `grid_view kind=section` answers with a sentence when the line starts or ends inside the
  building, and its data has `section.reach`: `missesBuilding`, `startInside`, `endInside`. A line
  that cuts nothing keeps the answer's existing "cuts nothing of the building" line.
- No new code in the record.
