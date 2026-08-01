import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ACTIVE_SEASON,
  loadSeasonCards,
} from '../services/cardDatabase'
import type { CardRecord } from '../types/card'
import {
  cleanSearchTerm,
  CURRENT_MANAGER,
  getCardPositions,
  getCardTeamCode,
  getCardYear,
  isCardOwnedByManager,
} from '../utils/cardHelpers'

type Section =
  | 'overview'
  | 'defense'
  | 'lineup'
  | 'bench'
  | 'rotation'
  | 'bullpen'

type DrawerSort =
  | 'points'
  | 'defense'
  | 'ob'
  | 'control'
  | 'speed'
  | 'year'
  | 'name'

type SortDirection =
  | 'asc'
  | 'desc'

type Slot = {
  id: string
  label: string
  section: Exclude<Section, 'overview'>
  eligibility:
    | 'C'
    | '1B'
    | '2B'
    | '3B'
    | 'SS'
    | 'LF'
    | 'CF'
    | 'RF'
    | 'DH'
    | 'P'
    | 'BATTER'
    | 'BENCH'
}

type RosterFormat =
  | 'compact'
  | 'full'

type SavedRoster = {
  name: string
  assigned: Record<string, string>
  rosterFormat: RosterFormat
  useDh: boolean
}

const STORAGE_KEY =
  'elements-roster-builder-v1'

const TWO_WAY_NAMES = new Set([
  'earl gurley',
  'martin dihigo',
  'martín dihigo',
  'shohei ohtani',
])

const DEFENSE: Slot[] = [
  {
    id: 'defense-c',
    label: 'C',
    section: 'defense',
    eligibility: 'C',
  },
  {
    id: 'defense-1b',
    label: '1B',
    section: 'defense',
    eligibility: '1B',
  },
  {
    id: 'defense-2b',
    label: '2B',
    section: 'defense',
    eligibility: '2B',
  },
  {
    id: 'defense-3b',
    label: '3B',
    section: 'defense',
    eligibility: '3B',
  },
  {
    id: 'defense-ss',
    label: 'SS',
    section: 'defense',
    eligibility: 'SS',
  },
  {
    id: 'defense-lf',
    label: 'LF',
    section: 'defense',
    eligibility: 'LF',
  },
  {
    id: 'defense-cf',
    label: 'CF',
    section: 'defense',
    eligibility: 'CF',
  },
  {
    id: 'defense-rf',
    label: 'RF',
    section: 'defense',
    eligibility: 'RF',
  },
  {
    id: 'defense-dh',
    label: 'DH',
    section: 'defense',
    eligibility: 'DH',
  },
  {
    id: 'defense-p',
    label: 'P',
    section: 'defense',
    eligibility: 'P',
  },
]

const LINEUP: Slot[] = Array.from(
  { length: 9 },
  (_, index) => ({
    id: `lineup-${index + 1}`,
    label: `${index + 1}`,
    section: 'lineup',
    eligibility: 'BATTER',
  }),
)

const BENCH: Slot[] = Array.from(
  { length: 7 },
  (_, index) => ({
    id: `bench-${index + 1}`,
    label: `BN${index + 1}`,
    section: 'bench',
    eligibility: 'BENCH',
  }),
)

const ROTATION: Slot[] = Array.from(
  { length: 5 },
  (_, index) => ({
    id: `rotation-${index + 1}`,
    label: `SP${index + 1}`,
    section: 'rotation',
    eligibility: 'P',
  }),
)

const BULLPEN: Slot[] = Array.from(
  { length: 5 },
  (_, index) => ({
    id: `bullpen-${index + 1}`,
    label: `P${index + 1}`,
    section: 'bullpen',
    eligibility: 'P',
  }),
)

const ALL_SLOTS = [
  ...DEFENSE,
  ...LINEUP,
  ...BENCH,
  ...ROTATION,
  ...BULLPEN,
]

function getPoints(card: CardRecord) {
  return card.hitter_points ?? 0
}

function isPublished(card: CardRecord) {
  return card.hitter_points !== null &&
    card.hitter_points >= 0
}

function isSeasonEligible(card: CardRecord) {
  const eligibilityValue = String(
    card.source_yes_field ?? '',
  )
    .trim()
    .toLowerCase()

  const cardYear =
    getCardYear(card)

  return (
    eligibilityValue === 'yes' ||
    eligibilityValue === 'true' ||
    eligibilityValue === '1' ||
    cardYear === ACTIVE_SEASON
  )
}

function hasPitchingSide(card: CardRecord) {
  return (
    card.pitcher_control !== null ||
    card.pitcher_ip !== null
  )
}

function isTrueTwoWay(card: CardRecord) {
  return (
    hasPitchingSide(card) &&
    card.hitter_on_base !== null &&
    TWO_WAY_NAMES.has(
      card.player_name
        .trim()
        .toLowerCase(),
    )
  )
}

function isPrimaryPitcher(card: CardRecord) {
  return (
    hasPitchingSide(card) &&
    getCardPositions(card).length === 0 &&
    !isTrueTwoWay(card)
  )
}

function isEligible(
  card: CardRecord,
  slot: Slot,
) {
  if (slot.eligibility === 'P') {
    return (
      isPrimaryPitcher(card) ||
      isTrueTwoWay(card)
    )
  }

  if (
    slot.eligibility === 'BATTER' ||
    slot.eligibility === 'BENCH'
  ) {
    return !isPrimaryPitcher(card)
  }

  if (slot.eligibility === 'DH') {
    return card.hitter_on_base !== null
  }

  return getCardPositions(card).includes(
    slot.eligibility,
  )
}

