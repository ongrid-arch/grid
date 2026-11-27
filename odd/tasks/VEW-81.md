# VEW-81

## Outcome

A floor map can share its scale and origin pixel with every other floor in the building. An agent can convert image coordinates back into metres, and a PNG has a companion world file when a single affine transform describes the picture. A plan write states its drawing origin and points to the existing rooms-text line for the site reference point.

## Design

Use the viewer's drawing bounds and the transform used to draw the picture. Take the union of floor bounds for the building frame and keep floor framing available for a closer view. Carry the inverse transform to the tool answer and PNG writer. Use the existing site origin field and rooms-text syntax, keeping drawing and site reference coordinates explicit.

## Done

Check that unequal floors share a frame and map the same drawing point to the same pixel, that floor framing still works and that PNG world files agree with the answer. Check write answers with a stated site origin and with the default drawing origin. Run the build, type check, lint, affected tests and scoreboard.
