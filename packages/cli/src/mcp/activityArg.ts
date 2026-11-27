/**
 * ARE-73: the `per_kind` argument of `grid_measure what=activity`: an activity zone's figures by
 * fixture kind, the depth in front (`front`) and the width on the centre line (`width`), or one
 * number for the depth alone. The kinds are the kinds registry's (`isItemKind`), so a kind added
 * to it is taken here with no change.
 */
import { isItemKind, itemKinds } from '@ongrid/floorplan/geometry'
import type { KindFigure } from '../quantities/activity'
import { ToolRefusal, type ArgSpec } from './toolkit'

/** The smallest and largest figure a zone takes, in metres, as the other lengths of grid_measure. */
const FIGURE_MIN = 0.05
const FIGURE_MAX = 100

function figure(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < FIGURE_MIN || value > FIGURE_MAX) throw new ToolRefusal(`${where} takes a length in metres from ${FIGURE_MIN} to ${FIGURE_MAX}.`)
  return value
}

/** One kind's figures: a depth alone, or front and width. */
const KIND_FIGURE = {
  anyOf: [
    { type: 'number', minimum: FIGURE_MIN, maximum: FIGURE_MAX },
    {
      type: 'object',
      properties: {
        front: { type: 'number', minimum: FIGURE_MIN, maximum: FIGURE_MAX },
        width: { type: 'number', minimum: FIGURE_MIN, maximum: FIGURE_MAX },
      },
      additionalProperties: false,
      minProperties: 1,
    },
  ],
} as const

export const PER_KIND_ARG: ArgSpec = {
  type: 'object',
  description:
    'For activity: the zone in front of each fixture by kind, in metres: front, the depth out from its front, and width, the box\'s width shared either side of its centre line (the fixture\'s own width when left out); a number alone is the front. '
    + 'So a 400 mm zone either side of a WC\'s centre line, 700 mm deep, is {"toilet": {"front": 0.7, "width": 0.8}}. A kind named here gets a zone whatever it is; kinds not named take clearance and width, else their own.',
  examples: [{ toilet: { front: 0.7, width: 0.8 }, basin: 0.6 }],
  schema: {
    type: 'object',
    // The kinds the registry holds when the server starts; a kind registered later is read too.
    properties: Object.fromEntries(itemKinds().map((kind) => [kind, KIND_FIGURE])),
    propertyNames: { pattern: '^[a-z][a-z0-9-]{0,39}$' },
    additionalProperties: KIND_FIGURE,
    minProperties: 1,
  },
  read(value) {
    const given = value as Record<string, unknown>
    const kinds = Object.keys(given)
    if (kinds.length === 0) throw new ToolRefusal('per_kind takes at least one kind, such as {"toilet": {"front": 0.7, "width": 0.8}}.')
    const out: Record<string, KindFigure> = {}
    for (const kind of kinds) {
      if (!isItemKind(kind)) throw new ToolRefusal(`per_kind names a kind Grid does not hold; the kinds of fixture are ${itemKinds('fixture').join(', ')}, and any other kind grid_measure what=library lists.`)
      const entry = given[kind]
      if (typeof entry === 'number') {
        out[kind] = { front: figure(entry, `per_kind.${kind}`) }
        continue
      }
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new ToolRefusal(`per_kind.${kind} takes a number, the depth in front, or an object with front and width.`)
      const fields = entry as Record<string, unknown>
      if (Object.keys(fields).some((field) => field !== 'front' && field !== 'width') || Object.keys(fields).length === 0) throw new ToolRefusal(`per_kind.${kind} takes front and width only, at least one of them.`)
      out[kind] = {
        ...(fields['front'] === undefined ? {} : { front: figure(fields['front'], `per_kind.${kind}.front`) }),
        ...(fields['width'] === undefined ? {} : { width: figure(fields['width'], `per_kind.${kind}.width`) }),
      }
    }
    return out
  },
}
