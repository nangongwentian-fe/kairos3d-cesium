import { Evented, type KairosMap } from "@kairos3d/cesium/core";
import type { LayerState } from "@kairos3d/cesium/layers";
import type { PickResult, SelectionState } from "@kairos3d/cesium/picking";
import type { ResultRecord } from "@kairos3d/cesium/results";
import { vi } from "vitest";

export class TestEvents extends Evented<Record<string, any>> {
  trigger(type: string, data?: unknown): void {
    this.emit(type, data);
  }
}

export function createWidgetMap() {
  let layerStates: LayerState[] = [];
  let drawItems: any[] = [];
  let overlayItems: any[] = [];
  let measureItems: any[] = [];
  let resultRecords: ResultRecord[] = [];
  let selectionState: SelectionState = { highlighted: false };
  let pickingEnabled = false;

  const layers = Object.assign(new TestEvents(), {
    listState: vi.fn(() => layerStates),
    setShow: vi.fn((id: string, show: boolean) => {
      const state = layerStates.find((item) => item.id === id);
      if (state) state.show = show;
      layers.trigger("update", state);
      return state;
    }),
    toggle: vi.fn((id: string) => {
      const state = layerStates.find((item) => item.id === id)!;
      return layers.setShow(id, !state.show);
    }),
    setGroupShow: vi.fn(),
    setOpacity: vi.fn((id: string, opacity: number) => {
      const state = layerStates.find((item) => item.id === id);
      if (state) state.opacity = opacity;
      layers.trigger("update", state);
      return state;
    }),
    move: vi.fn((id: string, order: number) => {
      const state = layerStates.find((item) => item.id === id);
      if (state) state.order = order;
      layerStates.sort((a, b) => a.order - b.order);
      layers.trigger("move", state);
      return state;
    }),
    flyTo: vi.fn(async () => true),
    remove: vi.fn((id: string) => {
      layerStates = layerStates.filter((item) => item.id !== id);
      layers.trigger("remove", { id });
      return true;
    })
  });

  const draw = Object.assign(new TestEvents(), {
    list: vi.fn(() => drawItems),
    setShow: vi.fn((id: string, value: boolean) => updateItem(draw, drawItems, id, "show", value)),
    setLocked: vi.fn((id: string, value: boolean) => updateItem(draw, drawItems, id, "locked", value)),
    setEditable: vi.fn((id: string, value: boolean) => updateItem(draw, drawItems, id, "editable", value)),
    setStyle: vi.fn((id: string, style: unknown) => {
      const item = drawItems.find((candidate) => candidate.id === id);
      if (item) item.style = style;
      draw.trigger("update", item);
      return item;
    }),
    setProperties: vi.fn((id: string, properties: Record<string, unknown>) => {
      const item = drawItems.find((candidate) => candidate.id === id);
      if (item) item.properties = properties;
      draw.trigger("update", item);
      return item;
    }),
    edit: vi.fn(async () => undefined),
    remove: vi.fn((id: string) => {
      drawItems = drawItems.filter((item) => item.id !== id);
      draw.trigger("remove", { id });
      return true;
    }),
    clear: vi.fn(() => {
      drawItems = [];
      draw.trigger("clear", []);
    })
  });

  const overlays = Object.assign(new TestEvents(), {
    list: vi.fn(() => overlayItems),
    setShow: vi.fn((id: string, value: boolean) => updateItem(overlays, overlayItems, id, "show", value)),
    setLocked: vi.fn((id: string, value: boolean) => updateItem(overlays, overlayItems, id, "locked", value)),
    setEditable: vi.fn((id: string, value: boolean) => updateItem(overlays, overlayItems, id, "editable", value)),
    setStyle: vi.fn((id: string, style: unknown) => {
      const item = overlayItems.find((candidate) => candidate.id === id);
      if (item) item.style = style;
      overlays.trigger("update", item);
      return item;
    }),
    setProperties: vi.fn((id: string, properties: Record<string, unknown>) => {
      const item = overlayItems.find((candidate) => candidate.id === id);
      if (item) item.properties = properties;
      overlays.trigger("update", item);
      return item;
    }),
    remove: vi.fn((id: string) => {
      overlayItems = overlayItems.filter((item) => item.id !== id);
      overlays.trigger("remove", { id });
      return true;
    }),
    clear: vi.fn(() => {
      overlayItems = [];
      overlays.trigger("clear", []);
    })
  });

  const tools = Object.assign(new TestEvents(), {
    active: undefined as { id: string } | undefined,
    start: vi.fn(async (id: string, options?: unknown) => {
      tools.active = { id };
      tools.trigger("start", tools.active);
      return { id, options };
    }),
    stop: vi.fn(() => {
      const active = tools.active;
      tools.active = undefined;
      tools.trigger("stop", active);
    }),
    cancel: vi.fn(() => {
      const active = tools.active;
      tools.active = undefined;
      tools.trigger("cancel", { toolId: active?.id });
    })
  });

  const measure = Object.assign(new TestEvents(), {
    list: vi.fn(() => measureItems),
    distance: vi.fn((options?: unknown) => tools.start("measure.distance", options)),
    area: vi.fn((options?: unknown) => tools.start("measure.area", options)),
    height: vi.fn((options?: unknown) => tools.start("measure.height", options)),
    remove: vi.fn((id: string) => {
      measureItems = measureItems.filter((item) => item.id !== id);
      measure.trigger("remove", { id });
      return true;
    }),
    clear: vi.fn(() => {
      measureItems = [];
      measure.trigger("clear", []);
    })
  });

  const clipping = new TestEvents();
  const results = Object.assign(new TestEvents(), {
    list: vi.fn((query: { source?: string; type?: string } = {}) =>
      resultRecords.filter(
        (record) =>
          (!query.source || record.source === query.source) &&
          (!query.type || record.type === query.type)
      )
    ),
    flyTo: vi.fn(async () => true),
    remove: vi.fn((id: string, source?: string) => {
      resultRecords = resultRecords.filter(
        (record) => record.id !== id || (source !== undefined && record.source !== source)
      );
      results.trigger("remove", { id, source });
      return true;
    }),
    clear: vi.fn((query: { source?: string; type?: string } = {}) => {
      const removed = results.list(query);
      resultRecords = resultRecords.filter((record) => !removed.includes(record));
      results.trigger("clear", removed);
      return removed;
    })
  });

  const selection = Object.assign(new TestEvents(), {
    get: vi.fn(() => selectionState),
    select: vi.fn((result?: PickResult) => {
      selectionState = { result, highlighted: Boolean(result) };
      selection.trigger("change", selectionState);
      return selectionState;
    }),
    clear: vi.fn(() => {
      selectionState = { highlighted: false };
      selection.trigger("change", selectionState);
      return selectionState;
    })
  });
  const picking = Object.assign(new TestEvents(), {
    isClickEnabled: vi.fn(() => pickingEnabled),
    enableClick: vi.fn(() => { pickingEnabled = true; }),
    disableClick: vi.fn(() => { pickingEnabled = false; })
  });

  const sceneSnapshot = {
    version: 1 as const,
    layers: [],
    bookmarks: [],
    createdAt: "2026-07-10T00:00:00.000Z"
  };
  const map = {
    layers,
    draw,
    overlays,
    tools,
    analysis: { measure, clipping },
    results,
    selection,
    picking,
    sceneState: {
      toJSON: vi.fn(() => structuredClone(sceneSnapshot)),
      load: vi.fn(async () => undefined)
    },
    viewer: {
      entities: { contains: vi.fn(() => false) },
      flyTo: vi.fn(async () => true),
      camera: { flyToBoundingSphere: vi.fn() }
    }
  } as unknown as KairosMap;

  return {
    map,
    layers,
    draw,
    overlays,
    tools,
    measure,
    results,
    selection,
    picking,
    setLayers: (items: LayerState[]) => { layerStates = items; },
    setDraw: (items: any[]) => { drawItems = items; },
    setOverlays: (items: any[]) => { overlayItems = items; },
    setMeasures: (items: any[]) => { measureItems = items; },
    setResults: (items: ResultRecord[]) => { resultRecords = items; },
    setSelection: (state: SelectionState) => { selectionState = state; },
    setPickingEnabled: (enabled: boolean) => { pickingEnabled = enabled; }
  };
}

function updateItem(
  events: TestEvents,
  items: any[],
  id: string,
  property: string,
  value: unknown
) {
  const item = items.find((candidate) => candidate.id === id);
  if (item) item[property] = value;
  events.trigger("update", item);
  return item;
}
