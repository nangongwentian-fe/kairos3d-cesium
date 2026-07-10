import { describe, expect, it } from "vitest";
import * as api from "./index";

describe("public exports", () => {
  it("exports the M6 React infrastructure surface", () => {
    expect(api).toMatchObject({
      KairosMapProvider: expect.any(Function),
      KairosMapViewport: expect.any(Function),
      KairosWidgetShell: expect.any(Function),
      KairosWidgetToolbar: expect.any(Function),
      KairosWidgetHost: expect.any(Function),
      KairosPopupHost: expect.any(Function),
      ReactWidgetRegistry: expect.any(Function),
      defineReactWidget: expect.any(Function),
      useKairosMap: expect.any(Function),
      useKairosMapState: expect.any(Function),
      useWidgetPlatform: expect.any(Function),
      useReactWidgetRegistry: expect.any(Function),
      useWidgetStates: expect.any(Function),
      useKairosPopup: expect.any(Function)
    });
  });
});
