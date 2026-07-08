import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Kairos3DCesium",
  description: "Cesium common feature SDK",
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Architecture", link: "/guide/architecture" },
      { text: "Status", link: "/guide/first-version-status" }
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Architecture", link: "/guide/architecture" },
          { text: "First Version Status", link: "/guide/first-version-status" }
        ]
      }
    ]
  }
});
