// 2D floor plan: walls as lines, rooms as polygons, dimensions
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { AreaDelta, Bounds, DiffStatusMap } from '@ongrid/floorplan/geometry'
import {
  boundsWithGhosts,
  buildDimensions,
  buildFloorPlan,
  floorAbove,
  ghostsOf,
  planForFloor,
  resolveFloor,
  tolerance
} from '@ongrid/floorplan/geometry'
import type { PlaybackClock } from '../preview/playback'
import type { PlanBuild } from '../preview/useBuildFrame'
import { useBuildFrame } from '../preview/useBuildFrame'
import type { SharedViewport, Viewport } from './viewport'
import {
  contains,
  cover,
  fitTo,
  lerpView,
  pan,
  reframe,
  sharedFrom,
  unproject,
  viewBoxOf,
  viewportFrom,
  zoomAt
} from './viewport'
import { retainSelection } from './selection'
import { dimensionKey, dimensionsProgress } from './buildFrame'
import { toReact } from './toReact'
import type { Look, PlanLook } from '../picture/look'
import { LIGHT_LOOK } from '../picture/look'
import type { LabelStyle } from './labelPlacement'
import { planScene } from '../picture/scene'
import { doorWarningsOf, framingOf, handingsOf, warningMessages } from '../picture/planSvg'
import type { Attrs as ShapeAttrs, SvgNode } from '../picture/svgNode'
import { progressOf, removalProgress } from '../preview/progress'
import { pulseAt } from '../preview/pulse'
import { CLICK_SLOP } from '../preview/click'
import { useReducedMotion } from '../preview/useReducedMotion'
import { drawingText, wordsOf } from '../picture/words'
import './plan.css'

/**
 * The canvas's own look. What is drawn inside it is dressed by plan.css, which hangs off
 * the plain `canvas` class. A drop outline beats the focus one, as it did before. Both
 * outlines are the focus-ring grey: a near-white accent vanished on the paper.
 */
const CANVAS_CLASS = [
  'canvas block size-full touch-none cursor-grab bg-plan-paper',
  'data-[panning=true]:cursor-grabbing',
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
  'data-[drag-over=true]:outline-2 data-[drag-over=true]:outline-dashed',
  'data-[drag-over=true]:-outline-offset-6 data-[drag-over=true]:outline-ring'
].join(' ')

/** A status as text, the same for the same ids and states in any key order. */
function statusContent(status: DiffStatusMap): string {
  return JSON.stringify(Object.fromEntries(Object.entries(status).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))))
}

/**
 * The plan canvas: the surface the plan is drawn on and worked over. Wheel to
 * zoom, drag to pan, click to select, double click or `f` to frame.
 *
 * What it draws comes from `planScene` (picture/scene.ts), the same elements a
 * picture of the plan has (`planToSvg`). Every element carries stable data
 * attributes — data-part, data-type, data-exposure, data-id — and the picture's
 * light colours as SVG presentation attributes. In the app the stylesheet still
 * defines the plan's finish: CSS wins over presentation attributes, so plan.css
 * and the review's sheets restyle it without touching this file.
 */

/** A room's net area in each version, as the plan diff computed it (`PlanDiff.areas`). */
export type CanvasAreaChange = Pick<AreaDelta, 'roomId' | 'before' | 'after'>

/**
 * A plan seen against another version of it. What changed is decided
 * elsewhere (the plan diff); the canvas only shows it, and computes no area.
 *
 * - With `base` (Overlay): the canvas draws the current plan, a ghost of what was
 *   removed or changed, and a label on each removed room's ghost.
 * - Without `base` (the Before canvas of Side by side): the canvas draws the plan
 *   it is given, which is the earlier one, with no ghosts; what the status calls
 *   `removed` is marked so on the drawn element.
 */
