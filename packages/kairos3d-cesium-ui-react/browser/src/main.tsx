import { createMemoryWidgetSnapshotStorage } from "@kairos3d/cesium-widget";
import { Cartesian3, EllipsoidTerrainProvider } from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  KairosMapProvider,
  KairosMapViewport,
  KairosWidgetHost,
  KairosWidgetShell,
  KairosWidgetToolbar,
  useKairosMapState
} from "../../src";
import { standardWidgets } from "../../src/widgets";
import "../../src/styles.css";
import "./smoke.css";

const snapshotStorage = createMemoryWidgetSnapshotStorage();

function SmokeSeed() {
  const state = useKairosMapState();
  const seeded = useRef(false);

  useEffect(() => {
    if (state.status !== "ready" || !state.map || seeded.current) {
      return;
    }
    seeded.current = true;
    const center = Cartesian3.fromDegrees(114.17, 22.3, 80);
    state.map.overlays.addPoint({
      id: "smoke-overlay",
      position: center,
      properties: { source: "browser-smoke" },
      group: "smoke"
    });
    state.map.draw.circle({
      id: "smoke-circle",
      center,
      radius: 250,
      properties: { source: "browser-smoke" }
    });
  }, [state]);

  return <output className="smoke-status" data-k3d-status={state.status}>{state.status}</output>;
}

createRoot(document.getElementById("root")!).render(
  <KairosMapProvider
    createOptions={{
      viewerOptions: {
        baseLayer: false,
        terrainProvider: new EllipsoidTerrainProvider(),
        animation: false,
        timeline: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        baseLayerPicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false
      },
      layers: [
        {
          id: "smoke-geojson",
          type: "geojson",
          name: "本地 GeoJSON",
          group: "测试数据",
          data: "/data/demo.geojson",
          order: 0,
          style: {
            markerColor: "#29c7d8",
            markerSize: 12
          }
        }
      ]
    }}
    modules={standardWidgets}
    snapshotStorage={snapshotStorage}
  >
    <KairosWidgetShell theme="dark">
      <KairosMapViewport />
      <KairosWidgetToolbar />
      <KairosWidgetHost />
      <SmokeSeed />
    </KairosWidgetShell>
  </KairosMapProvider>
);
