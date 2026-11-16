import { class_names, ow_ranks } from "../logic/defines";
import { icon_datauri } from "../logic/importExport";
import { rankSvgString, roleSvgString } from "./icons";

function rasterize(svg: string, size: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = 3;
      const canvas = document.createElement("canvas");
      canvas.width = size * scale;
      canvas.height = size * scale;
      canvas.getContext("2d")!.drawImage(img, 0, 0, size * scale, size * scale);
      const out = document.createElement("canvas");
      out.width = size;
      out.height = size;
      const ctx = out.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(canvas, 0, 0, size, size);
      resolve(out.toDataURL("image/png"));
    };
    img.onerror = () => resolve("");
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

export async function prepareIconDataUris() {
  for (const c of class_names) icon_datauri.classes[c] = await rasterize(roleSvgString(c, 60, "#3a4560"), 20);
  for (const r of ow_ranks) icon_datauri.ranks[r.key] = await rasterize(rankSvgString(r.key, 60), 20);
}
