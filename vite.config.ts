import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const PRELOAD_FONTS = [/saira-condensed-latin-800-normal-[^/]+\.woff2$/, /barlow-latin-400-normal-[^/]+\.woff2$/];

function preloadFonts(): Plugin {
  return {
    name: "preload-fonts",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {}).filter((f) => PRELOAD_FONTS.some((re) => re.test(f)));
        return files.map((f) => ({ tag: "link", attrs: { rel: "preload", href: `./${f}`, as: "font", type: "font/woff2", crossorigin: "" }, injectTo: "head" as const }));
      },
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), preloadFonts()],
});