export interface CanvasDiff {
  /** What happened to each entity, by id. An id that is absent is unchanged. */
  status: DiffStatusMap
  /** Ids to emphasise: the element and its ghost both get `data-focus`. */
  focus: readonly string[]
  /** The version before. Ghosts are its own drawing of the removed and modified entities. */
  base?: FloorPlan
  /**
   * The diff's area changes. A room listed with both areas reads "before → after"
   * in place of its area; without this, every room shows its plain area.
   */
  areaChange?: readonly CanvasAreaChange[]
}

interface Canvas2DProps {
  floorPlan: FloorPlan
  /** Which floor to draw (C5). Unset means the plan's ground floor. */
  floor?: string | null
  /** Overall and room dimensions. On by default. */
  showDimensions?: boolean
  /**
   * A live run's build, part by part. Without it the plan draws whole, as it
   * always has. Its plans are already this floor's slice.
   */
  build?: PlaybackClock<PlanBuild> | null
  /**
   * Show this plan against the version before it. Without it nothing changes.
   * Ignored while `build` is set: a live run draws the plan part by part, and
   * ghosts of a review on top of that would read as part of the drawing.
   */
  diff?: CanvasDiff
  /**
   * The view to show, as a centre and a width in meters. With it the canvas
   * is controlled: it shows exactly this, works its own height out from its shape,
   * never frames itself, and only reports gestures through `onViewportChange`.
   * Without it the canvas frames itself and keeps its own zoom and pan. During a
   * live build a controlled canvas still shows only this: it never zooms out on
   * its own to follow the plan growing.
   */
  viewport?: SharedViewport
  /** Called with the new view after a zoom, a pan or a request to frame the plan. */
  onViewportChange?: (viewport: SharedViewport) => void
  /**
   * The colours and font written on the drawn elements, as a picture of the plan has them
   * (`planToSvg`): colours of your own, or one of the named looks (`LOOKS`), the technical
   * one included (VEW-1). Light by default. The stylesheets still win over them in the app.
   */
  look?: Look | PlanLook
  /** How the room tags read, as a picture of the plan has them (`PictureOptions.labels`). */
  labels?: LabelStyle
}


/** How long the view takes to zoom out when a live build grows past the edge. */
const ZOOM_OUT_MS = 300

function sameBounds(a: Bounds, b: Bounds): boolean {
  const joint = tolerance('joint')
  const near = (p: number, q: number) => Math.abs(p - q) < joint
  return near(a.min.x, b.min.x) && near(a.min.y, b.min.y) && near(a.max.x, b.max.x) && near(a.max.y, b.max.y)
}

