/**
 * A small software rasteriser for a Three scene: it draws what WebGL would, without WebGL.
 *
 * - Triangles of every visible mesh, with a depth buffer, culled by the material's side.
 * - Flat shading: each face lit once by the scene's own hemisphere, ambient and directional
 *   lights, as Three's standard material lights a matte surface (diffuse only: no specular
 *   highlight and no shadows).
 * - Lines, dashed ones included, one pixel wide, as WebGL draws them.
 * - Transparent materials after the opaque ones, farthest first.
 * - Then Three's ACES filmic tone mapping and the sRGB curve, as the app's canvas has them.
 * - The ground grid, which the app draws with a shader, from the same figures.
 * - VEW-78: a sky in place of the flat background when asked: each sample's colour from the way
 *   it looks, the horizon's colour going to the zenith's overhead and the ground's below.
 *
 * Every edge is smoothed by drawing at `supersample` times the size and averaging down.
 * Materials it does not know, such as shader materials, are left out.
 */
import * as THREE from 'three'
import { acesFilmic, linearToSrgb } from './toneMap'

/** An image as rows of RGBA bytes, top row first, like `ImageData`. */
export interface RasterImage {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
}

/** The ground grid, as the app's canvas sets it up (`GROUND_GRID`), with its colours. */
export interface GroundGrid {
  readonly y: number
  /** Where the grid is centred, in Three's x and z. Its lines are this far apart from here. */
  readonly center: readonly [number, number]
  readonly cellSize: number
  readonly cellThickness: number
  readonly sectionSize: number
  readonly sectionThickness: number
  readonly fadeDistance: number
  readonly fadeStrength: number
  readonly cellColor: string
  readonly sectionColor: string
}

export interface RasteriseOptions {
  readonly width: number
  readonly height: number
  /** Samples per pixel along each side. 2 by default: four samples a pixel. */
  readonly supersample?: number
  readonly ground?: GroundGrid
  /** VEW-78: the sky drawn behind everything in place of the scene's background, as `#rrggbb` colours. */
  readonly sky?: Sky
}

/** VEW-78: a plain sky: its colour overhead, at the horizon, and the ground's below the horizon. */
export interface Sky {
  readonly zenith: string
  readonly horizon: string
  readonly ground: string
}

/** A colour on screen, after tone mapping and the sRGB curve, each channel from 0 to 1. */
type Rgb = [number, number, number]

interface Light {
  readonly ambient: THREE.Vector3
  readonly hemispheres: { sky: THREE.Vector3; ground: THREE.Vector3; up: THREE.Vector3 }[]
  readonly directionals: { color: THREE.Vector3; toward: THREE.Vector3 }[]
}

const RECIPROCAL_PI = 1 / Math.PI

function linear(color: THREE.Color, scale = 1): THREE.Vector3 {
  // Three keeps a colour linear once it is set from a hex string.
  return new THREE.Vector3(color.r * scale, color.g * scale, color.b * scale)
}

function sceneLights(scene: THREE.Scene): Light {
  const light: Light = { ambient: new THREE.Vector3(), hemispheres: [], directionals: [] }
  scene.traverseVisible((object) => {
    if ((object as THREE.AmbientLight).isAmbientLight) {
      const l = object as THREE.AmbientLight
      light.ambient.add(linear(l.color, l.intensity))
    } else if ((object as THREE.HemisphereLight).isHemisphereLight) {
      const l = object as THREE.HemisphereLight
      light.hemispheres.push({
        sky: linear(l.color, l.intensity),
        ground: linear(l.groundColor, l.intensity),
        up: new THREE.Vector3().setFromMatrixPosition(l.matrixWorld).normalize()
      })
    } else if ((object as THREE.DirectionalLight).isDirectionalLight) {
      const l = object as THREE.DirectionalLight
      l.target.updateMatrixWorld()
      const from = new THREE.Vector3().setFromMatrixPosition(l.matrixWorld)
      const to = new THREE.Vector3().setFromMatrixPosition(l.target.matrixWorld)
      light.directionals.push({ color: linear(l.color, l.intensity), toward: from.sub(to).normalize() })
    }
  })
  return light
}

const mapped = [0, 0, 0]

/** A linear colour to screen, through tone mapping when the material takes it. */
function toScreen(r: number, g: number, b: number, tone: boolean): Rgb {
  if (tone) {
    acesFilmic(r, g, b, mapped)
    return [linearToSrgb(mapped[0]!), linearToSrgb(mapped[1]!), linearToSrgb(mapped[2]!)]
  }
  return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(b)]
}

