import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { OpeningPartKind, SceneOpening } from '@ongrid/floorplan/geometry'
import { stairBlockGeometry } from './Stair3D'
import { GLASS } from './finishTint'

/**
 * A door or window in 3D (CNT-14): its frame, its leaves and its glass, as the core lays them
 * out (`sceneOpening`): every box square to the wall, the leaves closed and hung from the face
 * of the wall the door opens toward. The view draws the boxes and works out nothing of its own.
 *
 * VEW-78: glass is see-through and tinted (`GLASS`), in every theme, and a glazed door's leaves
 * (`SceneOpening.glazed`) are glass in their frame.
 *
 * Heights are local to the storey's group, whose y is its floor level.
 */

export interface OpeningColors {
  readonly frame: string
  readonly leaf: string
}

/** Whether a part is drawn as glass: its glass, and a glazed door's leaves. */
export function drawnAsGlass(opening: Pick<SceneOpening, 'glazed'>, part: OpeningPartKind): boolean {
  return part === 'glass' || (part === 'leaf' && opening.glazed === true)
}

export function Opening3D({ opening, colors, glow = 0 }: { opening: SceneOpening; colors: OpeningColors; glow?: number }): JSX.Element {
  const parts = useMemo(
    () => opening.parts.filter((p) => p.top > p.bottom).map((p) => ({ part: p.part, geometry: stairBlockGeometry(p) })),
    [opening]
  )
  useEffect(() => () => parts.forEach(({ geometry }) => geometry.dispose()), [parts])
  const color = (part: OpeningPartKind): string => (part === 'frame' ? colors.frame : colors.leaf)
  return (
    <group name={`${opening.type}:${opening.id}`}>
      {parts.map(({ part, geometry }, i) =>
        drawnAsGlass(opening, part) ? (
          <mesh key={i} name="glass" geometry={geometry}>
            <meshStandardMaterial color={GLASS.color} transparent opacity={GLASS.opacity} depthWrite={false} roughness={0.1} metalness={0} side={THREE.DoubleSide} />
          </mesh>
        ) : (
          <mesh key={i} name={part} geometry={geometry} castShadow receiveShadow>
            <meshStandardMaterial color={color(part)} emissive={color(part)} emissiveIntensity={glow} roughness={0.8} metalness={0} />
          </mesh>
        )
      )}
    </group>
  )
}
