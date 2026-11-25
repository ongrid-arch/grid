# 2026-11-25: pictures, exports and the footprint open on the ground floor (VEW-42)

## For people

- A house with a basement no longer opens on the basement. Pictures, sheets, the preview, an
  export of one floor and the brief's footprint line take the ground floor when no floor is
  named; name the basement to see it (VEW-42).

## For agents

- `floor` left out now means the ground floor (the floor at level 0, else the lowest floor
  above ground, else the lowest) in `grid_draw`, `grid_export`, `grid_sheet`, `grid_preview_sync`
  and the footprint line of `grid_check_brief`; it was the lowest floor, a basement first. A
  plan that is all basement still opens on its lowest floor. No new code in the record.
