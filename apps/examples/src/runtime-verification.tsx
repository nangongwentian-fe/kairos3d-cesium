import { useEffect, useRef, useState } from "react";
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Ion,
  Math as CesiumMath,
  SceneTransforms
} from "cesium";
import {
  createMap,
  type DrawResult,
  type KairosMap,
  type PickResult,
  type SceneSnapshot
} from "@kairos3d/cesium";

interface RuntimeSummary {
  ok: boolean;
  [key: string]: unknown;
}

export interface KairosRuntimeVerify {
  ready: boolean;
  getState(): Promise<RuntimeSummary>;
  debugCircleEditPick(): Promise<RuntimeSummary>;
  runDrawCircle(): Promise<RuntimeSummary>;
  runDrawRectangle(): Promise<RuntimeSummary>;
  editCircle(): Promise<RuntimeSummary>;
  editRectangle(): Promise<RuntimeSummary>;
  createOverlays(): Promise<RuntimeSummary>;
  pickOverlayAt(position?: { x: number; y: number }): Promise<RuntimeSummary>;
  createModelWithOrientation(): Promise<RuntimeSummary>;
  snapshotRoundtrip(): Promise<RuntimeSummary>;
  runAll(): Promise<RuntimeSummary>;
}

declare global {
  interface Window {
    __kairosRuntimeVerify?: KairosRuntimeVerify;
  }
}

const HOME_LONGITUDE = 114.1694;
const HOME_LATITUDE = 22.3193;
const MODEL_URI = "/runtime-verification/triangle.gltf";

export function RuntimeVerificationApp() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KairosMap | null>(null);
  const [status, setStatus] = useState("initializing");

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let disposed = false;

    void createMap({
      container: containerRef.current,
      viewerOptions: {
        animation: false,
        baseLayer: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false
      }
    }).then(async (map) => {
      if (disposed) {
        map.destroy();
        return;
      }

      mapRef.current = map;
      map.viewer.scene.globe.depthTestAgainstTerrain = false;
      await setupCamera(map);
      window.__kairosRuntimeVerify = createRuntimeVerifier(map);
      window.__kairosRuntimeVerify.ready = true;
      setStatus("ready");
    });

    return () => {
      disposed = true;
      window.__kairosRuntimeVerify = undefined;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, []);

  return (
    <main
      data-runtime-verification="true"
      style={{ width: "100vw", height: "100vh", position: "relative" }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <output
        aria-label="runtime verification status"
        style={{
          position: "absolute",
          left: 12,
          top: 12,
          zIndex: 1,
          padding: "6px 8px",
          color: "#ffffff",
          background: "rgba(0, 0, 0, 0.62)",
          font: "12px ui-monospace, SFMono-Regular, Consolas, monospace"
        }}
      >
        {status}
      </output>
    </main>
  );
}

