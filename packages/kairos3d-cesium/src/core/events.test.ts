import { describe, expect, it, vi } from "vitest";
import { Evented } from "./events";

interface TestEvents {
  change: { value: number };
}

class TestEvented extends Evented<TestEvents> {
  change(value: number): void {
    this.emit("change", { value });
  }
}

describe("Evented", () => {
  it("subscribes and unsubscribes listeners", () => {
    const target = new TestEvented();
    const listener = vi.fn();

    const off = target.on("change", listener);
    target.change(1);
    off();
    target.change(2);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].data.value).toBe(1);
  });

  it("runs once listeners once", () => {
    const target = new TestEvented();
    const listener = vi.fn();

    target.once("change", listener);
    target.change(1);
    target.change(2);

    expect(listener).toHaveBeenCalledOnce();
  });
});
