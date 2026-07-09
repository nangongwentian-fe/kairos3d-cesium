import React from "react";
import { createRoot } from "react-dom/client";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { App } from "./App";
import { configureCesiumIonToken } from "./cesium-env";
import { RuntimeVerificationApp } from "./runtime-verification";
import "./styles.css";

configureCesiumIonToken();

const RootApp =
  new URLSearchParams(window.location.search).get("runtimeVerify") === "1"
    ? RuntimeVerificationApp
    : App;

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>
);
