# 2026-11-28: dimension chains on sections (VEW-89)

## For people

- A section now carries dimension chains: up its left side the detail (each floor's level, the
  sill and head of every door and window cut, each floor's clear height), floor to floor and the
  overall height from the ground to the ridge, parapet or roof; under it the walls cut along the
  line and the overall length. `grid draw --section ... --hide dimensions` leaves them off
  (VEW-89).

## For agents

- `grid_view kind=section` draws the chains and says each in a line of its text (its figures in
  order, their sum and what each point is at); its data adds `section.dimensions` (each chain's
  `kind`: `detail`, `levels`, `overall`, `walls` or `length`; its `axis`; its `figures`, each with
  `value`, `from`, `to` and `ends`, each end's `kind` and `id`) and `section.openings` (each door
  and window the line cuts, with its `sill` and `head` levels). It takes `dimensions` (false
  leaves the chains off, from the picture and the answer). A sheet's section pages draw them too.
  No new code in the record.
