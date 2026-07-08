import { Color } from "cesium";
import { describe, expect, it } from "vitest";
import {
  mergeSymbolStyles,
  parseColorLike,
  serializeColor,
  serializeSymbolStyle
} from "./utils";

describe("style utilities", () => {
  it("parses and serializes ColorLike values", () => {
    expect(parseColorLike("#35d07f").green).toBeCloseTo(0.8157, 3);
    expect(parseColorLike({ red: 1, green: 0, blue: 0, alpha: 0.5 }).alpha).toBe(0.5);
    expect(serializeColor(Color.CYAN)).toEqual({
      red: 0,
      green: 1,
      blue: 1,
      alpha: 1
    });
  });

  it("rejects invalid colors", () => {
    expect(() => parseColorLike("not-a-color")).toThrow("valid CSS color");
    expect(() =>
      parseColorLike({ red: 2, green: 0, blue: 0, alpha: 1 })
    ).toThrow("between 0 and 1");
  });

  it("merges and serializes symbol styles", () => {
    const style = mergeSymbolStyles(
      {
        line: { color: "#ff3b30", width: 2 },
        point: { pixelSize: 8 }
      },
      {
        line: { width: 5 },
        label: { color: "#ffffff" }
      }
    );

    expect(style.line?.width).toBe(5);
    expect(style.point?.pixelSize).toBe(8);
    expect(serializeSymbolStyle(style)?.line?.color?.red).toBe(1);
  });
});
