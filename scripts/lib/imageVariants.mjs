import sharp from "sharp";

// Shared by scripts/generate-image-variants.mjs (one-time backfill) and
// scripts/sync-images-to-r2.mjs (ongoing pipeline) so the resize settings and
// R2 key convention are defined in exactly one place.
//
// Convention (additive-only — never touches the original):
//   card-images/<season>/<file>.png          <- original, untouched
//   card-images/<season>/grid/<file>.webp    <- 400w q82, Cards-page tile / grid contexts
//   card-images/<season>/thumb/<file>.webp   <- 100w q82, small roster/lineup thumbnails

export const VARIANTS = [
  { name: "grid", width: 400, quality: 82 },
  { name: "thumb", width: 100, quality: 82 },
];

const R2_PUBLIC_HOST_PATTERN = /^https:\/\/[^/]+\/card-images\/(.+)$/;

export function parseObjectKeyFromUrl(imageUrl) {
  const match = String(imageUrl ?? "").match(R2_PUBLIC_HOST_PATTERN);
  if (!match) return null;
  return `card-images/${match[1]}`;
}

export function splitKey(objectKey) {
  // card-images/<season>/<filename>.<ext>
  const parts = objectKey.split("/");
  if (parts.length !== 3 || parts[0] !== "card-images") return null;

  const [, season, filename] = parts;
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return null;

  return {
    season,
    basename: filename.slice(0, dot),
    extension: filename.slice(dot + 1).toLowerCase(),
  };
}

export function variantKey(season, basename, variantName) {
  return `card-images/${season}/${variantName}/${basename}.webp`;
}

export function variantKeysForObjectKey(objectKey) {
  const parsed = splitKey(objectKey);
  if (!parsed) return null;

  const { season, basename } = parsed;
  return Object.fromEntries(
    VARIANTS.map((v) => [v.name, variantKey(season, basename, v.name)]),
  );
}

export async function generateVariantBuffer(originalBuffer, variantConfig) {
  return sharp(originalBuffer)
    .resize({ width: variantConfig.width })
    .webp({ quality: variantConfig.quality })
    .toBuffer();
}
