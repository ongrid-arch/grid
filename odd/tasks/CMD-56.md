# CMD-56: the site and the massing carried into the DXF and the IFC

## Outcome

A plan can hold a plot (its boundary, street edges and set-backs), the site's things (fences,
gates, paths, paving, trees and pools) and floors that are massing (an outline and a height, no
walls yet). The 2D views draw all of it, but the exports did not: a plan of massing on a plot
was refused with "Nothing to export", and the DXF of a walled plan held no boundary, no tree and
no paving. When this is done:

- A plan whose floors are massing exports in every format: a floor that states an outline and
  has no walls counts as something the file holds, as its slab already did in the IFC, the OBJ
  and the GLB.
- The DXF draws the site on the floor it is drawn on (the ground floor), each part on a layer of
  its own: the boundary (`GRID-SITE-BOUNDARY`), the set-back lines at the person's own figures
  (`GRID-SITE-SETBACKS`, dashed), paving (`GRID-SITE-PAVING`), paths (`GRID-SITE-PATHS`), fences
  and gates (`GRID-SITE-FENCES`), pools (`GRID-SITE-POOLS`) and trees, a trunk and the crown
  across its canopy (`GRID-SITE-TREES`). Each massing floor's outline is a closed polyline on
  `GRID-MASSING` with its floor level as its elevation and its storey's height as its thickness,
  so a CAD program shows it as a block.
- The IFC's `IfcSite` carries the plot's boundary as its footprint (a closed polyline in the
  `FootPrint` view), each building the plan names stays an `IfcBuilding` of its own, and each
  massing floor is an `IfcBuildingElementProxy` on its storey: its outline swept up its storey's
  height, with its area, height and volume.
- A file that does not write the site's things says so, as it says what else it leaves out: the
  IFC and the OBJ (which write none of them), and a GLB of one floor, name them as site things
  left out, in the file's note and on the command's and the tool's line, with where they are
  drawn (a DXF, and a GLB of the whole building).

## Design

- `packages/floorplan/src/export/leftOut.ts`: `exportContents` counts a held floor that is
  massing (`isMassing`) as drawn, so the file is not empty. `siteLeftOut` names the site's things
  a format does not write, on the first floor of the file the site is drawn on (`siteFloors`).
- `packages/floorplan/src/geometry/export/leftOut.ts`: a new kind of part left out, `site` (a
  site thing). It is no part validation breaks, so the note words it apart: a file's first line
  says the format holds no site things and where they are drawn (`drawing.leftOut.site`, in the
  message files), after the line for broken parts when there are some.
- `packages/floorplan/src/export/planExport.ts`: hands the DXF floor that holds the site its
  set-back lines (`planSetbackLines`, exported from `geometry/sitePlan.ts`, the same lines the
  site plan draws) and each massing floor its level and height (`floorElevations`), and adds
  `siteLeftOut` to the IFC's, the OBJ's and a one-floor GLB's list.
- `packages/floorplan/src/geometry/export/dxfProfile.ts`: eight new categories (`site-boundary`,
  `setbacks`, `paving`, `paths`, `fences`, `pools`, `trees`, `massing`) with neutral pens, so an
  office's profile may rename them. A layer is listed only when something is drawn on it, so a
  plan with no site writes the same file as before.
- `packages/floorplan/src/geometry/export/dxf.ts`: `writeModel` draws the drawing's site
  (`PlanDrawing.site`, already worked out for the 2D view) and the set-back lines first, under
  everything, and the massing outline after them. A light polyline takes an elevation (38) and a
  thickness (39). A tree's trunk is a circle as wide as the 3D views draw it
  (`treeDrawnTrunk`, already in the tolerance table): no new figure.
- `packages/floorplan/src/geometry/export/ifc.ts`: the site's footprint shape is written before
  the `IfcSite`, only when the plot has a sound boundary, in a `FootPrint` sub-context made then,
  so a plan with no boundary writes the same file as before. `writeMassing` writes the proxies
  after the items, contained in their storeys. `Grid_LeftOut` takes `SiteThings` and
  `SiteThingIds`.
- The CLI's `leftOutText` (`command/export.ts`) says site things apart from parts that cannot be
  drawn, from the message files.
- Decided: the IFC does not write the site's things (IFC2x3 has no element for a tree or paving
  that every viewer reads alike); it names them. The set-backs are lines, not parts, so no file
  names them as left out. A floor's outline on a floor that has walls is not written as massing.

## Done

- `packages/floorplan/src/export/__tests__/siteMassing.test.ts`: a massing plan on a plot is not
  empty in any format; its DXF holds the boundary, the set-backs, the paving, the path, the fence,
  the pool, the tree and the massing outline on their layers, with the outline's elevation and
  thickness; a walled plan's DXF holds its site too; its IFC holds the site's footprint, one
  `IfcBuilding` per named building and a proxy per massing floor; the IFC and the OBJ name the
  site things left out, and the DXF and a GLB of the whole building do not.
- The existing export tests and goldens pass unchanged (a plan with no site writes what it did).
- `npm run build`, `npm run typecheck`, `npm run lint`, the floorplan export and geometry tests,
  `packages/cli/src/mcp`, `packages/cli/src/command`, the own-words and contract tests, and
  `npm run scoreboard`.
