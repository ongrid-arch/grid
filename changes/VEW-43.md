# 2026-11-25: describe counts outdoor rooms by kind (VEW-43)

## For people

- `grid describe` counts balconies, terraces and other outdoor rooms by kind ("76 balconies"), not
  among the rooms that do not say what they are for (VEW-43).

## For agents

- `grid_describe`'s room summary counts a room marked outdoor by its outdoor kind, after bedrooms and
  bathrooms, and leaves it out of "do not say what they are for". No new code in the record.