function loadSaved(): SavedRoster {
  try {
    const saved =
      window.localStorage.getItem(
        STORAGE_KEY,
      )

    if (!saved) {
      return {
        name: `${ACTIVE_SEASON} Team`,
        assigned: {},
        rosterFormat: 'full',
        useDh: true,
      }
    }

    const parsed =
      JSON.parse(saved) as Partial<SavedRoster>

    return {
      name:
        parsed.name ??
        `${ACTIVE_SEASON} Team`,
      assigned:
        parsed.assigned ?? {},
      rosterFormat:
        parsed.rosterFormat ??
        'full',
      useDh:
        parsed.useDh ?? true,
    }
  } catch {
    return {
      name: `${ACTIVE_SEASON} Team`,
      assigned: {},
      rosterFormat: 'full',
      useDh: true,
    }
  }
}

function RosterPage() {
  const navigate = useNavigate()
  const [initial] = useState(loadSaved)
  const [name, setName] =
    useState(initial.name)
  const [assigned, setAssigned] =
    useState<Record<string, string>>(
      initial.assigned,
    )
  const [
    rosterFormat,
    setRosterFormat,
  ] = useState<RosterFormat>(
    initial.rosterFormat,
  )
  const [useDh, setUseDh] =
    useState(initial.useDh)
  const [section, setSection] =
    useState<Section>('overview')
  const [selectedSlotId, setSelectedSlotId] =
    useState<string | null>(null)
  const [cards, setCards] =
    useState<CardRecord[]>([])
  const [search, setSearch] =
    useState('')
  const [drawerSort, setDrawerSort] =
    useState<DrawerSort>('points')
  const [
    drawerSortDirection,
    setDrawerSortDirection,
  ] = useState<SortDirection>('desc')
  const [yearFilter, setYearFilter] =
    useState('')
  const [teamFilter, setTeamFilter] =
    useState('')
  const [leagueFilter, setLeagueFilter] =
    useState('')
  const [batsFilter, setBatsFilter] =
    useState('')
  const [armFilter, setArmFilter] =
    useState('')
  const [loading, setLoading] =
    useState(true)
  const [error, setError] =
    useState('')
  const [message, setMessage] =
    useState('')
  const [
    draggedLineupSlotId,
    setDraggedLineupSlotId,
  ] = useState<string | null>(null)

  useEffect(() => {
    void loadSeasonCards()
      .then(setCards)
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Roster cards could not be loaded.',
        )
      })
      .finally(() =>
        setLoading(false),
      )
  }, [])

  const playerLimit =
    rosterFormat === 'compact'
      ? 18
      : 26

  const pointCap =
    rosterFormat === 'compact'
      ? 4000
      : 6000

  const activeDefenseSlots =
    useMemo(
      () =>
        DEFENSE.filter((slot) =>
          useDh
            ? slot.id !== 'defense-p'
            : slot.id !== 'defense-dh',
        ),
      [useDh],
    )

  const cardMap = useMemo(
    () =>
      new Map(
        cards.map((card) => [
          card.card_key,
          card,
        ]),
      ),
    [cards],
  )

  const selectedSlot =
    ALL_SLOTS.find(
      (slot) =>
        slot.id === selectedSlotId,
    ) ?? null

  const usedCardKeys = useMemo(
    () =>
      new Set(
        [
          ...activeDefenseSlots,
          ...BENCH,
          ...ROTATION,
          ...BULLPEN,
        ]
          .map(
            (slot) =>
              assigned[slot.id],
          )
          .filter(Boolean),
      ),
    [
      activeDefenseSlots,
      assigned,
    ],
  )

  const drawerYearOptions = useMemo(
    () =>
      Array.from(
        new Set(
          cards
            .map(getCardYear)
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
      ),
    [cards],
  )

  const drawerLeagueOptions = useMemo(
    () =>
      Array.from(
        new Set(
          cards
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
      ),
    [cards],
  )

  const eligibleCards = useMemo(() => {
    if (!selectedSlot) {
      return []
    }

    const cleaned =
      cleanSearchTerm(search)
        .toLowerCase()

    const defenseCardKeys =
      new Set(
        activeDefenseSlots
          .map(
            (slot) =>
              assigned[slot.id],
          )
          .filter(Boolean),
      )

    return cards
      .filter((card) => {
        if (
          selectedSlot.section ===
            'lineup' &&
          !defenseCardKeys.has(
            card.card_key,
          )
        ) {
          return false
        }
        if (!isPublished(card)) {
          return false
        }

        if (
          !isCardOwnedByManager(
            card.ownership,
            CURRENT_MANAGER,
          )
        ) {
          return false
        }

        if (!isSeasonEligible(card)) {
          return false
        }

        if (!isEligible(card, selectedSlot)) {
          return false
        }

        const existing =
          assigned[selectedSlot.id]

        if (
          selectedSlot.section ===
          'lineup'
        ) {
          const usedBattingOrderCards =
            new Set(
              LINEUP
                .map(
                  (slot) =>
                    assigned[
                      slot.id
                    ],
                )
                .filter(Boolean),
            )

          if (
            usedBattingOrderCards.has(
              card.card_key,
            ) &&
            existing !== card.card_key
          ) {
            return false
          }
        } else if (
          selectedSlot.id !==
            'defense-p' &&
          usedCardKeys.has(card.card_key) &&
          existing !== card.card_key
        ) {
          return false
        }

        if (
          yearFilter &&
          String(getCardYear(card)) !==
            yearFilter
        ) {
          return false
        }

        if (teamFilter) {
          const teamText = [
            card.team_name,
            getCardTeamCode(card),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()

          if (
            !teamText.includes(
              teamFilter
                .trim()
                .toLowerCase(),
            )
          ) {
            return false
          }
        }

        if (
          leagueFilter &&
          card.league !== leagueFilter
        ) {
          return false
        }

        if (
          batsFilter &&
          card.hitter_bats !== batsFilter
        ) {
          return false
        }

        if (
          armFilter &&
          card.pitcher_arm !== armFilter
        ) {
          return false
        }

        if (!cleaned) {
          return true
        }

        const haystack = [
          card.player_name,
          card.team_name,
          card.league,
          getCardTeamCode(card),
          getCardYear(card),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return haystack.includes(cleaned)
      })
      .sort((a, b) => {
        const direction =
          drawerSortDirection ===
          'asc'
            ? 1
            : -1

        const selectedPosition =
          selectedSlot.eligibility

        const defenseValue = (
          card: CardRecord,
        ) => {
          if (
            ![
              'C',
              '1B',
              '2B',
              '3B',
              'SS',
              'LF',
              'CF',
              'RF',
            ].includes(
              selectedPosition,
            )
          ) {
            return -999
          }

          const key =
            `defense_${selectedPosition.toLowerCase()}` as keyof CardRecord

          const value = card[key]

          return typeof value ===
            'number'
            ? value
            : -999
        }

        const numericValue = (
          card: CardRecord,
        ) => {
          switch (drawerSort) {
            case 'defense':
              return defenseValue(card)
            case 'ob':
              return (
                card.hitter_on_base ??
                -999
              )
            case 'control':
              return (
                card.pitcher_control ??
                -999
              )
            case 'speed':
              return (
                card.hitter_baserunning ??
                -999
              )
            case 'year':
              return (
                getCardYear(card) ??
                -999
              )
            case 'points':
            default:
              return getPoints(card)
          }
        }

        if (drawerSort === 'name') {
          return (
            a.player_name.localeCompare(
              b.player_name,
            ) * direction
          )
        }

        const difference =
          numericValue(a) -
          numericValue(b)

        if (difference !== 0) {
          return difference * direction
        }

        return a.player_name.localeCompare(
          b.player_name,
        )
      })
  }, [
    activeDefenseSlots,
    armFilter,
    assigned,
    batsFilter,
    cards,
    drawerSort,
    drawerSortDirection,
    leagueFilter,
    search,
    selectedSlot,
    teamFilter,
    usedCardKeys,
    yearFilter,
  ])

  const rosterSlots = [
    ...activeDefenseSlots,
    ...BENCH,
    ...ROTATION,
    ...BULLPEN,
  ]

  const rosterCardKeys =
    new Set(
      rosterSlots
        .map(
          (slot) =>
            assigned[slot.id],
        )
        .filter(Boolean),
    )

  const selectedCards =
    Array.from(rosterCardKeys)
      .map(
        (key) =>
          cardMap.get(key) ?? null,
      )
      .filter(
        (
          card,
        ): card is CardRecord =>
          card !== null,
      )

  const totalPoints =
    selectedCards.reduce(
      (sum, card) =>
        sum + getPoints(card),
      0,
    )

  const countFilled = (
    slots: Slot[],
  ) =>
    slots.filter((slot) =>
      Boolean(assigned[slot.id]),
    ).length

  const counts = {
    defense:
      countFilled(activeDefenseSlots),
    lineup: countFilled(LINEUP),
    bench: countFilled(BENCH),
    rotation: countFilled(ROTATION),
    bullpen: countFilled(BULLPEN),
  }

  function getDefenseRating(
    slotId: string,
    field:
      | 'defense_c'
      | 'defense_1b'
      | 'defense_2b'
      | 'defense_3b'
      | 'defense_ss'
      | 'defense_lf'
      | 'defense_cf'
      | 'defense_rf',
  ): number | null {
    const cardKey = assigned[slotId]

    if (!cardKey) {
      return null
    }

    const card = cardMap.get(cardKey)
    const value = card?.[field]

    return typeof value === 'number'
      ? value
      : null
  }

  const catcherScore =
    getDefenseRating(
      'defense-c',
      'defense_c',
    )

  const infieldRatings = {
    '1B': getDefenseRating(
      'defense-1b',
      'defense_1b',
    ),
    '2B': getDefenseRating(
      'defense-2b',
      'defense_2b',
    ),
    '3B': getDefenseRating(
      'defense-3b',
      'defense_3b',
    ),
    SS: getDefenseRating(
      'defense-ss',
      'defense_ss',
    ),
  }

  const infieldCombinations = [
    {
      label: '1B + 2B + SS',
      values: [
        infieldRatings['1B'],
        infieldRatings['2B'],
        infieldRatings.SS,
      ],
    },
    {
      label: '1B + 2B + 3B',
      values: [
        infieldRatings['1B'],
        infieldRatings['2B'],
        infieldRatings['3B'],
      ],
    },
    {
      label: '1B + SS + 3B',
      values: [
        infieldRatings['1B'],
        infieldRatings.SS,
        infieldRatings['3B'],
      ],
    },
  ]
    .map((combination) => ({
      label: combination.label,
      score: combination.values.every(
        (value) => value !== null,
      )
        ? combination.values.reduce(
            (sum, value) =>
              sum + (value ?? 0),
            0,
          )
        : null,
    }))
    .sort((left, right) => {
      if (
        left.score === null &&
        right.score === null
      ) {
        return left.label.localeCompare(
          right.label,
        )
      }

      if (left.score === null) {
        return 1
      }

      if (right.score === null) {
        return -1
      }

      return (
        right.score - left.score ||
        left.label.localeCompare(
          right.label,
        )
      )
    })

  const outfieldRatings = {
    LF: getDefenseRating(
      'defense-lf',
      'defense_lf',
    ),
    CF: getDefenseRating(
      'defense-cf',
      'defense_cf',
    ),
    RF: getDefenseRating(
      'defense-rf',
      'defense_rf',
    ),
  }

  function formatDefenseScore(
    score: number | null,
  ) {
    if (score === null) {
      return '--'
    }

    return score > 0
      ? `+${score}`
      : String(score)
  }


  const totalPlayers =
    rosterCardKeys.size

  const missingSections = [
    counts.defense <
      activeDefenseSlots.length
      ? `Defense ${
          activeDefenseSlots.length -
          counts.defense
        }`
      : '',
    counts.lineup < 9
      ? `Batting Order ${
          9 - counts.lineup
        }`
      : '',
  ].filter(Boolean)

  const teamComplete =
    totalPlayers === playerLimit &&
    totalPoints <= pointCap &&
    counts.defense ===
      activeDefenseSlots.length &&
    counts.lineup === 9

  const overPointCap =
    totalPoints > pointCap

  function changeDh(
    nextUseDh: boolean,
  ) {
    setUseDh(nextUseDh)

    setAssigned((current) => {
      const next = { ...current }
      const removedSlotId =
        nextUseDh
          ? 'defense-p'
          : 'defense-dh'
      const removedCard =
        next[removedSlotId]

      delete next[removedSlotId]

      if (removedCard) {
        for (const slot of LINEUP) {
          if (
            next[slot.id] ===
            removedCard
          ) {
            delete next[slot.id]
          }
        }
      }

      return next
    })
  }

  function saveRoster() {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        name:
          name.trim() ||
          `${ACTIVE_SEASON} Team`,
        assigned,
        rosterFormat,
        useDh,
      }),
    )

    setMessage('Team saved')
    window.setTimeout(
      () => setMessage(''),
      1600,
    )
  }

  function clearRoster() {
    setAssigned({})
    setSelectedSlotId(null)
    setMessage('Team cleared')
    window.setTimeout(
      () => setMessage(''),
      1600,
    )
  }

  function assignCard(
    card: CardRecord,
  ) {
    if (!selectedSlot) {
      return
    }

    const existingCard =
      assigned[selectedSlot.id]
    const isNewUniqueCard =
      !rosterCardKeys.has(
        card.card_key,
      )
    const replacingUniqueCard =
      Boolean(
        existingCard &&
        existingCard !== card.card_key &&
        !rosterSlots.some(
          (slot) =>
            slot.id !==
              selectedSlot.id &&
            assigned[slot.id] ===
              existingCard,
        ),
      )

    const projectedPlayers =
      totalPlayers +
      (isNewUniqueCard ? 1 : 0) -
      (replacingUniqueCard ? 1 : 0)

    const projectedPoints =
      totalPoints +
      (isNewUniqueCard
        ? getPoints(card)
        : 0) -
      (replacingUniqueCard &&
      existingCard
        ? getPoints(
            cardMap.get(
              existingCard,
            ) as CardRecord,
          )
        : 0)

    if (
      projectedPlayers >
      playerLimit
    ) {
      setMessage(
        `${playerLimit}-player limit reached`,
      )
      return
    }

    if (
      projectedPoints >
      pointCap
    ) {
      setMessage(
        `Adding this card would exceed the ${pointCap.toLocaleString()}-point cap`,
      )
      return
    }

    setAssigned((current) => {
      const next = {
        ...current,
        [selectedSlot.id]:
          card.card_key,
      }

      if (
        selectedSlot.id ===
        'defense-p'
      ) {
        const alreadyPitcher =
          [...ROTATION, ...BULLPEN]
            .some(
              (slot) =>
                next[slot.id] ===
                card.card_key,
            )

        if (!alreadyPitcher) {
          const emptyRotationSlot =
            ROTATION.find(
              (slot) =>
                !next[slot.id],
            )

          if (emptyRotationSlot) {
            next[emptyRotationSlot.id] =
              card.card_key
          }
        }
      }

      if (
        selectedSlot.section ===
        'defense'
      ) {
        const previousCard =
          current[selectedSlot.id]

        if (previousCard) {
          for (const slot of LINEUP) {
            if (
              next[slot.id] ===
              previousCard
            ) {
              delete next[slot.id]
            }
          }
        }

        const alreadyInOrder =
          LINEUP.some(
            (slot) =>
              next[slot.id] ===
              card.card_key,
          )

        if (!alreadyInOrder) {
          const emptyOrderSlot =
            LINEUP.find(
              (slot) =>
                !next[slot.id],
            )

          if (emptyOrderSlot) {
            next[emptyOrderSlot.id] =
              card.card_key
          }
        }
      }

      return next
    })
    setSelectedSlotId(null)
    setSearch('')
  }

  function removeCard(
    slotId: string,
  ) {
    setAssigned((current) => {
      const next = { ...current }
      const removedCard =
        current[slotId]

      delete next[slotId]

      if (
        slotId.startsWith(
          'defense-',
        ) &&
        removedCard
      ) {
        for (const slot of LINEUP) {
          if (
            next[slot.id] ===
            removedCard
          ) {
            delete next[slot.id]
          }
        }
      }

      return next
    })
  }

  function reorderBattingOrder(
    targetSlotId: string,
  ) {
    if (
      !draggedLineupSlotId ||
      draggedLineupSlotId === targetSlotId
    ) {
      setDraggedLineupSlotId(null)
      return
    }

    setAssigned((current) => {
      const next = { ...current }
      const draggedCard =
        current[draggedLineupSlotId]
      const targetCard =
        current[targetSlotId]

      if (draggedCard) {
        next[targetSlotId] =
          draggedCard
      } else {
        delete next[targetSlotId]
      }

      if (targetCard) {
        next[draggedLineupSlotId] =
          targetCard
      } else {
        delete next[
          draggedLineupSlotId
        ]
      }

      return next
    })

    setDraggedLineupSlotId(null)
  }

  function renderSlot(slot: Slot) {
    const cardKey =
      assigned[slot.id]
    const card = cardKey
      ? cardMap.get(cardKey)
      : null
    const pitcher =
      slot.eligibility === 'P'

    return (
      <div
        className={[
          card
            ? 'roster-slot filled'
            : 'roster-slot',
          slot.section === 'lineup'
            ? 'batting-order-slot'
            : '',
          draggedLineupSlotId ===
          slot.id
            ? 'is-dragging'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        draggable={
          slot.section === 'lineup' &&
          Boolean(card)
        }
        onDragStart={() => {
          if (
            slot.section === 'lineup' &&
            card
          ) {
            setDraggedLineupSlotId(
              slot.id,
            )
          }
        }}
        onDragEnd={() =>
          setDraggedLineupSlotId(null)
        }
        onDragOver={(event) => {
          if (
            slot.section === 'lineup'
          ) {
            event.preventDefault()
          }
        }}
        onDrop={(event) => {
          if (
            slot.section === 'lineup'
          ) {
            event.preventDefault()
            reorderBattingOrder(
              slot.id,
            )
          }
        }}
        key={slot.id}
      >
        <button
          type="button"
          className="roster-slot-main"
          onClick={() => {
            setSelectedSlotId(slot.id)
            setSearch('')
          }}
        >
          <span className="roster-slot-label">
            {slot.label}
          </span>

          {slot.section ===
            'lineup' &&
            card && (
              <span
                className="batting-order-drag-handle"
                aria-hidden="true"
              >
                ⋮⋮
              </span>
            )}

          {card ? (
            <>
              <span className="roster-player-thumb">
                {card.image_url ? (
                  <img
                    src={card.image_url}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  card.player_name[0]
                )}
              </span>

              <span className="roster-player-copy">
                <strong>
                  {card.player_name}
                </strong>
                <small>
                  {getCardYear(card)} ·{' '}
                  {getCardTeamCode(card) ??
                    card.team_name ??
                    '—'}
                </small>
              </span>

              {pitcher ? (
                <span className="pitcher-rating-pair">
                  <span className="rating-diamond">
                    <span>
                      OB{' '}
                      {card.hitter_on_base ??
                        '—'}
                    </span>
                  </span>
                  <span className="rating-diamond">
                    <span>
                      C{' '}
                      {card.pitcher_control ??
                        '—'}
                    </span>
                  </span>
                </span>
              ) : (
                <span className="hitter-rating-diamond">
                  <span>
                    OB{' '}
                    {card.hitter_on_base ??
                      '—'}
                  </span>
                </span>
              )}

              <span className="roster-player-points">
                {getPoints(
                  card,
                ).toLocaleString()}
              </span>
            </>
          ) : (
            <span className="empty-slot-copy">
              {slot.section ===
              'lineup'
                ? 'Choose from Defense'
                : 'Select a player'}
            </span>
          )}
        </button>

        {card && (
          <button
            type="button"
            className="remove-roster-card"
            onClick={() =>
              removeCard(slot.id)
            }
            aria-label={`Remove ${card.player_name}`}
          >
            ×
          </button>
        )}
      </div>
    )
  }

  function renderDefenseSummary(
    compact = false,
  ) {
    return (
      <section
        className={
          compact
            ? 'defense-summary compact'
            : 'defense-summary'
        }
      >
        <div className="defense-summary-block">
          <span className="defense-summary-label">
            Catcher Score
          </span>

          <strong>
            {formatDefenseScore(
              catcherScore,
            )}
          </strong>
        </div>

        <div className="defense-summary-block infield-summary-block">
          <span className="defense-summary-label">
            Infield Combos
          </span>

          <div className="infield-combo-scores">
            {infieldCombinations.map(
              (combination, index) => (
                <span
                  className="infield-combo-item"
                  key={
                    combination.label
                  }
                >
                  <strong>
                    #{index + 1}
                  </strong>

                  <span>
                    {formatDefenseScore(
                      combination.score,
                    )}
                  </span>

                  {!compact && (
                    <small>
                      {
                        combination.label
                      }
                    </small>
                  )}
                </span>
              ),
            )}
          </div>
        </div>

        <div className="defense-summary-block">
          <span className="defense-summary-label">
            Outfield Defense
          </span>

          <div className="outfield-defense-values">
            <span>
              LF
              <strong>
                {formatDefenseScore(
                  outfieldRatings.LF,
                )}
              </strong>
            </span>

            <span>
              CF
              <strong>
                {formatDefenseScore(
                  outfieldRatings.CF,
                )}
              </strong>
            </span>

            <span>
              RF
              <strong>
                {formatDefenseScore(
                  outfieldRatings.RF,
                )}
              </strong>
            </span>
          </div>
        </div>
      </section>
    )
  }

  function renderGroup(
    title: string,
    slots: Slot[],
  ) {
    return (
      <section className="roster-section-card">
        <div className="roster-section-heading">
          <h2>{title}</h2>
          <span>
            {countFilled(slots)}/
            {slots.length}
          </span>
        </div>

        <div className="roster-slot-list">
          {slots.map(renderSlot)}
        </div>
      </section>
    )
  }

  return (
    <div className="app roster-app">
      <header className="roster-header">
        <button
          type="button"
          className="back-button"
          onClick={() =>
            navigate('/')
          }
        >
          ← Home
        </button>

        <div className="roster-title-block">
          <p className="eyebrow">
            Elements Baseball
          </p>

          <h1>Team Builder</h1>

          <p>
            {ACTIVE_SEASON} Season
          </p>

        </div>

        <div className="roster-header-actions">
          <button
            type="button"
            className="roster-clear-button"
            onClick={clearRoster}
          >
            Clear
          </button>
          <button
            type="button"
            className="roster-save-button"
            onClick={saveRoster}
          >
            Save Team
          </button>
        </div>
      </header>

      <main className="roster-page">
        <section className="roster-summary">
          <label className="roster-name-field">
            <span>Roster Name</span>
            <input
              value={name}
              onChange={(event) =>
                setName(
                  event.target.value,
                )
              }
            />
          </label>

          <div className="roster-summary-stat roster-limit-stat">
            <span>
              Players · Maximum {playerLimit}
            </span>

            <strong>
              {totalPlayers}/{playerLimit}
            </strong>

            <label className="inline-roster-format">
              <span>Roster Format</span>

              <select
                value={rosterFormat}
                onChange={(event) =>
                  setRosterFormat(
                    event.target
                      .value as RosterFormat,
                  )
                }
              >
                <option value="compact">
                  18 / 4,000
                </option>

                <option value="full">
                  26 / 6,000
                </option>
              </select>
            </label>
          </div>

          <div className="roster-summary-stat roster-limit-stat">
            <span>
              Points · Maximum{' '}
              {pointCap.toLocaleString()}
            </span>

            <strong>
              {totalPoints.toLocaleString()}/
              {pointCap.toLocaleString()}
            </strong>

            <div className="inline-dh-setting">
              <span>
                Designated Hitter
              </span>

              <div className="inline-dh-toggle">
                <button
                  type="button"
                  className={
                    useDh
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    changeDh(true)
                  }
                >
                  On
                </button>

                <button
                  type="button"
                  className={
                    !useDh
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    changeDh(false)
                  }
                >
                  Off
                </button>
              </div>
            </div>
          </div>

          <div className="roster-summary-breakdown">
            <span>
              Defense
              <strong>
                {counts.defense}
              </strong>
            </span>
            <span>
              Batting Order
              <strong>
                {counts.lineup}
              </strong>
            </span>
            <span>
              Bench
              <strong>
                {counts.bench}
              </strong>
            </span>
            <span>
              Rotation
              <strong>
                {counts.rotation}
              </strong>
            </span>
            <span>
              Bullpen
              <strong>
                {counts.bullpen}
              </strong>
            </span>
          </div>
        </section>

        <section
          className={
            teamComplete
              ? 'team-completion-status complete'
              : overPointCap
                ? 'team-completion-status invalid'
                : 'team-completion-status'
          }
        >
          <strong>
            {teamComplete
              ? 'Team Complete'
              : overPointCap
                ? 'Point Cap Exceeded'
                : `${playerLimit - totalPlayers} roster spot${playerLimit - totalPlayers === 1 ? '' : 's'} remaining`}
          </strong>

          {!teamComplete &&
            missingSections.length >
              0 && (
              <span>
                Missing:{' '}
                {missingSections.join(
                  ' · ',
                )}
              </span>
            )}
        </section>

        {message && (
          <div className="roster-save-message">
            {message}
          </div>
        )}

        <nav className="roster-tabs">
          {(
            [
              'overview',
              'defense',
              'lineup',
              'bench',
              'rotation',
              'bullpen',
            ] as Section[]
          ).map((value) => (
            <button
              type="button"
              className={
                section === value
                  ? 'active'
                  : ''
              }
              onClick={() =>
                setSection(value)
              }
              key={value}
            >
              {value === 'lineup'
                ? 'Batting Order'
                : value}
            </button>
          ))}
        </nav>

        {!loading &&
          !error &&
          (section === 'overview' ||
            section === 'defense') &&
          renderDefenseSummary(
            section === 'overview',
          )}

        {loading && (
          <section className="status-panel">
            <div className="loading-spinner" />
            <h3>
              Loading team cards
            </h3>
            <p>
              Retrieving eligible cards.
            </p>
          </section>
        )}

        {!loading && error && (
          <section className="status-panel error-panel">
            <h3>
              Cards could not be loaded
            </h3>
            <p>{error}</p>
          </section>
        )}

        {!loading && !error && (
          <div className="roster-content">
            {section === 'overview' && (
              <div className="roster-overview-grid">
                  {renderGroup(
                    'Defense',
                    activeDefenseSlots,
                  )}
                  {renderGroup(
                    'Rotation',
                    ROTATION,
                  )}
                  {renderGroup(
                    'Bench',
                    BENCH,
                  )}
                  {renderGroup(
                    'Bullpen',
                    BULLPEN,
                  )}
              </div>
            )}

            {section === 'defense' &&
              renderGroup(
                'Defense',
                activeDefenseSlots,
              )}

            {section === 'lineup' &&
              renderGroup(
                'Batting Order',
                LINEUP,
              )}
            {section === 'bench' &&
              renderGroup(
                'Bench',
                BENCH,
              )}
            {section === 'rotation' &&
              renderGroup(
                'Rotation',
                ROTATION,
              )}
            {section === 'bullpen' &&
              renderGroup(
                'Bullpen',
                BULLPEN,
              )}
          </div>
        )}
      </main>

      {selectedSlot && (
        <div
          className="roster-drawer-backdrop"
          onMouseDown={(event) => {
            if (
              event.currentTarget ===
              event.target
            ) {
              setSelectedSlotId(null)
            }
          }}
        >
          <aside
            className="roster-player-drawer"
            onPointerDown={(event) =>
              event.stopPropagation()
            }
          >
            <div className="roster-drawer-heading">
              <div>
                <p>
                  {selectedSlot.section ===
                  'lineup'
                    ? 'Select Starter'
                    : 'Select Player'}
                </p>
                <h2>
                  {selectedSlot.label}
                </h2>
              </div>
              <button
                type="button"
                onClick={() =>
                  setSelectedSlotId(null)
                }
              >
                ×
              </button>
            </div>

            <label className="roster-player-search">
              <span>⌕</span>
              <input
                type="search"
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value,
                  )
                }
                placeholder="Search eligible players"
                autoFocus
              />
            </label>

            <section className="roster-drawer-sort">
              <span className="roster-drawer-section-label">
                Quick Sort
              </span>

              <div className="roster-sort-chip-row">
                {(
                  [
                    ['points', 'Points'],
                    ['year', 'Year'],
                    ['name', 'Name'],
                  ] as Array<
                    [DrawerSort, string]
                  >
                ).map(
                  ([value, label]) => (
                    <button
                      type="button"
                      className={
                        drawerSort ===
                        value
                          ? 'roster-sort-chip active'
                          : 'roster-sort-chip'
                      }
                      onClick={() => {
                        if (
                          drawerSort ===
                          value
                        ) {
                          setDrawerSortDirection(
                            (current) =>
                              current ===
                              'desc'
                                ? 'asc'
                                : 'desc',
                          )
                        } else {
                          setDrawerSort(
                            value,
                          )
                          setDrawerSortDirection(
                            value === 'name'
                              ? 'asc'
                              : 'desc',
                          )
                        }
                      }}
                      key={value}
                    >
                      {label}

                      {drawerSort ===
                        value && (
                        <span>
                          {drawerSortDirection ===
                          'desc'
                            ? '↓'
                            : '↑'}
                        </span>
                      )}
                    </button>
                  ),
                )}
              </div>

              <div className="roster-advanced-sort-row">
                <label>
                  <span>Advanced Sort</span>

                  <select
                    value={
                      [
                        'points',
                        'year',
                        'name',
                      ].includes(
                        drawerSort,
                      )
                        ? ''
                        : drawerSort
                    }
                    onChange={(event) => {
                      const value =
                        event.target
                          .value as DrawerSort

                      if (!value) {
                        return
                      }

                      setDrawerSort(value)
                      setDrawerSortDirection(
                        'desc',
                      )
                    }}
                  >
                    <option value="">
                      Select advanced sort
                    </option>
                    <option value="defense">
                      Defense
                    </option>
                    <option value="ob">
                      On Base
                    </option>
                    <option value="control">
                      Control
                    </option>
                    <option value="speed">
                      Speed / BsR
                    </option>
                  </select>
                </label>

                <button
                  type="button"
                  className="roster-sort-direction-button"
                  onClick={() =>
                    setDrawerSortDirection(
                      (current) =>
                        current === 'desc'
                          ? 'asc'
                          : 'desc',
                    )
                  }
                >
                  {drawerSortDirection ===
                  'desc'
                    ? 'High to Low ↓'
                    : 'Low to High ↑'}
                </button>
              </div>
            </section>

            <section className="roster-drawer-filter-section">
              <span className="roster-drawer-section-label">
                Filters
              </span>

              <div className="roster-drawer-filter-grid">
                <label>
                  <span>Year</span>

                  <select
                    value={yearFilter}
                    onChange={(event) =>
                      setYearFilter(
                        event.target.value,
                      )
                    }
                  >
                    <option value="">
                      All years
                    </option>

                    {drawerYearOptions.map(
                      (year) => (
                        <option
                          value={year}
                          key={year}
                        >
                          {year}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label>
                  <span>Team</span>

                  <input
                    type="search"
                    value={teamFilter}
                    onChange={(event) =>
                      setTeamFilter(
                        event.target.value,
                      )
                    }
                    placeholder="Team"
                  />
                </label>

                <label>
                  <span>League</span>

                  <select
                    value={leagueFilter}
                    onChange={(event) =>
                      setLeagueFilter(
                        event.target.value,
                      )
                    }
                  >
                    <option value="">
                      All leagues
                    </option>

                    {drawerLeagueOptions.map(
                      (league) => (
                        <option
                          value={league}
                          key={league}
                        >
                          {league}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label>
                  <span>Bats</span>

                  <select
                    value={batsFilter}
                    onChange={(event) =>
                      setBatsFilter(
                        event.target.value,
                      )
                    }
                  >
                    <option value="">
                      All
                    </option>
                    <option value="R">
                      R
                    </option>
                    <option value="L">
                      L
                    </option>
                    <option value="S">
                      S
                    </option>
                  </select>
                </label>

                <label>
                  <span>Arm</span>

                  <select
                    value={armFilter}
                    onChange={(event) =>
                      setArmFilter(
                        event.target.value,
                      )
                    }
                  >
                    <option value="">
                      All
                    </option>
                    <option value="R">
                      R
                    </option>
                    <option value="L">
                      L
                    </option>
                  </select>
                </label>

                <button
                  type="button"
                  className="roster-clear-drawer-filters"
                  onClick={() => {
                    setSearch('')
                    setYearFilter('')
                    setTeamFilter('')
                    setLeagueFilter('')
                    setBatsFilter('')
                    setArmFilter('')
                    setDrawerSort(
                      'points',
                    )
                    setDrawerSortDirection(
                      'desc',
                    )
                  }}
                >
                  Clear Filters
                </button>
              </div>
            </section>

            <div className="roster-drawer-rules">
              <span>Owned by Anthony</span>
              <span>Season Eligible</span>
              <span>Published</span>
              <span>
                {selectedSlot.eligibility ===
                'BATTER'
                  ? 'Defense Starters'
                  : selectedSlot.eligibility}
              </span>
            </div>

            <p className="roster-player-count">
              {eligibleCards.length}{' '}
              eligible cards
            </p>

            <div className="roster-player-grid">
              {eligibleCards.map(
                (card) => (
                  {(() => {
                    const existingCard =
                      assigned[
                        selectedSlot.id
                      ]
                    const isNew =
                      !rosterCardKeys.has(
                        card.card_key,
                      )
                    const replacesUnique =
                      Boolean(
                        existingCard &&
                        existingCard !==
                          card.card_key &&
                        !rosterSlots.some(
                          (slot) =>
                            slot.id !==
                              selectedSlot.id &&
                            assigned[
                              slot.id
                            ] ===
                              existingCard,
                        ),
                      )
                    const afterPlayers =
                      totalPlayers +
                      (isNew ? 1 : 0) -
                      (replacesUnique
                        ? 1
                        : 0)
                    const afterPoints =
                      totalPoints +
                      (isNew
                        ? getPoints(card)
                        : 0) -
                      (replacesUnique &&
                      existingCard
                        ? getPoints(
                            cardMap.get(
                              existingCard,
                            ) as CardRecord,
                          )
                        : 0)
                    const blocked =
                      afterPlayers >
                        playerLimit ||
                      afterPoints >
                        pointCap

                    return (
                  <button
                    type="button"
                    className={
                      blocked
                        ? 'roster-player-card blocked'
                        : 'roster-player-card'
                    }
                    disabled={blocked}
                    aria-label={`Add ${card.player_name} to ${selectedSlot.label}`}
                    onPointerUp={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      assignCard(card)
                    }}
                    key={card.card_key}
                  >
                    <div className="roster-card-image">
                      {card.image_url ? (
                        <img
                          src={card.image_url}
                          alt={`${card.player_name} card`}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span>
                          Image unavailable
                        </span>
                      )}
                    </div>

                    <div className="roster-card-copy">
                      <strong>
                        {card.player_name}
                      </strong>
                      <span>
                        {getCardYear(card)} ·{' '}
                        {getCardTeamCode(
                          card,
                        ) ??
                          card.team_name ??
                          '—'}
                      </span>

                      <div className="roster-card-footer">
                        <span>
                          {isTrueTwoWay(
                            card,
                          )
                            ? 'Two-Way'
                            : isPrimaryPitcher(
                                  card,
                                )
                              ? 'Pitcher'
                              : getCardPositions(
                                    card,
                                  ).join(
                                    ', ',
                                  ) ||
                                'DH'}
                        </span>
                        <strong>
                          {getPoints(
                            card,
                          )}{' '}
                          pts
                        </strong>
                      </div>

                      <div className="roster-card-projection">
                        <span>
                          After Add
                        </span>

                        <strong>
                          {afterPlayers}/
                          {playerLimit} ·{' '}
                          {afterPoints.toLocaleString()}/
                          {pointCap.toLocaleString()}
                        </strong>
                      </div>

                      <span className="roster-add-card-button">
                        {blocked
                          ? afterPlayers >
                            playerLimit
                            ? 'Roster Limit Reached'
                            : 'Over Point Cap'
                          : `Add to ${selectedSlot.label}`}
                      </span>
                    </div>
                  </button>
                    )
                  })()}
                ),
              )}
            </div>

            {eligibleCards.length === 0 && (
              <div className="roster-empty-drawer">
                <h3>
                  No eligible cards found
                </h3>
                <p>
                  {selectedSlot.section ===
                  'lineup'
                    ? 'Select the nine starters on the Defense page first.'
                    : 'Only owned, published, season-eligible cards that qualify for this slot appear here.'}
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

export default RosterPage
