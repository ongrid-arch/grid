# WRT-77: Let a stated wall thickness set the gap

## Outcome

Rooms can share a wall thicker than 0.6 m when the text states its thickness.
A scan can draw a wide wall from its two measured faces.

## Design

Use the thickness stated for the facing sides, the two rooms or the floor's
wall rule to extend the existing inferred gap limit for those faces. Keep the
measured gap when rooms are placed by coordinates. Keep the existing warning
when a wall line and the room positions disagree. State wide shared walls
before the first compile in the rooms read-back.

For scans, pass widths measured between two scanned wall faces to the rooms
compiler. Bound automatic pairing so the scan still distinguishes a wall from
open space. Preserve the one-sided wall assumption and the plan file shape.

## Done

Check 0.75 m, 0.9 m and 1.8 m walls, an unstated or wider gap, a rooms text
read-back, and a wide wall paired from scan faces. Run the build, type check,
lint, floorplan and CLI tests, and scoreboard.
