# 2026-11-26: child-size library entries, and an item placed at its own size (CNT-43)

## For people

- The library holds child-size things: a child's WC, a low basin, a cot, a nap cot, a changing
  table and coat rails at adult and child height. `grid edit place` takes an item's own
  `--width`, `--depth`, `--height`, `--clearance` and `--label`, and places a thing the library
  has no entry for by its kind with its size (CNT-43).

## For agents

- `grid_place_item` takes `width`, `depth`, `height`, `clearance` and `label` for one item: they
  are written on the item beside its library name and the answer says "at the size given". A
  `name` that is no library entry but a kind (`storage`, `table`, `toilet`) places a plain item of
  that kind, and then needs width, depth and height. A typical room given any of them is refused,
  as is width without depth. New built-in entries: `wc-child`, `basin-low`, `cot`, `nap-cot`,
  `changing-table`, `coat-rail`, `coat-rail-low`. No new code in the record.
