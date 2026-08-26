import type {
  CardRow,
} from '../types/card'
import { ACTIVE_SEASON_CONFIG } from '../gameplay/seasonConfig'

function getGoogleDriveFileId(
  url: string,
): string | null {
  try {
    const parsedUrl = new URL(url)

    const queryId =
      parsedUrl.searchParams.get('id')

    if (queryId) {
      return queryId
    }

    const filePathMatch =
      parsedUrl.pathname.match(
        /\/file\/d\/([^/]+)/,
      )

    if (filePathMatch?.[1]) {
      return filePathMatch[1]
    }

    const directPathMatch =
      parsedUrl.pathname.match(
        /\/d\/([^/=]+)/,
      )

    if (directPathMatch?.[1]) {
      return directPathMatch[1]
    }
  } catch {
    return null
  }

  return null
}

export function normalizeImageUrl(
  imageUrl: string | null,
): string | null {
  if (!imageUrl) {
    return null
  }

  const trimmedUrl =
    imageUrl.trim()

  if (!trimmedUrl) {
    return null
  }

  const correctedUrl =
    trimmedUrl.startsWith('s://')
      ? `http${trimmedUrl}`
      : trimmedUrl

  if (
    correctedUrl.includes(
      'drive.google.com',
    ) ||
    correctedUrl.includes(
      'googleusercontent.com',
    )
  ) {
    const fileId =
      getGoogleDriveFileId(
        correctedUrl,
      )

    if (fileId) {
      return `https://lh3.googleusercontent.com/d/${fileId}=w1200`
    }
  }

  return correctedUrl
}

export type CardImageSize = 'thumb' | 'grid' | 'original'

// Matches the R2 key convention in scripts/lib/imageVariants.mjs's
// variantKey() — duplicated here in logic (not import) since this is a Vite
// client bundle and that's a plain Node script with no shared build step:
//   card-images/<season>/<file>.<ext>        <- original
//   card-images/<season>/grid/<file>.webp    <- 400w q82
//   card-images/<season>/thumb/<file>.webp   <- 100w q82
const R2_CARD_IMAGE_PATTERN =
  /^(https:\/\/[^/]+\/card-images\/[^/]+\/)([^/]+)\.[a-zA-Z0-9]+$/

// Derives the URL for a resized/compressed variant of an already-normalized
// card image URL. Falls back to the original URL untouched when the size is
// 'original', or when the URL isn't in the expected R2 card-image shape (e.g.
// a Google Drive fallback URL from normalizeImageUrl) — there's no variant to
// derive in that case, so the caller gets back exactly what it passed in.
export function getCardImageUrl(
  normalizedUrl: string | null,
  size: CardImageSize,
): string | null {
  if (!normalizedUrl || size === 'original') {
    return normalizedUrl
  }

  const match = normalizedUrl.match(R2_CARD_IMAGE_PATTERN)

  if (!match) {
    return normalizedUrl
  }

  const [, prefix, basename] = match

  return `${prefix}${size}/${basename}.webp`
}

// Attach to an <img>'s onError when its src came from getCardImageUrl() with
// a 'thumb'/'grid' size. If the resized variant fails to load (missing,
// generation failure, not yet synced), falls back once to the original
// full-size image and returns true (caller should wait for that image's own
// load/error rather than treating this as final). If the original also fails
// (e.g. one of the handful of rows with no source image in R2 at all) — or
// there was no original to fall back to — does nothing further and returns
// false, so the caller can run its own "no image" placeholder logic exactly
// as it did before this fallback existed.
export function handleCardImageLoadError(
  img: HTMLImageElement,
  originalUrl: string | null,
): boolean {
  if (img.dataset.cardImageFallbackApplied === 'true') {
    return false
  }

  img.dataset.cardImageFallbackApplied = 'true'

  if (originalUrl && img.src !== originalUrl) {
    img.src = originalUrl
    return true
  }

  return false
}

export function cleanSearchTerm(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/[,%().'-]/g, ' ')
    .replace(/\s+/g, ' ')
}

function normalizeManagerName(
  managerName: string,
): string {
  return managerName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function getCardOwners(
  ownership: string | null,
): string[] {
  if (!ownership) {
    return []
  }

  return ownership
    .split('+')
    .map((managerName) =>
      managerName.trim(),
    )
    .filter(Boolean)
}

export function isCardOwnedByManager(
  ownership: string | null,
  managerName: string,
): boolean {
  const normalizedManagerName =
    normalizeManagerName(
      managerName,
    )

  return getCardOwners(
    ownership,
  ).some(
    (ownerName) =>
      normalizeManagerName(
        ownerName,
      ) === normalizedManagerName,
  )
}

export function getCardYear(
  card: CardRow,
): number | null {
  return (
    card.hitter_year ??
    card.pitcher_year
  )
}

// Was independently duplicated (identical implementation) in
// rosterSnapshot.ts and RosterPage.tsx -- consolidated here (health-audit
// finding 3.3).
export function getCardPoints(
  card: CardRow,
): number {
  return card.hitter_points ?? 0
}


const CURRENT_ELEMENTS_SEASON_YEAR = ACTIVE_SEASON_CONFIG.mlbYear

const ELEMENTS_MANAGER_NAMES = new Set([
  'anthony',
  'ben',
  'chuck',
  'eric',
  'james',
  'jeremiah',
  'john',
  'matt',
  'nate',
  'ryan',
  'will',
  'zeek',
])

export function isSeasonEligibleCard(
  card: CardRow,
): boolean {
  if (getCardYear(card) === CURRENT_ELEMENTS_SEASON_YEAR) {
    return true
  }

  const sourceValue = String(card.source_yes_field ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

  if (sourceValue === 'yes') {
    return true
  }

  return ELEMENTS_MANAGER_NAMES.has(sourceValue)
}

export function isSeasonEligibleCardForManager(
  card: CardRow,
  managerName: string,
): boolean {
  if (getCardYear(card) === CURRENT_ELEMENTS_SEASON_YEAR) {
    return true
  }

  const sourceValue = String(card.source_yes_field ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

  if (sourceValue === 'yes') {
    return true
  }

  const normalizedManager = normalizeManagerName(managerName)
  return Boolean(normalizedManager) && sourceValue === normalizedManager
}

export function getCardTeamCode(
  card: CardRow,
): string | null {
  return (
    card.hitter_team_code ??
    card.pitcher_team_code
  )
}

export function getCardPositions(
  card: CardRow,
): string[] {
  const positions: string[] = []

  if (card.defense_c !== null) {
    positions.push('C')
  }

  if (card.defense_1b !== null) {
    positions.push('1B')
  }

  if (card.defense_2b !== null) {
    positions.push('2B')
  }

  if (card.defense_3b !== null) {
    positions.push('3B')
  }

  if (card.defense_ss !== null) {
    positions.push('SS')
  }

  if (card.defense_lf !== null) {
    positions.push('LF')
  }

  if (card.defense_cf !== null) {
    positions.push('CF')
  }

  if (card.defense_rf !== null) {
    positions.push('RF')
  }

  return positions
}
