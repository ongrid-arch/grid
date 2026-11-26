# 2026-11-26: four small slips in the command (CMD-35)

## For people

- `grid init .` ends with `Next: grid check`, not `cd . && grid check`.
- `grid sheet` with no `--layout` writes the client sheet.
- A drawing refused for not fitting its paper says how much room the paper leaves for it after
  its margins and title block, next to the drawing's size.
- `grid diff --out <file.png>` writes the comparison's picture, as `grid draw` and `grid sheet`
  take `--out`. `--picture` still works.

## For agents

- No new code in the record. `grid sheet` without `--layout` is the client sheet; `grid diff`
  takes `--out` as another name for `--picture` (both together are a usage refusal).
