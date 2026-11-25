# 2026-11-25: the server's first line says what Grid makes (CMD-16)

## For people

- The first thing an agent reads from Grid now says that Grid draws floor plans for any small
  space (a van, a cabin, a module, a container) as well as whole buildings, with a picture and
  the free-floor numbers in one or two calls, and makes a whole-building 3D model (CMD-16).

## For agents

- The server's instructions open with that line, on `initialize` (2024-11-05, 2025-03-26 and
  2025-06-18) and on `server/discover` alike. It names `grid_view`, `grid_areas`, `grid_export`
  and `grid_sheet`, so a host that defers tools finds Grid when asked for a plan, a picture or a
  render. No new code in the record.
