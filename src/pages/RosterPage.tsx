import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import DefenseStage from '../components/DefenseStage'
import {
  ACTIVE_SEASON,
  loadSeasonCards,
} from '../services/cardDatabase'
import type { CardRecord } from '../types/card'
import {
  cleanSearchTerm,
  getCardPositions,
  getCardTeamCode,
  getCardYear,
  isCardOwnedByManager,
} from '../utils/cardHelpers'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { appPath } from '../lib/appPaths'

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
  | 'hitter_on_base'
  | 'hitter_outs'
  | 'hitter_baserunning'
  | 'hitter_stolen_base'
  | 'hitter_fatigue'
  | 'hitter_pu'
  | 'hitter_k'
  | 'hitter_gb'
  | 'hitter_fb'
  | 'hitter_bb'
  | 'hitter_1b'
  | 'hitter_1b_plus'
  | 'hitter_2b'
  | 'hitter_3b'
  | 'hitter_hr'
  | 'pitcher_control'
  | 'pitcher_outs'
  | 'pitcher_ip'
  | 'pitcher_fatigue'
  | 'pitcher_pu'
  | 'pitcher_k'
  | 'pitcher_gb'
  | 'pitcher_fb'
  | 'pitcher_bb'
  | 'pitcher_1b'
  | 'pitcher_2b'
  | 'pitcher_3b'
  | 'pitcher_hr'
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
  | 'standard25'
  | 'full'

type SavedLineup = {
  id: string
  name: string
  assigned: Record<string, string>
  rosterFormat: RosterFormat
  useDh: boolean
}




function SidebarIcon({ section }: { section: Section }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  // Active Roster: lineup card
  if (section === 'overview') return (
    <svg {...common}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h8M8 11h2M12 11h4M8 15h2M12 15h4" />
    </svg>
  )

  // Fielding: simple glove outline
  if (section === 'defense') return (
    <svg {...common}>
      <path d="M6.5 11V7.2a1.5 1.5 0 0 1 3 0v2.7-4a1.45 1.45 0 0 1 2.9 0v3.8-3a1.45 1.45 0 0 1 2.9 0v4.7l1.5-1.4a1.65 1.65 0 0 1 2.3 2.4l-3.4 4.2A6 6 0 0 1 11 19H9.8a4.8 4.8 0 0 1-4.8-4.8v-1.7A1.55 1.55 0 0 1 6.5 11Z" />
      <path d="M9.5 9.9v3M12.4 9.7v3M15.3 11.3v2" />
    </svg>
  )

  // Batting Order: numbered lineup/list icon
  if (section === 'lineup') return (
    <svg {...common}>
      <path d="M5 6h2M5 12h2M5 18h2" />
      <path d="M10 6h9M10 12h9M10 18h9" />
      <path d="M3.5 4.8v2.4M3 7.2h1" />
      <path d="M3 10.9c.2-.5.6-.8 1.1-.8.6 0 1 .4 1 1 0 .9-1.9 1.2-2.1 2.1h2.2" />
      <path d="M3 16.3h1.2c.6 0 1 .35 1 .85s-.4.85-1 .85H3m1.05-1.7c.55 0 .95-.32.95-.78s-.4-.77-.95-.77H3" />
    </svg>
  )

  // Bench
  if (section === 'bench') return (
    <svg {...common}>
      <path d="M4 10h16v4H4zM6 14v5M18 14v5M3 19h18" />
      <path d="M7 6h10v4H7z" />
    </svg>
  )

  // Rotation: standard baseball
  if (section === 'rotation') return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.2 5.1c1.25 1.45 1.9 3.15 1.9 5.05 0 1.9-.65 3.6-1.9 5.05M15.8 5.1c-1.25 1.45-1.9 3.15-1.9 5.05 0 1.9.65 3.6 1.9 5.05" />
      <path d="m8.9 7.1-1.2-.6M9.7 9.2l-1.35-.35M9.8 12l-1.4.15M15.1 7.1l1.2-.6M14.3 9.2l1.35-.35M14.2 12l1.4.15" />
    </svg>
  )

  // Bullpen: low, round pitcher's mound with rubber
  return (
    <svg {...common}>
      <ellipse cx="12" cy="16" rx="8" ry="3.3" />
      <path d="M5.6 15c1.3-3 3.4-4.6 6.4-4.6s5.1 1.6 6.4 4.6" />
      <rect x="9.3" y="9.1" width="5.4" height="1.5" rx=".65" />
      <path d="M7 16h10" />
    </svg>
  )
}

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
  { length: 8 },
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
  { length: 8 },
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

