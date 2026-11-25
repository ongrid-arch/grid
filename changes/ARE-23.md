# 2026-11-25: a room's true width and depth in the walk (ARE-23)

## For people

- The walk now says each room's width and depth as the room is drawn, also when you come in through a wall that is not square to the room (ARE-23).

## For agents

- `grid_describe length=walk`: `across` and `deep` of a stop are measured along the room's own side nearest to the way you face, so they agree with the room's area. No new code in the record.