function createRuntimeVerifier(map: KairosMap): KairosRuntimeVerify {
  return {
    ready: false,
    async getState() {
      await waitForRender(map);
      return {
        ok: true,
        viewerDestroyed: map.isDestroyed(),
        drawCount: map.draw.list().length,
        overlayCount: map.overlays.list().length,
        primitiveCount: map.primitives.list().length,
        resultCount: map.results.count(),
        ionTokenConfigured: Ion.defaultAccessToken.trim().length > 0,
        draws: map.draw.list().map((result) => ({
          id: result.id,
          type: result.type,
          positions: result.positions.length,
          radius: result.data?.radius
        })),
        canvas: getCanvasState(map)
      };
    },
    async debugCircleEditPick() {
      const circle = await ensureDrawResult(map, "circle");
      await map.draw.edit(circle.id, { handleStyle: { pixelSize: 48 } });
      await waitForRender(map, 10);
      const center = circle.positions[0];
      const edge = circleEdgePosition(center, Number(circle.data?.radius ?? 1));
      const centerScreen = screenFromPosition(map, center);
      const edgeScreen = screenFromPosition(map, edge);
      const centerPick = map.viewer.scene.pick(centerScreen);
      const edgePick = map.viewer.scene.pick(edgeScreen);
      const centerDrill = map.viewer.scene.drillPick(centerScreen, 10, 50, 50);
      const edgeDrill = map.viewer.scene.drillPick(edgeScreen, 10, 50, 50);
      const entityIds = map.viewer.entities.values.map((entity) => entity.id);
      map.draw.cancelEdit();
      await waitForRender(map);
      return {
        ok: true,
        circleId: circle.id,
        radius: circle.data?.radius,
        centerScreen: { x: centerScreen.x, y: centerScreen.y },
        edgeScreen: { x: edgeScreen.x, y: edgeScreen.y },
        centerPickId: pickId(centerPick),
        edgePickId: pickId(edgePick),
        centerDrillIds: centerDrill.map(pickId),
        edgeDrillIds: edgeDrill.map(pickId),
        entityIds
      };
    },
    async runDrawCircle() {
      await setupCamera(map);
      const result = await runInteractiveDraw(map, "draw.circle", [
        fromDegrees(HOME_LONGITUDE - 0.002, HOME_LATITUDE),
        fromDegrees(HOME_LONGITUDE + 0.0015, HOME_LATITUDE)
      ]);
      const radius = Number(result.data?.radius ?? 0);
      assert(result.type === "circle", "Circle draw returned a non-circle result.");
      assert(radius > 0, "Circle radius must be greater than zero.");
      return {
        ok: true,
        id: result.id,
        type: result.type,
        radius,
        positions: result.positions.length
      };
    },
    async runDrawRectangle() {
      await setupCamera(map);
      const result = await runInteractiveDraw(map, "draw.rectangle", [
        fromDegrees(HOME_LONGITUDE - 0.004, HOME_LATITUDE - 0.002),
        fromDegrees(HOME_LONGITUDE + 0.003, HOME_LATITUDE + 0.002)
      ]);
      assert(result.type === "rectangle", "Rectangle draw returned a non-rectangle result.");
      assert(result.positions.length === 2, "Rectangle result must keep two positions.");
      return {
        ok: true,
        id: result.id,
        type: result.type,
        positions: result.positions.length
      };
    },
    async editCircle() {
      const circle = await ensureDrawResult(map, "circle");
      const id = circle.id;
      const originalRadius = Number(circle.data?.radius ?? 0);
      assert(originalRadius > 0, "Circle result must have a radius before edit.");

      await editCircleRadius(map, id, originalRadius * 1.45);
      map.draw.stopEdit();
      await waitForRender(map);
      const committed = requireDrawResult(map, id, "circle");
      const committedRadius = Number(committed.data?.radius ?? 0);
      assert(committed.id === id, "Circle edit changed the result id.");
      assert(committedRadius > originalRadius, "Circle edit did not increase radius.");

      await editCircleRadius(map, id, committedRadius * 0.55);
      map.draw.cancelEdit();
      await waitForRender(map);
      const restored = requireDrawResult(map, id, "circle");
      const restoredRadius = Number(restored.data?.radius ?? 0);
      assert(near(restoredRadius, committedRadius, 0.5), "Circle cancel did not restore radius.");

      return {
        ok: true,
        id,
        originalRadius,
        committedRadius,
        restoredRadius
      };
    },
    async editRectangle() {
      const rectangle = await ensureDrawResult(map, "rectangle");
      const id = rectangle.id;
      const before = clonePositions(rectangle.positions);
      const nextCorner = fromDegrees(HOME_LONGITUDE - 0.0055, HOME_LATITUDE - 0.0028);

      await editRectangleCorner(map, id, nextCorner);
      map.draw.stopEdit();
      await waitForRender(map);
      const committed = requireDrawResult(map, id, "rectangle");
      assert(committed.id === id, "Rectangle edit changed the result id.");
      assert(!positionsNear(committed.positions, before, 0.1), "Rectangle edit did not move a corner.");

      const committedPositions = clonePositions(committed.positions);
      await editRectangleCorner(map, id, fromDegrees(HOME_LONGITUDE - 0.0065, HOME_LATITUDE - 0.0033));
      map.draw.cancelEdit();
      await waitForRender(map);
      const restored = requireDrawResult(map, id, "rectangle");
      assert(
        positionsNear(restored.positions, committedPositions, 0.1),
        "Rectangle cancel did not restore positions."
      );

      return {
        ok: true,
        id,
        before: before.length,
        committed: committed.positions.length,
        restored: restored.positions.length
      };
    },
    async createOverlays() {
      map.overlays.clear();
      const point = map.overlays.addPoint({
        id: "runtime-overlay-point",
        position: fromDegrees(HOME_LONGITUDE, HOME_LATITUDE + 0.001),
        style: {
          point: {
            color: Color.YELLOW,
            pixelSize: 24,
            outlineColor: Color.BLACK,
            outlineWidth: 2
          }
        },
        metadata: {
          purpose: "runtime-verification"
        }
      });
      const label = map.overlays.addLabel({
        id: "runtime-overlay-label",
        position: fromDegrees(HOME_LONGITUDE + 0.0018, HOME_LATITUDE + 0.001),
        text: "Kairos3D",
        style: {
          label: {
            color: "#ffffff",
            outlineColor: "#000000",
            pixelOffset: [0, -16]
          }
        }
      });
      await waitForRender(map, 4);
      return {
        ok: true,
        overlays: map.overlays.list().map((overlay) => ({
          id: overlay.id,
          type: overlay.type,
          show: overlay.show
        })),
        pointId: point.id,
        labelId: label.id
      };
    },
    async pickOverlayAt(position) {
      if (!map.overlays.get("runtime-overlay-point")) {
        await this.createOverlays();
      }
      await waitForRender(map, 4);
      const windowPosition = position
        ? new Cartesian2(position.x, position.y)
        : screenFromPosition(map, map.overlays.get("runtime-overlay-point")!.positions[0]);
      const picked = await map.picking.pick(windowPosition, { limit: 5, width: 48, height: 48 });
      assert(picked?.source === "overlay", "Picking did not return an overlay result.");
      assert(Boolean(picked.overlayId), "Overlay pick result is missing overlayId.");
      assert(Boolean(picked.overlayType), "Overlay pick result is missing overlayType.");
      return summarizePick(picked);
    },
    async createModelWithOrientation() {
      const heading = CesiumMath.toRadians(35);
      const pitch = CesiumMath.toRadians(8);
      const roll = CesiumMath.toRadians(12);
      const model = map.draw.model({
        id: "runtime-model",
        position: fromDegrees(HOME_LONGITUDE + 0.0025, HOME_LATITUDE - 0.001, 0),
        uri: MODEL_URI,
        scale: 220,
        minimumPixelSize: 32,
        heading,
        pitch,
        roll
      });
      await waitForRender(map, 8);
      const snapshot = map.draw.toJSON().find((item) => item.id === model.id);
      const snapshotData = snapshot?.data;
      assert(Boolean(model.entity.orientation), "Model entity orientation is missing.");
      assert(snapshotData?.heading === heading, "Model snapshot is missing heading.");
      assert(snapshotData.pitch === pitch, "Model snapshot is missing pitch.");
      assert(snapshotData.roll === roll, "Model snapshot is missing roll.");
      return {
        ok: true,
        id: model.id,
        uri: model.data?.uri,
        hasOrientation: Boolean(model.entity.orientation),
        heading: snapshotData.heading,
        pitch: snapshotData.pitch,
        roll: snapshotData.roll
      };
    },
    async snapshotRoundtrip() {
      await ensureSnapshotContent(map);
      const snapshot = map.sceneState.toJSON({
        includeResults: true,
        includePrimitives: true,
        includeOverlays: true
      });
      const before = snapshotCounts(map, snapshot);

      map.draw.clear();
      map.analysis.measure.clear();
      map.analysis.visibility.clear();
      map.analysis.profile.clear();
      map.analysis.clipping.clear();
      map.analysis.terrain.clear();
      map.overlays.clear();
      map.primitives.clear();
      await waitForRender(map);

      await map.sceneState.load(snapshot, {
        clearLayers: true,
        flyToCamera: true,
        restoreResults: true,
        clearResults: true,
        restorePrimitives: true,
        clearPrimitives: true,
        restoreOverlays: true,
        clearOverlays: true
      });
      await waitForRender(map, 4);
      const after = snapshotCounts(map, snapshot);

      assert(after.drawCount === before.snapshotDrawCount, "Draw results were not restored.");
      assert(after.overlayCount === before.snapshotOverlayCount, "Overlays were not restored.");
      assert(after.primitiveCount === before.snapshotPrimitiveCount, "Primitives were not restored.");
      assert(after.bookmarkCount === before.snapshotBookmarkCount, "Bookmarks were not restored.");

      return {
        ok: true,
        before,
        after,
        snapshotCreatedAt: snapshot.createdAt,
        hasCamera: Boolean(snapshot.camera)
      };
    },
    async runAll() {
      await setupCamera(map);
      const state = await this.getState();
      const circle = await this.runDrawCircle();
      const rectangle = await this.runDrawRectangle();
      const circleEdit = await this.editCircle();
      const rectangleEdit = await this.editRectangle();
      const overlays = await this.createOverlays();
      const overlayPick = await this.pickOverlayAt();
      const model = await this.createModelWithOrientation();
      const snapshot = await this.snapshotRoundtrip();
      const finalState = await this.getState();
      return {
        ok: true,
        state,
        circle,
        rectangle,
        circleEdit,
        rectangleEdit,
        overlays,
        overlayPick,
        model,
        snapshot,
        finalState
      };
    }
  };
}