type Lit = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial | THREE.MeshPhongMaterial

function isLit(material: THREE.Material): material is Lit {
  const m = material as Partial<Record<'isMeshStandardMaterial' | 'isMeshLambertMaterial' | 'isMeshPhongMaterial', boolean>>
  return Boolean(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)
}

function isBasic(material: THREE.Material): material is THREE.MeshBasicMaterial {
  return Boolean((material as THREE.MeshBasicMaterial).isMeshBasicMaterial)
}

/** A face's colour on screen, lit flat from its normal. */
function shade(material: Lit | THREE.MeshBasicMaterial, normal: THREE.Vector3, light: Light): Rgb {
  const { color } = material
  if (!isLit(material)) return toScreen(color.r, color.g, color.b, material.toneMapped)

  let ir = light.ambient.x
  let ig = light.ambient.y
  let ib = light.ambient.z
  for (const h of light.hemispheres) {
    const w = 0.5 * normal.dot(h.up) + 0.5
    ir += h.ground.x + (h.sky.x - h.ground.x) * w
    ig += h.ground.y + (h.sky.y - h.ground.y) * w
    ib += h.ground.z + (h.sky.z - h.ground.z) * w
  }
  for (const d of light.directionals) {
    const n = Math.max(0, normal.dot(d.toward))
    ir += d.color.x * n
    ig += d.color.y * n
    ib += d.color.z * n
  }
  const metal = (material as THREE.MeshStandardMaterial).isMeshStandardMaterial
    ? (material as THREE.MeshStandardMaterial).metalness
    : 0
  const diffuse = (1 - metal) * RECIPROCAL_PI
  const glow = material.emissiveIntensity
  const e = material.emissive
  return toScreen(
    color.r * diffuse * ir + e.r * glow,
    color.g * diffuse * ig + e.g * glow,
    color.b * diffuse * ib + e.b * glow,
    material.toneMapped
  )
}

/** A vertex on screen: pixel x and y, depth from -1 (near) to 1 (far), and 1/w for perspective. */
interface ScreenPoint {
  x: number
  y: number
  z: number
  q: number
}

/** A clip-space vertex with the line distance it carries, if any. */
interface ClipPoint {
  readonly v: THREE.Vector4
  readonly d: number
}

/** Cuts a polygon in clip space to the part in front of the near plane (z >= -w). */
function clipNear(points: ClipPoint[]): ClipPoint[] {
  const out: ClipPoint[] = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    const da = a.v.z + a.v.w
    const db = b.v.z + b.v.w
    if (da >= 0) out.push(a)
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db)
      out.push({ v: a.v.clone().lerp(b.v, t), d: a.d + (b.d - a.d) * t })
    }
  }
  return out
}

/** Draws into colour and depth buffers `w` by `h` samples. */
class Target {
  readonly color: Float32Array
  readonly depth: Float32Array

  constructor(
    readonly w: number,
    readonly h: number,
    background: Rgb
  ) {
    this.color = new Float32Array(w * h * 3)
    this.depth = new Float32Array(w * h).fill(Number.POSITIVE_INFINITY)
    for (let i = 0; i < w * h; i++) {
      this.color[i * 3] = background[0]
      this.color[i * 3 + 1] = background[1]
      this.color[i * 3 + 2] = background[2]
    }
  }

  toScreen(v: THREE.Vector4): ScreenPoint {
    const q = 1 / v.w
    return { x: (v.x * q * 0.5 + 0.5) * this.w, y: (0.5 - v.y * q * 0.5) * this.h, z: v.z * q, q }
  }

  /** Writes one sample, if it passes the depth test. */
  plot(i: number, z: number, rgb: Rgb, alpha: number, depthTest: boolean, depthWrite: boolean): void {
    if (depthTest && z > this.depth[i]!) return
    if (depthWrite) this.depth[i] = z
    const c = this.color
    const k = i * 3
    if (alpha >= 1) {
      c[k] = rgb[0]
      c[k + 1] = rgb[1]
      c[k + 2] = rgb[2]
    } else {
      c[k] = c[k]! + (rgb[0] - c[k]!) * alpha
      c[k + 1] = c[k + 1]! + (rgb[1] - c[k + 1]!) * alpha
      c[k + 2] = c[k + 2]! + (rgb[2] - c[k + 2]!) * alpha
    }
  }

