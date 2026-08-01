import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const STORAGE_BUCKET = "card-images";
const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const PAGE_SIZE = 1000;
const STORAGE_PAGE_SIZE = 1000;

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getSupabaseUrl() {
  return process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
}

function getSupabaseKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    ""
  );
}

function getSeason() {
  const season = String(process.argv[2] ?? "").trim();
  if (!/^\d{4}$/.test(season)) {
    throw new Error("A four-digit season is required. Example: npm run import:images -- 2025");
  }
  return Number(season);
}

function formatError(error) {
  if (error instanceof Error) return error.stack || error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function compactText(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function normalizeTeamCode(value) {
  return compactText(value).toUpperCase();
}

function editDistance(leftValue, rightValue) {
  const left = normalizeText(leftValue);
  const right = normalizeText(rightValue);
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(columns).fill(0));

  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let column = 0; column < columns; column += 1) matrix[0][column] = column;

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;

      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost,
      );

      if (
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        matrix[row][column] = Math.min(
          matrix[row][column],
          matrix[row - 2][column - 2] + 1,
        );
      }
    }
  }

  return matrix[left.length][right.length];
}

function nameSimilarity(leftValue, rightValue) {
  const left = normalizeText(leftValue);
  const right = normalizeText(rightValue);
  const longest = Math.max(left.length, right.length);

  if (longest === 0) return 1;
  return 1 - editDistance(left, right) / longest;
}

function splitVersionSuffix(playerName) {
  const match = String(playerName ?? "").trim().match(/^(.*?)(\d+)$/);

  if (!match) {
    return {
      playerName: String(playerName ?? "").trim(),
      version: "",
    };
  }

  return {
    playerName: match[1].trim(),
    version: match[2],
  };
}

function cardMatchesVersion(card, playerName, teamCode, year, version) {
  if (!version) return false;

  let residual = compactText(card.card_key);
  const partsToRemove = [
    compactText(playerName),
    String(year),
    normalizeTeamCode(teamCode).toLowerCase(),
  ];

  for (const part of partsToRemove) {
    const index = residual.indexOf(part);

    if (index >= 0) {
      residual = residual.slice(0, index) + residual.slice(index + part.length);
    }
  }

  return residual === version;
}

function chooseVersionedCard(candidates, playerName, teamCode, year, version) {
  if (!version) return null;

  const matches = candidates.filter((card) =>
    cardMatchesVersion(card, playerName, teamCode, year, version),
  );

  return matches.length === 1 ? matches[0] : null;
}

function getMimeType(filename) {
  switch (path.extname(filename).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    default: return "application/octet-stream";
  }
}

