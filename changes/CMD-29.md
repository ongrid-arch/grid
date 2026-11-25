# 2026-11-25: small protocol and packaging slips (CMD-29)

## For people

- The tool server tells its hosts which Grid it is, and the faster way to start it
  (`node .../grid.mjs mcp`) is written down. `grid edit merge --zones true` works as its help says,
  and a refusal no longer prints where the project folder is on the disk (CMD-29).

## For agents

- `serverInfo.version` is Grid's version, not "1"; `grid_export` answers `gridVersion`.
- A request line over 1 MiB is answered with its own `id` when the line's top level names one.
- A refusal for a path outside the project no longer names the project folder's place on the disk.
- `grid_measure` what=route takes `from` (as `room`) and what=narrow takes `width` (as `under`);
  two different values for one are refused.
- No new code in the record.
