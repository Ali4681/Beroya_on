import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "public", "VIP", "VIP.png");
const OUT_DIR = path.join(ROOT, "public", "VIP");

/** Reference size from the brief. Scale centers/radius if the asset differs. */
const REF_W = 2172;
const REF_H = 724;
const REF_FRONT = { x: 338, y: 533 };
const REF_REAR = { x: 1668, y: 533 };
const REF_SIZE = 292;
const REF_RADIUS = 146;

async function extractWheel(image, meta, center, outPath, label) {
  const sx = meta.width / REF_W;
  const sy = meta.height / REF_H;
  const size = Math.round(REF_SIZE * Math.min(sx, sy));
  const radius = Math.round(REF_RADIUS * Math.min(sx, sy));
  const cx = Math.round(center.x * sx);
  const cy = Math.round(center.y * sy);
  const left = Math.max(0, Math.round(cx - size / 2));
  const top = Math.max(0, Math.round(cy - size / 2));
  const width = Math.min(size, meta.width - left);
  const height = Math.min(size, meta.height - top);

  if (width !== size || height !== size) {
    throw new Error(`${label}: crop ${width}x${height} is not a full ${size}x${size} square (check coordinates).`);
  }

  const inset = Math.max(0, radius - 2);
  const diameter = inset * 2;
  const offset = Math.round((size - diameter) / 2);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="${size / 2}" cy="${size / 2}" rx="${inset}" ry="${inset}" fill="#fff"/>
    </svg>`,
  );

  await image
    .clone()
    .extract({ left, top, width, height })
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toFile(outPath);

  const info = await sharp(outPath).metadata();
  const file = await stat(outPath);
  if (!info.width || !info.height || file.size <= 0) {
    throw new Error(`${label}: output is empty or invalid.`);
  }
  if (info.width !== size || info.height !== size) {
    throw new Error(`${label}: expected ${size}x${size}, got ${info.width}x${info.height}.`);
  }
  if (info.hasAlpha !== true) {
    throw new Error(`${label}: expected alpha channel.`);
  }

  return { label, path: outPath, width: info.width, height: info.height, bytes: file.size, left, top, size };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const image = sharp(SOURCE).ensureAlpha();
  const meta = await image.metadata();
  if (!meta.width || !meta.height) throw new Error("Could not read VIP.png dimensions.");

  console.log(`Source ${SOURCE} → ${meta.width}x${meta.height}`);

  const front = await extractWheel(image, meta, REF_FRONT, path.join(OUT_DIR, "wheel-front.png"), "front");
  const rear = await extractWheel(image, meta, REF_REAR, path.join(OUT_DIR, "wheel-rear.png"), "rear");

  if (front.width !== rear.width || front.height !== rear.height) {
    throw new Error(`Wheel sizes differ: front ${front.width}x${front.height} vs rear ${rear.width}x${rear.height}.`);
  }

  console.log("OK", { front, rear });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
