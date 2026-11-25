# WRT-60: say how many parts a default type takes

## Outcome
- Making a wall, door or window type the default says how many parts take it from then on,
  counting the parts that name no type of their own.
- When none do (a default for exterior walls in a plan whose walls are all interior), the answer
  says so and offers the other kind, with how many walls of it there are.

## Design
- `packages/cli/src/edit/types.ts` `changeType`: the plan is read before the change, so a new
  default reached nothing in the count. It now adds the parts that name no type (of the kind, for
  walls) and always says the count with a default. With none, one line says "No wall takes it",
  gives the interior and exterior counts and offers the other kind.
- Decision: offer, never change the kind on its own; the person decides.

## Done
- `mcp/__tests__/namedTypes.test.ts`: a default with walls says the count; a default with none
  says none and offers the kind.
- Type check of `packages/cli`, lint, `namedTypes.test.ts`, `ownWords.test.ts`, `tolerances.test.ts`.
