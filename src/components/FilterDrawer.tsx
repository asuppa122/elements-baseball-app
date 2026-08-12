import { useState } from 'react'
import CardsFilterDrawer from './CardsFilterDrawer'

export type OwnershipFilter = '' | 'owned' | 'owned-eligible' | 'owned-ineligible' | 'not-collected'
export type ChartMode = 'batting' | 'pitching'
export type StatsContext = 'all' | 'hitting' | 'pitching'
export type AttributeFilter = '' | 'points' | 'hitter_fatigue' | 'hitter_on_base' | 'hitter_baserunning' | 'hitter_stolen_base' | 'pitcher_fatigue' | 'pitcher_control' | 'outs' | 'pitcher_ip' | 'k' | 'gb' | 'fb' | 'bb' | '1b' | '1b_plus' | '2b' | '3b' | 'hr'
export type AttributeOperator = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'includes' | 'starts_at' | 'ends_at'
export type AttributeCondition = {
  id: string
  attribute: AttributeFilter
  operator: AttributeOperator
  value: string
  chartMode?: ChartMode
}
export type SortField = 'card_number' | 'player_name' | 'team' | 'year' | 'points' | 'hitter_fatigue' | 'hitter_on_base' | 'hitter_outs' | 'hitter_baserunning' | 'hitter_stolen_base' | 'pitcher_fatigue' | 'pitcher_control' | 'pitcher_outs' | 'pitcher_ip' | 'k' | 'gb' | 'fb' | 'bb' | '1b' | '1b_plus' | '2b' | '3b' | 'hr' | 'defense'
export type SortDirection = 'asc' | 'desc'
export type DefensePosition = '' | 'c' | '1b' | '2b' | '3b' | 'ss' | 'lf' | 'cf' | 'rf'

type Props = {
  searchTerm: string
  onSearchChange: (value: string) => void
  yearFrom: string
  onYearFromChange: (value: string) => void
  yearTo: string
  onYearToChange: (value: string) => void
  yearOptions: number[]
  teamFilter: string
  onTeamFilterChange: (value: string) => void
  teamOptions: string[]
  leagueFilter: string
  onLeagueFilterChange: (value: string) => void
  leagueOptions: string[]
  positionFilter: string
  onPositionFilterChange: (value: string) => void
  ownershipFilter: OwnershipFilter
  onOwnershipFilterChange: (value: OwnershipFilter) => void
  seasonEligibleOnly: boolean
  onSeasonEligibleOnlyChange: (value: boolean) => void
  batsFilter: string
  onBatsFilterChange: (value: string) => void
  throwsFilter: string
  onThrowsFilterChange: (value: string) => void
  chartMode: ChartMode
  onChartModeChange: (value: ChartMode) => void
  statsContext: StatsContext
  onStatsContextChange: (value: StatsContext) => void
  attributeConditions: AttributeCondition[]
  onAttributeConditionsChange: (value: AttributeCondition[]) => void
  defensePosition: DefensePosition
  onDefensePositionChange: (value: DefensePosition) => void
  defenseRating: string
  onDefenseRatingChange: (value: string) => void
  defenseOperator: AttributeOperator
  onDefenseOperatorChange: (value: AttributeOperator) => void
  sortField: SortField
  onSortFieldChange: (value: SortField) => void
  sortDirection: SortDirection
  onSortDirectionChange: (value: SortDirection) => void
  onClearFilters: () => void
  hideOwnership?: boolean
  lockedYear?: string
}

const positions = [
  ['', 'ALL'],
  ['hitters', 'All Hitters'],
  ['p', 'P'],
  ['c', 'C'],
  ['1b', '1B'],
  ['2b', '2B'],
  ['3b', '3B'],
  ['ss', 'SS'],
  ['lf', 'LF'],
  ['cf', 'CF'],
  ['rf', 'RF'],
  ['dh', 'DH'],
] as const

const operators = [
  ['eq', '='],
  ['neq', '≠'],
  ['lt', '<'],
  ['lte', '≤'],
  ['gt', '>'],
  ['gte', '≥'],
] as const