async function runInteractiveDraw(
  map: KairosMap,
  toolId: "draw.circle" | "draw.rectangle",
  positions: [Cartesian3, Cartesian3]
): Promise<DrawResult> {
  const expectedType = toolId === "draw.circle" ? "circle" : "rectangle";
  const complete = waitForDrawComplete(map, expectedType);
  await map.tools.start(toolId, {
    once: true,
    style: {
      line: { color: "#00d4ff", width: 4 },
      polygon: { fillColor: "#00d4ff40", outlineColor: "#00d4ff" }
    }
  });
  await waitForRender(map);
  await clickCanvas(map, screenFromPosition(map, positions[0]));
  await moveCanvas(map, screenFromPosition(map, positions[1]));
  await clickCanvas(map, screenFromPosition(map, positions[1]));
  return complete;
}

function waitForDrawComplete(map: KairosMap, type: DrawResult["type"]): Promise<DrawResult> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      off();
      reject(new Error(`Timed out waiting for ${type} draw completion.`));
    }, 5000);
    const off = map.tools.on("complete", (event) => {
      if ((event.data as DrawResult).type !== type) {
        return;
      }

      window.clearTimeout(timer);
      off();
      resolve(event.data as DrawResult);
    });
  });
}

async function editCircleRadius(map: KairosMap, id: string, radius: number): Promise<void> {
  const result = requireDrawResult(map, id, "circle");
  await map.draw.edit(id, { handleStyle: { pixelSize: 48 } });
  await waitForRender(map, 10);
  const center = result.positions[0];
  await dragCanvas(
    map,
    screenFromPosition(map, circleEdgePosition(center, Number(result.data?.radius ?? 1))),
    screenFromPosition(map, circleEdgePosition(center, radius))
  );
  await waitForRender(map, 4);
}

