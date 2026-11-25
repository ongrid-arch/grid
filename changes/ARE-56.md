# 2026-11-25: a room wish meets a room by its use when the name differs (ARE-56)

## For people

- A brief wish for a room with a name and a use ("Utility", used as utility) is now met by a room
  drawn under another name, such as "Utility / laundry". The line says which room it took, so you
  can confirm it is the one (ARE-56).

## For agents

- `grid_write_brief` and the brief's lines: a `rooms` wish with `name` and `use` whose name no room
  carries takes the rooms of that `use`, and its text says so. A wish with a name only answers as
  before. No new code in the record.
