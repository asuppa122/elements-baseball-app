import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import CardGrid from '../components/CardGrid'
import FilterDrawer from '../components/FilterDrawer'
import type {
  AttributeCondition,
  AttributeFilter,
  AttributeOperator,
  DefensePosition,
  OwnershipFilter,
  SortDirection,
  SortField,
} from '../components/FilterDrawer'
import { supabase } from '../lib/supabase'
import type {
  CardImageRow,
  CardRecord,
  CardRow,
} from '../types/card'
import {
  CARD_COLUMNS,
} from '../types/card'
import {
  cleanSearchTerm,
  CURRENT_MANAGER,
  normalizeImageUrl,
} from '../utils/cardHelpers'

const PAGE_SIZE = 100
const DATABASE_BATCH_SIZE = 1000

const FILTER_STORAGE_KEY =
  'elements-card-database-filters'

type SavedFilterState = {
  searchTerm: string
  yearFilter: string
  teamFilter: string
  leagueFilter: string
  positionFilter: string
  ownershipFilter: OwnershipFilter
  batsFilter: string
  throwsFilter: string
  attributeConditions: AttributeCondition[]
  defensePosition: DefensePosition
  defenseRating: string
  sortField: SortField
  sortDirection: SortDirection
  visibleCardCount: number
}

function loadSavedFilterState(): Partial<SavedFilterState> {
  try {
    const savedValue =
      window.sessionStorage.getItem(
        FILTER_STORAGE_KEY,
      )

    if (!savedValue) {
      return {}
    }

    return JSON.parse(
      savedValue,
    ) as Partial<SavedFilterState>
  } catch {
    return {}
  }
}

const DEFENSE_COLUMNS: Record<
  Exclude<DefensePosition, ''>,
  keyof CardRow
> = {
  c: 'defense_c',
  '1b': 'defense_1b',
  '2b': 'defense_2b',
  '3b': 'defense_3b',
  ss: 'defense_ss',
  lf: 'defense_lf',
  cf: 'defense_cf',
  rf: 'defense_rf',
}

const POSITION_COLUMNS: Record<
  string,
  keyof CardRow
> = {
  c: 'defense_c',
  '1b': 'defense_1b',
  '2b': 'defense_2b',
  '3b': 'defense_3b',
  ss: 'defense_ss',
  lf: 'defense_lf',
  cf: 'defense_cf',
  rf: 'defense_rf',
}

const DEFENSE_COLUMN_LIST: Array<
  keyof CardRow
> = [
  'defense_c',
  'defense_1b',
  'defense_2b',
  'defense_3b',
  'defense_ss',
  'defense_lf',
  'defense_cf',
  'defense_rf',
]

type ChartRange = {
  start: number
  end: number
  rating: number
}

function createInitialAttributeCondition(): AttributeCondition {
  return {
    id: `attribute-${Date.now()}-${Math.random()}`,
    attribute: '',
    operator: 'eq',
    value: '',
  }
}

function parseChartRange(
  value: string | null,
): ChartRange | null {
  if (!value) {
    return null
  }

  const normalizedValue =
    value.trim()

  if (!normalizedValue) {
    return null
  }

  const rangeMatch =
    normalizedValue.match(
      /^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/,
    )

  if (rangeMatch) {
    const start = Number(
      rangeMatch[1],
    )
    const end = Number(
      rangeMatch[2],
    )

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end)
    ) {
      return null
    }

    return {
      start,
      end,
      rating:
        Math.abs(end - start) + 1,
    }
  }

  const singleNumber =
    Number(normalizedValue)

  if (
    !Number.isFinite(singleNumber)
  ) {
    return null
  }

  return {
    start: singleNumber,
    end: singleNumber,
    rating: 1,
  }
}

