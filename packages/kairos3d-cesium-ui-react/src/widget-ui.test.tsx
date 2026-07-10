import { createWidgetPlatform } from "@kairos3d/cesium-widget";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KairosMapProvider } from "./provider";
import { createFakeMap } from "./test/fakes";
import type { ReactWidgetModule } from "./types";
import {
  KairosWidgetHost,
  KairosWidgetShell,
  KairosWidgetToolbar
} from "./widget-ui";

const panel = (id: string, region: "left" | "right" | "bottom" | "floating"):
ReactWidgetModule => ({
  id,
  name: id,
  defaultPlacement: { region, width: 300, height: 220, floating: region === "floating" ? { x: 20, y: 30, width: 300, height: 220 } : undefined },
  component: () => <div>{id} content</div>
});

function Harness({ modules }: { modules: ReactWidgetModule[] }) {
  const { map } = createFakeMap();
  const platform = createWidgetPlatform({ map });
  return (
    <KairosMapProvider map={map} platform={platform} modules={modules}>
      <KairosWidgetShell>
        <KairosWidgetToolbar />
        <KairosWidgetHost />
      </KairosWidgetShell>
    </KairosMapProvider>
  );
}

describe("widget UI", () => {
  it("toggles dock widgets from the accessible toolbar and closes on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness modules={[panel("layers", "left")]} />);
    const button = await screen.findByRole("button", { name: "layers" });
    expect(button.getAttribute("aria-pressed")).toBe("false");

    await user.click(button);
    await screen.findByText("layers content");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    const region = screen.getByRole("region", { name: "layers" });
    expect(region.closest(".k3d-dock--left")).not.toBeNull();

    fireEvent.keyDown(region, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("layers content")).toBeNull());
  });

  it("isolates widget render errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken: ReactWidgetModule = {
      id: "broken",
      name: "Broken",
      component: () => {
        throw new Error("render exploded");
      }
    };
    const user = userEvent.setup();
    render(<Harness modules={[broken, panel("healthy", "right")]} />);
    await user.click(await screen.findByRole("button", { name: "Broken" }));
    await user.click(screen.getByRole("button", { name: "healthy" }));

    expect((await screen.findByRole("alert")).textContent).toContain("render exploded");
    expect(screen.getByText("healthy content")).toBeDefined();
    consoleError.mockRestore();
  });

  it("writes floating drag and resize results back to WidgetPlatform", async () => {
    const user = userEvent.setup();
    const { map } = createFakeMap();
    const platform = createWidgetPlatform({ map });
    const view = render(
      <KairosMapProvider map={map} platform={platform} modules={[panel("float", "floating")]}>
        <KairosWidgetShell>
          <KairosWidgetToolbar />
          <KairosWidgetHost />
        </KairosWidgetShell>
      </KairosMapProvider>
    );
    await user.click(await screen.findByRole("button", { name: "float" }));
    const move = await screen.findByRole("button", { name: "移动 float" });

    fireEvent.pointerDown(move, { button: 0, clientX: 20, clientY: 30 });
    fireEvent.pointerMove(window, { clientX: 70, clientY: 90 });
    fireEvent.pointerUp(window, { clientX: 70, clientY: 90 });
    expect(platform.get("float")?.placement?.floating).toMatchObject({ x: 70, y: 90 });

    const resize = screen.getByRole("button", { name: "调整 float 大小" });
    fireEvent.pointerDown(resize, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 25 });
    fireEvent.pointerUp(window, { clientX: 40, clientY: 25 });
    expect(platform.get("float")?.placement?.floating).toMatchObject({
      width: 340,
      height: 245
    });

    const addListener = vi.spyOn(window, "addEventListener");
    const removeListener = vi.spyOn(window, "removeEventListener");
    fireEvent.pointerDown(screen.getByRole("button", { name: "移动 float" }), {
      button: 0,
      clientX: 70,
      clientY: 90
    });
    const pointerMoveListener = addListener.mock.calls.find(
      ([type]) => type === "pointermove"
    )?.[1];
    view.unmount();
    expect(pointerMoveListener).toBeDefined();
    expect(removeListener).toHaveBeenCalledWith("pointermove", pointerMoveListener);
  });
});
