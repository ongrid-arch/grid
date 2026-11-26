# VEW-60: a section is drawn in the technical look unless another is asked for

## Outcome

`grid_view kind=section` with no `look` draws the section in the technical look (black on white,
lines in millimetres), as `grid draw --section` already does, and the `look` argument says it
applies to sections as well as plans and facades. A person who asks for the working look still
gets it, and the answer says which look drew the picture.

## Design

- `packages/cli/src/mcp/readTools.ts`: the `look` description named plan and facade only, and
  the section branch took `working` when `look` was left out. The description now names section
  and says a section's default is technical; the section branch defaults to `technical`. A plan
  and a facade keep `working`.
- `docs/tool-server.md` and `docs/commands.md`: say it where the section view and the looks are
  described.
- Decision: only the section default changes. A facade keeps `working`, since nobody asked and
  a changed default moves pictures other callers rely on.
- No new convention and no new message code.

## Done

- `packages/cli/src/mcp/__tests__/sectionView.test.ts`: a section with no look is drawn in the
  technical look, `look: working` still draws the working look, and the schema's description of
  `look` names sections.
- Type check of `packages/cli`, lint, `ownWords.test.ts`, `tolerances.test.ts`.
