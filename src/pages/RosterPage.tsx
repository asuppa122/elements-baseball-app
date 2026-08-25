import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import DefenseStage from '../components/DefenseStage'
import UniversalFilterDrawer from '../components/UniversalFilterDrawer'
import {
  ACTIVE_SEASON,
  loadSeasonCards,
} from '../services/cardDatabase'
import type { CardRecord } from '../types/card'
import { resolveDemoRosterAssignments } from '../data/demoRoster'
import {
  cleanSearchTerm,
  getCardImageUrl,
  getCardPoints,
  getCardPositions,
  getCardTeamCode,
  getCardYear,
  handleCardImageLoadError,
  isCardOwnedByManager,
  isSeasonEligibleCard,
  isSeasonEligibleCardForManager,
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

type AttributeOperator = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'
type AttributeCondition = {
  id: string
  attribute: DrawerSort | ''
  operator: AttributeOperator
  value: string
}
type DefensePosition = '' | 'c' | '1b' | '2b' | '3b' | 'ss' | 'lf' | 'cf' | 'rf'

const attributeOperators: Array<[AttributeOperator, string]> = [
  ['eq', '='], ['neq', '≠'], ['lt', '<'], ['lte', '≤'], ['gt', '>'], ['gte', '≥'],
]

const attributeLabels: Partial<Record<DrawerSort, string>> = {
  hitter_on_base: 'On Base',
  hitter_outs: 'Hitter Outs',
  hitter_baserunning: 'Baserunning',
  hitter_stolen_base: 'Stolen Base',
  hitter_fatigue: 'Hitter Fatigue',
  hitter_pu: 'Hitter Pop Up',
  hitter_k: 'Hitter Strikeout',
  hitter_gb: 'Hitter Ground Ball',
  hitter_fb: 'Hitter Fly Ball',
  hitter_bb: 'Hitter Walk',
  hitter_1b: 'Hitter Single',
  hitter_1b_plus: 'Single Plus',
  hitter_2b: 'Hitter Double',
  hitter_3b: 'Hitter Triple',
  hitter_hr: 'Hitter Home Run',
  pitcher_control: 'Control',
  pitcher_outs: 'Pitcher Outs',
  pitcher_ip: 'Innings Pitched',
  pitcher_fatigue: 'Pitcher Fatigue',
  pitcher_pu: 'Pitcher Pop Up',
  pitcher_k: 'Pitcher Strikeout',
  pitcher_gb: 'Pitcher Ground Ball',
  pitcher_fb: 'Pitcher Fly Ball',
  pitcher_bb: 'Pitcher Walk',
  pitcher_1b: 'Pitcher Single',
  pitcher_2b: 'Pitcher Double',
  pitcher_3b: 'Pitcher Triple',
  pitcher_hr: 'Pitcher Home Run',
  defense: 'Fielding',
}

function numericCardValue(card: CardRecord, attribute: DrawerSort): number | null {
  if (attribute === 'points') return getCardPoints(card)
  if (attribute === 'year') return getCardYear(card)
  if (attribute === 'name' || attribute === 'defense') return null
  const value = card[attribute as keyof CardRecord]
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const match = value.match(/-?\d+(?:\.\d+)?/)
    return match ? Number(match[0]) : null
  }
  return null
}

function matchesAttributeCondition(card: CardRecord, condition: AttributeCondition): boolean {
  if (!condition.attribute || condition.value.trim() === '') return true
  const actual = numericCardValue(card, condition.attribute)
  const expected = Number(condition.value)
  if (actual === null || Number.isNaN(expected)) return false
  if (condition.operator === 'eq') return actual === expected
  if (condition.operator === 'neq') return actual !== expected
  if (condition.operator === 'lt') return actual < expected
  if (condition.operator === 'lte') return actual <= expected
  if (condition.operator === 'gt') return actual > expected
  return actual >= expected
}


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
  seasonEligibleOnly: boolean
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
    'aria-hidden': true as const,
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

function isPublished(card: CardRecord) {
  return card.hitter_points !== null &&
    card.hitter_points >= 0
}

function hasChartValue(value: string | null) {
  if (value === null) return false
  const normalized = value.trim()
  return normalized.length > 0 && normalized !== '--' && normalized !== '-'
}

function hasHittingSide(card: CardRecord) {
  const hasHitterChart = [
    card.hitter_pu,
    card.hitter_k,
    card.hitter_gb,
    card.hitter_fb,
    card.hitter_bb,
    card.hitter_1b,
    card.hitter_1b_plus,
    card.hitter_2b,
    card.hitter_3b,
    card.hitter_hr,
  ].some(hasChartValue)

  return card.hitter_on_base !== null && hasHitterChart
}

