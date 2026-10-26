// Local technical conversion only; no upload, model call, or content approval.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

export async function convertWebp(page, input) {
  if (!input.length || input.length > 16 * 1024 * 1024)
    throw Error("Source must be 1 byte to 16 MiB");
  const mime = input
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : input[0] === 255 && input[1] === 216 && input[2] === 255
      ? "image/jpeg"
      : input.toString("ascii", 0, 4) === "RIFF" &&
          input.toString("ascii", 8, 12) === "WEBP"
        ? "image/webp"
        : null;
  if (!mime) throw Error("Source must be PNG, JPEG, or WebP");
  const result = await page.evaluate(
    async ({ data, mime }) => {
      const img = new Image();
      img.src = `data:${mime};base64,${data}`;
      await img.decode();
      if (
        !img.naturalWidth ||
        !img.naturalHeight ||
        img.naturalWidth * img.naturalHeight > 32 * 1024 * 1024
      )
        throw Error("Source dimensions too large");
      const scale = Math.min(
        1,
        512 / Math.max(img.naturalWidth, img.naturalHeight),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2]) {
        const url = canvas.toDataURL("image/webp", quality);
        if (!url.startsWith("data:image/webp;base64,"))
          throw Error("WebP encoder unavailable");
        const base64 = url.split(",")[1];
        if (atob(base64).length <= 102400) {
          const verify = new Image();
          verify.src = url;
          await verify.decode();
          if (
            verify.naturalWidth !== canvas.width ||
            verify.naturalHeight !== canvas.height
          )
            throw Error("WebP verification failed");
          return {
            base64,
            width: canvas.width,
            height: canvas.height,
            quality,
          };
        }
      }
      throw Error(
        "Cannot fit within 100 KiB; simplify source and review again",
      );
    },
    { data: input.toString("base64"), mime },
  );
  const bytes = Buffer.from(result.base64, "base64");
  return {
    bytes,
    width: result.width,
    height: result.height,
    quality: result.quality,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [source, target] = process.argv.slice(2);
  if (!source || !target || !target.toLowerCase().endsWith(".webp"))
    throw Error("Usage: node scripts/convert-webp.mjs source.png output.webp");
  const input = readFileSync(source);
  const browser = await chromium.launch({ headless: true });
  try {
    const result = await convertWebp(await browser.newPage(), input);
    writeFileSync(target, result.bytes, { flag: "wx" }); // never overwrite a source or existing adoption
    console.log(
      JSON.stringify({
        path: target,
        width: result.width,
        height: result.height,
        byteSize: result.bytes.length,
        quality: result.quality,
        contentReviewRequired: true,
      }),
    );
  } finally {
    await browser.close();
  }
}
