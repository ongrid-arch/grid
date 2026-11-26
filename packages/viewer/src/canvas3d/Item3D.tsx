import { useEffect, useMemo } from 'react'
import type { SceneItem } from '@ongrid/floorplan/geometry'
import { stairBlockGeometry } from './Stair3D'

/**
 * CNT-42: a fixture or a piece of furniture, in the storey it stands on: the plain blocks its kind
 * gives in the core (`buildScene`, the kinds registry), each solid from its bottom to its top. The
 * 3D view works out nothing of its own. With a cutaway, what stands above `cut` is not drawn.
 * Heights are local to the storey's group, whose y is its floor level.
 */
export function Item3D({ item, color, cut = null, castShadow = false, glow = 0 }: {
  item: SceneItem
  color: string
  cut?: number | null
  castShadow?: boolean
  glow?: number
}): JSX.Element {
  const geometries = useMemo(
    () =>
      item.blocks
        .filter((b) => cut === null || b.bottom < cut)
        .map((b) => (cut === null || b.top <= cut ? b : { ...b, top: cut }))
        .filter((b) => b.top > b.bottom)
        .map(stairBlockGeometry),
    [item, cut]
  )
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries])
  return (
    <group name={`item:${item.id}`}>
      {geometries.map((geometry, i) => (
        <mesh key={i} geometry={geometry} castShadow={castShadow} receiveShadow>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} roughness={0.9} metalness={0} />
        </mesh>
      ))}
    </group>
  )
}
