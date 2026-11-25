# VEW-32: a row of bays is labelled once, a site's things are labelled, a site picture is not crowded

## Outcome

- Bay numbers that do not fit their bay at the picture's zoom are no longer printed on top of
  each other (`P1P2P3…`). A row of such bays gets one label, the first and last number as a range
  (`P1-P30`), in the middle of the row. A bay whose number fits keeps its own number. A bay alone
  that does not fit waits for the user to zoom in.
- A site's things are labelled: a thing the person named (a sprinkler tank, a bike store) shows
  that word at its middle (a tree at its trunk, a fence or gate along its longest line). A thing
  with only its kind's word is left unlabelled, so a plan of ordinary paving and trees is as before.
- A picture of a site-sized plan (its drawing's longest side is 100 m or more) leaves out the
  room dimensions and the opening chains of more than six marks: they are unreadable at that scale
  and repeat the same figures sixty times. Overall and wall chains stay.

## Design

- `packages/viewer/src/picture/bayLabels.ts`: pure `bayLabels(bays, mpp)` returns the labels to
  draw (`{ at, text, bayId | null }`). A number fits when its estimated width
  (`estimateTextWidth`, 10 px) plus padding is inside the bay's width in pixels. Unfit bays are
  grouped into rows by a shared centre line (same y, else same x) and cut where the gap is more
  than twice the row's smallest pitch; rows of two or more get a range.
- `scene.ts`: draws bays through it; `data-part="bay-number"` for a single, `bay-range` for a row.
- `site.ts`: `thingLabel` places the label (pole of inaccessibility of the biggest ring, tree trunk,
  middle of a fence's longest line); drawn last in the site group, in the look's dimension-text
  colour, `data-part="site-label"`.
- `siteScale.ts`: `isSiteScale(bounds)` and `withoutSiteClutter(dimensions)`, used in
  `planSceneIn` before the layout. The limit and the chain length are constants there.
- Decisions: 100 m rather than "has a site", because a house with a plot is not site scale;
  labels only for named things, because the default word repeats on every tree.

## Done

- `__tests__/bayLabels.test.ts`: 120 bays in a row give one `P1-P120`-style range, a wide bay
  keeps its number, a single unfit bay is blank; the same row zoomed in gets its numbers.
- `__tests__/siteLabels.test.ts`: a named pool/paving is labelled, an unnamed tree is not; a
  site-sized plan has no room dimension and no long opening chain, a house keeps them.
- Viewer test folder, typecheck, lint, scoreboard, `ownWords.test.ts`.
