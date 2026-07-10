import { describe, expect, it } from "vitest";
import type { UserConfig } from "vite";
import packageJson from "../package.json";
import viteConfig from "../vite.config";

const expectedExports = [".", "./snapshot"].sort();

describe("public widget package exports", () => {
  it("keeps package exports aligned with Vite library entries", () => {
    const exportedSubpaths = Object.keys(packageJson.exports).sort();
    const config = viteConfig as UserConfig;
    const entries = config.build?.lib && "entry" in config.build.lib
      ? config.build.lib.entry
      : undefined;

    expect(exportedSubpaths).toEqual(expectedExports);
    expect(entrySubpaths(entries)).toEqual(expectedExports);
  });
});

function entrySubpaths(entries: unknown): string[] {
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    return [];
  }
  return Object.keys(entries)
    .map((entryName) =>
      entryName === "index" ? "." : `./${entryName.replace(/\/index$/, "")}`
    )
    .sort();
}
