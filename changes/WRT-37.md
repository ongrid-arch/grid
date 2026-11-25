# 2026-11-25: wall ids stay put when a building is added elsewhere (WRT-37)

## For people

- Adding a building that shares no wall with the others, such as a pump house beside a shed,
  no longer renames the walls Grid works out for the others, so an opening pattern on one of
  them keeps placing its openings. The building written first keeps its wall names, and each
  other one puts its first room's id in its own (`ext-pump-south`) (WRT-37).

## For agents

- `grid write` and `grid_write_rooms` name the walls they work out per building: on a floor with
  rooms that share no wall, the building of the text's first room keeps the names it had, and
  every other building's outside walls and walls named by place carry its first room's id
  (`ext-<room>-south`, `w-<room>-x12.5`, `w-<room>-angled`). Ids on a floor of one building
  are as before. No new code in the record.
