# VEW-27: mark what a section assumes without a material hatch

## Outcome

A section no longer draws a 45-degree hatch over the slabs, roofs and walls Grid took because the
plan states no thickness or height. A hatch reads as a material (concrete, insulation; on a plan
the same hatch is brick), and an assumed part is not a material. Now each assumed part is drawn
with a dashed outline and a light tint that matches no material, and the key under the drawing
says "Dashed outline: taken by Grid, not stated in the plan". Hatches stay for materials only.

## Design

- `packages/viewer/src/picture/section.ts`: the assumed pieces are painted with a flat tint
  (`look.colors.dimensionSoft` at low opacity) and a dashed outline in the cut's own weight; the
  hatch pattern and `hatchDefs` are removed from the section. `data-part` is `section-assumed`
  (group `section-assumed-group`), `data-kind` and `data-ids` are unchanged. The key swatch uses
  the same tint and dash.
- Messages (`en.ts`, `es.ts`): the key line and the stderr note (`drawing.section.note.hatched.*`)
  say "dashed outline" instead of "hatched"; keys stay, so nothing else moves.
- The CLI's text answer (`sectionAnswer.ts`) and the tool and option descriptions say "dashed"
  where they said "hatched".
- Decision: the record field `SectionAssumption.hatched` and the answer's `hatched` flag keep their
  names (the result contract); their meaning, "marked on the cut", is stated in their comments.
- No facade change: a facade draws only material courses, never assumed parts. No new
  convention and no new message code.

## Done

- `packages/viewer/src/picture/__tests__/section.test.ts`: assumed parts carry a dash and a tint,
  no `<pattern>` and no `url(#...)` fill appear in a section picture.
- `packages/cli` tests that read the wording pass; `ownWords.test.ts` passes; typecheck, lint and
  the scoreboard do not get worse.
