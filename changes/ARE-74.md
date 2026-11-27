# 2026-11-27: price the change between plan versions (ARE-74)

## For people

- Compare quantities before and after a change and price the difference with the same rates (ARE-74).

## For agents

- `grid_takeoff` accepts `for=estimate` with `since`, or `for=change` with two ordered `plans`.
  It returns before, after and signed changes by estimate key, with amounts when priced,
  in text, structured data or CSV. With `rates`, `grid_compare` and `grid_diff` include
  the same `estimateChange` data. No new code in the record.
