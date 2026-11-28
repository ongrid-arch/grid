# 2026-11-28: the site and the massing in the DXF and the IFC (CMD-56)

## For people

- A plan of massing, floors drawn as an outline and a height before any wall, now exports in every format. Before, `grid export` refused it with "Nothing to export" (CMD-56).
- The DXF draws the site on the ground floor: the plot's boundary, the set-back lines, paving, paths, fences and gates, pools and trees, each on a layer of its own. Each massing floor is its outline at its floor level, as high as its storey, so a CAD program shows it as a block.
- The IFC's site carries the plot's boundary, each building of the plan is a building of its own, and each massing floor is a block on its storey, with its area, height and volume.
- A file that holds none of the site's things (the IFC, the OBJ, a GLB of one floor) says which it left out, and that the DXF draws them.

## For agents

- `grid_export` and `grid export`: a floor that states an outline and has no walls counts as something the file holds, so a plan of massing is no longer refused as empty. `leftOutParts` may hold parts of the new kind `site` (a fence, gate, path, paving, tree or pool, by its id) for an IFC, an OBJ or a GLB of one floor that holds the floor the site is drawn on; the answer's line says them apart from parts that cannot be drawn ("This format holds no site things: …"). The file's note says so too, and the IFC's `Grid_LeftOut` has `SiteThings` and `SiteThingIds`.
- The DXF: new categories `site-boundary`, `setbacks`, `paving`, `paths`, `fences`, `pools`, `trees` and `massing` (`GRID-SITE-BOUNDARY`, `GRID-SITE-SETBACKS`, `GRID-SITE-PAVING`, `GRID-SITE-PATHS`, `GRID-SITE-FENCES`, `GRID-SITE-POOLS`, `GRID-SITE-TREES`, `GRID-MASSING`), which `dxf-layers.json` may rename. The site is drawn once, on the first floor of the file it is drawn on. A massing outline is an `LWPOLYLINE` with its elevation (38) and thickness (39).
- The IFC: `IfcSite.Representation` is the boundary as a `FootPrint` `GeometricCurveSet` when the plot has a sound boundary; each massing floor is an `IfcBuildingElementProxy` (`ObjectType` `Massing`, `Tag` the floor's id) with `GrossFootprintArea`, `Height` and `GrossVolume`. A plan with no boundary and no massing writes the file it did.
- No new code in the record.
