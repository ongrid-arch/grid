# 2026-11-27: lettable area, the core, efficiency, the area per person, frontage zones and the area as written (ARE-68)

## For people

- Grid gives the lettable area, the floor a tenant or buyer has the use of, apart from net to
  gross: a room is lettable by the tenure it states, else by its use (not a stair, lift, plant
  room, corridor or parking), or by the uses and tenures you choose. Beside it come the core
  (stair, lift and plant rooms) with its share of each floor plate, and the efficiency, lettable
  over gross internal, per floor, per floor type and in all, in the area answers and when plans
  are compared. Net to gross now says it holds the core and corridors (ARE-68).
- Say who the building is for, pupils, covers, keys, beds, capacity or desks, in the call or in
  the brief, and the areas come per one: gross internal per pupil, net per key, per cover. With
  none, the covers and desks counted from the furniture are used (ARE-68).
- A shop's floor in bands of depth from its frontage, A, B, C and the rest, in m² and sq ft, at
  6.1 m (20 ft) or the depth you give; and a room's area to its walls' centre lines, the size it
  was written at, beside its net area (ARE-68).

## For agents

- `grid_areas`: `data.lettable` (`lettable`, `core`, `grossInternal`, `efficiency`, `coreShare`,
  `floors` with each floor's `lettable`, `core`, `efficiency`, `coreShare`, `floorType`,
  `lettableByUse` and `coreRooms`, `floorTypes`, `lettableByUse`, `notLettable`, `chosen`,
  `states`, `rules`) on every answer; the text gives "Lettable area: …", each floor's line ends
  "; lettable … (…%), core … (…% of the plate)", and the net to gross line ends "It holds the core
  and the corridors; lettable to gross: …%.". New arguments `lettable_uses`, `lettable_tenures`,
  `people` (`pupils`, `covers`, `keys`, `beds`, `capacity`, `desks`: a whole number, or `count`
  and `rooms`) and `as_written` (each room's `asWritten`, to the middle of its walls). With a
  figure, or covers and desks counted from the furniture, `data.people` lists each `kind`, `count`,
  `from` (`asked`, `brief`, `counted`), `rooms` and `per` (`grossInternal`, `grossExternal`, `net`,
  `lettable`).
- `grid_compare`: each option has `lettable`, `core`, `efficiency`, `coreShare` and, with a
  figure, `people`; it takes `lettable_uses`, `lettable_tenures` and `people`, else each plan's
  brief's people.
- `grid_measure what=frontage` (with `room`, and `wall`, `depth`, `bands`): `answer.bands`, each
  `name`, `from`, `to`, `area` and `sqFt`, with the `wall`, how it was `found`, its `width` and the
  `area` in all.
- `grid_write_brief`: the brief takes `people`, a fact that no line measures.
- No new code in the record.