function sanitizeStorageFilename(filename) {
  const extension = path.extname(filename).toLowerCase();
  const basename = path.basename(filename, path.extname(filename));
  const safeBasename = basename
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");

  if (!safeBasename) throw new Error(`Could not create a safe filename for "${filename}".`);
  return `${safeBasename}${extension}`;
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveSeasonFolder(importRoot, season) {
  const root = path.resolve(importRoot);
  const nested = path.join(root, String(season));

  if (await exists(nested)) return nested;
  if (path.basename(root) === String(season) && (await exists(root))) return root;

  throw new Error(
    `Season folder not found. Expected "${nested}" or a root folder named "${season}".`,
  );
}

async function scanImages(folder) {
  const images = [];

  async function walk(currentFolder) {
    const entries = await fs.readdir(currentFolder, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      const absolutePath = path.join(currentFolder, entry.name);

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (
        entry.isFile() &&
        SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      ) {
        images.push({ absolutePath, filename: entry.name });
      }
    }
  }

  await walk(folder);

  return images.sort((a, b) =>
    a.filename.localeCompare(b.filename, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

async function fetchCards(supabase, season) {
  const rowsByKey = new Map();

  for (const [yearColumn, role] of [
    ["hitter_year", "hitter"],
    ["pitcher_year", "pitcher"],
  ]) {
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from("cards")
        .select(
          "card_key,player_name,hitter_year,hitter_team_code,pitcher_year,pitcher_team_code",
        )
        .eq(yearColumn, season)
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        throw new Error(`Could not load ${role} cards for ${season}: ${error.message}`);
      }

      for (const row of data ?? []) {
        if (!row.card_key) continue;
        rowsByKey.set(row.card_key, row);
      }

      if (!data || data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  return [...rowsByKey.values()];
}

function getCardTeamCodes(card, season) {
  const codes = new Set();

  if (Number(card.hitter_year) === season && card.hitter_team_code) {
    codes.add(normalizeTeamCode(card.hitter_team_code));
  }

  if (Number(card.pitcher_year) === season && card.pitcher_team_code) {
    codes.add(normalizeTeamCode(card.pitcher_team_code));
  }

  return [...codes];
}

function buildIndexes(cards, season) {
  const exact = new Map();
  const nameYear = new Map();
  const teamCodes = new Set();

  for (const card of cards) {
    const playerName = compactText(card.player_name);
    if (!card.card_key || !playerName) continue;

    const nameYearKey = `${playerName}|${season}`;
    if (!nameYear.has(nameYearKey)) nameYear.set(nameYearKey, []);
    nameYear.get(nameYearKey).push(card);

    for (const teamCode of getCardTeamCodes(card, season)) {
      teamCodes.add(teamCode);
      const exactKey = `${teamCode}|${playerName}|${season}`;
      if (!exact.has(exactKey)) exact.set(exactKey, []);
      exact.get(exactKey).push(card);
    }
  }

  const teamYear = new Map();

  for (const card of cards) {
    for (const teamCode of getCardTeamCodes(card, season)) {
      const key = `${teamCode}|${season}`;

      if (!teamYear.has(key)) teamYear.set(key, []);
      teamYear.get(key).push(card);
    }
  }

  const byCardKey = new Map();

  for (const card of cards) {
    if (card.card_key) {
      byCardKey.set(compactText(card.card_key), card);
    }
  }

  return {
    exact,
    nameYear,
    teamYear,
    byCardKey,
    teamCodes: [...teamCodes].sort((a, b) => b.length - a.length),
  };
}

function parseImageFilename(filename, season, knownTeamCodes) {
  const basename = path.basename(filename, path.extname(filename));
  const cleaned = basename
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[_-]+/g, " ")
    .replace(/[()[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = cleaned.split(" ").filter(Boolean);
  let year = season;

  const yearIndex = tokens.findIndex((token) => /^\d{4}$/.test(token));
  if (yearIndex >= 0) {
    year = Number(tokens[yearIndex]);
    tokens.splice(yearIndex, 1);
  }

  let teamCode = "";

  for (let index = 0; index < tokens.length; index += 1) {
    const candidate = normalizeTeamCode(tokens[index]);

    if (knownTeamCodes.includes(candidate)) {
      teamCode = candidate;
      tokens.splice(index, 1);
      break;
    }
  }

  const rawPlayerName = tokens.join(" ").trim();
  const versionedName = splitVersionSuffix(rawPlayerName);

  return {
    teamCode,
    rawPlayerName,
    playerName: versionedName.playerName,
    version: versionedName.version,
    year,
  };
}

function matchImage(filename, season, indexes) {
  const parsed = parseImageFilename(filename, season, indexes.teamCodes);

  if (parsed.teamCode && parsed.playerName) {
    const workbookTeamCode = parsed.version
      ? `${parsed.teamCode}${parsed.version}`
      : parsed.teamCode;

    const expectedCardKey = compactText(
      `${parsed.playerName} ${parsed.year} ${workbookTeamCode}`,
    );
    const directCard = indexes.byCardKey.get(expectedCardKey);

    if (directCard) {
      return {
        status: "matched",
        card: directCard,
        parsed,
        matchType: parsed.version ? "version" : "exact-card-key",
      };
    }
  }

  const normalizedName = compactText(parsed.playerName);

  if (parsed.teamCode && normalizedName) {
    const exactMatches =
      indexes.exact.get(
        `${parsed.teamCode}|${normalizedName}|${parsed.year}`,
      ) ?? [];

    if (exactMatches.length === 1 && !parsed.version) {
      return {
        status: "matched",
        card: exactMatches[0],
        parsed,
        matchType: "exact",
      };
    }

    if (exactMatches.length > 0 && parsed.version) {
      const versionedCard = chooseVersionedCard(
        exactMatches,
        parsed.playerName,
        parsed.teamCode,
        parsed.year,
        parsed.version,
      );

      if (versionedCard) {
        return {
          status: "matched",
          card: versionedCard,
          parsed,
          matchType: "version",
        };
      }
    }

    if (exactMatches.length === 1) {
      return {
        status: "matched",
        card: exactMatches[0],
        parsed,
        matchType: "exact",
      };
    }

    if (exactMatches.length > 1) {
      return {
        status: "ambiguous",
        parsed,
        candidates: exactMatches,
      };
    }
  }

  if (normalizedName) {
    const nameYearMatches =
      indexes.nameYear.get(`${normalizedName}|${parsed.year}`) ?? [];

    const sameTeamMatches = parsed.teamCode
      ? nameYearMatches.filter((card) =>
          getCardTeamCodes(card, season).includes(parsed.teamCode),
        )
      : nameYearMatches;

    if (sameTeamMatches.length === 1 && !parsed.version) {
      return {
        status: "matched",
        card: sameTeamMatches[0],
        parsed,
        matchType: "name-year",
      };
    }

    if (sameTeamMatches.length > 0 && parsed.version) {
      const versionedCard = chooseVersionedCard(
        sameTeamMatches,
        parsed.playerName,
        parsed.teamCode,
        parsed.year,
        parsed.version,
      );

      if (versionedCard) {
        return {
          status: "matched",
          card: versionedCard,
          parsed,
          matchType: "version",
        };
      }
    }

    if (sameTeamMatches.length > 1) {
      return {
        status: "ambiguous",
        parsed,
        candidates: sameTeamMatches,
      };
    }
  }

  if (parsed.teamCode && normalizedName) {
    const candidates =
      indexes.teamYear.get(`${parsed.teamCode}|${parsed.year}`) ?? [];

    const ranked = candidates
      .map((card) => ({
        card,
        similarity: nameSimilarity(parsed.playerName, card.player_name),
      }))
      .sort((left, right) => right.similarity - left.similarity);

    const best = ranked[0];
    const second = ranked[1];

    if (
      best &&
      best.similarity >= 0.82 &&
      (!second || best.similarity - second.similarity >= 0.06)
    ) {
      if (parsed.version) {
        const sameNameCandidates = ranked
          .filter((entry) => entry.similarity >= best.similarity - 0.02)
          .map((entry) => entry.card);

        const versionedCard = chooseVersionedCard(
          sameNameCandidates,
          best.card.player_name,
          parsed.teamCode,
          parsed.year,
          parsed.version,
        );

        if (versionedCard) {
          return {
            status: "matched",
            card: versionedCard,
            parsed,
            matchType: "corrected-version",
            similarity: best.similarity,
          };
        }
      } else {
        return {
          status: "matched",
          card: best.card,
          parsed,
          matchType: "corrected",
          similarity: best.similarity,
        };
      }
    }
  }

  return { status: "unmatched", parsed, candidates: [] };
}

async function listExistingStorageObjects(supabase, season) {
  const existing = new Set();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(String(season), {
        limit: STORAGE_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

    if (error) {
      throw new Error(
        `Could not list Storage folder ${STORAGE_BUCKET}/${season}: ${error.message}`,
      );
    }

    for (const item of data ?? []) {
      if (item.name && item.id) existing.add(`${season}/${item.name}`);
    }

    if (!data || data.length < STORAGE_PAGE_SIZE) break;
    offset += STORAGE_PAGE_SIZE;
  }

  return existing;
}

async function uploadIfMissing(
  supabase,
  image,
  season,
  storageFilename,
  existingObjects,
) {
  const storagePath = `${season}/${storageFilename}`;

  if (existingObjects.has(storagePath)) {
    return { storagePath, uploaded: false };
  }

  const fileBuffer = await fs.readFile(image.absolutePath);
  const maxAttempts = 5;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: getMimeType(image.filename),
        cacheControl: "31536000",
        upsert: false,
      });

    if (!error) {
      existingObjects.add(storagePath);
      return { storagePath, uploaded: true };
    }

    if (/already exists|duplicate/i.test(error.message ?? "")) {
      existingObjects.add(storagePath);
      return { storagePath, uploaded: false };
    }

    lastError = error;

    if (attempt < maxAttempts) {
      const delay = attempt * 1500;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error(
    `Storage upload failed after ${maxAttempts} attempts: ${
      lastError?.message ?? formatError(lastError)
    }`,
  );
}

function buildCardImageRecord({
  cardKey,
  publicUrl,
  storagePath,
  storageFilename,
  mimeType,
  season,
}) {
  const now = new Date().toISOString();

  return {
    card_key: cardKey,
    drive_file_id: `supabase-storage:${storagePath}`,
    drive_file_name: storageFilename,
    drive_folder_id: `supabase-storage:${season}`,
    drive_folder_name: String(season),
    image_url: publicUrl,
    thumbnail_url: publicUrl,
    mime_type: mimeType,
    is_primary: true,
    last_synced_at: now,
    source_year: season,
    source_name: "supabase-storage",
  };
}

async function saveCardImage(supabase, record) {
  const { data: existingRows, error: findError } = await supabase
    .from("card_images")
    .select("id")
    .eq("drive_file_id", record.drive_file_id)
    .order("id", { ascending: true })
    .limit(1);

  if (findError) {
    throw new Error(`card_images lookup failed: ${findError.message}`);
  }

  const existing = existingRows?.[0];

  if (existing) {
    const { error: updateError } = await supabase
      .from("card_images")
      .update(record)
      .eq("id", existing.id);

    if (updateError) {
      throw new Error(`card_images update failed: ${updateError.message}`);
    }

    return "updated";
  }

  const { error: insertError } = await supabase
    .from("card_images")
    .insert({
      ...record,
      first_synced_at: new Date().toISOString(),
    });

  if (insertError) {
    throw new Error(`card_images insert failed: ${insertError.message}`);
  }

  return "inserted";
}

async function main() {
  const season = getSeason();
  const importRoot = requireEnv("ELEMENTS_CARD_IMPORT_FOLDER");
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseKey();

  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL or VITE_SUPABASE_URL environment variable.");
  }

  if (!supabaseKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SECRET_KEY, or VITE_SUPABASE_ANON_KEY environment variable.",
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const folder = await resolveSeasonFolder(importRoot, season);
  const images = await scanImages(folder);
  const cards = await fetchCards(supabase, season);
  const indexes = buildIndexes(cards, season);
  const existingObjects = await listExistingStorageObjects(supabase, season);

  const summary = {
    scanned: images.length,
    matched: 0,
    uploaded: 0,
    skippedStorage: 0,
    upserted: 0,
    unmatched: 0,
    ambiguous: 0,
    corrected: 0,
    versioned: 0,
    failed: 0,
  };

  const unmatched = [];
  const ambiguous = [];
  const failed = [];

  console.log(`Season folder: ${folder}`);
  console.log(`Cards loaded: ${cards.length}`);
  console.log(`Images found: ${images.length}`);
  console.log("");

  for (const image of images) {
    const match = matchImage(image.filename, season, indexes);

    if (match.status === "unmatched") {
      summary.unmatched += 1;
      unmatched.push({ filename: image.filename, parsed: match.parsed });
      console.log(`[UNMATCHED] ${image.filename}`);
      continue;
    }

    if (match.status === "ambiguous") {
      summary.ambiguous += 1;
      ambiguous.push({
        filename: image.filename,
        parsed: match.parsed,
        candidates: match.candidates,
      });
      console.log(`[AMBIGUOUS] ${image.filename}`);
      continue;
    }

    summary.matched += 1;

    if (
      match.matchType === "corrected" ||
      match.matchType === "corrected-version"
    ) {
      summary.corrected += 1;
    }

    if (
      match.matchType === "version" ||
      match.matchType === "corrected-version"
    ) {
      summary.versioned += 1;
    }

    try {
      const storageFilename = sanitizeStorageFilename(image.filename);
      const uploadResult = await uploadIfMissing(
        supabase,
        image,
        season,
        storageFilename,
        existingObjects,
      );

      if (uploadResult.uploaded) summary.uploaded += 1;
      else summary.skippedStorage += 1;

      const {
        data: { publicUrl },
      } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(uploadResult.storagePath);

      const record = buildCardImageRecord({
        cardKey: match.card.card_key,
        publicUrl,
        storagePath: uploadResult.storagePath,
        storageFilename,
        mimeType: getMimeType(image.filename),
        season,
      });

      await saveCardImage(supabase, record);
      summary.upserted += 1;

      const label =
        match.matchType === "corrected" ||
        match.matchType === "corrected-version"
          ? "CORRECTED"
          : match.matchType === "version"
            ? "VERSION"
            : "OK";

      const versionLabel = match.parsed.version
        ? ` | version ${match.parsed.version}`
        : "";

      console.log(
        `[${label}] ${image.filename} -> ${match.card.card_key}${versionLabel}`,
      );
    } catch (error) {
      summary.failed += 1;
      const message = formatError(error);
      failed.push({ filename: image.filename, message });
      console.error(`[FAILED] ${image.filename}: ${message}`);
    }
  }

  console.log("");
  console.log("Summary");
  console.log("-------");
  console.log(`Season: ${season}`);
  console.log(`Folder: ${folder}`);
  console.log(`Images scanned: ${summary.scanned}`);
  console.log(`Cards matched: ${summary.matched}`);
  console.log(`Uploaded: ${summary.uploaded}`);
  console.log(`Already in Storage: ${summary.skippedStorage}`);
  console.log(`Database upserts: ${summary.upserted}`);
  console.log(`Unmatched: ${summary.unmatched}`);
  console.log(`Ambiguous: ${summary.ambiguous}`);
  console.log(`Auto-corrected names: ${summary.corrected}`);
  console.log(`Versioned cards matched: ${summary.versioned}`);
  console.log(`Failed: ${summary.failed}`);

  if (unmatched.length > 0) {
    console.log("");
    console.log("Unmatched images");
    console.log("----------------");

    for (const item of unmatched) {
      console.log(
        `${item.filename} -> raw="${item.parsed.rawPlayerName}", name="${item.parsed.playerName}", version="${item.parsed.version}", team="${item.parsed.teamCode}", year="${item.parsed.year}"`,
      );
    }
  }

  if (ambiguous.length > 0) {
    console.log("");
    console.log("Ambiguous images");
    console.log("----------------");

    for (const item of ambiguous) {
      console.log(
        `${item.filename} -> raw="${item.parsed.rawPlayerName}", name="${item.parsed.playerName}", version="${item.parsed.version}", team="${item.parsed.teamCode}", year="${item.parsed.year}"`,
      );

      for (const candidate of item.candidates) {
        console.log(
          `  - ${candidate.card_key} | ${candidate.player_name} | ${getCardTeamCodes(candidate, season).join("/")}`,
        );
      }
    }
  }

  if (failed.length > 0) {
    console.log("");
    console.log("Failed images");
    console.log("-------------");

    for (const item of failed) {
      console.log(`${item.filename}: ${item.message}`);
    }
  }

  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(formatError(error));
  process.exitCode = 1;
});