function compareNumbers(
  actualValue: number,
  targetValue: number,
  operator: AttributeOperator,
) {
  switch (operator) {
    case 'neq':
      return actualValue !== targetValue
    case 'lt':
      return actualValue < targetValue
    case 'lte':
      return actualValue <= targetValue
    case 'gt':
      return actualValue > targetValue
    case 'gte':
      return actualValue >= targetValue
    case 'eq':
    default:
      return actualValue === targetValue
  }
}

function matchesNumericValues(
  values: Array<number | null>,
  targetValue: number,
  operator: AttributeOperator,
) {
  const populatedValues =
    values.filter(
      (
        value,
      ): value is number =>
        value !== null &&
        Number.isFinite(value),
    )

  if (
    populatedValues.length === 0
  ) {
    return false
  }

  return populatedValues.some(
    (value) =>
      compareNumbers(
        value,
        targetValue,
        operator,
      ),
  )
}

function matchesChartValues(
  values: Array<string | null>,
  targetValue: number,
  operator: AttributeOperator,
) {
  const parsedRanges =
    values
      .map(parseChartRange)
      .filter(
        (
          range,
        ): range is ChartRange =>
          range !== null,
      )

  if (
    operator === 'includes'
  ) {
    return parsedRanges.some(
      (range) =>
        targetValue >= range.start &&
        targetValue <= range.end,
    )
  }

  if (
    operator === 'starts_at'
  ) {
    return parsedRanges.some(
      (range) =>
        range.start === targetValue,
    )
  }

  if (
    operator === 'ends_at'
  ) {
    return parsedRanges.some(
      (range) =>
        range.end === targetValue,
    )
  }

  const ratings =
    parsedRanges.length > 0
      ? parsedRanges.map(
          (range) => range.rating,
        )
      : [0]

  return ratings.some(
    (rating) =>
      compareNumbers(
        rating,
        targetValue,
        operator,
      ),
  )
}

function matchesPosition(
  card: CardRecord,
  positionFilter: string,
) {
  if (!positionFilter) {
    return true
  }

  const positionColumn =
    POSITION_COLUMNS[
      positionFilter
    ]

  if (positionColumn) {
    return (
      card[positionColumn] !== null
    )
  }

  const defensePositionCount =
    DEFENSE_COLUMN_LIST.filter(
      (column) =>
        card[column] !== null,
    ).length

  if (
    positionFilter === 'multi'
  ) {
    return (
      defensePositionCount > 1
    )
  }

  if (
    positionFilter === 'dh'
  ) {
    return (
      defensePositionCount === 0 &&
      card.pitcher_control === null
    )
  }

  if (
    positionFilter === 'p'
  ) {
    return (
      card.pitcher_control !== null ||
      card.pitcher_year !== null
    )
  }

  return true
}

