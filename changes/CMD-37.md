# 2026-11-26: the sill argument says doors, and grid diff says an opening once (CMD-37)

## For people

- `grid edit opening --help` says `--sill` is a window's sill and a door's threshold, so `--sill 0` is the way to take a door's step away (CMD-37).
- `grid diff` lists an opening that stayed where it was, or moved with its wall or room, once (CMD-37).

## For agents

- `grid_change_opening`: the `sill` argument's description names doors (their threshold) as well as windows; no change to what it accepts. `grid_diff`: `stayed` and `movedWith` hold one entry for each opening. No new code in the record.