function hasPitchingSide(card: CardRecord) {
  const hasPitcherChart = [
    card.pitcher_pu,
    card.pitcher_k,
    card.pitcher_gb,
    card.pitcher_fb,
    card.pitcher_bb,
    card.pitcher_1b,
    card.pitcher_2b,
    card.pitcher_3b,
    card.pitcher_hr,
  ].some(hasChartValue)

  return (
    card.pitcher_control !== null &&
    card.pitcher_ip !== null &&
    hasPitcherChart
  )
}

function isTrueTwoWay(card: CardRecord) {
  return hasHittingSide(card) && hasPitchingSide(card)
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

function matchesDefenseOperator(
  actual: number,
  expected: number,
  operator: AttributeOperator,
) {
  switch (operator) {
    case 'eq': return actual === expected
    case 'neq': return actual !== expected
    case 'lt': return actual < expected
    case 'lte': return actual <= expected
    case 'gt': return actual > expected
    case 'gte': return actual >= expected
    default: return actual >= expected
  }
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
  const [seasonEligibleOnly, setSeasonEligibleOnly] = useState(true)
  const [lineupLoaded, setLineupLoaded] = useState(false)
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
  const [attributeConditions, setAttributeConditions] = useState<AttributeCondition[]>([
    { id: 'attribute-1', attribute: '', operator: 'eq', value: '' },
  ])
  const [defensePosition, setDefensePosition] = useState<DefensePosition>('')
  const [defenseRating, setDefenseRating] = useState('')
  const [defenseOperator, setDefenseOperator] = useState<AttributeOperator>('gte')
  const [drawerControlsOpen, setDrawerControlsOpen] =
    useState(false)
  const [hoverCardKey, setHoverCardKey] =
    useState<string | null>(null)
  const [selectedSubstituteKey, setSelectedSubstituteKey] =
    useState<string | null>(null)
  const [loading, setLoading] =
    useState(true)
  const [error, setError] =
    useState('')
  const [message, setMessage] =
    useState('')
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(isDemo ? 'idle' : 'saved')
  const [autosaveError, setAutosaveError] = useState('')
  const saveInFlightRef = useRef(false)
  const pendingSaveRef = useRef<{ fingerprint: string; payload: Record<string, unknown> } | null>(null)
  const lastPersistedFingerprintRef = useRef('')
  const mountedRef = useRef(true)
  const [
    draggedLineupSlotId,
    setDraggedLineupSlotId,
  ] = useState<string | null>(null)
  const [
    tapReorderSlotId,
    setTapReorderSlotId,
  ] = useState<string | null>(null)
  const [
    tapReorderMode,
    setTapReorderMode,
  ] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse), (max-width: 820px)')
    const syncMode = () => setTapReorderMode(query.matches)
    syncMode()
    query.addEventListener?.('change', syncMode)
    return () => query.removeEventListener?.('change', syncMode)
  }, [])

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
    setHoverCardKey(null)
    setSelectedSubstituteKey(null)
  }, [selectedSlotId])

  useEffect(() => {
    setTapReorderSlotId(null)
  }, [section])

  useEffect(() => {
    if (!isDemo || cards.length === 0) return

    const demoAssignments = resolveDemoRosterAssignments(cards)

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
        const loadedSnapshot = {
          name: data.name,
          assigned: state.assigned ?? {},
          rosterFormat: (state.rosterFormat ?? 'full') as RosterFormat,
          useDh: data.use_dh ?? state.useDh ?? true,
          seasonEligibleOnly: state.seasonEligibleOnly ?? true,
        }
        lastPersistedFingerprintRef.current = JSON.stringify(loadedSnapshot)
        setName(loadedSnapshot.name)
        setAssigned(loadedSnapshot.assigned)
        setRosterFormat(loadedSnapshot.rosterFormat)
        setUseDh(loadedSnapshot.useDh)
        setSeasonEligibleOnly(loadedSnapshot.seasonEligibleOnly)
        setLineupLoaded(true)
        setAutosaveStatus('saved')
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

        if (seasonEligibleOnly) {
          const eligible = isDemo
            ? isSeasonEligibleCard(card)
            : isSeasonEligibleCardForManager(card, currentManager)
          if (!eligible) return false
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
          selectedSlot.id !== 'defense-p' &&
          usedCardKeys.has(card.card_key) &&
          existing !== card.card_key
        ) {
          // True two-way cards are one roster member with multiple legal roles.
          // Allow the same card to appear once in a hitting/fielding role and once
          // in a pitching role without creating a second player or charging points twice.
          if (!isTrueTwoWay(card)) {
            return false
          }

          const targetIsPitching =
            selectedSlot.section === 'rotation' ||
            selectedSlot.section === 'bullpen'

          const sameRoleAlreadyAssigned = ALL_SLOTS.some((slot) => {
            if (slot.id === selectedSlot.id || assigned[slot.id] !== card.card_key) {
              return false
            }

            const slotIsPitching =
              slot.section === 'rotation' ||
              slot.section === 'bullpen'

            return targetIsPitching === slotIsPitching
          })

          if (sameRoleAlreadyAssigned) {
            return false
          }
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

        if (!attributeConditions.every((condition) => matchesAttributeCondition(card, condition))) {
          return false
        }

        if (defenseRating.trim() !== '') {
          const minimum = Number(defenseRating)
          if (!Number.isNaN(minimum)) {
            const positions = defensePosition
              ? [defensePosition]
              : ['c', '1b', '2b', '3b', 'ss', 'lf', 'cf', 'rf']
            const best = Math.max(
              ...positions.map((position) => {
                const value = card[`defense_${position}` as keyof CardRecord]
                return typeof value === 'number' ? value : -999
              }),
            )
            if (!matchesDefenseOperator(best, minimum, defenseOperator)) return false
          }
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
            return getCardPoints(card)
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
    attributeConditions,
    defensePosition,
    defenseRating,
    defenseOperator,
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
    seasonEligibleOnly,
  ])

  useEffect(() => {
    if (!selectedSubstituteKey) return
    const remainsEligible = eligibleCards.some((card) => card.card_key === selectedSubstituteKey)
    if (!remainsEligible) setSelectedSubstituteKey(null)
  }, [eligibleCards, selectedSubstituteKey])

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
        sum + getCardPoints(card),
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

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (isDemo || !lineupLoaded || !user || !lineupId) return

    const snapshot = { name, assigned, rosterFormat, useDh, seasonEligibleOnly }
    const fingerprint = rosterFingerprint(snapshot)
    if (fingerprint === lastPersistedFingerprintRef.current && !saveInFlightRef.current && !pendingSaveRef.current) return

    pendingSaveRef.current = {
      fingerprint,
      payload: {
        name: name.trim() || `${ACTIVE_SEASON} Team`,
        use_dh: useDh,
        player_count: totalPlayers,
        total_points: totalPoints,
        roster_state: { assigned, rosterFormat, useDh, seasonEligibleOnly },
        updated_at: new Date().toISOString(),
      },
    }

    void drainAutosaveQueue()
  }, [assigned, isDemo, lineupId, lineupLoaded, name, rosterFormat, seasonEligibleOnly, totalPlayers, totalPoints, useDh, user?.id])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDemo || (autosaveStatus !== 'saving' && autosaveStatus !== 'error' && !pendingSaveRef.current)) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [autosaveStatus, isDemo])

  useEffect(() => {
    if (!selectedSlotId) return
    const previousOverflow = document.body.style.overflow
    const previousOverscroll = document.body.style.overscrollBehavior
    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'
    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.overscrollBehavior = previousOverscroll
    }
  }, [selectedSlotId])


  function rosterFingerprint(snapshot: {
    name: string
    assigned: Record<string, string>
    rosterFormat: RosterFormat
    useDh: boolean
    seasonEligibleOnly: boolean
  }) {
    return JSON.stringify(snapshot)
  }

  async function drainAutosaveQueue() {
    if (saveInFlightRef.current || isDemo || !user || !lineupId) return
    const nextSave = pendingSaveRef.current
    if (!nextSave) return

    pendingSaveRef.current = null
    saveInFlightRef.current = true
    if (mountedRef.current) {
      setAutosaveStatus('saving')
      setAutosaveError('')
    }

    const { error: saveError } = await supabase
      .from('lineups')
      .update(nextSave.payload)
      .eq('id', lineupId)
      .eq('user_id', user.id)

    saveInFlightRef.current = false

    if (saveError) {
      pendingSaveRef.current = nextSave
      if (mountedRef.current) {
        setAutosaveStatus('error')
        setAutosaveError(saveError.message)
      }
      return
    }

    lastPersistedFingerprintRef.current = nextSave.fingerprint

    if (pendingSaveRef.current) {
      void drainAutosaveQueue()
      return
    }

    if (mountedRef.current) setAutosaveStatus('saved')
  }

  function retryAutosave() {
    if (!pendingSaveRef.current) return
    void drainAutosaveQueue()
  }

  function clearTeam() {
    if (!window.confirm('Clear the entire team? This removes every player from Fielding, Batting Order, Bench, Rotation, and Bullpen.')) return
    setAssigned({})
    setSelectedSlotId(null)
    setMessage('Entire team cleared')
    window.setTimeout(() => setMessage(''), 1600)
  }

  function clearCurrentPage() {
    if (section === 'overview') {
      clearTeam()
      return
    }

    const linkedSlots = section === 'defense'
      ? [...DEFENSE, ...LINEUP]
      : ALL_SLOTS.filter((slot) => slot.section === section)

    const pageName = section === 'defense'
      ? 'Fielding and its connected Batting Order'
      : section === 'lineup'
        ? 'Batting Order'
        : section.charAt(0).toUpperCase() + section.slice(1)

    if (!window.confirm(`Clear ${pageName}?`)) return

    setAssigned((current) => {
      const next = { ...current }
      for (const slot of linkedSlots) delete next[slot.id]
      return next
    })
    setSelectedSlotId(null)
    setMessage(`${pageName} cleared`)
    window.setTimeout(() => setMessage(''), 1600)
  }

  function assignCard(
    card: CardRecord,
  ) {
    if (
      !selectedSlot ||
      selectedSlot.id === 'defense-p' ||
      !isEligible(card, selectedSlot)
    ) {
      setMessage('That card is not eligible for this roster slot')
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
        ? getCardPoints(card)
        : 0) -
      (replacingUniqueCard &&
      existingCard
        ? getCardPoints(
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

    // Do not cap bench/bullpen by occupied UI slots. The real roster limit is
    // based on unique roster members, so a true two-way player may legally
    // occupy both a hitting/fielding assignment and a pitching assignment.

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
    setHoverCardKey(null)
    setSelectedSubstituteKey(null)
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
    sourceSlotId = draggedLineupSlotId,
  ) {
    if (
      !sourceSlotId ||
      sourceSlotId === targetSlot.id
    ) {
      setDraggedLineupSlotId(null)
      setTapReorderSlotId(null)
      return
    }

    const sourceSlot = ALL_SLOTS.find(
      (slot) => slot.id === sourceSlotId,
    )

    if (
      !sourceSlot ||
      sourceSlot.section !== targetSlot.section ||
      !['lineup', 'bench', 'rotation', 'bullpen'].includes(
        targetSlot.section,
      )
    ) {
      setDraggedLineupSlotId(null)
      setTapReorderSlotId(null)
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
      (slot) => slot.id === sourceSlotId,
    )
    const targetIndex = orderedSlots.findIndex(
      (slot) => slot.id === targetSlot.id,
    )

    if (sourceIndex < 0 || targetIndex < 0) {
      setDraggedLineupSlotId(null)
      setTapReorderSlotId(null)
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
    setTapReorderSlotId(null)
  }

  function handleReorderableSlotTap(slot: Slot, hasCard: boolean) {
    if (!tapReorderMode) {
      if (slot.section !== 'lineup') {
        setSelectedSlotId(slot.id)
        setSearch('')
      }
      return
    }

    if (tapReorderSlotId) {
      if (tapReorderSlotId === slot.id) {
        setTapReorderSlotId(null)
        return
      }

      reorderRosterSlots(slot, tapReorderSlotId)
      return
    }

    if (hasCard) {
      setTapReorderSlotId(slot.id)
      return
    }

    if (slot.section !== 'lineup') {
      setSelectedSlotId(slot.id)
      setSearch('')
    }
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
    const isPitchingAssignment =
      slot.section === 'rotation' || slot.section === 'bullpen'
    const isTwoWaySecondaryAssignment = Boolean(
      card &&
      isPitchingAssignment &&
      ALL_SLOTS.some((candidate) => {
        if (candidate.id === slot.id || assigned[candidate.id] !== card.card_key) return false
        return candidate.section !== 'rotation' && candidate.section !== 'bullpen'
      }),
    )

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
          tapReorderSlotId === slot.id
            ? 'is-tap-selected'
            : '',
          tapReorderSlotId &&
          tapReorderSlotId !== slot.id &&
          ALL_SLOTS.find((candidate) => candidate.id === tapReorderSlotId)?.section === slot.section &&
          ['lineup', 'bench', 'rotation', 'bullpen'].includes(slot.section)
            ? 'is-tap-target'
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
        data-section={slot.section}
      >
        <button
          type="button"
          className="roster-slot-main"
          disabled={lockedSlot}
          onClick={() => {
            if (lockedSlot) {
              return
            }

            if (['lineup', 'bench', 'rotation', 'bullpen'].includes(slot.section)) {
              handleReorderableSlotTap(slot, Boolean(card))
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
                    src={getCardImageUrl(card.image_url, 'thumb') ?? card.image_url}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(event) =>
                      handleCardImageLoadError(event.currentTarget, card.image_url)
                    }
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

              <span
                className={`roster-player-points${isTwoWaySecondaryAssignment ? ' roster-player-points--counted' : ''}`}
                title={isTwoWaySecondaryAssignment ? `${getCardPoints(card).toLocaleString()} points counted with the hitter/fielding assignment` : undefined}
              >
                {isTwoWaySecondaryAssignment
                  ? '2-WAY'
                  : getCardPoints(card).toLocaleString()}
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
                    ? 'Choose from Fielding'
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
                src={getCardImageUrl(card.image_url, 'grid') ?? card.image_url}
                alt={card.player_name}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(event) =>
                  handleCardImageLoadError(event.currentTarget, card.image_url)
                }
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
          <span className="defense-inline-combo defense-inline-catcher">
            <small>C</small>
            <strong>{formatDefenseScore(catcherScore)}</strong>
          </span>
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

        {tapReorderMode && tapReorderSlotId &&
          slots.some((slot) => slot.id === tapReorderSlotId) && (
            <div className="tap-reorder-hint" role="status">
              Player selected — tap another spot to move
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
  const selectedSubstituteCard = selectedSubstituteKey ? cardMap.get(selectedSubstituteKey) ?? null : null
  const hoverCard = hoverCardKey ? cardMap.get(hoverCardKey) ?? null : null
  const previewCard = selectedSubstituteCard ?? hoverCard

  return (
    <div className={`app roster-app roster-workspace roster-workspace--${section}`}>
      <aside className="roster-side-nav">
        <button
          type="button"
          className="roster-side-back"
          onClick={() => {
            if (!isDemo && autosaveStatus === 'error' && !window.confirm('Your latest Team Builder change has not saved. Leave anyway?')) return
            navigate(appPath('/lineup-builder', isDemo))
          }}
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
              aria-label={label}
              aria-current={section === value ? 'page' : undefined}
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
            <div className="roster-points-status"><strong>{totalPoints.toLocaleString()} / {pointCap.toLocaleString()}</strong>{totalPoints > pointCap ? <span className="roster-points-over">{(totalPoints - pointCap).toLocaleString()} over cap</span> : <span>{(pointCap - totalPoints).toLocaleString()} remaining</span>}</div>
            <button
              type="button"
              className={`roster-season-toggle ${seasonEligibleOnly ? 'active' : ''}`}
              aria-pressed={seasonEligibleOnly}
              onClick={() => setSeasonEligibleOnly((current) => !current)}
              title={seasonEligibleOnly ? 'Only season-eligible cards are available' : 'Cards from all years are available'}
            >
              <span>Season Eligible</span>
              <strong>{seasonEligibleOnly ? 'ON' : 'OFF'}</strong>
            </button>
            <button type="button" className="roster-clear-button" onClick={clearCurrentPage}>Clear Page</button>
            <button type="button" className="roster-clear-button roster-clear-team-button" onClick={clearTeam}>Clear Team</button>
            {isDemo ? (
              <div className="roster-autosave-status demo" aria-live="polite">Demo — Not Saved</div>
            ) : (
              <button
                type="button"
                className={`roster-autosave-status ${autosaveStatus}`}
                onClick={autosaveStatus === 'error' ? retryAutosave : undefined}
                title={autosaveStatus === 'error' ? autosaveError : 'Team Builder autosaves every change'}
                aria-live="polite"
              >
                {autosaveStatus === 'saving' ? 'Saving…' : autosaveStatus === 'error' ? 'Save Failed — Retry' : 'Saved'}
              </button>
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
                    'Fielding',
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
              setHoverCardKey(null)
              setSelectedSubstituteKey(null)
              setSelectedSlotId(null)
            }
          }}
        >
          <aside
            className="roster-player-drawer universal-filter-surface universal-filter-surface--overlay"
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
                onClick={() => {
                  setHoverCardKey(null)
                  setSelectedSubstituteKey(null)
                  setSelectedSlotId(null)
                }}
              >
                ×
              </button>
            </div>

            <UniversalFilterDrawer
              open={drawerControlsOpen}
              onOpenChange={setDrawerControlsOpen}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search eligible players"
              quickSortOptions={[
                { value: 'points' as DrawerSort, label: 'Points' },
                { value: 'year' as DrawerSort, label: 'Year' },
                { value: 'name' as DrawerSort, label: 'Name' },
              ]}
              sortValue={drawerSort}
              sortDirection={drawerSortDirection}
              onQuickSort={(value) => {
                if (drawerSort === value) {
                  setDrawerSortDirection((current) =>
                    current === 'desc' ? 'asc' : 'desc',
                  )
                } else {
                  setDrawerSort(value)
                  setDrawerSortDirection(value === 'name' ? 'asc' : 'desc')
                }
              }}
              attributeSortValue={
                ['points', 'year', 'name'].includes(drawerSort)
                  ? ''
                  : drawerSort
              }
              attributeSortOptions={
                <>
                  <option value="">Select an attribute</option>
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
                  <option value="defense">Fielding at selected position</option>
                </>
              }
              onAttributeSortChange={(value) => {
                if (!value) return
                setDrawerSort(value as DrawerSort)
                setDrawerSortDirection('desc')
              }}
              onDirectionToggle={() =>
                setDrawerSortDirection((current) =>
                  current === 'desc' ? 'asc' : 'desc',
                )
              }
              filterFields={[
                {
                  label: 'Year',
                  value: yearFilter,
                  options: [
                    { value: '', label: 'All years' },
                    ...drawerYearOptions.map((year) => ({
                      value: String(year),
                      label: String(year),
                    })),
                  ],
                  onChange: setYearFilter,
                },
                {
                  label: 'Team',
                  value: teamFilter,
                  kind: 'search',
                  placeholder: 'Team',
                  onChange: setTeamFilter,
                },
                {
                  label: 'League',
                  value: leagueFilter,
                  options: [
                    { value: '', label: 'All leagues' },
                    ...drawerLeagueOptions.map((league) => ({
                      value: league,
                      label: league,
                    })),
                  ],
                  onChange: setLeagueFilter,
                },
                {
                  label: 'Bats',
                  value: batsFilter,
                  options: [
                    { value: '', label: 'All' },
                    { value: 'R', label: 'R' },
                    { value: 'L', label: 'L' },
                    { value: 'S', label: 'S' },
                  ],
                  onChange: setBatsFilter,
                },
                {
                  label: 'Arm',
                  value: armFilter,
                  options: [
                    { value: '', label: 'All' },
                    { value: 'R', label: 'R' },
                    { value: 'L', label: 'L' },
                  ],
                  onChange: setArmFilter,
                },
              ]}
              appliedFilters={[
                ...(seasonEligibleOnly
                  ? [{ id: 'season-eligible', label: isDemo ? 'Season Eligible' : `Eligible for ${currentManager}`, onRemove: () => setSeasonEligibleOnly(false) }]
                  : []),
                ...(search.trim()
                  ? [{ id: 'search', label: `Search: ${search.trim()}`, onRemove: () => setSearch('') }]
                  : []),
                ...(yearFilter
                  ? [{ id: 'year', label: `Year: ${yearFilter}`, onRemove: () => setYearFilter('') }]
                  : []),
                ...(teamFilter.trim()
                  ? [{ id: 'team', label: `Team: ${teamFilter.trim()}`, onRemove: () => setTeamFilter('') }]
                  : []),
                ...(leagueFilter
                  ? [{ id: 'league', label: `League: ${leagueFilter}`, onRemove: () => setLeagueFilter('') }]
                  : []),
                ...(batsFilter
                  ? [{ id: 'bats', label: `Bats: ${batsFilter}`, onRemove: () => setBatsFilter('') }]
                  : []),
                ...(armFilter
                  ? [{ id: 'arm', label: `Arm: ${armFilter}`, onRemove: () => setArmFilter('') }]
                  : []),
                ...attributeConditions
                  .filter((condition) => condition.attribute && condition.value.trim())
                  .map((condition) => ({
                    id: condition.id,
                    label: `${attributeLabels[condition.attribute as DrawerSort] ?? condition.attribute} ${attributeOperators.find(([value]) => value === condition.operator)?.[1] ?? '='} ${condition.value.trim()}`,
                    onRemove: () => setAttributeConditions((current) =>
                      current.length === 1
                        ? [{ id: 'attribute-1', attribute: '', operator: 'eq', value: '' }]
                        : current.filter((item) => item.id !== condition.id),
                    ),
                  })),
                ...(defensePosition
                  ? [{ id: 'defense-position', label: `Fielding: ${defensePosition.toUpperCase()}`, onRemove: () => setDefensePosition('') }]
                  : []),
                ...(defenseRating.trim()
                  ? [{ id: 'defense-rating', label: `${defensePosition ? defensePosition.toUpperCase() : 'Highest'} DEF ${attributeOperators.find(([value]) => value === defenseOperator)?.[1] ?? '≥'} ${defenseRating.trim()}`, onRemove: () => setDefenseRating('') }]
                  : []),
              ]}
              onClearFilters={() => {
                setSearch('')
                setYearFilter('')
                setTeamFilter('')
                setLeagueFilter('')
                setBatsFilter('')
                setArmFilter('')
                setDrawerSort('points')
                setDrawerSortDirection('desc')
              }}
              onClearAppliedFilters={() => {
                setSearch('')
                setYearFilter('')
                setTeamFilter('')
                setLeagueFilter('')
                setBatsFilter('')
                setArmFilter('')
                setSeasonEligibleOnly(false)
                setAttributeConditions([{ id: 'attribute-1', attribute: '', operator: 'eq', value: '' }])
                setDefensePosition('')
                setDefenseRating('')
                setDefenseOperator('gte')
              }}
             >
               <section className="tb-attribute-filters">
                 <div className="tb-attribute-layout shared-attribute-inline-layout">
                   <span className="tb-attribute-inline-label shared-attribute-inline-label">Attribute Filters</span>
                   <div className="tb-attribute-condition-list shared-attribute-condition-list">
                     {attributeConditions.map((condition) => (
                       <div className="tb-attribute-condition" key={condition.id}>
                         <select
                           value={condition.attribute}
                           onChange={(event) =>
                             setAttributeConditions((current) =>
                               current.map((item) =>
                                 item.id === condition.id
                                   ? { ...item, attribute: event.target.value as DrawerSort | '' }
                                   : item,
                               ),
                             )
                           }
                         >
                           <option value="">Select an attribute</option>
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
                         </select>
                         <select
                           value={condition.operator}
                           onChange={(event) =>
                             setAttributeConditions((current) =>
                               current.map((item) =>
                                 item.id === condition.id
                                   ? { ...item, operator: event.target.value as AttributeOperator }
                                   : item,
                               ),
                             )
                           }
                         >
                           {attributeOperators.map(([value, label]) => (
                             <option value={value} key={value}>{label}</option>
                           ))}
                         </select>
                         <input
                           value={condition.value}
                           onChange={(event) =>
                             setAttributeConditions((current) =>
                               current.map((item) =>
                                 item.id === condition.id ? { ...item, value: event.target.value } : item,
                               ),
                             )
                           }
                           placeholder="Value"
                           inputMode="decimal"
                         />
                         <button type="button" aria-label="Remove filter" onClick={() =>
                           setAttributeConditions((current) =>
                             current.length === 1
                               ? [{ id: 'attribute-1', attribute: '', operator: 'eq', value: '' }]
                               : current.filter((item) => item.id !== condition.id),
                           )
                         }>
                           ×
                         </button>
                       </div>
                     ))}
                   </div>

                   <div className="tb-defense-filters shared-defense-filter-group">
                     <label>
                       <span>Fielding Position</span>
                       <select value={defensePosition} onChange={(event) =>
                         setDefensePosition(event.target.value as DefensePosition)
                       }>
                         <option value="">Highest score</option>
                         <option value="c">C</option>
                         <option value="1b">1B</option>
                         <option value="2b">2B</option>
                         <option value="3b">3B</option>
                         <option value="ss">SS</option>
                         <option value="lf">LF</option>
                         <option value="cf">CF</option>
                         <option value="rf">RF</option>
                       </select>
                     </label>
                     <label className="defense-operator-field">
                       <span>Operator</span>
                       <select
                         value={defenseOperator}
                         onChange={(event) => setDefenseOperator(event.target.value as AttributeOperator)}
                         aria-label="Defense comparison operator"
                       >
                         {attributeOperators.map(([value, label]) => (
                           <option value={value} key={value}>{label}</option>
                         ))}
                       </select>
                     </label>
                     <label>
                       <span>DEF</span>
                       <input value={defenseRating} onChange={(event) =>
                         setDefenseRating(event.target.value)
                       } placeholder="e.g. 6" inputMode="numeric" />
                     </label>
                   </div>
                   <button
                     type="button"
                     className="tb-inline-add-filter shared-inline-add-filter"
                     onClick={() =>
                       setAttributeConditions((current) => [
                         ...current,
                         { id: `attribute-${Date.now()}`, attribute: '', operator: 'eq', value: '' },
                       ])
                     }
                   >
                     + Add Filter
                   </button>
                 </div>
               </section>
             </UniversalFilterDrawer>

            </div>

            <div className="roster-picker-content roster-picker-content-stacked">
              <section className="roster-compare-strip">
                <div className="roster-compare-side">
                  <span>Current</span>
                  <div className="roster-compare-card">
                    {currentCard?.image_url ? (
                      <img
                        src={getCardImageUrl(currentCard.image_url, 'thumb') ?? currentCard.image_url}
                        alt={`${currentCard.player_name} current card`}
                        referrerPolicy="no-referrer"
                        onError={(event) =>
                          handleCardImageLoadError(event.currentTarget, currentCard.image_url)
                        }
                      />
                    ) : (
                      <em>Empty {selectedSlot.label} slot</em>
                    )}
                  </div>
                  <strong>{currentCard?.player_name ?? `No player at ${selectedSlot.label}`}</strong>
                </div>
                <div className="roster-compare-side">
                  <span>{currentCard ? 'Substitute' : 'Add Player'}</span>
                  <div className="roster-compare-card preview">
                    {previewCard?.image_url ? (
                      <img
                        src={getCardImageUrl(previewCard.image_url, 'thumb') ?? previewCard.image_url}
                        alt={`${previewCard.player_name} preview card`}
                        referrerPolicy="no-referrer"
                        onError={(event) =>
                          handleCardImageLoadError(event.currentTarget, previewCard.image_url)
                        }
                      />
                    ) : (
                      <em>Tap or click a card to select</em>
                    )}
                  </div>
                  <strong>{previewCard?.player_name ?? 'Select a card below'}</strong>
                </div>
                <div className="roster-compare-shared-action">
                  <button
                    type="button"
                    className="roster-confirm-swap"
                    disabled={!selectedSubstituteCard}
                    onClick={() => selectedSubstituteCard && assignCard(selectedSubstituteCard)}
                  >
                    {selectedSubstituteCard
                      ? currentCard
                        ? 'Confirm Swap'
                        : `Confirm Add to ${selectedSlot.label}`
                      : currentCard
                        ? 'Select a Substitute'
                        : 'Select a Player'}
                  </button>
                </div>
              </section>

              <div className={`roster-mobile-confirm-bar ${selectedSubstituteCard ? 'is-ready' : ''}`}>
                <div>
                  <span>{currentCard ? 'Replace with' : `Add to ${selectedSlot.label}`}</span>
                  <strong>{selectedSubstituteCard?.player_name ?? 'Select a player'}</strong>
                </div>
                <button
                  type="button"
                  disabled={!selectedSubstituteCard}
                  onClick={() => selectedSubstituteCard && assignCard(selectedSubstituteCard)}
                >
                  {currentCard ? 'Confirm Swap' : 'Confirm Add'}
                </button>
              </div>

              <div className={`roster-replacement-browser roster-replacement-browser-${selectedSlot.section}`}>
                <div className="roster-drawer-rules">
                  <span>{isDemo ? 'All 2025 Cards' : `Owned by ${currentManager}`}</span>
                  <span>{seasonEligibleOnly ? (isDemo ? 'Season Eligible' : `Eligible for ${currentManager}`) : 'All Years'}</span>
                  <span>Published</span>
                  <span>
                    {selectedSlot.eligibility ===
                    'BATTER'
                      ? 'Fielding Starters'
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
                        ? getCardPoints(card)
                        : 0) -
                      (replacesUnique &&
                      existingCard
                        ? getCardPoints(
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
                    onMouseEnter={() => setHoverCardKey(card.card_key)}
                    onMouseLeave={() => setHoverCardKey(null)}
                    onFocus={() => setHoverCardKey(card.card_key)}
                    onBlur={() => setHoverCardKey(null)}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setSelectedSubstituteKey(card.card_key)
                      setHoverCardKey(null)
                    }}
                    key={card.card_key}
                  >
                    <div className="roster-card-image">
                      {card.image_url ? (
                        <img
                          src={getCardImageUrl(card.image_url, 'grid') ?? card.image_url}
                          alt={`${card.player_name} card`}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(event) =>
                            handleCardImageLoadError(event.currentTarget, card.image_url)
                          }
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
                          : `Select for ${selectedSlot.label}`}
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
                    ? 'Select the nine starters on the Fielding page first.'
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
