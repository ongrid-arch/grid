# VEW-68 — Keep room labels inside their rooms

## Outcome

Each name and area in a plan picture belongs to the room underneath it. A row of
like rooms can be told apart by the numbers in their labels. A crop lays out its
own labels in the floor it shows.

## Design

Use the room outlines and holes in the shared plan scene. Fit the padded text
inside the visible part of its own room and clear of wall ink, door swings,
stair flights and lift crosses. Try the whole name and area, turning along a
narrow room, then smaller and wrapped forms, then the room number with a key.
Keep numbers on full labels for rooms with the same name. Leave a room without
text when even its number has no clear spot. An outside callout has no reliable
place on every floor, especially one with detached buildings or a court.

## Done

Check repeated rooms, off-centre and angled rooms, nested rooms, a crop and a
room too tight for a number. Run the build, type check, lint, floorplan, CLI and
viewer tests, and the scoreboard after bringing in main.
