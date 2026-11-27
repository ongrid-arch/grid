import { useEffect, useMemo } from 'react'
import type { SiteBlock, SiteBlockKind } from '@ongrid/floorplan/geometry'
import type { BuildingGround } from './building'
import { stairBlockGeometry } from './Stair3D'

/**
 * CNT-60: the site in 3D: the neighbours, fences, gates, paths, paving, trees and pools' water the
 * core gives as blocks (`siteScene`, `BuildingGround.site`), each solid from its bottom to its top
 * in the ground's own heights. The view works out nothing of its own: it colours each kind.
 */

/** The colour each kind of block is drawn in, and how much of it is seen through (water alone). Plain colours of the things themselves, the same in every theme. */
export const SITE_LOOK: Readonly<Record<SiteBlockKind, { readonly color: string; readonly opacity: number }>> = {
  neighbour: { color: '#d4d2cc', opacity: 1 },
  fence: { color: '#8a7f70', opacity: 1 },
  gate: { color: '#6f6457', opacity: 1 },
  path: { color: '#bdb6a8', opacity: 1 },
  paving: { color: '#c9c2b4', opacity: 1 },
  water: { color: '#4f8fbf', opacity: 0.75 },
  trunk: { color: '#6b5440', opacity: 1 },
  crown: { color: '#6f9a5a', opacity: 1 }
}

/** CNT-60: a party wall's colour: drawn as a cut, the building going on past it. */
export const CUT_WALL_COLOR = '#45454a'

/** Nothing is picked on the site: a click or hover goes to the storey behind it. */
const NO_RAYCAST = (): void => {}

/** The site's blocks as geometries, each with its look, lifted to the ground's height in Three's frame. */
export function siteGeometries(site: readonly SiteBlock[]): { readonly block: SiteBlock; readonly geometry: ReturnType<typeof stairBlockGeometry> }[] {
  return site.filter((block) => block.top > block.bottom && block.outline.length >= 3).map((block) => ({ block, geometry: stairBlockGeometry(block) }))
}

export function Site3D({ ground }: { ground: Pick<BuildingGround, 'site'> }): JSX.Element {
  const parts = useMemo(() => siteGeometries(ground.site), [ground])
  useEffect(() => () => parts.forEach((part) => part.geometry.dispose()), [parts])
  return (
    <group name="site">
      {parts.map(({ block, geometry }, i) => {
        const look = SITE_LOOK[block.kind]
        const see = look.opacity < 1
        return (
          <mesh key={`${block.kind}:${block.id}:${i}`} name={`${block.kind}:${block.id}`} geometry={geometry} castShadow={!see} receiveShadow raycast={NO_RAYCAST}>
            <meshStandardMaterial color={look.color} transparent={see} opacity={look.opacity} depthWrite={!see} roughness={see ? 0.2 : 0.9} metalness={0} />
          </mesh>
        )
      })}
    </group>
  )
}