function matchesAttribute(
  card: CardRecord,
  attributeFilter: AttributeFilter,
  attributeOperator: AttributeOperator,
  attributeValue: string,
) {
  if (
    !attributeFilter ||
    attributeValue === ''
  ) {
    return true
  }

  const numericValue =
    Number(attributeValue)

  if (
    !Number.isFinite(numericValue)
  ) {
    return true
  }

  switch (attributeFilter) {
    case 'points':
      return matchesNumericValues(
        [card.hitter_points],
        numericValue,
        attributeOperator,
      )

    case 'hitter_fatigue':
      return matchesNumericValues(
        [card.hitter_fatigue],
        numericValue,
        attributeOperator,
      )

    case 'hitter_on_base':
      return matchesNumericValues(
        [card.hitter_on_base],
        numericValue,
        attributeOperator,
      )

    case 'hitter_baserunning':
      return matchesNumericValues(
        [card.hitter_baserunning],
        numericValue,
        attributeOperator,
      )

    case 'hitter_stolen_base':
      return matchesNumericValues(
        [card.hitter_stolen_base],
        numericValue,
        attributeOperator,
      )

    case 'pitcher_fatigue':
      return matchesNumericValues(
        [card.pitcher_fatigue],
        numericValue,
        attributeOperator,
      )

    case 'pitcher_control':
      return matchesNumericValues(
        [card.pitcher_control],
        numericValue,
        attributeOperator,
      )

    case 'outs':
      return matchesNumericValues(
        [
          card.hitter_outs,
          card.pitcher_outs,
        ],
        numericValue,
        attributeOperator,
      )

    case 'pitcher_ip':
      return matchesNumericValues(
        [card.pitcher_ip],
        numericValue,
        attributeOperator,
      )

    case 'k':
      return matchesChartValues(
        [
          card.hitter_k,
          card.pitcher_k,
        ],
        numericValue,
        attributeOperator,
      )

    case 'gb':
      return matchesChartValues(
        [
          card.hitter_gb,
          card.pitcher_gb,
        ],
        numericValue,
        attributeOperator,
      )

    case 'fb':
      return matchesChartValues(
        [
          card.hitter_fb,
          card.pitcher_fb,
        ],
        numericValue,
        attributeOperator,
      )

    case 'bb':
      return matchesChartValues(
        [
          card.hitter_bb,
          card.pitcher_bb,
        ],
        numericValue,
        attributeOperator,
      )

    case '1b':
      return matchesChartValues(
        [
          card.hitter_1b,
          card.pitcher_1b,
        ],
        numericValue,
        attributeOperator,
      )

    case '1b_plus':
      return matchesChartValues(
        [card.hitter_1b_plus],
        numericValue,
        attributeOperator,
      )

    case '2b':
      return matchesChartValues(
        [
          card.hitter_2b,
          card.pitcher_2b,
        ],
        numericValue,
        attributeOperator,
      )

    case '3b':
      return matchesChartValues(
        [
          card.hitter_3b,
          card.pitcher_3b,
        ],
        numericValue,
        attributeOperator,
      )

    case 'hr':
      return matchesChartValues(
        [
          card.hitter_hr,
          card.pitcher_hr,
        ],
        numericValue,
        attributeOperator,
      )

    default:
      return true
  }
}

function getChartRating(
  values: Array<string | null>,
): number | null {
  const ratings = values
    .map(parseChartRange)
    .filter(
      (
        range,
      ): range is ChartRange =>
        range !== null,
    )
    .map((range) => range.rating)

  if (ratings.length === 0) {
    return null
  }

  return Math.max(...ratings)
}

function getSortValue(
  card: CardRecord,
  sortField: SortField,
  defensePosition: DefensePosition,
): number | string | null {
  switch (sortField) {
    case 'player_name':
      return card.player_name.toLowerCase()
    case 'team':
      return (
        card.hitter_team_code ??
        card.pitcher_team_code ??
        card.team_name ??
        ''
      ).toLowerCase()
    case 'year':
      return (
        card.hitter_year ??
        card.pitcher_year
      )
    case 'points':
      return card.hitter_points
    case 'hitter_fatigue':
      return card.hitter_fatigue
    case 'hitter_on_base':
      return card.hitter_on_base
    case 'hitter_outs':
      return card.hitter_outs
    case 'hitter_baserunning':
      return card.hitter_baserunning
    case 'hitter_stolen_base':
      return card.hitter_stolen_base
    case 'pitcher_fatigue':
      return card.pitcher_fatigue
    case 'pitcher_control':
      return card.pitcher_control
    case 'pitcher_outs':
      return card.pitcher_outs
    case 'pitcher_ip':
      return card.pitcher_ip
    case 'k':
      return getChartRating([
        card.hitter_k,
        card.pitcher_k,
      ])
    case 'gb':
      return getChartRating([
        card.hitter_gb,
        card.pitcher_gb,
      ])
    case 'fb':
      return getChartRating([
        card.hitter_fb,
        card.pitcher_fb,
      ])
    case 'bb':
      return getChartRating([
        card.hitter_bb,
        card.pitcher_bb,
      ])
    case '1b':
      return getChartRating([
        card.hitter_1b,
        card.pitcher_1b,
      ])
    case '1b_plus':
      return getChartRating([
        card.hitter_1b_plus,
      ])
    case '2b':
      return getChartRating([
        card.hitter_2b,
        card.pitcher_2b,
      ])
    case '3b':
      return getChartRating([
        card.hitter_3b,
        card.pitcher_3b,
      ])
    case 'hr':
      return getChartRating([
        card.hitter_hr,
        card.pitcher_hr,
      ])
    case 'defense': {
      if (!defensePosition) {
        return null
      }

      return card[
        DEFENSE_COLUMNS[
          defensePosition
        ]
      ] as number | null
    }
    case 'card_number':
    default:
      return (
        card.all_number ??
        card.card_number
      )
  }
}

