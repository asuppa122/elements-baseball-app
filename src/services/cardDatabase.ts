import { supabase } from '../lib/supabase'
import type {
  CardImageRow,
  CardRecord,
  CardRow,
} from '../types/card'
import { CARD_COLUMNS } from '../types/card'
import {
  normalizeImageUrl,
} from '../utils/cardHelpers'
import { ACTIVE_SEASON_CONFIG } from '../gameplay/seasonConfig'

const DATABASE_BATCH_SIZE = 1000
export const ACTIVE_SEASON = ACTIVE_SEASON_CONFIG.mlbYear

async function loadAllCardRows(): Promise<CardRow[]> {
  const rows: CardRow[] = []
  let startingRow = 0
  let moreRowsAvailable = true

  while (moreRowsAvailable) {
    const endingRow =
      startingRow + DATABASE_BATCH_SIZE - 1

    const { data, error } = await supabase
      .from('cards')
      .select(CARD_COLUMNS)
      .gte('hitter_points', 0)
      .order('card_key', {
        ascending: true,
      })
      .range(startingRow, endingRow)

    if (error) {
      throw error
    }

    const batch = (data ?? []) as CardRow[]
    rows.push(...batch)

    moreRowsAvailable =
      batch.length === DATABASE_BATCH_SIZE

    startingRow += DATABASE_BATCH_SIZE
  }

  return rows
}

async function loadAllCardImages(): Promise<CardImageRow[]> {
  const images: CardImageRow[] = []
  let startingRow = 0
  let moreRowsAvailable = true

  while (moreRowsAvailable) {
    const endingRow =
      startingRow + DATABASE_BATCH_SIZE - 1

    const { data, error } = await supabase
      .from('card_images')
      .select('card_key, image_url')
      .order('card_key', {
        ascending: true,
      })
      .range(startingRow, endingRow)

    if (error) {
      throw error
    }

    const batch =
      (data ?? []) as CardImageRow[]

    images.push(...batch)

    moreRowsAvailable =
      batch.length === DATABASE_BATCH_SIZE

    startingRow += DATABASE_BATCH_SIZE
  }

  return images
}

export async function loadSeasonCards(): Promise<CardRecord[]> {
  const [cards, images] = await Promise.all([
    loadAllCardRows(),
    loadAllCardImages(),
  ])

  const imageMap = new Map<string, string>()

  for (const image of images) {
    const normalizedUrl =
      normalizeImageUrl(image.image_url)

    if (image.card_key && normalizedUrl) {
      imageMap.set(image.card_key, normalizedUrl)
    }
  }

  return cards.map((card) => ({
    ...card,
    image_url:
      imageMap.get(card.card_key) ?? null,
  }))
}

export async function loadCardByKey(
  cardKey: string,
): Promise<CardRecord | null> {
  const { data: cardData, error: cardError } =
    await supabase
      .from('cards')
      .select(CARD_COLUMNS)
      .eq('card_key', cardKey)
      .limit(1)
      .maybeSingle()

  if (cardError) {
    throw cardError
  }

  if (!cardData) {
    return null
  }

  const { data: imageData, error: imageError } =
    await supabase
      .from('card_images')
      .select('card_key, image_url')
      .eq('card_key', cardKey)
      .limit(1)
      .maybeSingle()

  if (imageError) {
    console.error(
      'Card image loading error:',
      imageError,
    )
  }

  return {
    ...(cardData as CardRow),
    image_url: normalizeImageUrl(
      imageData?.image_url ?? null,
    ),
  }
}
