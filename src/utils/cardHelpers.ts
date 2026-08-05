import type {
  CardRow,
} from '../types/card'

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
