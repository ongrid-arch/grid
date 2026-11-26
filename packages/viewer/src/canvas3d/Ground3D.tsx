import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { BuildingGround } from './building'
import { MODEL_TO_THREE } from './convert'

/**
 * VEW-66: the ground as a surface. A sheet in the background's own colour, not tone mapped, so
 * where nothing lies under it it is the background; partly see-through, so what lies under it (a
 * basement, a car park's levels) shows through it faded, as buried. Cut away over the floors that
 * go down into the ground (`sceneGround`), so a floor shown as a cutaway is seen through the hole.
 */
export const GROUND_FILL = {
  /** Under the ground, just below the grid's lines (`GROUND_GRID.y`), so they lie on it. */
  y: -0.02,
  /** How much of what lies under it the ground hides. */
  opacity: 0.7
} as const

/** The ground's pieces as one flat geometry at `y`, in Three's frame, facing up. */
export function groundGeometry(ground: BuildingGround): THREE.BufferGeometry {
  // The library closes each ring with its first point again, which a shape leaves out.
  const points = (ring: readonly (readonly [number, number])[]): THREE.Vector2[] => {
    const open = ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1] ? ring.slice(0, -1) : ring
    return open.map(([x, y]) => new THREE.Vector2(x, y))
  }
  const shapes = ground.pieces
    .filter((polygon) => polygon.length > 0 && polygon[0]!.length >= 3)
    .map(([outer, ...holes]) => {
      const shape = new THREE.Shape(points(outer!))
      for (const hole of holes) shape.holes.push(new THREE.Path(points(hole)))
      return shape
    })
  const geometry = new THREE.ShapeGeometry(shapes)
  geometry.applyMatrix4(MODEL_TO_THREE)
  geometry.translate(0, ground.y + GROUND_FILL.y, 0)
  return geometry
}

/** Nothing is picked on the ground: a click or hover goes to the storey behind it. */
const NO_RAYCAST = (): void => {}

export function Ground3D({ ground, color }: { ground: BuildingGround; color: string }): JSX.Element {
  const geometry = useMemo(() => groundGeometry(ground), [ground])
  useEffect(() => () => geometry.dispose(), [geometry])
  // Drawn before every other see-through part and writing no depth, so the grid's lines over it
  // keep their strength.
  return (
    <mesh geometry={geometry} renderOrder={-1} raycast={NO_RAYCAST}>
      <meshBasicMaterial
        color={color}
        transparent
        opacity={GROUND_FILL.opacity}
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