const hitterAttributes: Array<[AttributeFilter, string]> = [
  ['hitter_on_base', 'On Base'],
  ['outs', 'Outs'],
  ['hitter_baserunning', 'Baserunning'],
  ['hitter_stolen_base', 'Stolen Base'],
  ['hitter_fatigue', 'Fatigue'],
  ['k', 'Strikeout'],
  ['gb', 'Ground Ball'],
  ['fb', 'Fly Ball'],
  ['bb', 'Walk'],
  ['1b', 'Single'],
  ['1b_plus', 'Single Plus'],
  ['2b', 'Double'],
  ['3b', 'Triple'],
  ['hr', 'Home Run'],
]

const pitcherAttributes: Array<[AttributeFilter, string]> = [
  ['pitcher_control', 'Control'],
  ['outs', 'Outs'],
  ['pitcher_ip', 'Innings Pitched'],
  ['pitcher_fatigue', 'Fatigue'],
  ['k', 'Strikeout'],
  ['gb', 'Ground Ball'],
  ['fb', 'Fly Ball'],
  ['bb', 'Walk'],
  ['1b', 'Single'],
  ['2b', 'Double'],
  ['3b', 'Triple'],
  ['hr', 'Home Run'],
]

type EncodedAttribute = `${ChartMode}:${AttributeFilter}`

function encodeAttribute(mode: ChartMode, attribute: AttributeFilter): EncodedAttribute {
  return `${mode}:${attribute}`
}

function decodeAttribute(value: string): { mode: ChartMode; attribute: AttributeFilter } | null {
  const [mode, attribute] = value.split(':')
  if ((mode !== 'batting' && mode !== 'pitching') || !attribute) return null
  return { mode, attribute: attribute as AttributeFilter }
}

function sortSelection(sortField: SortField, chartMode: ChartMode): string {
  const hitterMap: Partial<Record<SortField, AttributeFilter>> = {
    hitter_fatigue: 'hitter_fatigue',
    hitter_on_base: 'hitter_on_base',
    hitter_outs: 'outs',
    hitter_baserunning: 'hitter_baserunning',
    hitter_stolen_base: 'hitter_stolen_base',
  }
  const pitcherMap: Partial<Record<SortField, AttributeFilter>> = {
    pitcher_fatigue: 'pitcher_fatigue',
    pitcher_control: 'pitcher_control',
    pitcher_outs: 'outs',
    pitcher_ip: 'pitcher_ip',
  }

  if (hitterMap[sortField]) return encodeAttribute('batting', hitterMap[sortField]!)
  if (pitcherMap[sortField]) return encodeAttribute('pitching', pitcherMap[sortField]!)
  if (sortField === 'defense') return 'defense'
  if (['points', 'year', 'player_name'].includes(sortField)) return ''
  return encodeAttribute(chartMode, sortField as AttributeFilter)
}