function RosterPage() {
  const navigate = useNavigate()
  const { lineupId } = useParams()
  const { user, profile, isDemo } = useAuth()
  const currentManager = profile?.manager_name ?? ''
  const [name, setName] = useState(`${ACTIVE_SEASON} Team`)
  const [assigned, setAssigned] = useState<Record<string, string>>({})
  const [rosterFormat, setRosterFormat] = useState<RosterFormat>('full')
  const [useDh, setUseDh] = useState(true)
  const [, setLineupLoaded] = useState(false)
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
  const [drawerControlsOpen, setDrawerControlsOpen] =
    useState(false)
  const [previewCardKey, setPreviewCardKey] =
    useState<string | null>(null)
  const [loading, setLoading] =
    useState(true)
  const [error, setError] =
    useState('')
  const [message, setMessage] =
    useState('')
  const [savingRoster, setSavingRoster] = useState(false)
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


  useEffect(() => {
    if (!isDemo || cards.length === 0) return

    const byName = new Map(cards.map((card) => [card.player_name.trim().toLowerCase(), card.card_key]))
    const pick = (name: string) => byName.get(name.toLowerCase())
    const demoAssignments: Record<string, string> = {}
    const seed: Array<[string, string]> = [
      ['defense-c', 'Salvador Perez'],
      ['defense-1b', 'Nolan Schanuel'],
      ['defense-2b', 'Brendan Donovan'],
      ['defense-3b', 'Brice Matthews'],
      ['defense-ss', 'Francisco Lindor'],
      ['defense-lf', 'Nathan Lukes'],
      ['defense-cf', 'Ángel Martínez'],
      ['defense-rf', 'Addison Barger'],
      ['defense-dh', 'Shohei Ohtani'],
      ['lineup-1', 'Shohei Ohtani'],
      ['lineup-2', 'Nolan Schanuel'],
      ['lineup-3', 'Francisco Lindor'],
      ['lineup-4', 'Brendan Donovan'],
      ['lineup-5', 'Addison Barger'],
      ['lineup-6', 'Nathan Lukes'],
      ['lineup-7', 'Salvador Perez'],
      ['lineup-8', 'Ángel Martínez'],
      ['lineup-9', 'Brice Matthews'],
      ['bench-1', 'Chad Wallach'],
      ['bench-2', 'Ali Sánchez'],
      ['bench-3', 'Aramis Garcia'],
      ['bench-4', 'CJ Alexander'],
      ['rotation-1', 'Garrett Crochet'],
      ['rotation-2', 'Bryan Woo'],
      ['rotation-3', 'Framber Valdez'],
      ['rotation-4', 'Zack Littell'],
      ['rotation-5', 'Max Scherzer'],
      ['bullpen-1', 'Gabe Speier'],
      ['bullpen-2', 'Jeff Hoffman'],
      ['bullpen-3', 'Valente Bellozo'],
      ['bullpen-4', 'Mitch Spence'],
      ['bullpen-5', 'Tyler Alexander'],
      ['bullpen-6', 'Antonio Senzatela'],
      ['bullpen-7', 'Ryan Weathers'],
      ['bullpen-8', 'Héctor Neris'],
    ]
    seed.forEach(([slot, player]) => {
      const key = pick(player)
      if (key) demoAssignments[slot] = key
    })

    setName('2025 Elements Demo')
    setAssigned(demoAssignments)
    setRosterFormat('full')
    setUseDh(true)
    setLineupLoaded(true)
  }, [cards, isDemo])


  useEffect(() => {
    if (isDemo || !user || !lineupId) {
      return
    }

    setLineupLoaded(false)
    void supabase
      .from('lineups')
      .select('name, use_dh, roster_state')
      .eq('id', lineupId)
      .eq('user_id', user.id)
      .single()
      .then(({ data, error: lineupError }) => {
        if (lineupError || !data) {
          setError(lineupError?.message ?? 'Lineup could not be loaded.')
          return
        }

        const state = (data.roster_state ?? {}) as Partial<SavedLineup>
        setName(data.name)
        setAssigned(state.assigned ?? {})
        setRosterFormat(state.rosterFormat ?? 'full')
        setUseDh(data.use_dh ?? state.useDh ?? true)
        setLineupLoaded(true)
      })
  }, [lineupId, user?.id, isDemo])



  const playerLimit =
    rosterFormat === 'compact'
      ? 18
      : rosterFormat === 'standard25'
        ? 25
        : 26

  const pointCap =
    rosterFormat === 'compact'
      ? 4000
      : rosterFormat === 'standard25'
        ? 5500
        : 6000

  const activeDefenseSlots =
    useMemo(
      () =>
        DEFENSE.filter((slot) =>
          useDh
            ? true
            : slot.id !== 'defense-dh',
        ),
      [useDh],
    )

  const requiredDefenseSlots =
    useMemo(
      () =>
        activeDefenseSlots.filter(
          (slot) =>
            slot.id !== 'defense-p',
        ),
      [activeDefenseSlots],
    )

  const activeLineupSlots = useMemo(
    () => LINEUP.map((slot) =>
      !useDh && slot.id === 'lineup-9'
        ? { ...slot, label: 'P', eligibility: 'P' as const }
        : slot,
    ),
    [useDh],
  )

  const requiredLineupSlots =
    useMemo(
      () =>
        useDh
          ? LINEUP
          : LINEUP.slice(0, 8),
      [useDh],
    )

  const pitcherLimit =
    rosterFormat === 'full'
      ? 13
      : playerLimit

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
          !isDemo &&
          !isCardOwnedByManager(
            card.ownership,
            currentManager,
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
              activeLineupSlots
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

        const chartStart = (
          value: string | null,
        ) => {
          if (!value) {
            return -999
          }

          const match = value.match(/-?\d+(?:\.\d+)?/)
          return match
            ? Number(match[0])
            : -999
        }

        const numericValue = (
          card: CardRecord,
        ) => {
          if (drawerSort === 'defense') {
            return defenseValue(card)
          }

          if (drawerSort === 'year') {
            return getCardYear(card) ?? -999
          }

          if (drawerSort === 'points') {
            return getPoints(card)
          }

          const value = card[
            drawerSort as keyof CardRecord
          ]

          if (typeof value === 'number') {
            return value
          }

          if (typeof value === 'string') {
            return chartStart(value)
          }

          return -999
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

  const pitcherCount =
    selectedCards.filter(
      isPrimaryPitcher,
    ).length

  const countFilled = (
    slots: Slot[],
  ) =>
    slots.filter((slot) =>
      Boolean(assigned[slot.id]),
    ).length

  const counts = {
    defense:
      countFilled(requiredDefenseSlots),
    lineup:
      countFilled(requiredLineupSlots),
    bench: countFilled(BENCH),
    rotation: countFilled(ROTATION),
    bullpen: countFilled(BULLPEN),
  }

  const sharedReserveCount =
    counts.bench + counts.bullpen

  const sharedReserveMaximum =
    Math.max(
      0,
      playerLimit -
        requiredDefenseSlots.length -
        ROTATION.length,
    )

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


  async function saveRoster() {
    if (isDemo) {
      setMessage('Demo changes are not saved')
      window.setTimeout(() => setMessage(''), 1800)
      return
    }
    if (!user || !lineupId || savingRoster) {
      return
    }

    setSavingRoster(true)
    setMessage('Saving team…')

    const { error: saveError } = await supabase
      .from('lineups')
      .update({
        name: name.trim() || `${ACTIVE_SEASON} Team`,
        use_dh: useDh,
        player_count: totalPlayers,
        total_points: totalPoints,
        roster_state: {
          assigned,
          rosterFormat,
          useDh,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', lineupId)
      .eq('user_id', user.id)

    if (saveError) {
      setMessage(saveError.message)
      setSavingRoster(false)
      return
    }

    setSavingRoster(false)
    setMessage('Team saved')
    window.setTimeout(() => setMessage(''), 1600)
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
    if (
      !selectedSlot ||
      selectedSlot.id === 'defense-p'
    ) {
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

    const projectedPitchers =
      pitcherCount +
      (isNewUniqueCard &&
      isPrimaryPitcher(card)
        ? 1
        : 0) -
      (replacingUniqueCard &&
      existingCard &&
      isPrimaryPitcher(
        cardMap.get(
          existingCard,
        ) as CardRecord,
      )
        ? 1
        : 0)

    const reserveSlot =
      selectedSlot.section === 'bench' ||
      selectedSlot.section === 'bullpen'

    const replacingReserveCard =
      Boolean(existingCard)

    const projectedReserveCount =
      sharedReserveCount +
      (reserveSlot &&
      !replacingReserveCard
        ? 1
        : 0)

    if (
      projectedReserveCount >
      sharedReserveMaximum
    ) {
      setMessage(
        `Bench and bullpen share ${sharedReserveMaximum} roster spots`,
      )
      return
    }

    if (
      projectedPitchers >
      pitcherLimit
    ) {
      setMessage(
        `${pitcherLimit}-pitcher limit reached`,
      )
      return
    }

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

  function reorderRosterSlots(
    targetSlot: Slot,
  ) {
    if (
      !draggedLineupSlotId ||
      draggedLineupSlotId === targetSlot.id
    ) {
      setDraggedLineupSlotId(null)
      return
    }

    const sourceSlot = ALL_SLOTS.find(
      (slot) => slot.id === draggedLineupSlotId,
    )

    if (
      !sourceSlot ||
      sourceSlot.section !== targetSlot.section ||
      !['lineup', 'bench', 'rotation', 'bullpen'].includes(
        targetSlot.section,
      )
    ) {
      setDraggedLineupSlotId(null)
      return
    }

    const orderedSlots =
      targetSlot.section === 'lineup'
        ? activeLineupSlots
        : targetSlot.section === 'bench'
          ? BENCH
          : targetSlot.section === 'rotation'
            ? ROTATION
            : BULLPEN

    const sourceIndex = orderedSlots.findIndex(
      (slot) => slot.id === draggedLineupSlotId,
    )
    const targetIndex = orderedSlots.findIndex(
      (slot) => slot.id === targetSlot.id,
    )

    if (sourceIndex < 0 || targetIndex < 0) {
      setDraggedLineupSlotId(null)
      return
    }

    setAssigned((current) => {
      const values = orderedSlots.map(
        (slot) => current[slot.id],
      )
      const [movedCard] = values.splice(sourceIndex, 1)
      values.splice(targetIndex, 0, movedCard)

      const next = { ...current }

      orderedSlots.forEach((slot, index) => {
        const cardKey = values[index]
        if (cardKey) next[slot.id] = cardKey
        else delete next[slot.id]
      })

      return next
    })

    setDraggedLineupSlotId(null)
  }

  function renderSlot(slot: Slot) {
    const lockedPitcherSlot = slot.id === 'defense-p'
    const lockedLineupPitcher = !useDh && slot.id === 'lineup-9'
    const lockedSlot = lockedPitcherSlot || lockedLineupPitcher
    const cardKey = lockedLineupPitcher ? undefined : assigned[slot.id]
    const card = cardKey ? cardMap.get(cardKey) : null
    const hasHittingChart =
      card?.hitter_on_base !== null &&
      card?.hitter_on_base !== undefined
    const hasPitchingChart =
      card?.pitcher_control !== null &&
      card?.pitcher_control !== undefined

    return (
      <div
        className={[
          card
            ? 'roster-slot filled'
            : 'roster-slot',
          ['lineup', 'bench', 'rotation', 'bullpen'].includes(slot.section)
            ? 'reorderable-roster-slot'
            : '',
          slot.section === 'lineup'
            ? 'batting-order-slot'
            : '',
          draggedLineupSlotId ===
          slot.id
            ? 'is-dragging'
            : '',
          lockedSlot
            ? 'locked-pitcher-slot'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        draggable={
          ['lineup', 'bench', 'rotation', 'bullpen'].includes(
            slot.section,
          ) &&
          Boolean(card) &&
          !lockedSlot
        }
        onDragStart={() => {
          if (
            ['lineup', 'bench', 'rotation', 'bullpen'].includes(slot.section) &&
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
            ['lineup', 'bench', 'rotation', 'bullpen'].includes(slot.section)
          ) {
            event.preventDefault()
          }
        }}
        onDrop={(event) => {
          if (
            ['lineup', 'bench', 'rotation', 'bullpen'].includes(slot.section)
          ) {
            event.preventDefault()
            reorderRosterSlots(slot)
          }
        }}
        key={slot.id}
      >
        <button
          type="button"
          className="roster-slot-main"
          disabled={lockedSlot}
          onClick={() => {
            if (lockedSlot) {
              return
            }

            setSelectedSlotId(slot.id)
            setSearch('')
          }}
        >
          <span className="roster-slot-label">
            {slot.label}
          </span>

          {['lineup', 'bench', 'rotation', 'bullpen'].includes(slot.section) &&
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

              <span className="pitcher-rating-pair">
                <span
                  className={`hitter-rating-diamond${
                    hasHittingChart
                      ? ''
                      : ' rating-diamond--empty'
                  }`}
                  aria-label={
                    hasHittingChart
                      ? `On Base ${card.hitter_on_base}`
                      : 'No hitting chart'
                  }
                >
                  <span>
                    {hasHittingChart
                      ? `OB ${card.hitter_on_base}`
                      : '—'}
                  </span>
                </span>

                <span
                  className={`rating-diamond${
                    hasPitchingChart
                      ? ''
                      : ' rating-diamond--empty'
                  }`}
                  aria-label={
                    hasPitchingChart
                      ? `Control ${card.pitcher_control}`
                      : 'No pitching chart'
                  }
                >
                  <span>
                    {hasPitchingChart
                      ? `C ${card.pitcher_control}`
                      : '—'}
                  </span>
                </span>
              </span>

              <span className="roster-player-points">
                {getPoints(
                  card,
                ).toLocaleString()}
              </span>
            </>
          ) : (
            <span className="empty-slot-copy">
              {lockedLineupPitcher
                ? 'PITCHER'
                : lockedPitcherSlot
                  ? 'Pitcher'
                  : slot.section ===
                      'lineup'
                    ? 'Choose from Defense'
                    : 'Select a player'}
            </span>
          )}
        </button>

        {card &&
          !lockedSlot && (
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

  function renderFieldSlot(slot: Slot) {
    if (slot.id === 'defense-p') {
      return (
        <div className="field-pitcher-placeholder" key="field-defense-p">
          <span className="field-pitcher-space" aria-hidden="true" />
          <span className="field-position-label">P</span>
        </div>
      )
    }

    const cardKey = assigned[slot.id]
    const card = cardKey
      ? cardMap.get(cardKey)
      : null

    if (!card) {
      return (
        <div className="field-empty-position" key={`field-${slot.id}`}>
          <button
            type="button"
            className="field-empty-card"
            onClick={() => {
              setSelectedSlotId(slot.id)
              setSearch('')
            }}
          >
            <span>Select player</span>
          </button>
          <span className="field-position-label">{slot.label}</span>
        </div>
      )
    }

    return (
      <div
        className="roster-field-player-card"
        key={`field-${slot.id}`}
      >
        <button
          type="button"
          className="roster-field-card-main"
          onClick={() => {
            setSelectedSlotId(slot.id)
            setSearch('')
          }}
        >
          <span className="roster-field-card-image">
            {card.image_url ? (
              <img
                src={card.image_url}
                alt={card.player_name}
                referrerPolicy="no-referrer"
              />
            ) : (
              <span>{card.player_name[0]}</span>
            )}
          </span>

          <span className="roster-field-card-name">
            {card.player_name}
          </span>
        </button>

        <button
          type="button"
          className="remove-field-card"
          onClick={() => removeCard(slot.id)}
          aria-label={`Remove ${card.player_name}`}
        >
          ×
        </button>

        <span className="field-position-label">{slot.label}</span>
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
            ? 'defense-summary compact defense-summary-inline'
            : 'defense-summary defense-summary-inline'
        }
      >
        <span className="defense-inline-group">
          <b>C DEF:</b>
          <strong>{formatDefenseScore(catcherScore)}</strong>
        </span>

        <span className="defense-inline-divider" aria-hidden="true">|</span>

        <span className="defense-inline-group defense-inline-infield">
          <b>INF DEF:</b>
          {infieldCombinations.map((combination) => (
            <span className="defense-inline-combo" key={combination.label}>
              <small>{combination.label}</small>
              <strong>{formatDefenseScore(combination.score)}</strong>
            </span>
          ))}
        </span>

        <span className="defense-inline-divider" aria-hidden="true">|</span>

        <span className="defense-inline-group defense-inline-outfield">
          <b>OF DEF:</b>
          <span><small>LF</small><strong>{formatDefenseScore(outfieldRatings.LF)}</strong></span>
          <span><small>CF</small><strong>{formatDefenseScore(outfieldRatings.CF)}</strong></span>
          <span><small>RF</small><strong>{formatDefenseScore(outfieldRatings.RF)}</strong></span>
        </span>
      </section>
    )
  }

  function renderGroup(
    title: string,
    slots: Slot[],
    occupiedOnly = false,
  ) {
    const groupClass =
      title === 'Batting Order'
        ? 'lineup-card'
        : ['Bench', 'Rotation', 'Bullpen'].includes(title)
          ? 'vertical-roster-card'
          : ''

    const overviewGroupClass = occupiedOnly
      ? `overview-group overview-group-${title.toLowerCase().replace(/\s+/g, '-')}`
      : ''

    return (
      <section
        className={[
          'roster-section-card',
          groupClass,
          overviewGroupClass,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {occupiedOnly && (
          <div className="roster-section-heading roster-section-heading--overview">
            <h2>{title}</h2>
          </div>
        )}

        <div className="roster-slot-list">
          {(occupiedOnly
            ? slots.filter(
                (slot) =>
                  slot.id !== 'defense-p' &&
                  Boolean(assigned[slot.id]),
              )
            : slots
          ).map(renderSlot)}
        </div>
      </section>
    )
  }


  function renderDefenseField() {
    const fieldSlots = activeDefenseSlots.filter(
      (slot) => slot.id !== 'defense-dh',
    )
    const dhSlot = activeDefenseSlots.find(
      (slot) => slot.id === 'defense-dh',
    )

    return (
      <DefenseStage
        filled={counts.defense}
        required={requiredDefenseSlots.length}
        slots={fieldSlots}
        dhSlot={dhSlot}
        renderSlot={renderFieldSlot}
      />
    )
  }

  const sectionLabel = section === 'overview'
    ? 'Active Roster'
    : section === 'defense'
      ? 'Fielding'
      : section === 'lineup'
        ? 'Batting Order'
        : section.charAt(0).toUpperCase() + section.slice(1)

  const currentCard = selectedSlot && assigned[selectedSlot.id]
    ? cardMap.get(assigned[selectedSlot.id] as string) ?? null
    : null
  const previewCard = previewCardKey ? cardMap.get(previewCardKey) ?? null : null

  return (
    <div className={`app roster-app roster-workspace roster-workspace--${section}`}>
      <aside className="roster-side-nav">
        <button
          type="button"
          className="roster-side-back"
          onClick={() => navigate(appPath('/lineup-builder', isDemo))}
          title="Back to lineups"
        >
          <span>←</span>
          <strong>Team Builder</strong>
        </button>

        <nav>
          {([
            ['overview', 'Active Roster'],
            ['defense', 'Fielding'],
            ['lineup', 'Batting Order'],
            ['bench', 'Bench'],
            ['rotation', 'Rotation'],
            ['bullpen', 'Bullpen'],
          ] as Array<[Section, string]>).map(([value, label]) => (
            <button
              type="button"
              className={section === value ? 'active' : ''}
              onClick={() => setSection(value)}
              key={value}
            >
              <SidebarIcon section={value} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="roster-main-column">
        <header className="roster-header roster-header-compact">
          <div className="roster-title-block">
            <p className="eyebrow">{name}</p>
            <h1>{sectionLabel}</h1>
          </div>

          <div className="roster-header-actions">
            <div className="roster-points-status"><strong>{totalPoints.toLocaleString()} / {pointCap.toLocaleString()}</strong><span>{Math.max(pointCap-totalPoints,0).toLocaleString()} remaining</span></div>
            <button type="button" className="roster-clear-button" onClick={clearRoster}>Clear</button>
            {isDemo ? (
              <button type="button" className="roster-save-button demo-disabled-save" onClick={saveRoster}>Demo — Not Saved</button>
            ) : (
              <button type="button" className="roster-save-button" onClick={saveRoster} disabled={savingRoster}>{savingRoster ? 'Saving…' : 'Save Team'}</button>
            )}
          </div>
        </header>

        <main className="roster-page roster-page-with-sidebar">
          {message && <div className="roster-save-message">{message}</div>}
        {!loading &&
          !error &&
          section === 'overview' &&
          renderDefenseSummary(true)}

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
                    true,
                  )}
                  {renderGroup(
                    'Bench',
                    BENCH,
                    true,
                  )}
                  {renderGroup(
                    'Rotation',
                    ROTATION,
                    true,
                  )}
                  {renderGroup(
                    'Bullpen',
                    BULLPEN,
                    true,
                  )}
              </div>
            )}

            {section === 'defense' &&
              renderDefenseField()}

            {section === 'lineup' &&
              renderGroup(
                'Batting Order',
                activeLineupSlots,
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
      </div>

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
            <div className="roster-drawer-sticky-controls">
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

            {!drawerControlsOpen && (
              <div className="roster-compact-toolbar">
                <div className="roster-sort-chip-row">
                  {([['points', 'Points'], ['year', 'Year'], ['name', 'Name']] as Array<[DrawerSort, string]>).map(([value, label]) => (
                    <button
                      type="button"
                      className={drawerSort === value ? 'roster-sort-chip active' : 'roster-sort-chip'}
                      onClick={() => {
                        if (drawerSort === value) {
                          setDrawerSortDirection((current) => current === 'desc' ? 'asc' : 'desc')
                        } else {
                          setDrawerSort(value)
                          setDrawerSortDirection(value === 'name' ? 'asc' : 'desc')
                        }
                      }}
                      key={value}
                    >
                      {label}{drawerSort === value && <span>{drawerSortDirection === 'desc' ? '↓' : '↑'}</span>}
                    </button>
                  ))}
                </div>
                <button type="button" className="roster-expand-controls" onClick={() => setDrawerControlsOpen(true)}>
                  Filters & Sort +
                </button>
              </div>
            )}

            {drawerControlsOpen && (<>
            <div className="roster-expanded-controls-heading">
              <span>Filters & Sort</span>
              <button type="button" onClick={() => setDrawerControlsOpen(false)}>Collapse −</button>
            </div>
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
                  <span>Attribute Sort</span>

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
                      Select an attribute
                    </option>
                    <optgroup label="Hitter Attributes">
                      <option value="hitter_on_base">On Base</option>
                      <option value="hitter_outs">Outs</option>
                      <option value="hitter_baserunning">Baserunning</option>
                      <option value="hitter_stolen_base">Stolen Base</option>
                      <option value="hitter_fatigue">Fatigue</option>
                      <option value="hitter_pu">Pop Up</option>
                      <option value="hitter_k">Strikeout</option>
                      <option value="hitter_gb">Ground Ball</option>
                      <option value="hitter_fb">Fly Ball</option>
                      <option value="hitter_bb">Walk</option>
                      <option value="hitter_1b">Single</option>
                      <option value="hitter_1b_plus">Single Plus</option>
                      <option value="hitter_2b">Double</option>
                      <option value="hitter_3b">Triple</option>
                      <option value="hitter_hr">Home Run</option>
                    </optgroup>
                    <optgroup label="Pitcher Attributes">
                      <option value="pitcher_control">Control</option>
                      <option value="pitcher_outs">Outs</option>
                      <option value="pitcher_ip">Innings Pitched</option>
                      <option value="pitcher_fatigue">Fatigue</option>
                      <option value="pitcher_pu">Pop Up</option>
                      <option value="pitcher_k">Strikeout</option>
                      <option value="pitcher_gb">Ground Ball</option>
                      <option value="pitcher_fb">Fly Ball</option>
                      <option value="pitcher_bb">Walk</option>
                      <option value="pitcher_1b">Single</option>
                      <option value="pitcher_2b">Double</option>
                      <option value="pitcher_3b">Triple</option>
                      <option value="pitcher_hr">Home Run</option>
                    </optgroup>
                    <option value="defense">Defense at selected position</option>
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
            </>)}

            </div>

            <div className="roster-picker-content roster-picker-content-stacked">
              {currentCard && (
                <section className="roster-compare-strip">
                  <div className="roster-compare-side">
                    <span>Player being replaced</span>
                    <div className="roster-compare-card">
                      {currentCard.image_url ? <img src={currentCard.image_url} alt={`${currentCard.player_name} current card`} referrerPolicy="no-referrer" /> : <em>Image unavailable</em>}
                    </div>
                    <strong>{currentCard.player_name}</strong>
                  </div>
                  <div className="roster-compare-arrow">
                    <span>Compare</span>
                    <b>↔</b>
                  </div>
                  <div className="roster-compare-side">
                    <span>Substitute</span>
                    <div className="roster-compare-card preview">
                      {previewCard?.image_url ? <img src={previewCard.image_url} alt={`${previewCard.player_name} preview card`} referrerPolicy="no-referrer" /> : <em>Tap or hover a card to compare</em>}
                    </div>
                    <strong>{previewCard?.player_name ?? 'Select a card below'}</strong>
                    {previewCard && <button type="button" className="roster-confirm-swap" onClick={() => assignCard(previewCard)}>Make Swap</button>}
                  </div>
                </section>
              )}

              <div className={`roster-replacement-browser roster-replacement-browser-${selectedSlot.section}`}>
                <div className="roster-drawer-rules">
                  <span>{isDemo ? 'All 2025 Cards' : `Owned by ${currentManager}`}</span>
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
                (card) => {
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
                    onMouseEnter={() => setPreviewCardKey(card.card_key)}
                    onFocus={() => setPreviewCardKey(card.card_key)}
                    onPointerUp={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      if (window.matchMedia('(max-width: 768px)').matches && currentCard) {
                        setPreviewCardKey(card.card_key)
                        return
                      }
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

                    <div className="roster-card-copy roster-card-actions-only">
                      <div className="roster-card-projection">
                        <span>After Add</span>
                        <strong>
                          {afterPlayers}/{playerLimit} ·{' '}
                          {afterPoints.toLocaleString()}/{pointCap.toLocaleString()}
                        </strong>
                      </div>

                      <span className="roster-add-card-button">
                        {blocked
                          ? afterPlayers > playerLimit
                            ? 'Roster Limit Reached'
                            : 'Over Point Cap'
                          : `Add to ${selectedSlot.label}`}
                      </span>
                    </div>
                  </button>
                    )
                  },
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
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

export default RosterPage