  /** Fills a triangle given on screen, sampling at each sample's centre. */
  triangle(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint, rgb: Rgb, alpha: number, depthTest: boolean, depthWrite: boolean): void {
    let area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    if (area === 0) return
    // Wind every triangle the same way on screen, so one test covers both.
    if (area < 0) {
      const t = b
      b = c
      c = t
      area = -area
    }
    const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)))
    const maxX = Math.min(this.w - 1, Math.ceil(Math.max(a.x, b.x, c.x)))
    const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)))
    const maxY = Math.min(this.h - 1, Math.ceil(Math.max(a.y, b.y, c.y)))
    if (minX > maxX || minY > maxY) return

    // Each edge function e(x, y) = ex * x + ey * y + e0 is positive inside, for this winding
    // with y pointing down; along a row it grows by ex for each sample.
    const e1x = -(c.y - b.y), e1y = c.x - b.x, e10 = -(e1x * b.x + e1y * b.y)
    const e2x = -(a.y - c.y), e2y = a.x - c.x, e20 = -(e2x * c.x + e2y * c.y)
    const e3x = -(b.y - a.y), e3y = b.x - a.x, e30 = -(e3x * a.x + e3y * a.y)
    // Depth is a plane on screen, so it steps the same way.
    const inv = 1 / area
    const zx = (e1x * a.z + e2x * b.z + e3x * c.z) * inv
    const zy = (e1y * a.z + e2y * b.z + e3y * c.z) * inv
    const z0 = (e10 * a.z + e20 * b.z + e30 * c.z) * inv

    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5
      const px0 = minX + 0.5
      let w1 = e1x * px0 + e1y * py + e10
      let w2 = e2x * px0 + e2y * py + e20
      let w3 = e3x * px0 + e3y * py + e30
      let z = zx * px0 + zy * py + z0
      const row = y * this.w
      for (let x = minX; x <= maxX; x++) {
        if (w1 >= 0 && w2 >= 0 && w3 >= 0) this.plot(row + x, z, rgb, alpha, depthTest, depthWrite)
        w1 += e1x
        w2 += e2x
        w3 += e3x
        z += zx
      }
    }
  }

  /**
   * A line `width` samples wide from `a` to `b`, the part on screen only. `u` gives a value at
   * each end, interpolated with perspective like any varying, and `sample` turns it into the
   * line's strength at that point: 0 leaves a gap, 1 is solid.
   */
  line(
    a: ScreenPoint,
    b: ScreenPoint,
    rgb: Rgb,
    width: number,
    options: {
      readonly u?: readonly [number, number]
      readonly sample?: (u: number) => number
      readonly depthTest?: boolean
      readonly depthWrite?: boolean
    } = {}
  ): void {
    const { depthTest = true, depthWrite = true, sample, u = [0, 0] } = options
    // Cut the line to the screen, with room for its width (Liang and Barsky).
    const dx = b.x - a.x
    const dy = b.y - a.y
    let t0 = 0
    let t1 = 1
    const bounds: [number, number][] = [
      [-dx, a.x + width],
      [dx, this.w + width - a.x],
      [-dy, a.y + width],
      [dy, this.h + width - a.y]
    ]
    for (const [p, q] of bounds) {
      if (p === 0) {
        if (q < 0) return
      } else {
        const r = q / p
        if (p < 0) t0 = Math.max(t0, r)
        else t1 = Math.min(t1, r)
      }
    }
    if (t0 > t1) return

    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * (t1 - t0)))
    const half = width / 2
    const [ua, ub] = u
    for (let s = 0; s <= steps; s++) {
      const t = t0 + ((t1 - t0) * s) / steps
      let alpha = 1
      if (sample) {
        const q = a.q + (b.q - a.q) * t
        alpha = sample((ua * a.q + (ub * b.q - ua * a.q) * t) / q)
        if (alpha <= 0) continue
        if (alpha > 1) alpha = 1
      }
      const x0 = Math.round(a.x + dx * t - half)
      const y0 = Math.round(a.y + dy * t - half)
      const z = a.z + (b.z - a.z) * t
      for (let oy = 0; oy < width; oy++) {
        const py = y0 + oy
        if (py < 0 || py >= this.h) continue
        for (let ox = 0; ox < width; ox++) {
          const px = x0 + ox
          if (px < 0 || px >= this.w) continue
          this.plot(py * this.w + px, z, rgb, alpha, depthTest, depthWrite)
        }
      }
    }
  }

  /** The image, each pixel the average of its `ss` by `ss` samples. */
  resolve(ss: number): RasterImage {
    const width = this.w / ss
    const height = this.h / ss
    const data = new Uint8ClampedArray(width * height * 4)
    const n = ss * ss
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0
        let g = 0
        let b = 0
        for (let sy = 0; sy < ss; sy++) {
          for (let sx = 0; sx < ss; sx++) {
            const k = ((y * ss + sy) * this.w + x * ss + sx) * 3
            r += this.color[k]!
            g += this.color[k + 1]!
            b += this.color[k + 2]!
          }
        }
        const o = (y * width + x) * 4
        data[o] = Math.round((r / n) * 255)
        data[o + 1] = Math.round((g / n) * 255)
        data[o + 2] = Math.round((b / n) * 255)
        data[o + 3] = 255
      }
    }
    return { width, height, data }
  }
}