export function Canvas2D({
  floorPlan,
  floor,
  showDimensions = true,
  build = null,
  diff: diffProp,
  viewport,
  onViewportChange,
  look = LIGHT_LOOK,
  labels
}: Canvas2DProps): JSX.Element {
  const hostRef = useRef<SVGSVGElement | null>(null)
  const [size, setSize] = useState({ width: 1, height: 1 })
  const [ownView, setOwnView] = useState<Viewport | null>(null)
  const [panning, setPanning] = useState(false)
  const [rawSelectedId, setSelectedId] = useState<string | null>(null)

  // One floor at a time (C5). Slicing before building, rather than filtering the
  // drawing after, is what keeps exposure and validation per-floor: a wall whose
  // only room is upstairs genuinely has no room against it on this storey.
  //
  // During a build the frame's plan stands in for the file's: what has been
  // built so far, which changes once per step.
  const frame = useBuildFrame(build)
  const reducedMotion = useReducedMotion()
  const source = frame?.plan ?? floorPlan
  const floorId = useMemo(() => resolveFloor(source, floor), [source, floor])
  const plan = useMemo(() => planForFloor(source, floorId), [source, floorId])

  const drawing = useMemo(() => buildFloorPlan(plan), [plan])
  // SHT-11: the outline of the floor above, dashed, as the picture draws it.
  const above = useMemo(() => floorAbove(plan), [plan])

  // Which way each door opens, where the plan says so. A door that
  // doesn't say draws as a plain gap.
  const handings = useMemo(() => handingsOf(plan), [plan])

  // Doors whose swing runs into something: a wall, or another door. The
  // warnings that only say a value is missing don't get a mark: that door has
  // no symbol, so there is nothing to point at. Checked for this floor only,
  // on the drawing already built for it (QAR-7).
  const doorWarnings = useMemo(() => doorWarningsOf(plan, drawing), [plan, drawing])
  const warningText = useMemo(() => warningMessages(doorWarnings), [doorWarnings])
  const [hoveredWarning, setHoveredWarning] = useState<string | null>(null)
  const hitIds = (hoveredWarning && doorWarnings.get(hoveredWarning)?.hits) || null
  /** Lit while the user hovers the warning of a door that runs into this. */
  const hit = (id: string): ShapeAttrs => (hitIds?.has(id) ? { 'data-hit': 'true' } : {})

  // Where the build starts and ends. The end is what gets framed and
  // dimensioned, so neither changes on every step.
  const startPlan = frame?.prev ?? null
  const endPlan = frame?.next ?? null
  const prevDrawing = useMemo(
    () => (startPlan ? buildFloorPlan(planForFloor(startPlan, floorId)) : null),
    [startPlan, floorId]
  )
  const finalDrawing = useMemo(
    () => (endPlan ? buildFloorPlan(planForFloor(endPlan, floorId)) : null),
    [endPlan, floorId]
  )

  // A diff waits for the build to end (see the `diff` prop).
  const live = build !== null
  const diff = live ? undefined : diffProp

  // The version before, drawn for the same floor. Keyed on the parts of the diff,
  // not the object, which a caller may recreate on every render.
  const diffBase = diff?.base
  const diffStatus = diff?.status
  const diffFocus = diff?.focus
  const diffAreas = diff?.areaChange
  const baseDrawing = useMemo(
    () => (diffBase ? buildFloorPlan(planForFloor(diffBase, floorId)) : null),
    [diffBase, floorId]
  )
  // A caller may also build the status inline on every render (`statusOf(...)`):
  // the ghosts follow what it says, not the object it comes in.
  const statusKey = diffStatus ? statusContent(diffStatus) : null
  const ghosts = useMemo(
    () =>
      baseDrawing && statusKey !== null
        ? ghostsOf(baseDrawing, JSON.parse(statusKey) as DiffStatusMap)
        : null,
    [baseDrawing, statusKey]
  )
  const focused = useMemo(() => new Set(diffFocus ?? []), [diffFocus])

  // Derived, not synchronised: a selection on a floor we left, or one the
  // assistant deleted, simply stops being selected.
  const selectedId = retainSelection(drawing, rawSelectedId)

  // What gets dimensioned and framed: the plan, or during a build the plan it
  // ends on. The latter changes once per save, not once per step.
  const target = finalDrawing ?? drawing

  const dimensions = useMemo(
    () => (showDimensions ? buildDimensions(target) : []),
    [target, showDimensions]
  )

  // A dimension the build doesn't change stays put; the others fade in at the
  // dimensions step.
  const steadyDimensions = useMemo(
    () =>
      prevDrawing && showDimensions
        ? new Set(buildDimensions(prevDrawing).map(dimensionKey))
        : null,
    [prevDrawing, showDimensions]
  )
  const dimensionsShown = frame ? dimensionsProgress(frame.steps, frame.k, frame.inFlight) : 1

  // Dimensions sit outside the walls, so framing on the plan bounds alone
  // would clip them.
  const framedKey = useMemo(() => {
    const own = framingOf(target, dimensions)
    // Ghosts can lie outside the current plan (a wall that moved away), and
    // would otherwise be clipped from the first view.
    return JSON.stringify(ghosts ? boundsWithGhosts(own, ghosts) : own)
  }, [target, dimensions, ghosts])
  // Compared by value: a new frame resets the user's zoom, so only a frame that
  // really moved may do that, not a recomputed one in the same place.
  const framed = useMemo(() => JSON.parse(framedKey) as Bounds, [framedKey])

  const aspect = size.width / Math.max(size.height, 1)

  // Given a viewport the view is derived from it and from this canvas's shape, not
  // held in state. It exists as soon as the canvas has been measured.
  const controlled = viewport !== undefined
  const measured = size.width > 1 && size.height > 1
  const view: Viewport | null = controlled
    ? measured
      ? viewportFrom(viewport, aspect)
      : null
    : ownView

  // Every gesture ends here. A controlled canvas only reports, and keeps showing
  // what it was given until the caller passes the new viewport back.
  const commit = useCallback(
    (next: Viewport) => {
      if (!controlled) setOwnView(next)
      onViewportChange?.(sharedFrom(next))
    },
    [controlled, onViewportChange]
  )

  const fit = useCallback(() => {
    commit(fitTo(framed, size.width / Math.max(size.height, 1)))
  }, [commit, framed, size.width, size.height])

  // Measure the container. The viewBox depends on the real aspect ratio;
  // without this the plan comes out stretched.
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return

    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect
      if (box && box.width > 0 && box.height > 0) {
        setSize({ width: box.width, height: box.height })
      }
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  const viewRef = useRef(view)
  viewRef.current = view
  const buildRef = useRef(build)
  buildRef.current = build

  const aspectRef = useRef(aspect)
  aspectRef.current = aspect
  const firstPlanRef = useRef(false)
  firstPlanRef.current =
    prevDrawing !== null && prevDrawing.walls.length === 0 && prevDrawing.rooms.length === 0

  const zoomOut = useRef<number | null>(null)
  const stopZoomOut = useCallback(() => {
    if (zoomOut.current !== null) cancelAnimationFrame(zoomOut.current)
    zoomOut.current = null
  }, [])
  useEffect(() => stopZoomOut, [stopZoomOut])

  /** What the view framed while live, so the run ending doesn't reframe it. */
  const heldFrame = useRef<Bounds | null>(null)

  // A new plan asks for a new frame, except during a live run: then the view
  // holds still while the plan is built, so the user keeps their place. A
  // controlled canvas never frames itself, live or not: the caller owns the view.
  useEffect(() => {
    if (controlled) {
      stopZoomOut()
      heldFrame.current = null
      return
    }

    if (!live) {
      const held = heldFrame.current
      heldFrame.current = null
      // The run ended on the plan it was building: nothing new to frame.
      if (held && sameBounds(held, framed)) return
      setOwnView(null)
      return
    }

    heldFrame.current = framed
    const current = viewRef.current
    // Not framed yet: the first framing fits the plan the build ends on.
    if (!current) return

    // A first plan draws into a frame that already fits it.
    if (firstPlanRef.current) {
      stopZoomOut()
      setOwnView(fitTo(framed, aspectRef.current))
      return
    }

    // Otherwise only a plan growing past the edge moves the view, and only
    // outwards, just enough, and smoothly.
    if (contains(current, framed)) return
    const target = cover(current, framed, aspectRef.current)
    stopZoomOut()
    const start = performance.now()
    const tick = (): void => {
      const t = Math.min(1, (performance.now() - start) / ZOOM_OUT_MS)
      setOwnView(lerpView(current, target, 1 - Math.pow(1 - t, 3)))
      zoomOut.current = t < 1 ? requestAnimationFrame(tick) : null
    }
    zoomOut.current = requestAnimationFrame(tick)
  }, [framed, live, controlled, stopZoomOut])

  // The initial framing waits until the container has been measured. Doing it
  // earlier would compute against a made-up 1:1 ratio and the plan would show
  // up at an arbitrary zoom.
  useEffect(() => {
    if (controlled) return
    if (size.width <= 1 || size.height <= 1) return
    setOwnView((current) => current ?? fitTo(framed, size.width / size.height))
  }, [size, framed, controlled])

  // Resizing must not move what the user was looking at, only fix the ratio.
  useEffect(() => {
    if (controlled) return
    setOwnView((current) => (current ? reframe(current, aspect) : current))
  }, [aspect, controlled])

  // Current values for the native listeners, which register once.
  const commitRef = useRef(commit)
  commitRef.current = commit

  /**
   * Zoom goes through a native listener rather than React's onWheel: React
   * registers those as passive, where preventDefault() has no effect, so the
   * page would scroll on top of zooming.
   */
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const onWheel = (event: WheelEvent): void => {
      // The user's zoom wins over an automatic zoom-out; the drawing goes on.
      stopZoomOut()
      const current = viewRef.current
      if (!current) return
      event.preventDefault()

      const anchor = unproject(current, event.clientX, event.clientY, host.getBoundingClientRect())
      commitRef.current(zoomAt(current, anchor, Math.exp(event.deltaY * 0.0015)))
    }

    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [stopZoomOut])


  const drag = useRef<{ x: number; y: number; moved: number } | null>(null)
  /** Distance accumulated in the last gesture, to tell a click from a drag. */
  const moved = useRef(0)

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>): void => {
    stopZoomOut()
    if (event.button !== 0) return
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Some synthetic pointers do not support capture. Dragging still works,
      // it just stops tracking the cursor outside the element.
    }
    drag.current = { x: event.clientX, y: event.clientY, moved: 0 }
    moved.current = 0
  }

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    const state = drag.current
    const current = viewRef.current
    const rect = hostRef.current?.getBoundingClientRect()
    if (!state || !current || !rect) return

    const dx = event.clientX - state.x
    const dy = event.clientY - state.y
    state.moved += Math.abs(dx) + Math.abs(dy)
    moved.current = state.moved
    state.x = event.clientX
    state.y = event.clientY

    if (state.moved <= CLICK_SLOP) return

    const worldDx = (dx / rect.width) * current.width
    const worldDy = (dy / rect.height) * current.height

    setPanning(true)
    commit(pan(current, worldDx, worldDy))
  }

  const endDrag = (event: React.PointerEvent<SVGSVGElement>): void => {
    drag.current = null
    setPanning(false)
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      // See handlePointerDown.
    }
  }

  /**
   * Selection lives on `click` rather than `pointerup` on purpose: `click` is
   * emitted alike by mouse, touch and synthetic pointers, while pointer events
   * do not always arrive complete. All we take from the pointer events is how
   * far it moved, which is what separates a click from a drag.
   */
  const handleClick = (event: React.MouseEvent<SVGSVGElement>): void => {
    if (moved.current > CLICK_SLOP) return
    let target = (event.target as Element).closest('[data-id]')
    // A click never waits for the drawing: it finishes the build, then selects
    // what is under the pointer in the finished plan. Panning, zooming and keys
    // let it keep drawing.
    const build = buildRef.current
    if (build && !build.getSnapshot().idle) {
      flushSync(() => build.finish())
      target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-id]') ?? null
    }
    setSelectedId(target?.getAttribute('data-id') ?? null)
  }

  // What the frame changes per animation frame, read by the scene below.
  const leaving = removalProgress(frame?.inFlight)
  const removing = new Set(
    frame?.inFlight.filter((f) => f.step.kind === 'remove').map((f) => f.step.id) ?? []
  )

  /** How far a sliding wall still has to go, in plan meters. */
  const moveOffset = (id: string): { x: number; y: number } | null => {
    const sliding = progressOf(frame?.inFlight, 'move', id)
    if (sliding === null || !frame) return null
    const before = frame.prev.walls.find((wall) => wall.id === id)
    const after = plan.walls.find((wall) => wall.id === id)
    if (!before || !after) return null
    return {
      x: (1 - sliding) * (before.start[0] - after.start[0]),
      y: (1 - sliding) * (before.start[1] - after.start[1])
    }
  }

  /** A room's name and area follow its fill, in the second half of its step. */
  const labelOpacity = (id: string): number | undefined => {
    const filling = progressOf(frame?.inFlight, 'room', id)
    return filling === null ? undefined : Math.max(0, filling * 2 - 1)
  }

  // Where the assistant's "still working" pulse sits, if anywhere.
  const pulse = pulseAt(frame, reducedMotion)

  // What each current element says about itself when there is a diff. Nothing
  // at all without one, so the plain canvas keeps its DOM.
  const marks = (id: string): ShapeAttrs => {
    if (!diff) return {}
    const status = diffStatus?.[id]
    return {
      'data-diff': status ?? 'unchanged',
      'data-focus': focused.has(id) ? 'true' : undefined
    }
  }
  // A ghost is not an entity: no `data-id`, so selection never sees it, and no
  // pointer events, so a click goes through to what is beneath.
  const ghostAttrs = (id: string): ShapeAttrs => ({
    'data-diff': 'before',
    'data-ghost-of': id,
    'data-focus': focused.has(id) ? 'true' : undefined,
    'pointer-events': 'none'
  })

  // A room that changed size says so in place of its area, with the numbers the
  // diff gave. A room with no earlier or no later area keeps its plain label.
  const areaChanges = new Map(
    (diffAreas ?? []).flatMap(({ roomId, before, after }) =>
      before !== null && after !== null ? [[roomId, { before, after }] as const] : []
    )
  )
  // A removed room has no current label, so its ghost says what it was.
  const removedRooms = ghosts?.rooms.filter((room) => diffStatus?.[room.id] === 'removed') ?? []

  if (!view) {
    return <svg ref={hostRef} className={CANVAS_CLASS} role="img" aria-label={drawingText(wordsOf(labels?.display), 'drawing.picture.empty')} />
  }

  // The viewBox is in meters, so a font-size in pixels would come out the size
  // of a building. Each label is scaled by how many meters a pixel measures:
  // the CSS still rules and the text keeps its on-screen size.
  const metersPerPixel = view.width / size.width

  // The drawing itself is the picture's: the same elements `planToSvg` writes,
  // with what the app shows on top (a build, a review, selection, hover).
  const scene = planScene({
    drawing,
    handings,
    doorWarnings: warningText,
    dimensions,
    metersPerPixel,
    look,
    labels,
    above,
    live: {
      leaving: leaving !== null && prevDrawing ? { drawing: prevDrawing, ids: removing, progress: leaving } : null,
      ghosts,
      removedRooms,
      selectedId,
      marks,
      ghostAttrs,
      hit,
      roomFill: (id) => progressOf(frame?.inFlight, 'room', id),
      wallTrace: (id) => progressOf(frame?.inFlight, 'wall', id),
      wallOffset: moveOffset,
      openingOpen: (id) => progressOf(frame?.inFlight, 'opening', id),
      dimensionShown: (dim) => (steadyDimensions?.has(dimensionKey(dim)) ? 1 : dimensionsShown),
      labelOpacity,
      areaChange: (id) => areaChanges.get(id),
      hoveredWarning,
      pulse
    }
  })

  // Hovering a warning mark is the only thing it does; a click passes on to
  // selection as anywhere else.
  const handlers = (node: SvgNode): Record<string, unknown> | undefined => {
    if (node.attrs['data-part'] !== 'door-warning') return undefined
    const id = String(node.attrs['data-opening'])
    return {
      onPointerEnter: () => setHoveredWarning(id),
      onPointerLeave: () => setHoveredWarning(null)
    }
  }

  return (
    <svg
      ref={hostRef}
      className={CANVAS_CLASS}
      viewBox={viewBoxOf(view)}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={drawingText(wordsOf(labels?.display), 'drawing.picture', { count: drawing.rooms.length })}
      tabIndex={0}
      data-panning={panning}
      // The reference image (a backdrop to trace over) is not part of this viewer yet.
      // Both of its attributes stay, so the canvas's markup does not change when it arrives.
      data-has-reference={false}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={handleClick}
      onDoubleClick={fit}
      data-drag-over={false}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setSelectedId(null)
        if (event.key === 'f') fit()
      }}
    >
      {scene.map((node) => toReact(node, handlers))}
    </svg>
  )
}
