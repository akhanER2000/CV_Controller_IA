import { it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { renderPageAsImage } from "unpdf";
// Rasteriza la página PNG_PAGE (1) de PNG_IN a PNG_OUT, para mirar un PDF de la auditoría.
it("png", async () => {
  const png = await renderPageAsImage(new Uint8Array(readFileSync(process.env.PNG_IN!)), Number(process.env.PNG_PAGE ?? 1), {
    canvasImport: () => import("@napi-rs/canvas"),
    scale: Number(process.env.PNG_SCALE ?? 1.2),
  });
  writeFileSync(process.env.PNG_OUT!, Buffer.from(png));
});
