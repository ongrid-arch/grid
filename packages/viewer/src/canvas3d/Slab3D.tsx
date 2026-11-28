import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { SLAB_THICKNESS, type SceneSlab } from '@ongrid/floorplan/geometry'
import { MODEL_TO_THREE } from './convert'

/**
 * A room's slab: the same polygon the 2D plan draws as a room, extruded
 * `SLAB_THICKNESS` (C3: the inner faces, the same footprint IFC writes).
 *
 * "Slab", not "floor", because a floor plan's `floor` is a storey (C5) — this
 * is the surface under one room, and a storey is drawn as a set of them.
 *
 * Heights are local to the storey's group, whose y is its floor level, so a
 * storey changing height never rebuilds its slabs.
 */

/**
 * A room's floor as a Three shape: its polygon, open over each of its holes (ARE-6), as the
 * floor mesh the exports write is.
 */
export function slabShape(slab: SceneSlab): THREE.Shape {
  return ringsShape(slab.polygon, slab.holes)
}

function ringsShape(outline: SceneSlab['polygon'], holes: SceneSlab['holes']): THREE.Shape {
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, p.y)))
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, p.y))))
  return shape
}

/** LVL-27: the floor as laid: its pieces when the storey's slab is open over part of it (none for a void), else the room. */
function laidShapes(slab: SceneSlab): THREE.Shape[] {
  return slab.pieces === undefined ? [slabShape(slab)] : slab.pieces.map((piece) => ringsShape(piece.outline, piece.holes))
}

/** The room's floor as laid extruded from `from` up `depth`, in Three's frame. */
function slabBetween(slab: SceneSlab, from: number, depth = SLAB_THICKNESS): THREE.BufferGeometry {
  // The polygon is counter-clockwise and the axis conversion keeps orientation,
  // so the extrusion's faces point outward on their own.
  const geometry = new THREE.ExtrudeGeometry(laidShapes(slab), {
    depth,
    bevelEnabled: false,
    steps: 1
  })
  geometry.translate(0, 0, from)
  geometry.applyMatrix4(MODEL_TO_THREE)
  return geometry
}

/**
 * A storey's floor slab: its top at the room's floor, going down under the room. A room set off
 * its storey (LVL-7) has its top at its `offset`: a raised one is solid down to the storey's
 * floor and its slab under it, so a stage reads as a platform; a sunken one is a slab of the
 * usual thickness, lower down.
 */
export function floorSlabGeometry(slab: SceneSlab): THREE.BufferGeometry {
  const top = slab.offset ?? 0
  const bottom = Math.min(top, 0) - SLAB_THICKNESS
  return slabBetween(slab, bottom, top - bottom)
}

export function Slab3D({
  slab,
  color,
  meshRef,
  castShadow = false,
  glow = 0
}: {
  slab: SceneSlab
  color: string
  /** For a live build, which fades the slab in. */
  meshRef?: (mesh: THREE.Mesh | null) => void
  /** Upper storeys' slabs shade the storeys below. */
  castShadow?: boolean
  /** How much the slab glows in its own colour (a muted storey in light theme, `mutedGlow`). */
  glow?: number
}): JSX.Element {
  const geometry = useMemo(() => floorSlabGeometry(slab), [slab])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh ref={meshRef} geometry={geometry} receiveShadow castShadow={castShadow}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} roughness={1} />
    </mesh>
  )
}
