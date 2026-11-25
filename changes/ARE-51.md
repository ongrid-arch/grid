# 2026-11-25: ramp lines in the take-off read cleanly (ARE-51)

## For people

- The take-off's ramp lines write each unit once ("3.00 m up over 35.75 m") and name the floors a
  ramp joins by name, not by id (ARE-51).

## For agents

- `grid_takeoff`: the text line for each ramp no longer doubles the unit and names both floors by
  name; the levels are written in the asked units. The data is unchanged. No new code in the record.
