import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Kairos3DCesium",
  description: "Cesium common feature SDK",
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Architecture", link: "/guide/architecture" },
      { text: "Operations", link: "/guide/operations" }
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Operations And Loading", link: "/guide/operations" },
          { text: "Runtime Concurrency", link: "/guide/runtime-concurrency" },
          { text: "Scene Transactions", link: "/guide/scene-transactions" },
          { text: "Architecture", link: "/guide/architecture" }
        ]
      }
    ]
  }
});