async function editRectangleCorner(map: KairosMap, id: string, nextCorner: Cartesian3): Promise<void> {
  const result = requireDrawResult(map, id, "rectangle");
  await map.draw.edit(id, { handleStyle: { pixelSize: 48 } });
  await waitForRender(map, 10);
  await dragCanvas(map, screenFromPosition(map, result.positions[0]), screenFromPosition(map, nextCorner));
  await waitForRender(map, 4);
}

async function ensureDrawResult(map: KairosMap, type: "circle" | "rectangle"): Promise<DrawResult> {
  const existing = map.draw.list().find((result) => result.type === type);
  if (existing) {
    return existing;
  }

  return type === "circle"
    ? (await createRuntimeVerifier(map).runDrawCircle(), requireLatestDrawResult(map, "circle"))
    : (await createRuntimeVerifier(map).runDrawRectangle(), requireLatestDrawResult(map, "rectangle"));
}

async function ensureSnapshotContent(map: KairosMap): Promise<void> {
  if (!map.draw.list().some((result) => result.type === "circle")) {
    await createRuntimeVerifier(map).runDrawCircle();
  }
  if (!map.draw.list().some((result) => result.type === "rectangle")) {
    await createRuntimeVerifier(map).runDrawRectangle();
  }
  if (!map.draw.get("runtime-model")) {
    await createRuntimeVerifier(map).createModelWithOrientation();
  }
  if (map.overlays.list().length === 0) {
    await createRuntimeVerifier(map).createOverlays();
  }
  if (map.primitives.list().length === 0) {
    map.primitives.addPolyline({
      id: "runtime-primitive-line",
      positions: [
        fromDegrees(HOME_LONGITUDE - 0.003, HOME_LATITUDE + 0.003),
        fromDegrees(HOME_LONGITUDE + 0.003, HOME_LATITUDE + 0.003)
      ],
      color: "#35d07f",
      width: 3
    });
  }
  if (map.sceneState.bookmarks.list().length === 0) {
    map.sceneState.bookmarks.add({
      id: "runtime-home",
      name: "Runtime home",
      view: map.sceneState.captureCamera()
    });
  }
}

