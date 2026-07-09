import { Color } from "cesium";
import type { DrawType } from "../draw/types";
import type { MeasureType, TerrainAnalysisType } from "../analysis/types";
import type {
  ResultSymbolStyle,
  SDKStyleDefaults,
  SelectionSymbolStyle
} from "./types";
import {
  cloneSymbolStyle,
  mergeSymbolStyles
} from "./utils";

const drawTypes: DrawType[] = [
  "point",
  "polyline",
  "polygon",
  "circle",
  "rectangle",
  "billboard",
  "label",
  "model",
  "ellipse",
  "wall",
  "corridor",
  "box",
  "cylinder"
];

export class StyleManager {
  private defaults: SDKStyleDefaults = createDefaultStyles();
  private readonly presets = new Map<string, ResultSymbolStyle>();

  setDefaults(defaults: SDKStyleDefaults): void {
    this.defaults = mergeDefaults(this.defaults, defaults);
  }

  getDefaults(): SDKStyleDefaults {
    return cloneDefaults(this.defaults);
  }

  registerPreset(id: string, style: ResultSymbolStyle): void {
    this.presets.set(id, mergeSymbolStyles(style));
  }

  hasPreset(id: string): boolean {
    return this.presets.has(id);
  }

  getPreset(id: string): ResultSymbolStyle | undefined {
    return cloneSymbolStyle(this.presets.get(id));
  }

  listPresets(): Array<{ id: string; style: ResultSymbolStyle }> {
    return [...this.presets.entries()].map(([id, style]) => ({
      id,
      style: cloneSymbolStyle(style) ?? {}
    }));
  }

  removePreset(id: string): boolean {
    return this.presets.delete(id);
  }

  resolveDrawStyle(type: DrawType, override?: ResultSymbolStyle): ResultSymbolStyle {
    return mergeSymbolStyles(this.defaults.draw?.[type], override);
  }

  resolveMeasureStyle(type: MeasureType, override?: ResultSymbolStyle): ResultSymbolStyle {
    return mergeSymbolStyles(this.defaults.measure?.[type], override);
  }

  resolveVisibilityStyle(override?: ResultSymbolStyle): ResultSymbolStyle {
    return mergeSymbolStyles(this.defaults.visibility, override);
  }

  resolveProfileStyle(override?: ResultSymbolStyle): ResultSymbolStyle {
    return mergeSymbolStyles(this.defaults.profile, override);
  }

  resolveClippingStyle(override?: ResultSymbolStyle): ResultSymbolStyle {
    return mergeSymbolStyles(this.defaults.clipping, override);
  }

  resolveTerrainStyle(
    type: TerrainAnalysisType,
    override?: ResultSymbolStyle
  ): ResultSymbolStyle {
    return mergeSymbolStyles(this.defaults.terrain?.[type], override);
  }

  resolveSelectionStyle(override?: SelectionSymbolStyle): SelectionSymbolStyle {
    return {
      entity: {
        point: {
          ...this.defaults.selection?.entity?.point,
          ...override?.entity?.point
        }
      },
      tilesFeature: {
        ...this.defaults.selection?.tilesFeature,
        ...override?.tilesFeature
      }
    };
  }
}

