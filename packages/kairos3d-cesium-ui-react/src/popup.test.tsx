import { createWidgetPlatform } from "@kairos3d/cesium-widget";
import { Cartesian2, Cartesian3, SceneTransforms } from "cesium";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useKairosPopup } from "./popup";
import { KairosMapProvider } from "./provider";
import { createFakeMap } from "./test/fakes";
import { KairosWidgetShell } from "./widget-ui";

function PopupButtons() {
  const popup = useKairosPopup();
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          popup.open({
            id: "screen",
            anchor: { type: "screen", x: 40, y: 50 },
            offset: [3, 4],
            content: <span>screen popup</span>
          })
        }
      >
        open screen
      </button>
      <button
        type="button"
        onClick={() =>
          popup.open({
            id: "world",
            anchor: { type: "world", position: new Cartesian3(1, 2, 3) },
            content: <span>world popup</span>
          })
        }
      >
        open world
      </button>
      <output data-testid="popup-count">{popup.list().length}</output>
    </div>
  );
}

describe("Kairos popup", () => {
  it("positions screen popups and closes them", async () => {
    const user = userEvent.setup();
    const { map, postRender } = createFakeMap();
    const platform = createWidgetPlatform({ map });
    render(
      <KairosMapProvider map={map} platform={platform}>
        <KairosWidgetShell>
          <PopupButtons />
        </KairosWidgetShell>
      </KairosMapProvider>
    );

    await user.click(screen.getByRole("button", { name: "open screen" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(dialog.style.transform).toBe("translate3d(43px, 54px, 0)")
    );
    expect(postRender.listenerCount()).toBe(0);
    await user.click(screen.getByRole("button", { name: "关闭弹窗" }));
    expect(screen.queryByText("screen popup")).toBeNull();
  });

  it("projects world anchors after postRender and removes the listener", async () => {
    const user = userEvent.setup();
    const { map, postRender } = createFakeMap();
    const platform = createWidgetPlatform({ map });
    const projection = vi
      .spyOn(SceneTransforms, "worldToWindowCoordinates")
      .mockReturnValue(new Cartesian2(15, 25));
    render(
      <KairosMapProvider map={map} platform={platform}>
        <KairosWidgetShell>
          <PopupButtons />
        </KairosWidgetShell>
      </KairosMapProvider>
    );

    await user.click(screen.getByRole("button", { name: "open world" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(postRender.listenerCount()).toBe(1));
    postRender.raise();
    expect(dialog.style.transform).toBe("translate3d(25px, 45px, 0)");

    await user.click(screen.getByRole("button", { name: "关闭弹窗" }));
    await waitFor(() => expect(postRender.listenerCount()).toBe(0));
    projection.mockRestore();
  });
});