/** Something to draw once the opaque parts are down, farthest first. */
interface Deferred {
  readonly order: number
  readonly depth: number
  readonly draw: () => void
}

/** Draws `scene` as `camera` sees it, at `width` by `height` pixels. */
export function rasterise(scene: THREE.Scene, camera: THREE.Camera, options: RasteriseOptions): RasterImage {
  const ss = Math.max(1, Math.round(options.supersample ?? 2))
  const background = scene.background instanceof THREE.Color ? scene.background : new THREE.Color(0, 0, 0)
  const bg = background.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace)
  const target = new Target(options.width * ss, options.height * ss, [bg.r, bg.g, bg.b])

  scene.updateMatrixWorld(true)
  camera.updateMatrixWorld()
  if (options.sky) paintSky(target, camera, options.sky)
  const viewProjection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  const light = sceneLights(scene)
  const deferred: Deferred[] = []
  const viewDepth = (world: THREE.Vector3): number => world.clone().applyMatrix4(camera.matrixWorldInverse).z

  const toClip = (world: THREE.Vector3, d = 0): ClipPoint => ({
    v: new THREE.Vector4(world.x, world.y, world.z, 1).applyMatrix4(viewProjection),
    d
  })

  scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh
    const lines = object as THREE.LineSegments
    if (mesh.isMesh) {
      const material = mesh.material as THREE.Material
      if (Array.isArray(mesh.material) || !material.visible) return
      if (!isLit(material) && !isBasic(material)) return
      const draw = () => drawMesh(mesh, material, light, target, toClip)
      if (material.transparent) {
        deferred.push({ order: mesh.renderOrder, depth: viewDepth(meshCentre(mesh)), draw })
      } else draw()
    } else if (lines.isLineSegments) {
      const material = lines.material as THREE.LineBasicMaterial
      if (Array.isArray(lines.material) || !material.visible || !(material as THREE.LineBasicMaterial).isLineBasicMaterial) return
      const draw = () => drawLines(lines, material, toClip, target, ss)
      if (material.transparent) {
        deferred.push({ order: lines.renderOrder, depth: viewDepth(meshCentre(lines)), draw })
      } else draw()
    }
  })

  // The ground grid is see-through, so it goes with the transparent parts.
  if (options.ground) {
    const ground = options.ground
    deferred.push({
      order: 0,
      depth: Number.NEGATIVE_INFINITY,
      draw: () => drawGround(ground, camera, toClip, target, ss)
    })
  }

  // Three draws transparent objects by render order, then farthest first.
  deferred.sort((p, q) => p.order - q.order || p.depth - q.depth)
  for (const part of deferred) part.draw()

  return target.resolve(ss)
}

/** Screen colour of a `#rrggbb`, as the background is read. */
function screenColour(hex: string): Rgb {
  const c = new THREE.Color(hex).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace)
  return [c.r, c.g, c.b]
}

/**
 * Fills every sample with the sky the way it looks: for a perspective camera, from how far above
 * or below the horizon its ray points. Above, the horizon's colour gives way to the zenith's; below,
 * the ground's, with the horizon a soft line between them.
 */