function requireLatestDrawResult(map: KairosMap, type: DrawResult["type"]): DrawResult {
  const result = [...map.draw.list()].reverse().find((item) => item.type === type);
  if (!result) {
    throw new Error(`Expected latest ${type} draw result.`);
  }
  return result;
}

function requireDrawResult(map: KairosMap, id: string, type: DrawResult["type"]): DrawResult {
  const result = map.draw.get(id);
  if (!result) {
    throw new Error(`Draw result ${id} does not exist.`);
  }
  assert(result.type === type, `Draw result ${id} is not ${type}.`);
  return result;
}

function summarizePick(picked: PickResult): RuntimeSummary {
  return {
    ok: true,
    id: picked.id,
    type: picked.type,
    source: picked.source,
    overlayId: picked.overlayId,
    overlayType: picked.overlayType,
    hasPosition: Boolean(picked.position),
    propertyKeys: Object.keys(picked.properties)
  };
}

function pickId(picked: unknown): string | undefined {
  if (!picked || typeof picked !== "object") {
    return undefined;
  }

  const id = (picked as { id?: unknown }).id;
  if (!id) {
    return undefined;
  }
  if (typeof id === "string") {
    return id;
  }
  if (typeof id === "object" && "id" in id) {
    return String((id as { id?: unknown }).id);
  }
  return String(id);
}

function snapshotCounts(map: KairosMap, snapshot: SceneSnapshot) {
  return {
    drawCount: map.draw.list().length,
    overlayCount: map.overlays.list().length,
    primitiveCount: map.primitives.list().length,
    bookmarkCount: map.sceneState.bookmarks.list().length,
    snapshotDrawCount: snapshot.results?.draw.length ?? 0,
    snapshotOverlayCount: snapshot.overlays?.length ?? 0,
    snapshotPrimitiveCount: snapshot.primitives?.length ?? 0,
    snapshotBookmarkCount: snapshot.bookmarks.length,
    layerCount: map.layers.listState().length,
    snapshotLayerCount: snapshot.layers.length
  };
}

async function setupCamera(map: KairosMap): Promise<void> {
  map.viewer.camera.setView({
    destination: Cartesian3.fromDegrees(HOME_LONGITUDE, HOME_LATITUDE, 3500),
    orientation: {
      heading: 0,
      pitch: -CesiumMath.PI_OVER_TWO,
      roll: 0
    }
  });
  await waitForRender(map, 4);
}

async function waitForRender(map: KairosMap, frames = 2): Promise<void> {
  for (let index = 0; index < frames; index += 1) {
    map.viewer.resize();
    map.viewer.scene.requestRender();
    map.viewer.render();
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }
}

async function clickCanvas(map: KairosMap, position: Cartesian2): Promise<void> {
  const canvas = map.viewer.scene.canvas;
  canvas.focus();
  dispatchMouse(canvas, "mousemove", position);
  dispatchMouse(canvas, "mousedown", position, 0, 1);
  dispatchMouse(canvas, "mouseup", position);
  dispatchMouse(canvas, "click", position);
  await waitForRender(map);
}

async function moveCanvas(map: KairosMap, position: Cartesian2): Promise<void> {
  dispatchMouse(map.viewer.scene.canvas, "mousemove", position);
  await waitForRender(map);
}

