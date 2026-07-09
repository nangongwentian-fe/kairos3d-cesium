import { Ion } from "cesium";

export function configureCesiumIonToken(): void {
  const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
  if (typeof token === "string" && token.trim().length > 0) {
    Ion.defaultAccessToken = token.trim();
  }
}
