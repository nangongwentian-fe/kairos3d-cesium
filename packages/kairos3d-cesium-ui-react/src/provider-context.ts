import { createContext } from "react";
import type { KairosMapState } from "./types";

export interface KairosProviderContextValue {
  mode: "create" | "external";
  state: KairosMapState;
  setViewportElement(element: HTMLDivElement | null): void;
}

export const KairosProviderContext = createContext<KairosProviderContextValue | undefined>(
  undefined
);