function compareSortValues(
  leftValue: number | string | null,
  rightValue: number | string | null,
  direction: SortDirection,
): number {
  if (
    leftValue === null &&
    rightValue === null
  ) {
    return 0
  }

  if (leftValue === null) {
    return 1
  }

  if (rightValue === null) {
    return -1
  }

  const multiplier =
    direction === 'asc' ? 1 : -1

  if (
    typeof leftValue === 'string' &&
    typeof rightValue === 'string'
  ) {
    return (
      leftValue.localeCompare(
        rightValue,
        undefined,
        {
          numeric: true,
          sensitivity: 'base',
        },
      ) * multiplier
    )
  }

  return (
    (Number(leftValue) -
      Number(rightValue)) *
    multiplier
  )
}

function isSeasonEligible(
  card: CardRecord,
): boolean {
  return (
    String(
      card.source_yes_field ?? '',
    )
      .trim()
      .toLowerCase() === 'yes'
  )
}

function CardsPage() {
  const navigate = useNavigate()
  const [savedFilters] = useState(
    loadSavedFilterState,
  )

  const [
    allCards,
    setAllCards,
  ] = useState<CardRecord[]>([])

  const [
    cardImages,
    setCardImages,
  ] = useState<CardImageRow[]>([])

  const [
    visibleCardCount,
    setVisibleCardCount,
  ] = useState(
    savedFilters.visibleCardCount ??
      PAGE_SIZE,
  )

  const [
    isLoading,
    setIsLoading,
  ] = useState(true)

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('')

  const [
    searchTerm,
    setSearchTerm,
  ] = useState(
    savedFilters.searchTerm ?? '',
  )

  const [
    debouncedSearchTerm,
    setDebouncedSearchTerm,
  ] = useState(
    savedFilters.searchTerm ?? '',
  )

  const [
    yearFilter,
    setYearFilter,
  ] = useState(
    savedFilters.yearFilter ?? '',
  )

  const [
    teamFilter,
    setTeamFilter,
  ] = useState(
    savedFilters.teamFilter ?? '',
  )

  const [
    debouncedTeamFilter,
    setDebouncedTeamFilter,
  ] = useState(
    savedFilters.teamFilter ?? '',
  )

  const [
    leagueFilter,
    setLeagueFilter,
  ] = useState(
    savedFilters.leagueFilter ?? '',
  )

  const [
    positionFilter,
    setPositionFilter,
  ] = useState(
    savedFilters.positionFilter ?? '',
  )

  const [
    ownershipFilter,
    setOwnershipFilter,
  ] =
    useState<OwnershipFilter>(
      savedFilters.ownershipFilter ??
        '',
    )

  const [
    batsFilter,
    setBatsFilter,
  ] = useState(
    savedFilters.batsFilter ?? '',
  )

  const [
    throwsFilter,
    setThrowsFilter,
  ] = useState(
    savedFilters.throwsFilter ?? '',
  )

  const [
    attributeConditions,
    setAttributeConditions,
  ] = useState<AttributeCondition[]>(
    savedFilters.attributeConditions
      ?.length
      ? savedFilters.attributeConditions
      : [
          createInitialAttributeCondition(),
        ],
  )

  const [
    defensePosition,
    setDefensePosition,
  ] =
    useState<DefensePosition>(
      savedFilters.defensePosition ??
        '',
    )

  const [
    defenseRating,
    setDefenseRating,
  ] = useState(
    savedFilters.defenseRating ?? '',
  )

  const [
    sortField,
    setSortField,
  ] =
    useState<SortField>(
      savedFilters.sortField ??
        'points',
    )

  const [
    sortDirection,
    setSortDirection,
  ] =
    useState<SortDirection>(
      savedFilters.sortDirection ??
        'desc',
    )


  useEffect(() => {
    const filterState:
      SavedFilterState = {
        searchTerm,
        yearFilter,
        teamFilter,
        leagueFilter,
        positionFilter,
        ownershipFilter,
        batsFilter,
        throwsFilter,
        attributeConditions,
        defensePosition,
        defenseRating,
        sortField,
        sortDirection,
        visibleCardCount,
      }

    window.sessionStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify(filterState),
    )
  }, [
    attributeConditions,
    batsFilter,
    defensePosition,
    defenseRating,
    leagueFilter,
    ownershipFilter,
    positionFilter,
    searchTerm,
    sortDirection,
    sortField,
    teamFilter,
    throwsFilter,
    visibleCardCount,
    yearFilter,
  ])

  const imageMap = useMemo(() => {
    const map =
      new Map<string, string>()

    for (const image of cardImages) {
      const normalizedUrl =
        normalizeImageUrl(
          image.image_url,
        )

      if (
        image.card_key &&
        normalizedUrl
      ) {
        map.set(
          image.card_key,
          normalizedUrl,
        )
      }
    }

    return map
  }, [cardImages])

  useEffect(() => {
    const timeoutId =
      window.setTimeout(() => {
        setDebouncedSearchTerm(
          searchTerm,
        )
      }, 300)

    return () => {
      window.clearTimeout(
        timeoutId,
      )
    }
  }, [searchTerm])

  useEffect(() => {
    const timeoutId =
      window.setTimeout(() => {
        setDebouncedTeamFilter(
          teamFilter,
        )
      }, 300)

    return () => {
      window.clearTimeout(
        timeoutId,
      )
    }
  }, [teamFilter])

  useEffect(() => {
    async function loadDatabase() {
      setIsLoading(true)
      setErrorMessage('')

      try {
        const loadedImages:
          CardImageRow[] = []

        let imageStartingRow = 0
        let moreImagesAvailable =
          true

        while (
          moreImagesAvailable
        ) {
          const imageEndingRow =
            imageStartingRow +
            DATABASE_BATCH_SIZE -
            1

          const {
            data: imageData,
            error: imageError,
          } = await supabase
            .from('card_images')
            .select(
              'card_key, image_url',
            )
            .order('card_key', {
              ascending: true,
            })
            .range(
              imageStartingRow,
              imageEndingRow,
            )

          if (imageError) {
            throw imageError
          }

          const imageBatch =
            (imageData ??
              []) as CardImageRow[]

          loadedImages.push(
            ...imageBatch,
          )

          moreImagesAvailable =
            imageBatch.length ===
            DATABASE_BATCH_SIZE

          imageStartingRow +=
            DATABASE_BATCH_SIZE
        }

        setCardImages(
          loadedImages,
        )

        const loadedCards:
          CardRow[] = []

        let startingRow = 0
        let moreCardsAvailable =
          true

        while (
          moreCardsAvailable
        ) {
          const endingRow =
            startingRow +
            DATABASE_BATCH_SIZE -
            1

          const {
            data,
            error,
          } = await supabase
            .from('cards')
            .select(CARD_COLUMNS)
            .gte(
              'hitter_points',
              0,
            )
            .order('hitter_points', {
              ascending: false,
              nullsFirst: false,
            })
            .order('all_number', {
              ascending: true,
              nullsFirst: false,
            })
            .range(
              startingRow,
              endingRow,
            )

          if (error) {
            throw error
          }

          const batch =
            (data ??
              []) as CardRow[]

          loadedCards.push(
            ...batch,
          )

          moreCardsAvailable =
            batch.length ===
            DATABASE_BATCH_SIZE

          startingRow +=
            DATABASE_BATCH_SIZE
        }

        const loadedImageMap =
          new Map<string, string>()

        for (
          const image of
          loadedImages
        ) {
          const normalizedUrl =
            normalizeImageUrl(
              image.image_url,
            )

          if (
            image.card_key &&
            normalizedUrl
          ) {
            loadedImageMap.set(
              image.card_key,
              normalizedUrl,
            )
          }
        }

        setAllCards(
          loadedCards.map(
            (card) => ({
              ...card,
              image_url:
                loadedImageMap.get(
                  card.card_key,
                ) ?? null,
            }),
          ),
        )
      } catch (error) {
        console.error(
          'Card database loading error:',
          error,
        )

        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'The card database could not be loaded.',
        )

        setAllCards([])
      } finally {
        setIsLoading(false)
      }
    }

    void loadDatabase()
  }, [])

  useEffect(() => {
    if (
      allCards.length === 0 ||
      imageMap.size === 0
    ) {
      return
    }

    setAllCards(
      (currentCards) =>
        currentCards.map(
          (card) => ({
            ...card,
            image_url:
              imageMap.get(
                card.card_key,
              ) ??
              card.image_url ??
              null,
          }),
        ),
    )
  }, [imageMap])

  const yearOptions =
    useMemo(() => {
      return Array.from(
        new Set(
          allCards
            .flatMap((card) => [
              card.hitter_year,
              card.pitcher_year,
            ])
            .filter(
              (
                year,
              ): year is number =>
                year !== null,
            ),
        ),
      ).sort(
        (left, right) =>
          right - left,
      )
    }, [allCards])

  const leagueOptions =
    useMemo(() => {
      return Array.from(
        new Set(
          allCards
            .map((card) =>
              card.league?.trim(),
            )
            .filter(
              (
                league,
              ): league is string =>
                Boolean(league),
            ),
        ),
      ).sort((left, right) =>
        left.localeCompare(right),
      )
    }, [allCards])

  const filteredCards =
    useMemo(() => {
      const normalizedSearch =
        cleanSearchTerm(
          debouncedSearchTerm,
        ).toLowerCase()

      const normalizedTeam =
        cleanSearchTerm(
          debouncedTeamFilter,
        ).toLowerCase()

      const numericYear =
        Number(yearFilter)

      const numericDefenseRating =
        Number(defenseRating)

      const completedAttributeConditions =
        attributeConditions.filter(
          (condition) =>
            condition.attribute &&
            condition.value !== '',
        )

      const matchingCards =
        allCards.filter((card) => {
          if (normalizedSearch) {
            const searchableValues = [
              card.player_name,
              card.team_name,
              card.league,
              card.hitter_team_code,
              card.pitcher_team_code,
              card.card_key,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()

            if (
              !searchableValues.includes(
                normalizedSearch,
              )
            ) {
              return false
            }
          }

          if (
            yearFilter &&
            Number.isFinite(
              numericYear,
            ) &&
            card.hitter_year !==
              numericYear &&
            card.pitcher_year !==
              numericYear
          ) {
            return false
          }

          if (normalizedTeam) {
            const teamValues = [
              card.team_name,
              card.hitter_team_code,
              card.pitcher_team_code,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()

            if (
              !teamValues.includes(
                normalizedTeam,
              )
            ) {
              return false
            }
          }

          if (
            leagueFilter &&
            card.league !==
              leagueFilter
          ) {
            return false
          }

          if (
            !matchesPosition(
              card,
              positionFilter,
            )
          ) {
            return false
          }

          const ownedByManager =
            (card.ownership ?? '')
              .split('+')
              .map((owner) =>
                owner.trim(),
              )
              .some(
                (owner) =>
                  owner.toLowerCase() ===
                  CURRENT_MANAGER.toLowerCase(),
              )

          const eligible =
            isSeasonEligible(card)

          if (
            ownershipFilter ===
              'owned-eligible' &&
            (!ownedByManager ||
              !eligible)
          ) {
            return false
          }

          if (
            ownershipFilter ===
              'owned-ineligible' &&
            (!ownedByManager ||
              eligible)
          ) {
            return false
          }

          if (
            ownershipFilter ===
              'not-collected' &&
            ownedByManager
          ) {
            return false
          }

          if (
            batsFilter &&
            card.hitter_bats !==
              batsFilter
          ) {
            return false
          }

          if (
            throwsFilter &&
            card.pitcher_arm !==
              throwsFilter
          ) {
            return false
          }

          const matchesEveryAttribute =
            completedAttributeConditions.every(
              (condition) =>
                matchesAttribute(
                  card,
                  condition.attribute,
                  condition.operator,
                  condition.value,
                ),
            )

          if (
            !matchesEveryAttribute
          ) {
            return false
          }

          if (
            defensePosition &&
            defenseRating !== '' &&
            Number.isFinite(
              numericDefenseRating,
            )
          ) {
            const defenseColumn =
              DEFENSE_COLUMNS[
                defensePosition
              ]

            if (
              card[
                defenseColumn
              ] !==
              numericDefenseRating
            ) {
              return false
            }
          }

          return true
        })

      return [...matchingCards].sort(
        (leftCard, rightCard) => {
          const primaryComparison =
            compareSortValues(
              getSortValue(
                leftCard,
                sortField,
                defensePosition,
              ),
              getSortValue(
                rightCard,
                sortField,
                defensePosition,
              ),
              sortDirection,
            )

          if (primaryComparison !== 0) {
            return primaryComparison
          }

          return (
            (leftCard.all_number ??
              Number.MAX_SAFE_INTEGER) -
            (rightCard.all_number ??
              Number.MAX_SAFE_INTEGER)
          )
        },
      )
    }, [
      allCards,
      attributeConditions,
      batsFilter,
      debouncedSearchTerm,
      debouncedTeamFilter,
      defensePosition,
      defenseRating,
      leagueFilter,
      ownershipFilter,
      positionFilter,
      sortDirection,
      sortField,
      throwsFilter,
      yearFilter,
    ])

  useEffect(() => {
    setVisibleCardCount(
      PAGE_SIZE,
    )
  }, [
    attributeConditions,
    batsFilter,
    debouncedSearchTerm,
    debouncedTeamFilter,
    defensePosition,
    defenseRating,
    leagueFilter,
    ownershipFilter,
    positionFilter,
    sortDirection,
    sortField,
    throwsFilter,
    yearFilter,
  ])

  const visibleCards =
    useMemo(() => {
      return filteredCards.slice(
        0,
        visibleCardCount,
      )
    }, [
      filteredCards,
      visibleCardCount,
    ])

  const clearFilters = () => {
    setSearchTerm('')
    setDebouncedSearchTerm('')
    setYearFilter('')
    setTeamFilter('')
    setDebouncedTeamFilter('')
    setLeagueFilter('')
    setPositionFilter('')
    setOwnershipFilter('')
    setBatsFilter('')
    setThrowsFilter('')
    setAttributeConditions([
      createInitialAttributeCondition(),
    ])
    setDefensePosition('')
    setDefenseRating('')
    setSortField('points')
    setSortDirection('desc')
    setVisibleCardCount(
      PAGE_SIZE,
    )
  }

  const hasMoreCards =
    visibleCards.length <
    filteredCards.length

  return (
    <div className="app">
      <header className="topbar">
        <button
          type="button"
          className="back-button"
          onClick={() =>
            navigate('/')
          }
        >
          <span aria-hidden="true">
            ←
          </span>

          <span>Home</span>
        </button>

        <div className="page-heading">
          <p className="eyebrow">
            Elements Baseball
          </p>

          <h1>
            Card Database
          </h1>

          <p className="page-description">
            Browse every published
            Elements card.
          </p>
        </div>

        <div
          className="header-spacer"
          aria-hidden="true"
        />
      </header>

      <main className="cards-page">
        <section className="gallery-heading">
          <div>
            <p className="section-label">
              Published Cards
            </p>

            <h2>
              Find every published player,
              team, and season.
            </h2>
          </div>

          <div className="record-badge">
            {isLoading
              ? 'Loading cards'
              : `${visibleCards.length.toLocaleString()} of ${filteredCards.length.toLocaleString()}`}
          </div>
        </section>

        <FilterDrawer
          searchTerm={searchTerm}
          onSearchChange={
            setSearchTerm
          }
          yearFilter={yearFilter}
          onYearFilterChange={
            setYearFilter
          }
          yearOptions={yearOptions}
          teamFilter={teamFilter}
          onTeamFilterChange={
            setTeamFilter
          }
          leagueFilter={leagueFilter}
          onLeagueFilterChange={
            setLeagueFilter
          }
          leagueOptions={leagueOptions}
          positionFilter={
            positionFilter
          }
          onPositionFilterChange={
            setPositionFilter
          }
          ownershipFilter={
            ownershipFilter
          }
          onOwnershipFilterChange={
            setOwnershipFilter
          }
          batsFilter={batsFilter}
          onBatsFilterChange={
            setBatsFilter
          }
          throwsFilter={
            throwsFilter
          }
          onThrowsFilterChange={
            setThrowsFilter
          }
          attributeConditions={
            attributeConditions
          }
          onAttributeConditionsChange={
            setAttributeConditions
          }
          defensePosition={
            defensePosition
          }
          onDefensePositionChange={
            setDefensePosition
          }
          defenseRating={
            defenseRating
          }
          onDefenseRatingChange={
            setDefenseRating
          }
          sortField={sortField}
          onSortFieldChange={
            setSortField
          }
          sortDirection={
            sortDirection
          }
          onSortDirectionChange={
            setSortDirection
          }
          onClearFilters={
            clearFilters
          }
        />

        {isLoading && (
          <section className="status-panel">
            <div className="loading-spinner" />

            <h3>
              Loading card gallery
            </h3>

            <p>
              Retrieving every published
              card.
            </p>
          </section>
        )}

        {!isLoading &&
          errorMessage && (
            <section className="status-panel error-panel">
              <h3>
                Cards could not be loaded
              </h3>

              <p>
                {errorMessage}
              </p>
            </section>
          )}

        {!isLoading &&
          !errorMessage &&
          filteredCards.length ===
            0 && (
            <section className="status-panel">
              <h3>
                No cards found
              </h3>

              <p>
                Try changing your search
                or removing a filter.
              </p>
            </section>
          )}

        {!isLoading &&
          !errorMessage &&
          visibleCards.length >
            0 && (
            <>
              <CardGrid
                cards={
                  visibleCards
                }
              />

              {hasMoreCards && (
                <section className="load-more-section">
                  <p>
                    Showing{' '}
                    {visibleCards.length.toLocaleString()}{' '}
                    of{' '}
                    {filteredCards.length.toLocaleString()}{' '}
                    matching cards
                  </p>

                  <button
                    type="button"
                    className="load-more-button"
                    onClick={() =>
                      setVisibleCardCount(
                        (
                          currentCount,
                        ) =>
                          currentCount +
                          PAGE_SIZE,
                      )
                    }
                  >
                    Load {PAGE_SIZE} More
                  </button>
                </section>
              )}
            </>
          )}
      </main>
    </div>
  )
}

export default CardsPage
