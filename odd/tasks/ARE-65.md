# ARE-65: use the below-ground findings when checking escape openings

## Outcome

When the drawing check reports a bedroom's window or door as below ground,
the escape check leaves that opening out. If no other candidate remains, the
escape finding explains why and names the openings so their notes can be found.

## Design

- In `packages/rules/src/checks/check.ts`, take the excluded opening ids from
  the drawing check's findings. That check already reads sloping ground and
  accounts for the floor of an outdoor space and the foot of a ramp.
- In `packages/rules/src/checks/escape.ts`, apply those exclusions when
  collecting outside openings for each room. Keep the existing finding code,
  wording and opening references.

## Done

- A window beside a shallow light well is excluded and the escape finding
  points to its below-ground note. A deep enough light well keeps the window
  available. A door at the foot of a ramp stays available.
- On a slope, a window buried on the uphill side is excluded while an
  equivalent window on the downhill side can count.
- Build, type check, lint, affected tests and scoreboard pass.
