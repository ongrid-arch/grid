# 2026-11-28: access measurements drawn, printed and found first (SHT-27)

## For people

- The access measurements can now be handed on (SHT-27). `grid draw --marks access` draws on the
  floor plan each way in and each marked route, each room's turning circle, each door's clear
  width and sill, and each step on a way with its height; a number short of your own figure from
  the brief says so in its tag ("0.50 m clear, under your 0.80 m"). `grid sheet --layout access`
  prints an access sheet: your figures with your own words, a drawing per floor with those marks
  and its doors, the corridors and turning spaces, the ways in with their steps, and what Grid did
  not look at. Neither says a room or the building is accessible.

## For agents

- No new code in the record. `grid_view kind=plan` takes `access` in `marks` (the SVG's
  `data-part="access-route"`, `access-turning`, `access-door` and `access-step`, each with
  `data-short`), and its text says how many ways are drawn and how many numbers are short of the
  person's figures. `grid_sheet` takes `layout=access` (`<name>-access.pdf`; `sheet` words are
  refused for it, as for check). `grid_measure`'s description now opens with wheelchair, step-free
  and accessible access and `what=access`, so it is the call for those questions rather than
  `route`, `use` and `fit` pieced together. New keys: `drawing.access.*` and `sheet.access.*`
  (title, head, figures, doors, rooms, ways, steps and the eight `sheet.access.notLooked.<n>`,
  the same words as `what=access`'s list).
