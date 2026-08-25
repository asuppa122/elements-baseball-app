import { supabase } from '../lib/supabase'
import { fetchAllPaginated } from '../lib/supabasePagination'
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

export const ACTIVE_SEASON = ACTIVE_SEASON_CONFIG.mlbYear

async function loadAllCardRows(): Promise<CardRow[]> {
  return fetchAllPaginated<CardRow>(
    (range) =>
      supabase
        .from('cards')
        .select(CARD_COLUMNS)
        .gte('hitter_points', 0)
        .order('card_key', { ascending: true })
        .range(range.from, range.to),
    () =>
      supabase
        .from('cards')
        .select('card_key', { count: 'exact', head: true })
        .gte('hitter_points', 0),
  )
}

async function loadAllCardImages(): Promise<CardImageRow[]> {
  return fetchAllPaginated<CardImageRow>(
    (range) =>
      supabase
        .from('card_images')
        .select('card_key, image_url')
        .order('card_key', { ascending: true })
        .range(range.from, range.to),
    () =>
      supabase
        .from('card_images')
        .select('card_key', { count: 'exact', head: true }),
  )
}

// In-memory cache for the lifetime of this tab/session -- navigating away
// from Team Builder and back re-mounts the component but does not re-fetch.
// Trade-off: any change to the underlying data (e.g. an ownership change
// from a trade) made elsewhere while this session is open won't be reflected
// until a hard reload. See IMAGE_PIPELINE.md-style note in the commit message
// for the one place this matters beyond minor staleness: the Select Player
// picker's eligibility filter reads `card.ownership` from this cached data.
let cachedSeasonCards: CardRecord[] | null = null
let cachedSeasonCardsPromise: Promise<CardRecord[]> | null = null

async function loadSeasonCardsUncached(): Promise<CardRecord[]> {
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

export async function loadSeasonCards(): Promise<CardRecord[]> {
  if (cachedSeasonCards) {
    return cachedSeasonCards
  }

  if (cachedSeasonCardsPromise) {
    return cachedSeasonCardsPromise
  }

  cachedSeasonCardsPromise = loadSeasonCardsUncached()
    .then((result) => {
      cachedSeasonCards = result
      cachedSeasonCardsPromise = null
      return result
    })
    .catch((error: unknown) => {
      // Don't cache a failure -- the next call should retry from scratch.
      cachedSeasonCardsPromise = null
      throw error
    })

  return cachedSeasonCardsPromise
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
