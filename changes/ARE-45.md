# 2026-11-25: one answer for what=route, with or without a width (ARE-45)

## For people

- The route measure now always gives how far a route is walked, each room's share, the narrowest door and whether a body or trolley gets through, with or without a width (Grid's own 0.9 m indicator when none is given), so a length and a width check no longer come in separate answers (ARE-45).

## For agents

- `grid_measure what=route` answers with the same fields whether `width` is given or not: the route's `length`, `legs`, `steps`, `narrowestPassage`, and `code`, `figure` (`from` is `grid` with 0.9 m when no width is given), `through`, `way`, `shortest` and `narrower`. A route up or down stairs has `through: null`. The text always carries the walked length and the width lines. No new code in the record.
