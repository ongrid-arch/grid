# 2026-11-25: floor names, ids and use words in other languages (MSG-22)

## For people

- A plan with one floor and no floor list names that floor in the language Grid writes in:
  "Planta baja" in a Spanish check, description, drawing or sheet, "Ground floor" in English. A
  floor the plan names keeps its name (MSG-22).
- Rooms text writes an id with accents in plain letters (`baño` is `bano`) and says so, and
  refuses an id with letters that have no plain form, so every tool and edit takes the ids it
  writes (MSG-22).
- A room's use may be written in plain words of Spanish, German, French or Chinese (`cocineta`,
  `Flur`, `chambre`, `卧室`) in the plan file, rooms text, the edits and the brief (MSG-22).
- `es-MX` and `es-ES` are read as Spanish in a tool's `language` and a plan's `display.language`,
  as they already were by `--lang` (MSG-22).

## For agents

- `grid_write_rooms` warns `rooms/id-folded` when it wrote an id in plain letters, naming each
  (`'baño' is 'bano'`): use the plain id in later calls. It refuses `rooms/bad-id` for an id with
  a letter that has no plain form, on its line. These are rooms text codes, not record codes.
- Every tool reads an id argument with accents in plain letters: `room: "baño"` reaches `bano`.
- The `use` arguments of `grid_merge_rooms`, `grid_split_room`, `grid_add_room` and
  `grid_rename_room`, and a brief room's `use`, take a word that plainly means a use in the
  person's language (`cocina`, `Flur`, `卫生间`) and keep the use it means; their schemas list no
  closed set of words any more. An unknown word is refused with the uses.
- `language` takes a region tag (`es-MX`); its schema lists no closed set of words any more.
- A record, a description, a drawing or a sheet in Spanish names the floor of a plan with no
  floor list "Planta baja" (`floors[].name` in the record), where it said "Ground floor".
- No new code in the record.
