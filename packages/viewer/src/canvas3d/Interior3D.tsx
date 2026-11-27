import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { limit, type SceneCeiling, type SceneInterior, type SceneLining, type Vec2 } from '@ongrid/floorplan/geometry'
import { toThree } from './convert'
import { finishTint } from './finishTint'

/**
 * VEW-78: a room's inside as the core works it out (`sceneInterior`): its wall finishes, each a
 * flat lining on its wall's face, open over each opening, and its ceilings. The view draws them and
 * works out nothing of its own. A room's floor finish is drawn a hair over its floor. A lining is drawn a hair into the room off its face
 * (`liningOffset`), a band twice as far, so each shows over what it covers; a ceiling as far under
 * its height.
 *
 * Heights are local to the storey's group, whose y is its floor level.
 */

/** A lining as a flat shape, in Three's frame: along its side and up, open over its holes. */
export function liningGeometry(lining: SceneLining): THREE.BufferGeometry | null {
  const dx = lining.to.x - lining.from.x
  const dy = lining.to.y - lining.from.y
  const length = Math.hypot(dx, dy)
  if (!(length > 0) || !(lining.top > lining.bottom)) return null
  const shape = new THREE.Shape([
    new THREE.Vector2(0, lining.bottom),
    new THREE.Vector2(length, lining.bottom),
    new THREE.Vector2(length, lining.top),
    new THREE.Vector2(0, lining.top)
  ])
  for (const hole of lining.holes) {
    shape.holes.push(
      new THREE.Path([
        new THREE.Vector2(hole.along[0], hole.rise[0]),
        new THREE.Vector2(hole.along[0], hole.rise[1]),
        new THREE.Vector2(hole.along[1], hole.rise[1]),
        new THREE.Vector2(hole.along[1], hole.rise[0])
      ])
    )
  }
  const geometry = new THREE.ShapeGeometry(shape)
  // The room is on the side's left: the lining stands that far into it.
  const inset = limit('liningOffset') * (lining.band ? 2 : 1)
  const ux = dx / length
  const uy = dy / length
  const position = geometry.getAttribute('position')
  for (let i = 0; i < position.count; i++) {
    const s = position.getX(i)
    const z = position.getY(i)
    const p = toThree({ x: lining.from.x + ux * s - uy * inset, y: lining.from.y + uy * s + ux * inset, z })
    position.setXYZ(i, p.x, p.y, p.z)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

/** A ceiling's pieces as flat shapes at its height, in Three's frame, a hair under it; a floor finish's a hair over it. */
export function ceilingGeometries(ceiling: SceneCeiling, below = true): THREE.BufferGeometry[] {
  const y = ceiling.z + (below ? -1 : 1) * limit('liningOffset')
  const v = (p: Vec2): THREE.Vector2 => new THREE.Vector2(p.x, p.y)
  return ceiling.pieces.map((piece) => {
    const shape = new THREE.Shape(piece.outline.map(v))
    for (const hole of piece.holes) shape.holes.push(new THREE.Path(hole.map(v)))
    const geometry = new THREE.ShapeGeometry(shape)
    const position = geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      const p = toThree({ x: position.getX(i), y: position.getY(i), z: y })
      position.setXYZ(i, p.x, p.y, p.z)
    }
    position.needsUpdate = true
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()
    return geometry
  })
}

/**
 * How much a ceiling glows in its own colour: the light the floor and walls throw back up at it,
 * which the scene's lights, all from above, do not give. Without it a white ceiling reads dark.
 */
export const CEILING_BOUNCE = 0.45

export interface Interior3DProps {
  readonly interior: SceneInterior
  /** Whether the ceilings are drawn: for a camera in a room, where they close the view overhead. */
  readonly ceilings: boolean
  /** The colour a ceiling with no tint is drawn in. */
  readonly ceilingColor: string
  /** A colour as the storey shows it: muted below the focused floor, tinted while hovered. */
  readonly tone: (color: string) => string
  readonly glow?: number
}

export function Interior3D({ interior, ceilings, ceilingColor, tone, glow = 0 }: Interior3DProps): JSX.Element {
  const linings = useMemo(
    () =>
      interior.linings.flatMap((lining) => {
        const tint = finishTint(lining.finish)
        const geometry = tint === null ? null : liningGeometry(lining)
        return geometry === null || tint === null ? [] : [{ geometry, tint, key: `${lining.room}:${lining.wall}:${lining.band ? `band:${lining.bottom}` : 'face'}:${lining.from.x},${lining.from.y}` }]
      }),
    [interior]
  )
  const tops = useMemo(
    () =>
      ceilings
        ? interior.ceilings.flatMap((ceiling, i) =>
            ceilingGeometries(ceiling).map((geometry, k) => ({ geometry, tint: finishTint(ceiling.finish), key: `${ceiling.room}:${i}:${k}` }))
          )
        : [],
    [interior, ceilings]
  )
  const floors = useMemo(
    () =>
      interior.floors.flatMap((floor, i) => {
        const tint = finishTint(floor.finish)
        return tint === null ? [] : ceilingGeometries(floor, false).map((geometry, k) => ({ geometry, tint, key: `${floor.room}:${i}:${k}` }))
      }),
    [interior]
  )
  useEffect(() => () => floors.forEach(({ geometry }) => geometry.dispose()), [floors])
  useEffect(() => () => linings.forEach(({ geometry }) => geometry.dispose()), [linings])
  useEffect(() => () => tops.forEach(({ geometry }) => geometry.dispose()), [tops])
  return (
    <group name="interior">
      {linings.map(({ geometry, tint, key }) => (
        <mesh key={key} name="lining" geometry={geometry} receiveShadow>
          <meshStandardMaterial color={tone(tint)} emissive={tone(tint)} emissiveIntensity={glow} roughness={0.9} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {floors.map(({ geometry, tint, key }) => (
        <mesh key={key} name="floor finish" geometry={geometry} receiveShadow>
          <meshStandardMaterial color={tone(tint)} emissive={tone(tint)} emissiveIntensity={glow} roughness={1} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {tops.map(({ geometry, tint, key }) => (
        <mesh key={key} name="ceiling" geometry={geometry} receiveShadow>
          <meshStandardMaterial color={tone(tint ?? ceilingColor)} emissive={tone(tint ?? ceilingColor)} emissiveIntensity={Math.max(glow, CEILING_BOUNCE)} roughness={1} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}
