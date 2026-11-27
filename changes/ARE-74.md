# 2026-11-27: price the change between plan versions (ARE-74)

## For people

- Compare quantities before and after a change and price the difference with the same rates (ARE-74).

## For agents

- `grid_takeoff` with `for=estimate` and `since` returns before, after and signed changes
  by estimate key, in text, structured data or CSV. With `rates`, `grid_compare` and
  `grid_diff` include the same `estimateChange` data. With `for=change` and two ordered
  `plans`, the take-off prices demolition, making good and new work between the drawings.
  No new code in the record.
