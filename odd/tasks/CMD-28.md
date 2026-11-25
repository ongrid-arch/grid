# CMD-28: the guide says what the writer does with a word that is not a use

## Outcome

An agent that reads the guide knows, before it writes, that a word after a room's name that is
not one of Grid's uses (`kennel`, `theatre`, `ward`, `isolation`) is refused by rooms text with
the list of uses, and that nothing is written. It also knows the way out: `other` when no use
fits, `-` for none. The guide no longer reads as if every unknown word is only noted; that is
true of a plan file alone.

## Design

- `packages/cli/src/guide/guide.ts` and `docs/agent-guide.md` carry the same sentence in the
  section on which word is the use. It says the refusal first (the writer), then the plan file's
  note, and names `other` and `-`.
- No new code and no change to the writer: the refusal (`rooms/unknown-use`) and the note
  (`plan/unknown-use`) already behave as the sentence says. The sentence is the fix, because the
  writer's refusal lists the uses and an agent can recover from it.
- A test in `guide/__tests__/guide.test.ts` holds the guide to the writer: the guide says the
  refusal, and the uses the refusal lists are the uses in the guide's table.

## Done

- `npx vitest run packages/cli/src/guide` passes, and the new test fails on the old sentence.
- `ownWords.test.ts` and `tolerances.test.ts` pass; typecheck and lint are clean.