export default function FilterDrawer(props: Props) {
  const [open, setOpen] = useState(false)

  const quickSort = (field: SortField) => {
    if (props.sortField === field) {
      props.onSortDirectionChange(props.sortDirection === 'desc' ? 'asc' : 'desc')
      return
    }

    props.onSortFieldChange(field)
    props.onSortDirectionChange(field === 'player_name' ? 'asc' : 'desc')
  }

  const updateCondition = (id: string, changes: Partial<AttributeCondition>) => {
    props.onAttributeConditionsChange(
      props.attributeConditions.map((condition) =>
        condition.id === id ? { ...condition, ...changes } : condition,
      ),
    )
  }

  const removeCondition = (id: string) => {
    props.onAttributeConditionsChange(
      props.attributeConditions.filter((condition) => condition.id !== id),
    )
  }

  const addCondition = () => {
    props.onAttributeConditionsChange([
      ...props.attributeConditions,
      {
        id: `f-${Date.now()}`,
        attribute: '',
        operator: 'eq',
        value: '',
        chartMode: props.statsContext === 'pitching' ? 'pitching' : 'batting',
      },
    ])
  }

  const selectedSort = sortSelection(props.sortField, props.chartMode)
  const visibleHitterAttributes = props.statsContext !== 'pitching'
  const visiblePitcherAttributes = props.statsContext !== 'hitting'
  const labelForContext = (mode: ChartMode, label: string) =>
    props.statsContext === 'all' ? `${mode === 'batting' ? 'Hitting' : 'Pitching'} · ${label}` : label

  const filterFields = [
    props.lockedYear
      ? { label: 'Year', value: props.lockedYear, kind: 'locked' as const }
      : {
          label: 'Year',
          value: props.yearFrom === props.yearTo ? props.yearFrom : '',
          options: [
            { value: '', label: 'All years' },
            ...props.yearOptions.map((year) => ({ value: String(year), label: String(year) })),
          ],
          onChange: (value: string) => {
            props.onYearFromChange(value)
            props.onYearToChange(value)
          },
        },
    {
      label: 'Team',
      value: props.teamFilter,
      kind: 'search' as const,
      placeholder: 'Team',
      onChange: props.onTeamFilterChange,
    },
    {
      label: 'League',
      value: props.leagueFilter,
      options: [
        { value: '', label: 'All leagues' },
        ...props.leagueOptions.map((league) => ({ value: league, label: league })),
      ],
      onChange: props.onLeagueFilterChange,
    },
    {
      label: 'Bats',
      value: props.batsFilter,
      options: [
        { value: '', label: 'All' },
        { value: 'R', label: 'R' },
        { value: 'L', label: 'L' },
        { value: 'S', label: 'S' },
      ],
      onChange: props.onBatsFilterChange,
    },
    {
      label: 'Arm',
      value: props.throwsFilter,
      options: [
        { value: '', label: 'All' },
        { value: 'R', label: 'R' },
        { value: 'L', label: 'L' },
      ],
      onChange: props.onThrowsFilterChange,
    },
  ]

  return (
    <section className="cards-filter-surface">
      <CardsFilterDrawer
        open={open}
        onOpenChange={setOpen}
        searchValue={props.searchTerm}
        onSearchChange={props.onSearchChange}
        searchPlaceholder="Search players"
        positionChips={positions.map(([value, label]) => ({ value, label }))}
        activePosition={props.positionFilter}
        onPositionChange={props.onPositionFilterChange}
        quickSortOptions={[
          { value: 'points' as SortField, label: 'Points' },
          { value: 'year' as SortField, label: 'Year' },
          { value: 'player_name' as SortField, label: 'Name' },
        ]}
        contextControls={
          <div className="cards-stats-context" aria-label="Chart type">
            <span className="cards-control-heading">Chart Type</span>
            <div className="cards-stats-context-options">
              {([
                ['all', 'ALL'],
                ['hitting', 'HITTING'],
                ['pitching', 'PITCHING'],
              ] as Array<[StatsContext, string]>).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={props.statsContext === value ? 'cards-filter-sort-chip active' : 'cards-filter-sort-chip'}
                  aria-pressed={props.statsContext === value}
                  onClick={() => props.onStatsContextChange(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        }
        quickFilterControls={
          <>
            {!props.hideOwnership && (
              <button
                type="button"
                className={props.ownershipFilter === 'owned' ? 'cards-filter-sort-chip active' : 'cards-filter-sort-chip'}
                aria-pressed={props.ownershipFilter === 'owned'}
                onClick={() =>
                  props.onOwnershipFilterChange(props.ownershipFilter === 'owned' ? '' : 'owned')
                }
              >
                Owned by Me
              </button>
            )}
            <button
              type="button"
              className={props.seasonEligibleOnly ? 'cards-filter-sort-chip active' : 'cards-filter-sort-chip'}
              aria-pressed={props.seasonEligibleOnly}
              onClick={() => props.onSeasonEligibleOnlyChange(!props.seasonEligibleOnly)}
            >
              Season Eligible
            </button>
          </>
        }
        sortValue={props.sortField}
        sortDirection={props.sortDirection}
        onQuickSort={quickSort}
        attributeSortValue={selectedSort}
        attributeSortOptions={
          <>
            <option value="">Select an attribute</option>
            {visibleHitterAttributes && (
              <optgroup label="Hitting Attributes">
                {hitterAttributes.map(([value, label]) => (
                  <option key={`sort-h-${value}`} value={encodeAttribute('batting', value)}>
                    {labelForContext('batting', label)}
                  </option>
                ))}
              </optgroup>
            )}
            {visiblePitcherAttributes && (
              <optgroup label="Pitching Attributes">
                {pitcherAttributes.map(([value, label]) => (
                  <option key={`sort-p-${value}`} value={encodeAttribute('pitching', value)}>
                    {labelForContext('pitching', label)}
                  </option>
                ))}
              </optgroup>
            )}
            <option value="defense">Fielding at selected position</option>
          </>
        }
        onAttributeSortChange={(value) => {
          if (value === 'defense') {
            props.onSortFieldChange('defense')
            props.onSortDirectionChange('desc')
            return
          }
          const decoded = decodeAttribute(value)
          if (!decoded) return
          props.onChartModeChange(decoded.mode)
          const nextSortField =
            decoded.attribute === 'outs'
              ? decoded.mode === 'batting'
                ? 'hitter_outs'
                : 'pitcher_outs'
              : decoded.attribute
          props.onSortFieldChange(nextSortField as SortField)
          props.onSortDirectionChange('desc')
        }}
        onDirectionToggle={() =>
          props.onSortDirectionChange(props.sortDirection === 'desc' ? 'asc' : 'desc')
        }
        filterFields={filterFields}
        onClearFilters={props.onClearFilters}
      >
        <section className="card-database-attribute-filters">
          <div className="card-database-attribute-layout shared-attribute-inline-layout">
            <span className="cards-filter-section-label card-database-attribute-inline-label shared-attribute-inline-label">Attribute Filters</span>
            <div className="card-database-condition-list shared-attribute-condition-list">
          {props.attributeConditions.map((condition) => {
            const conditionMode = condition.chartMode ?? props.chartMode
            return (
              <div className="uf-condition card-database-condition" key={condition.id}>
                <select
                  value={
                    condition.attribute
                      ? encodeAttribute(conditionMode, condition.attribute)
                      : ''
                  }
                  onChange={(event) => {
                    const decoded = decodeAttribute(event.target.value)
                    if (!decoded) {
                      updateCondition(condition.id, { attribute: '' })
                      return
                    }
                    updateCondition(condition.id, {
                      attribute: decoded.attribute,
                      chartMode: decoded.mode,
                    })
                  }}
                >
                  <option value="">Select an attribute</option>
                  {visibleHitterAttributes && (
                    <optgroup label="Hitting Attributes">
                      {hitterAttributes.map(([value, label]) => (
                        <option key={`filter-h-${value}`} value={encodeAttribute('batting', value)}>
                          {labelForContext('batting', label)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {visiblePitcherAttributes && (
                    <optgroup label="Pitching Attributes">
                      {pitcherAttributes.map(([value, label]) => (
                        <option key={`filter-p-${value}`} value={encodeAttribute('pitching', value)}>
                          {labelForContext('pitching', label)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <select
                  value={condition.operator}
                  onChange={(event) =>
                    updateCondition(condition.id, {
                      operator: event.target.value as AttributeOperator,
                    })
                  }
                >
                  {operators.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  value={condition.value}
                  onChange={(event) => updateCondition(condition.id, { value: event.target.value })}
                  placeholder="Value"
                  inputMode="decimal"
                />
                <button
                  type="button"
                  onClick={() => removeCondition(condition.id)}
                  aria-label="Remove filter"
                >
                  ×
                </button>
              </div>
            )
          })}
            </div>

          <div className="card-database-defense-row shared-defense-filter-group">
            <label>
              <span>Fielding Position</span>
              <select
                value={props.defensePosition}
                onChange={(event) =>
                  props.onDefensePositionChange(event.target.value as DefensePosition)
                }
              >
                <option value="">Highest score</option>
                {positions
                  .filter(([value]) =>
                    ['c', '1b', '2b', '3b', 'ss', 'lf', 'cf', 'rf'].includes(value),
                  )
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
            <label className="defense-operator-field">
              <span>Operator</span>
              <select
                value={props.defenseOperator}
                onChange={(event) =>
                  props.onDefenseOperatorChange(event.target.value as AttributeOperator)
                }
                aria-label="Defense comparison operator"
              >
                {operators.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>DEF</span>
              <input
                value={props.defenseRating}
                onChange={(event) => props.onDefenseRatingChange(event.target.value)}
                placeholder="e.g. 6"
                inputMode="numeric"
              />
            </label>
          </div>
            <button type="button" className="add-filter-button card-database-inline-add-filter shared-inline-add-filter" onClick={addCondition}>
              + Add Filter
            </button>
          </div>
        </section>
      </CardsFilterDrawer>
    </section>
  )
}
