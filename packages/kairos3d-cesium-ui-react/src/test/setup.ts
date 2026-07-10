import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

if (!("PointerEvent" in globalThis)) {
  class TestPointerEvent extends MouseEvent {
    readonly pointerId: number;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  Object.defineProperty(globalThis, "PointerEvent", {
    configurable: true,
    value: TestPointerEvent
  });
}

afterEach(() => cleanup());
