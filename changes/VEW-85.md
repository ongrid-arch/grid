# 2026-11-28: a site plan view, and the site under any floor (VEW-85)

## For people

- Grid draws a site plan: `grid draw --site`. It shows the plot with every building on it, not
  only the lowest floor's, each in solid fill with its name, storeys and height written on it,
  the site's things with the labels you gave them, your set-back lines, the street edges, a scale
  bar and the north arrow, framed to the whole site. `grid draw --with-site` draws the site faint
  under any floor, so an upper floor's evacuation map can show the assembly point outside (VEW-85).

## For agents

- `grid_view` takes `kind=site`: the site plan, framed to the plot and every building. Its text
  lists each building drawn with its storeys, height and area seen from above, any building not
  drawn and why, the plot's area, the labelled things, the set-back lines and the street edges;
  its data has `site` (`buildings`, `plotArea`, `setbacks`, `streets`, `labels`, `north`,
  `scaleBar`) and `ids`, the buildings drawn. It takes `look` only, and refuses a plan with no plot,
  no site thing and no floor whose walls close an outline. `kind=plan` takes `with_site: true` to
  draw the site faint under the floor, framed with it. The plan holds no street names, so none is
  written. No new code in the record.