async function dragCanvas(map: KairosMap, from: Cartesian2, to: Cartesian2): Promise<void> {
  const canvas = map.viewer.scene.canvas;
  canvas.focus();
  dispatchMouse(canvas, "mousemove", from);
  dispatchMouse(canvas, "mousedown", from, 0, 1);
  for (let step = 1; step <= 6; step += 1) {
    const t = step / 6;
    dispatchMouse(
      canvas,
      "mousemove",
      new Cartesian2(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t),
      0,
      1
    );
    await waitForRender(map);
  }
  dispatchMouse(canvas, "mouseup", to);
  await waitForRender(map);
}

function dispatchMouse(
  canvas: HTMLCanvasElement,
  type: string,
  position: Cartesian2,
  button = 0,
  buttons = 0
): void {
  const rect = canvas.getBoundingClientRect();
  const clientX = rect.left + position.x;
  const clientY = rect.top + position.y;
  dispatchPointer(canvas, type, clientX, clientY, button, buttons);
  canvas.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY,
      screenX: window.screenX + clientX,
      screenY: window.screenY + clientY,
      button,
      buttons
    })
  );
}

function dispatchPointer(
  canvas: HTMLCanvasElement,
  mouseType: string,
  clientX: number,
  clientY: number,
  button: number,
  buttons: number
): void {
  if (typeof PointerEvent === "undefined") {
    return;
  }

  const pointerType = pointerTypeForMouseEvent(mouseType);
  if (!pointerType) {
    return;
  }

  canvas.dispatchEvent(
    new PointerEvent(pointerType, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY,
      screenX: window.screenX + clientX,
      screenY: window.screenY + clientY,
      button,
      buttons,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true
    })
  );
}

function pointerTypeForMouseEvent(mouseType: string): string | undefined {
  if (mouseType === "mousedown") {
    return "pointerdown";
  }
  if (mouseType === "mouseup") {
    return "pointerup";
  }
  if (mouseType === "mousemove") {
    return "pointermove";
  }
  return undefined;
}

function screenFromPosition(map: KairosMap, position: Cartesian3): Cartesian2 {
  const screen = SceneTransforms.worldToWindowCoordinates(map.viewer.scene, position);
  if (!screen) {
    throw new Error("Could not project world position to window coordinates.");
  }
  return screen;
}

function getCanvasState(map: KairosMap) {
  const canvas = map.viewer.scene.canvas;
  const pixel = sampleCanvasPixel(canvas);
  return {
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    drawingBufferWidth: canvas.width,
    drawingBufferHeight: canvas.height,
    samplePixel: pixel,
    nonblank: pixel.some((value) => value !== 0)
  };
}

function sampleCanvasPixel(canvas: HTMLCanvasElement): number[] {
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) {
    return [0, 0, 0, 0];
  }

  const pixel = new Uint8Array(4);
  gl.readPixels(
    Math.max(0, Math.floor(gl.drawingBufferWidth / 2)),
    Math.max(0, Math.floor(gl.drawingBufferHeight / 2)),
    1,
    1,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixel
  );
  return [...pixel];
}

function fromDegrees(longitude: number, latitude: number, height = 0): Cartesian3 {
  return Cartesian3.fromDegrees(longitude, latitude, height);
}

function circleEdgePosition(center: Cartesian3, radius: number): Cartesian3 {
  const cartographic = Cartographic.fromCartesian(center);
  assert(Boolean(cartographic), "Could not convert Cartesian3 to Cartographic.");
  const earthRadius = 6378137;
  const longitudeDelta =
    radius / (earthRadius * Math.max(Math.abs(Math.cos(cartographic.latitude)), 0.01));
  return Cartesian3.fromRadians(
    cartographic.longitude + longitudeDelta,
    cartographic.latitude,
    cartographic.height
  );
}

function clonePositions(positions: Cartesian3[]): Cartesian3[] {
  return positions.map((position) => Cartesian3.clone(position));
}

function positionsNear(a: Cartesian3[], b: Cartesian3[], epsilon: number): boolean {
  return (
    a.length === b.length &&
    a.every((position, index) => Cartesian3.distance(position, b[index]) <= epsilon)
  );
}

function near(a: number, b: number, epsilon: number): boolean {
  return Math.abs(a - b) <= epsilon;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
