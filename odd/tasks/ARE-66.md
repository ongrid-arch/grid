# ARE-66: report the narrowest point of each corridor in the brief

## Outcome

Each measured corridor gets a line saying whether its narrowest width from end to end meets the
brief. The line gives the same width and location as the access measure. Widening one stretch
still leaves the corridor short when another stretch is below the figure.

## Design

- In `packages/cli/src/brief/lines.ts`, give corridor width its own lines so every measured
  corridor gets a width, verdict and location. Use the existing access measurement and the
  same tolerance for judging the target.
- When access finds no two ends, keep its widest-circle fallback and state the reason.
- Put the corridor wording in the message files and document the lines in `docs/brief.md`.

## Done

- Compare the brief and access for a corridor with a narrow stretch, a corridor meeting the
  figure and a corridor close enough to meet it by the access tolerance.
- Keep the existing tests for widening just one stretch and for widening the whole corridor.
- Run the build, typecheck, lint, affected tests and scoreboard.