function paintSky(target: Target, camera: THREE.Camera, sky: Sky): void {
  const zenith = screenColour(sky.zenith)
  const horizon = screenColour(sky.horizon)
  const ground = screenColour(sky.ground)
  const perspective = (camera as THREE.PerspectiveCamera).isPerspectiveCamera ? (camera as THREE.PerspectiveCamera) : null
  const e = camera.matrixWorld.elements
  // The camera's right, up and forward in the world; Three's camera looks down its -z.
  const right = e[1]!
  const up = e[5]!
  const forward = -e[9]!
  const ty = perspective ? Math.tan((perspective.fov * Math.PI) / 360) / perspective.zoom : 0
  const tx = perspective ? ty * perspective.aspect : 0
  const c = target.color
  for (let y = 0; y < target.h; y++) {
    const ny = (1 - ((y + 0.5) / target.h) * 2) * ty
    for (let x = 0; x < target.w; x++) {
      const nx = (((x + 0.5) / target.w) * 2 - 1) * tx
      // The ray's height over its length: the sine of its angle above the horizon.
      const rise = (forward + nx * right + ny * up) / Math.sqrt(1 + nx * nx + ny * ny)
      let rgb: Rgb
      if (rise >= 0) {
        const t = Math.sqrt(Math.min(1, rise))
        rgb = [horizon[0] + (zenith[0] - horizon[0]) * t, horizon[1] + (zenith[1] - horizon[1]) * t, horizon[2] + (zenith[2] - horizon[2]) * t]
      } else {
        const t = Math.min(1, -rise * 8)
        rgb = [horizon[0] + (ground[0] - horizon[0]) * t, horizon[1] + (ground[1] - horizon[1]) * t, horizon[2] + (ground[2] - horizon[2]) * t]
      }
      const k = (y * target.w + x) * 3
      c[k] = rgb[0]
      c[k + 1] = rgb[1]
      c[k + 2] = rgb[2]
    }
  }
}

function meshCentre(object: THREE.Mesh | THREE.LineSegments): THREE.Vector3 {
  const geometry = object.geometry
  if (!geometry.boundingSphere) geometry.computeBoundingSphere()
  return geometry.boundingSphere!.center.clone().applyMatrix4(object.matrixWorld)
}

function drawMesh(
  mesh: THREE.Mesh,
  material: Lit | THREE.MeshBasicMaterial,
  light: Light,
  target: Target,
  toClip: (world: THREE.Vector3) => ClipPoint
): void {
  const geometry = mesh.geometry
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!position) return
  const index = geometry.getIndex()
  const count = index ? index.count : position.count
  // A mirroring transform turns every face inside out.
  const mirrored = mesh.matrixWorld.determinant() < 0
  const alpha = material.transparent ? material.opacity : 1
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  const normal = new THREE.Vector3()

  for (let i = 0; i + 2 < count; i += 3) {
    for (let k = 0; k < 3; k++) {
      const at = index ? index.getX(i + k) : i + k
      corners[k]!.fromBufferAttribute(position, at).applyMatrix4(mesh.matrixWorld)
    }
    const [a, b, c] = corners as [THREE.Vector3, THREE.Vector3, THREE.Vector3]
    normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a))
    if (normal.lengthSq() === 0) continue
    normal.normalize()
    if (mirrored) normal.negate()

    const polygon = clipNear([toClip(a), toClip(b), toClip(c)])
    if (polygon.length < 3) continue
    const screen = polygon.map((p) => target.toScreen(p.v))

    // Counter-clockwise in normalised device coordinates is a front face; on screen, with y
    // pointing down, that is a negative area.
    const s0 = screen[0]!
    const s1 = screen[1]!
    const s2 = screen[2]!
    const area = (s1.x - s0.x) * (s2.y - s0.y) - (s1.y - s0.y) * (s2.x - s0.x)
    if (area === 0) continue
    const front = (area < 0) !== mirrored
    if (material.side === THREE.FrontSide && !front) continue
    if (material.side === THREE.BackSide && front) continue
    const facing = front ? normal : normal.clone().negate()

    const rgb = shade(material, facing, light)
    for (let k = 1; k + 1 < screen.length; k++) {
      target.triangle(s0, screen[k]!, screen[k + 1]!, rgb, alpha, material.depthTest, material.depthWrite)
    }
  }
}

