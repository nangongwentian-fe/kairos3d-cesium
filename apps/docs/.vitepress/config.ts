import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Kairos3DCesium",
  description: "Cesium common feature SDK",
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Architecture", link: "/guide/architecture" },
      { text: "Status", link: "/guide/first-version-status" },
      { text: "Roadmap", link: "/guide/roadmap" },
      { text: "Release", link: "/guide/release-prep" }
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Operations And Loading", link: "/guide/operations" },
          { text: "Scene Transactions", link: "/guide/scene-transactions" },
          { text: "Architecture", link: "/guide/architecture" },
          { text: "First Version Status", link: "/guide/first-version-status" },
          { text: "Roadmap", link: "/guide/roadmap" },
          { text: "Release Preparation", link: "/guide/release-prep" }
        ]
      }
    ]
  }
});
