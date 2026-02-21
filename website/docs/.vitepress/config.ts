import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Mecha",
  description: "Local-first multi-agent runtime",
  cleanUrls: true,
  base: "/",

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
  ],

  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/" },
      {
        text: "GitHub",
        link: "https://github.com/xiaolai/myprojects/tree/main/mecha.im",
      },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "Getting Started", link: "/guide/" },
            { text: "Installation", link: "/guide/installation" },
          ],
        },
        {
          text: "Reference",
          items: [
            { text: "CLI Reference", link: "/guide/cli-reference" },
          ],
        },
      ],
    },

    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/xiaolai/myprojects/tree/main/mecha.im",
      },
    ],

    footer: {
      message: "Released under the ISC License.",
      copyright: "Copyright © 2024-present",
    },
  },
});
