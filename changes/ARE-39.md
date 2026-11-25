# 2026-11-25: gross internal area follows the rooms beside each wall (ARE-39)

## For people

- Gross internal area no longer leaves out a wall that was built as an outside wall but now has
  rooms on both faces, such as the old end wall of a building after an extension (ARE-39). Its
  floor counts; the wall keeps its kind.

## For agents

- `grid_areas` and `grid check`: `grossInternal` takes off only the stretches of wall that face
  outside by the rooms beside them. A wall stated `exterior` with rooms on both faces is floor
  there, so the figure can be larger than before on such plans. No new code in the record.
