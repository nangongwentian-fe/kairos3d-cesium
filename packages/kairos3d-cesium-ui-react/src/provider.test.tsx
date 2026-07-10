import {
  createWidgetPlatform,
  WidgetPlatform,
  type WidgetController
} from "@kairos3d/cesium-widget";
import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useKairosMapState } from "./hooks";
import { KairosMapProvider, KairosMapViewport } from "./provider";
import { createFakeMap } from "./test/fakes";

const mocks = vi.hoisted(() => ({ createMap: vi.fn() }));

vi.mock("@kairos3d/cesium/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@kairos3d/cesium/core")>()),
  createMap: mocks.createMap
}));

function StateProbe() {
  const state = useKairosMapState();
  return <output data-testid="status">{state.status}</output>;
}

describe("KairosMapProvider", () => {
  beforeEach(() => mocks.createMap.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it("creates owned resources and disposes registry, platform, then map", async () => {
    const order: string[] = [];
    const { map } = createFakeMap();
    vi.mocked(map.destroy).mockImplementation(() => order.push("map"));
    mocks.createMap.mockResolvedValue(map);
    const originalDestroy = WidgetPlatform.prototype.destroy;
    const platformDestroy = vi
      .spyOn(WidgetPlatform.prototype, "destroy")
      .mockImplementation(async function (this: WidgetPlatform) {
        order.push("platform");
        return originalDestroy.call(this);
      });
    const controller: WidgetController = {
      activate: vi.fn(),
      deactivate: vi.fn(),
      destroy: vi.fn(() => {
        order.push("widget");
      })
    };

    const view = render(
      <KairosMapProvider
        createOptions={{}}
        onReady={({ platform }) => {
          void platform.activate("layers");
        }}
        modules={[
          {
            id: "layers",
            name: "Layers",
            component: () => null,
            create: () => controller
          }
        ]}
      >
        <KairosMapViewport />
        <StateProbe />
      </KairosMapProvider>
    );
    await screen.findByText("ready");
    await waitFor(() => expect(controller.activate).toHaveBeenCalledTimes(1));
    view.unmount();

    await waitFor(() => expect(order).toEqual(["widget", "platform", "map"]));
    expect(platformDestroy).toHaveBeenCalledTimes(1);
  });

  it("reports creation failures", async () => {
    const { map } = createFakeMap();
    const onError = vi.fn();
    mocks.createMap.mockResolvedValue(map);
    const duplicateModule = {
      id: "duplicate",
      name: "Duplicate",
      component: () => null
    };
    render(
      <KairosMapProvider
        createOptions={{}}
        modules={[duplicateModule, duplicateModule]}
        onError={onError}
      >
        <KairosMapViewport />
        <StateProbe />
      </KairosMapProvider>
    );

    await screen.findByText("error");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toContain("already registered");
    expect(map.destroy).toHaveBeenCalledTimes(1);
  });

  it("reaches ready when mounted under StrictMode", async () => {
    mocks.createMap.mockImplementation(async () => {
      const { map } = createFakeMap();
      return map;
    });
    const view = render(
      <StrictMode>
        <KairosMapProvider createOptions={{}}>
          <KairosMapViewport />
          <StateProbe />
        </KairosMapProvider>
      </StrictMode>
    );

    await screen.findByText("ready");
    expect(mocks.createMap).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("does not destroy externally supplied map or platform", async () => {
    const { map } = createFakeMap();
    const platform = createWidgetPlatform({ map });
    const destroyPlatform = vi.spyOn(platform, "destroy");
    const view = render(
      <KairosMapProvider map={map} platform={platform}>
        <StateProbe />
      </KairosMapProvider>
    );
    await screen.findByText("ready");
    view.unmount();

    await Promise.resolve();
    expect(map.destroy).not.toHaveBeenCalled();
    expect(destroyPlatform).not.toHaveBeenCalled();
  });

  it("rejects KairosMapViewport in external mode", () => {
    const { map } = createFakeMap();
    expect(() =>
      render(
        <KairosMapProvider map={map}>
          <KairosMapViewport />
        </KairosMapProvider>
      )
    ).toThrow("only available in createOptions mode");
  });
});
