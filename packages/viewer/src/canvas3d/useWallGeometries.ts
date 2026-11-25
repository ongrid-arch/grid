import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Scene3D, SceneWall } from '@ongrid/floorplan/geometry'
import { alongFace } from '@ongrid/floorplan/geometry'
import { toThree } from './convert'
import { cutElevation } from './cutWall'

/**
 * Built wall meshes, rebuilt only for the walls that actually changed.
 *
 * The watcher hands over a new FloorPlan object on every write to the file,
 * so anything keyed on object identity rebuilds the whole scene each time the
 * agent touches a single wall. Each rebuild retriangulates an extrusion and
 * re-uploads it to the GPU, which is the expensive part — the maths that
 * precedes it is microseconds.
 *
 * Keying on `wall.revision` instead means a wall survives untouched unless its
 * own shape moved.
 */
export function useWallGeometries(scene: Scene3D, cut: number | null = null): Map<string, THREE.BufferGeometry> {
  const cache = useRef(new Map<string, { revision: string; geometry: THREE.BufferGeometry }>())
  // A wall kept for one cut is another wall under a different one (VEW-58).
  const revisionOf = (wall: SceneWall): string => (cut === null ? wall.revision : `${wall.revision}@${cut}`)

  const geometries = useMemo(() => {
    const current = cache.current
    const alive = new Set<string>()

    for (const wall of scene.walls) {
      alive.add(wall.id)
      const kept = current.get(wall.id)
      if (kept?.revision === revisionOf(wall)) continue

      // The shape changed: the old mesh is dead weight on the GPU.
      kept?.geometry.dispose()
      current.set(wall.id, { revision: revisionOf(wall), geometry: buildWallGeometry(wall, cut) })
    }

    // Walls the agent deleted.
    for (const [id, entry] of current) {
      if (alive.has(id)) continue
      entry.geometry.dispose()
      current.delete(id)
    }

    return new Map([...current].map(([id, entry]) => [id, entry.geometry]))
  // eslint-disable-next-line react-hooks/exhaustive-deps -- revisionOf reads only `cut`
  }, [scene, cut])

  // On unmount nothing else will release them.
  useEffect(() => {
    const current = cache.current
    return () => {
      for (const entry of current.values()) entry.geometry.dispose()
      current.clear()
    }
  }, [])

  return geometries
}

/**
 * One wall, raised from its elevation.
 *
 * Build the Shape of the outline, add the openings as Paths, extrude by the
 * thickness. No boolean operations — the holes are part of the shape and Three
 * triangulates them on extrusion. Then each face's ends move to the joint the
 * core decided, so the corners close as in the plan.
 */
export function buildWallGeometry(wall: SceneWall, cut: number | null = null): THREE.BufferGeometry {
  const lowered = (elevation: SceneWall['elevation']): SceneWall['elevation'] => (cut === null ? elevation : cutElevation(elevation, cut))
  // CNT-18: a curved wall is raised piece by piece, the pieces one geometry.
  if (wall.pieces !== undefined) return joinGeometries(wall.pieces.map((piece) => raise(lowered(piece.elevation), piece.basis)))
  return raise(lowered(wall.elevation), wall.basis)
}

/** Geometries one after the other as one, each made non-indexed so their faces stay as they are. */
function joinGeometries(parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((part) => (part.index === null ? part : part.toNonIndexed()))
  const join = (name: string): Float32Array => {
    const arrays = flat.map((part) => part.getAttribute(name).array as ArrayLike<number>)
    const out = new Float32Array(arrays.reduce((sum, array) => sum + array.length, 0))
    let at = 0
    for (const array of arrays) {
      out.set(array, at)
      at += array.length
    }
    return out
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(join('position'), 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(join('normal'), 3))
  for (const part of parts) part.dispose()
  for (const part of flat) part.dispose()
  return geometry
}

function raise(elevation: SceneWall['elevation'], basis: SceneWall['basis']): THREE.BufferGeometry {

  const shape = new THREE.Shape(elevation.outline.map((p) => new THREE.Vector2(p.x, p.y)))
  shape.holes = elevation.holes.map(
    (hole) => new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, p.y)))
  )

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: elevation.thickness,
    bevelEnabled: false,
    steps: 1
  })

  // The extrusion runs from z=0 to z=thickness; the wall axis sits halfway.
  geometry.translate(0, 0, -elevation.thickness / 2)

  // Each face's ends go where the core joins the corners (SHT-2). Local z is `across`, the
  // wall's right face; the left face is at −z.
  const position = geometry.getAttribute('position')
  for (let i = 0; i < position.count; i++) {
    position.setX(i, alongFace(elevation, position.getX(i), position.getZ(i) > 0 ? 'right' : 'left'))
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()

  // The basis is right-handed, so the normals survive intact. The transform is
  // baked into the vertices: the scene is static, so the mesh needs no
  // transform of its own.
  const placement = new THREE.Matrix4()
    .makeBasis(toThree(basis.along), toThree(basis.up), toThree(basis.across))
    .setPosition(toThree(basis.origin))
  geometry.applyMatrix4(placement)

  return geometry
}