function drawLines(
  lines: THREE.LineSegments,
  material: THREE.LineBasicMaterial,
  toClip: (world: THREE.Vector3, d?: number) => ClipPoint,
  target: Target,
  ss: number
): void {
  const geometry = lines.geometry
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!position) return
  const distance = geometry.getAttribute('lineDistance') as THREE.BufferAttribute | undefined
  const dashed = (material as unknown as THREE.LineDashedMaterial).isLineDashedMaterial
    ? (material as unknown as THREE.LineDashedMaterial)
    : null
  const index = geometry.getIndex()
  const count = index ? index.count : position.count
  const color = material.color
  const rgb = toScreen(color.r, color.g, color.b, material.toneMapped)
  const alpha = material.transparent ? material.opacity : 1
  const world = new THREE.Vector3()

  for (let i = 0; i + 1 < count; i += 2) {
    const ends: ClipPoint[] = []
    for (let k = 0; k < 2; k++) {
      const at = index ? index.getX(i + k) : i + k
      world.fromBufferAttribute(position, at).applyMatrix4(lines.matrixWorld)
      ends.push(toClip(world, distance ? distance.getX(at) : 0))
    }
    const clipped = clipSegment(ends[0]!, ends[1]!)
    if (!clipped) continue
    const [p, q] = clipped
    const total = dashed ? dashed.dashSize + dashed.gapSize : 0
    target.line(target.toScreen(p.v), target.toScreen(q.v), rgb, ss, {
      u: dashed ? [p.d * dashed.scale, q.d * dashed.scale] : undefined,
      // A dashed line leaves out what falls in a gap, as its shader does.
      sample: dashed ? (d) => (d % total > dashed.dashSize ? 0 : alpha) : alpha < 1 ? () => alpha : undefined,
      depthTest: material.depthTest,
      depthWrite: material.depthWrite
    })
  }
}

/** A segment cut to the part in front of the near plane, or null when none of it is. */
function clipSegment(a: ClipPoint, b: ClipPoint): [ClipPoint, ClipPoint] | null {
  const da = a.v.z + a.v.w
  const db = b.v.z + b.v.w
  if (da < 0 && db < 0) return null
  if (da >= 0 && db >= 0) return [a, b]
  const t = da / (da - db)
  const cut: ClipPoint = { v: a.v.clone().lerp(b.v, t), d: a.d + (b.d - a.d) * t }
  return da >= 0 ? [a, cut] : [cut, b]
}

/**
 * The ground grid: a thin cell line every `cellSize` and a full
 * section line every `sectionSize`, each fading out `fadeDistance` from the point under the
 * camera.
 */
function drawGround(
  ground: GroundGrid,
  camera: THREE.Camera,
  toClip: (world: THREE.Vector3, d?: number) => ClipPoint,
  target: Target,
  ss: number
): void {
  const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld)
  const under = new THREE.Vector3(eye.x, ground.y, eye.z)
  const [cx, cz] = ground.center
  const reach = ground.fadeDistance
  // A grid line covers about its thickness squared of a pixel; the cell lines are also
  // weakened to three quarters where no section line runs.
  const cellAlpha = 0.75 * ground.cellThickness ** 2
  const sectionAlpha = ground.cellThickness ** 2 + ground.sectionThickness ** 2
  const cell = new THREE.Color(ground.cellColor)
  const section = new THREE.Color(ground.sectionColor)
  const cellRgb = toScreen(cell.r, cell.g, cell.b, true)
  const sectionRgb = toScreen(section.r, section.g, section.b, true)
  const fade = (x: number, z: number): number => {
    // Measured on the ground, from the point under the camera.
    const d = 1 - Math.min(Math.hypot(x - under.x, z - under.z) / reach, 1)
    return Math.pow(d, ground.fadeStrength)
  }
  const sectionEvery = Math.round(ground.sectionSize / ground.cellSize)

  const drawAxis = (alongX: boolean): void => {
    const cross = alongX ? under.z : under.x
    const along = alongX ? under.x : under.z
    const centre = alongX ? cz : cx
    const first = Math.ceil((cross - reach - centre) / ground.cellSize)
    const last = Math.floor((cross + reach - centre) / ground.cellSize)
    for (let k = first; k <= last; k++) {
      const at = centre + k * ground.cellSize
      // Only the part of the line within the fade is drawn at all.
      const off = at - cross
      const half = Math.sqrt(Math.max(0, reach * reach - off * off))
      if (half <= 0) continue
      const isSection = k % sectionEvery === 0
      const strength = isSection ? sectionAlpha : cellAlpha
      const s0 = along - half
      const s1 = along + half
      const p0 = alongX ? new THREE.Vector3(s0, ground.y, at) : new THREE.Vector3(at, ground.y, s0)
      const p1 = alongX ? new THREE.Vector3(s1, ground.y, at) : new THREE.Vector3(at, ground.y, s1)
      const clipped = clipSegment(toClip(p0, s0), toClip(p1, s1))
      if (!clipped) continue
      target.line(target.toScreen(clipped[0].v), target.toScreen(clipped[1].v), isSection ? sectionRgb : cellRgb, ss, {
        u: [clipped[0].d, clipped[1].d],
        sample: (s) => strength * fade(alongX ? s : at, alongX ? at : s),
        depthWrite: false
      })
    }
  }
  drawAxis(true)
  drawAxis(false)
}