function createDefaultStyles(): SDKStyleDefaults {
  return {
    draw: {
      point: {
        point: { color: Color.ORANGE, pixelSize: 8 }
      },
      polyline: {
        line: { color: Color.CYAN, width: 3, clampToGround: false }
      },
      polygon: {
        line: { color: Color.CYAN, width: 2, clampToGround: false },
        polygon: { fillColor: Color.CYAN.withAlpha(0.28), outlineColor: Color.CYAN }
      },
      circle: {
        line: { color: Color.CYAN, width: 2, clampToGround: false },
        polygon: { fillColor: Color.CYAN.withAlpha(0.22), outlineColor: Color.CYAN }
      },
      rectangle: {
        line: { color: Color.CYAN, width: 2, clampToGround: false },
        polygon: { fillColor: Color.CYAN.withAlpha(0.22), outlineColor: Color.CYAN }
      },
      billboard: {
        billboard: { color: Color.WHITE, scale: 1 }
      },
      label: {
        label: { color: Color.WHITE, outlineColor: Color.BLACK }
      },
      model: {
        model: { scale: 1 }
      },
      ellipse: {
        line: { color: Color.CYAN, width: 2, clampToGround: false },
        polygon: { fillColor: Color.CYAN.withAlpha(0.22), outlineColor: Color.CYAN }
      },
      wall: {
        line: { color: Color.CYAN, width: 2, clampToGround: false },
        polygon: { fillColor: Color.CYAN.withAlpha(0.2), outlineColor: Color.CYAN }
      },
      corridor: {
        line: { color: Color.CYAN, width: 2, clampToGround: false },
        polygon: { fillColor: Color.CYAN.withAlpha(0.2), outlineColor: Color.CYAN }
      },
      box: {
        line: { color: Color.CYAN, width: 2, clampToGround: false },
        polygon: { fillColor: Color.CYAN.withAlpha(0.2), outlineColor: Color.CYAN }
      },
      cylinder: {
        line: { color: Color.CYAN, width: 2, clampToGround: false },
        polygon: { fillColor: Color.CYAN.withAlpha(0.2), outlineColor: Color.CYAN }
      }
    },
    measure: {
      distance: {
        line: { color: Color.YELLOW, width: 3, clampToGround: false },
        label: { color: Color.WHITE, outlineColor: Color.BLACK }
      },
      area: {
        polygon: { fillColor: Color.YELLOW.withAlpha(0.25), outlineColor: Color.YELLOW },
        label: { color: Color.WHITE, outlineColor: Color.BLACK }
      },
      height: {
        line: { color: Color.LIME, width: 3, clampToGround: false },
        label: { color: Color.WHITE, outlineColor: Color.BLACK }
      }
    },
    visibility: {
      visibleLine: { color: Color.LIME, width: 3, clampToGround: false },
      blockedLine: { color: Color.RED, width: 3, clampToGround: false },
      point: { color: Color.WHITE, pixelSize: 8 },
      blockedPoint: { color: Color.RED, pixelSize: 9 }
    },
    profile: {
      line: { color: Color.DEEPSKYBLUE, width: 3, clampToGround: false },
      point: { color: Color.WHITE, pixelSize: 7 }
    },
    clipping: {
      line: { color: Color.YELLOW, width: 2, clampToGround: false }
    },
    terrain: {
      "slope-aspect": {
        polygon: {
          fillColor: Color.ORANGE.withAlpha(0.18),
          outlineColor: Color.ORANGE
        },
        line: { color: Color.ORANGE, width: 2, clampToGround: true }
      },
      contour: {
        line: { color: Color.WHITE, width: 2, clampToGround: true }
      },
      volume: {
        polygon: {
          fillColor: Color.GOLD.withAlpha(0.18),
          outlineColor: Color.GOLD
        },
        line: { color: Color.GOLD, width: 2, clampToGround: true }
      },
      flood: {
        polygon: {
          fillColor: Color.DEEPSKYBLUE.withAlpha(0.22),
          outlineColor: Color.DEEPSKYBLUE
        },
        line: { color: Color.DEEPSKYBLUE, width: 2, clampToGround: true }
      },
      excavation: {
        polygon: {
          fillColor: Color.RED.withAlpha(0.16),
          outlineColor: Color.RED
        },
        line: { color: Color.RED, width: 2, clampToGround: true }
      }
    },
    selection: {
      entity: {
        point: {
          color: Color.YELLOW.withAlpha(0.9),
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          pixelSize: 14
        }
      },
      tilesFeature: {
        color: Color.YELLOW.withAlpha(0.75)
      }
    }
  };
}

function mergeDefaults(
  current: SDKStyleDefaults,
  next: SDKStyleDefaults
): SDKStyleDefaults {
  const draw: SDKStyleDefaults["draw"] = {};
  for (const type of drawTypes) {
    draw[type] = mergeSymbolStyles(current.draw?.[type], next.draw?.[type]);
  }

  return {
    draw,
    measure: {
      distance: mergeSymbolStyles(current.measure?.distance, next.measure?.distance),
      area: mergeSymbolStyles(current.measure?.area, next.measure?.area),
      height: mergeSymbolStyles(current.measure?.height, next.measure?.height)
    },
    visibility: mergeSymbolStyles(current.visibility, next.visibility),
    profile: mergeSymbolStyles(current.profile, next.profile),
    clipping: mergeSymbolStyles(current.clipping, next.clipping),
    terrain: {
      "slope-aspect": mergeSymbolStyles(
        current.terrain?.["slope-aspect"],
        next.terrain?.["slope-aspect"]
      ),
      contour: mergeSymbolStyles(current.terrain?.contour, next.terrain?.contour),
      volume: mergeSymbolStyles(current.terrain?.volume, next.terrain?.volume),
      flood: mergeSymbolStyles(current.terrain?.flood, next.terrain?.flood),
      excavation: mergeSymbolStyles(
        current.terrain?.excavation,
        next.terrain?.excavation
      )
    },
    selection: {
      entity: {
        point: {
          ...current.selection?.entity?.point,
          ...next.selection?.entity?.point
        }
      },
      tilesFeature: {
        ...current.selection?.tilesFeature,
        ...next.selection?.tilesFeature
      }
    }
  };
}

function cloneDefaults(defaults: SDKStyleDefaults): SDKStyleDefaults {
  return mergeDefaults({}, defaults);
}
