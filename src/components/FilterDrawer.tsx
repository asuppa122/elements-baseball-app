import {
  useMemo,
  useState,
} from 'react'

export type OwnershipFilter =
  | ''
  | 'owned-eligible'
  | 'owned-ineligible'
  | 'not-collected'

export type AttributeFilter =
  | ''
  | 'points'
  | 'hitter_fatigue'
  | 'hitter_on_base'
  | 'hitter_baserunning'
  | 'hitter_stolen_base'
  | 'pitcher_fatigue'
  | 'pitcher_control'
  | 'outs'
  | 'pitcher_ip'
  | 'k'
  | 'gb'
  | 'fb'
  | 'bb'
  | '1b'
  | '1b_plus'
  | '2b'
  | '3b'
  | 'hr'

export type AttributeOperator =
  | 'eq'
  | 'neq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'includes'
  | 'starts_at'
  | 'ends_at'

export type AttributeCondition = {
  id: string
  attribute: AttributeFilter
  operator: AttributeOperator
  value: string
}

export type SortField =
  | 'card_number'
  | 'player_name'
  | 'team'
  | 'year'
  | 'points'
  | 'hitter_fatigue'
  | 'hitter_on_base'
  | 'hitter_outs'
  | 'hitter_baserunning'
  | 'hitter_stolen_base'
  | 'pitcher_fatigue'
  | 'pitcher_control'
  | 'pitcher_outs'
  | 'pitcher_ip'
  | 'k'
  | 'gb'
  | 'fb'
  | 'bb'
  | '1b'
  | '1b_plus'
  | '2b'
  | '3b'
  | 'hr'
  | 'defense'

export type SortDirection =
  | 'asc'
  | 'desc'

export type DefensePosition =
  | ''
  | 'c'
  | '1b'
  | '2b'
  | '3b'
  | 'ss'
  | 'lf'
  | 'cf'
  | 'rf'

type FilterDrawerProps = {
  searchTerm: string
  onSearchChange: (
    value: string,
  ) => void

  yearFilter: string
  onYearFilterChange: (
    value: string,
  ) => void
  yearOptions: number[]

  teamFilter: string
  onTeamFilterChange: (
    value: string,
  ) => void

  leagueFilter: string
  onLeagueFilterChange: (
    value: string,
  ) => void
  leagueOptions: string[]

  positionFilter: string
  onPositionFilterChange: (
    value: string,
  ) => void

  ownershipFilter: OwnershipFilter
  onOwnershipFilterChange: (
    value: OwnershipFilter,
  ) => void

  batsFilter: string
  onBatsFilterChange: (
    value: string,
  ) => void

  throwsFilter: string
  onThrowsFilterChange: (
    value: string,
  ) => void

  attributeConditions: AttributeCondition[]
  onAttributeConditionsChange: (
    value: AttributeCondition[],
  ) => void

  defensePosition: DefensePosition
  onDefensePositionChange: (
    value: DefensePosition,
  ) => void

  defenseRating: string
  onDefenseRatingChange: (
    value: string,
  ) => void

  sortField: SortField
  onSortFieldChange: (
    value: SortField,
  ) => void

  sortDirection: SortDirection
  onSortDirectionChange: (
    value: SortDirection,
  ) => void

  onClearFilters: () => void
}

const POSITION_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'c', label: 'C' },
  { value: '1b', label: '1B' },
  { value: '2b', label: '2B' },
  { value: '3b', label: '3B' },
  { value: 'ss', label: 'SS' },
  { value: 'lf', label: 'LF' },
  { value: 'cf', label: 'CF' },
  { value: 'rf', label: 'RF' },
  { value: 'dh', label: 'DH' },
  { value: 'multi', label: 'Multi' },
  { value: 'p', label: 'P' },
]

const CHART_ATTRIBUTES: AttributeFilter[] = [
  'k',
  'gb',
  'fb',
  'bb',
  '1b',
  '1b_plus',
  '2b',
  '3b',
  'hr',
]

const DEFENSE_RATINGS =
  Array.from(
    { length: 17 },
    (_, index) => index - 2,
  )

function createCondition(): AttributeCondition {
  return {
    id: `attribute-${Date.now()}-${Math.random()}`,
    attribute: '',
    operator: 'eq',
    value: '',
  }
}

function FilterDrawer({
  searchTerm,
  onSearchChange,
  yearFilter,
  onYearFilterChange,
  yearOptions,
  teamFilter,
  onTeamFilterChange,
  leagueFilter,
  onLeagueFilterChange,
  leagueOptions,
  positionFilter,
  onPositionFilterChange,
  ownershipFilter,
  onOwnershipFilterChange,
  batsFilter,
  onBatsFilterChange,
  throwsFilter,
  onThrowsFilterChange,
  attributeConditions,
  onAttributeConditionsChange,
  defensePosition,
  onDefensePositionChange,
  defenseRating,
  onDefenseRatingChange,
  sortField,
  onSortFieldChange,
  sortDirection,
  onSortDirectionChange,
  onClearFilters,
}: FilterDrawerProps) {
  const [
    isOpen,
    setIsOpen,
  ] = useState(false)

  const [
    advancedOpen,
    setAdvancedOpen,
  ] = useState(false)

  const completedAttributeCount =
    attributeConditions.filter(
      (condition) =>
        condition.attribute &&
        condition.value !== '',
    ).length

  const activeFilterCount =
    useMemo(() => {
      return [
        yearFilter,
        teamFilter,
        leagueFilter,
        positionFilter,
        ownershipFilter,
        batsFilter,
        throwsFilter,
        ...Array.from(
          { length: completedAttributeCount },
          () => 'attribute',
        ),
        defensePosition &&
        defenseRating !== ''
          ? 'defense'
          : '',
        sortField !== 'points' ||
        sortDirection !== 'desc'
          ? 'sort'
          : '',
      ].filter(Boolean).length
    }, [
      batsFilter,
      completedAttributeCount,
      defensePosition,
      defenseRating,
      leagueFilter,
      ownershipFilter,
      positionFilter,
      sortDirection,
      sortField,
      teamFilter,
      throwsFilter,
      yearFilter,
    ])

  const updateCondition = (
    id: string,
    changes: Partial<AttributeCondition>,
  ) => {
    onAttributeConditionsChange(
      attributeConditions.map(
        (condition) => {
          if (condition.id !== id) {
            return condition
          }

          const nextCondition = {
            ...condition,
            ...changes,
          }

          if (
            changes.attribute !== undefined &&
            !CHART_ATTRIBUTES.includes(
              changes.attribute,
            ) &&
            [
              'includes',
              'starts_at',
              'ends_at',
            ].includes(nextCondition.operator)
          ) {
            nextCondition.operator = 'eq'
          }

          return nextCondition
        },
      ),
    )
  }

  const addCondition = () => {
    onAttributeConditionsChange([
      ...attributeConditions,
      createCondition(),
    ])
  }

  const removeCondition = (
    id: string,
  ) => {
    const remainingConditions =
      attributeConditions.filter(
        (condition) =>
          condition.id !== id,
      )

    onAttributeConditionsChange(
      remainingConditions.length > 0
        ? remainingConditions
        : [createCondition()],
    )
  }

  return (
    <section className="filter-drawer refined-filter-drawer">
      <div className="filter-toolbar">
        <label className="search-box filter-search-box">
          <span
            className="search-icon"
            aria-hidden="true"
          >
            ⌕
          </span>

          <input
            type="search"
            value={searchTerm}
            onChange={(event) =>
              onSearchChange(
                event.target.value,
              )
            }
            placeholder="Search player, team, league, or card key"
            aria-label="Search cards"
          />
        </label>

        <button
          type="button"
          className={
            isOpen
              ? 'filter-toggle-button is-open'
              : 'filter-toggle-button'
          }
          onClick={() =>
            setIsOpen(
              (currentValue) =>
                !currentValue,
            )
          }
          aria-expanded={isOpen}
          aria-controls="card-filter-panel"
        >
          <span>Filters & Sort</span>

          {activeFilterCount > 0 && (
            <strong>
              {activeFilterCount}
            </strong>
          )}

          <span
            className="filter-chevron"
            aria-hidden="true"
          >
            {isOpen ? '−' : '+'}
          </span>
        </button>
      </div>

      {isOpen && (
        <div
          id="card-filter-panel"
          className="filter-panel refined-filter-panel"
        >
          <div className="filter-panel-heading">
            <div>
              <p>Published Card Database</p>

              <h3>
                Refine and sort cards
              </h3>
            </div>

            <button
              type="button"
              className="clear-filters-button"
              onClick={onClearFilters}
              disabled={
                activeFilterCount === 0 &&
                searchTerm.length === 0
              }
            >
              Clear All
            </button>
          </div>

          <section className="refined-filter-section">
            <span className="filter-section-label">
              Position
            </span>

            <div className="position-chip-grid">
              {POSITION_OPTIONS.map(
                (position) => (
                  <button
                    type="button"
                    key={
                      position.value ||
                      'all'
                    }
                    className={
                      positionFilter ===
                      position.value
                        ? 'position-chip active'
                        : 'position-chip'
                    }
                    onClick={() =>
                      onPositionFilterChange(
                        position.value,
                      )
                    }
                  >
                    {position.label}
                  </button>
                ),
              )}
            </div>
          </section>

          <section className="refined-filter-section">
            <span className="filter-section-label">
              Card Details
            </span>

            <div className="refined-control-grid three-column-grid">
              <label className="filter-field">
                <span>Year</span>

                <select
                  value={yearFilter}
                  onChange={(event) =>
                    onYearFilterChange(
                      event.target.value,
                    )
                  }
                >
                  <option value="">
                    All years
                  </option>

                  {yearOptions.map(
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

              <label className="filter-field">
                <span>Team</span>

                <input
                  type="search"
                  value={teamFilter}
                  onChange={(event) =>
                    onTeamFilterChange(
                      event.target.value,
                    )
                  }
                  placeholder="Team name or code"
                />
              </label>

              <label className="filter-field">
                <span>League</span>

                <select
                  value={leagueFilter}
                  onChange={(event) =>
                    onLeagueFilterChange(
                      event.target.value,
                    )
                  }
                >
                  <option value="">
                    All leagues
                  </option>

                  {leagueOptions.map(
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
            </div>
          </section>

          <section className="refined-filter-section">
            <span className="filter-section-label">
              Bats and Arm
            </span>

            <div className="handedness-grid">
              <div>
                <span className="mini-filter-label">
                  Bats
                </span>

                <div className="small-chip-row">
                  {[
                    ['', 'All'],
                    ['R', 'R'],
                    ['L', 'L'],
                    ['S', 'S'],
                  ].map(
                    ([value, label]) => (
                      <button
                        type="button"
                        key={`bats-${value || 'all'}`}
                        className={
                          batsFilter === value
                            ? 'small-filter-chip active'
                            : 'small-filter-chip'
                        }
                        onClick={() =>
                          onBatsFilterChange(
                            value,
                          )
                        }
                      >
                        {label}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div>
                <span className="mini-filter-label">
                  Arm
                </span>

                <div className="small-chip-row">
                  {[
                    ['', 'All'],
                    ['R', 'R'],
                    ['L', 'L'],
                  ].map(
                    ([value, label]) => (
                      <button
                        type="button"
                        key={`arm-${value || 'all'}`}
                        className={
                          throwsFilter === value
                            ? 'small-filter-chip active'
                            : 'small-filter-chip'
                        }
                        onClick={() =>
                          onThrowsFilterChange(
                            value,
                          )
                        }
                      >
                        {label}
                      </button>
                    ),
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="refined-filter-section">
            <span className="filter-section-label">
              Ownership
            </span>

            <div className="ownership-choice-grid">
              {[
                [
                  '',
                  'All Published',
                ],
                [
                  'owned-eligible',
                  'Owned — Season Eligible',
                ],
                [
                  'owned-ineligible',
                  'Owned — Not Season Eligible',
                ],
                [
                  'not-collected',
                  'Not Collected',
                ],
              ].map(
                ([value, label]) => (
                  <button
                    type="button"
                    key={value || 'all'}
                    className={
                      ownershipFilter === value
                        ? 'ownership-choice active'
                        : 'ownership-choice'
                    }
                    onClick={() =>
                      onOwnershipFilterChange(
                        value as OwnershipFilter,
                      )
                    }
                  >
                    {label}
                  </button>
                ),
              )}
            </div>
          </section>

          <section className="refined-filter-section">
            <span className="filter-section-label">
              Quick Sort
            </span>

            <div className="card-sort-chip-row">
              {(
                [
                  ['points', 'Points'],
                  ['year', 'Year'],
                  ['player_name', 'Name'],
                ] as Array<
                  [SortField, string]
                >
              ).map(
                ([value, label]) => (
                  <button
                    type="button"
                    className={
                      sortField === value
                        ? 'card-sort-chip active'
                        : 'card-sort-chip'
                    }
                    onClick={() => {
                      if (
                        sortField === value
                      ) {
                        onSortDirectionChange(
                          sortDirection ===
                          'desc'
                            ? 'asc'
                            : 'desc',
                        )
                      } else {
                        onSortFieldChange(
                          value,
                        )

                        onSortDirectionChange(
                          value ===
                            'player_name'
                            ? 'asc'
                            : 'desc',
                        )
                      }
                    }}
                    key={value}
                  >
                    {label}

                    {sortField === value && (
                      <span
                        aria-label={
                          sortDirection ===
                          'desc'
                            ? 'Descending'
                            : 'Ascending'
                        }
                      >
                        {sortDirection ===
                        'desc'
                          ? '↓'
                          : '↑'}
                      </span>
                    )}
                  </button>
                ),
              )}
            </div>

            <div className="card-more-sort-row">
              <label className="filter-field">
                <span>
                  Advanced Sort
                </span>

                <select
                  value={
                    [
                      'points',
                      'year',
                      'player_name',
                    ].includes(sortField)
                      ? ''
                      : sortField
                  }
                  onChange={(event) => {
                    const value =
                      event.target
                        .value as SortField

                    if (!value) {
                      return
                    }

                    onSortFieldChange(
                      value,
                    )
                    onSortDirectionChange(
                      value === 'team'
                        ? 'asc'
                        : 'desc',
                    )
                  }}
                >
                  <option value="">
                    Select advanced sort
                  </option>
                  <option value="defense">
                    Defense
                  </option>
                  <option value="hitter_on_base">
                    On Base
                  </option>
                  <option value="pitcher_control">
                    Control
                  </option>
                  <option value="hitter_baserunning">
                    Speed / BsR
                  </option>
                  <option value="card_number">
                    Card Number
                  </option>
                  <option value="team">
                    Team
                  </option>
                  <option value="hitter_fatigue">
                    Hitter FtG
                  </option>
                  <option value="pitcher_fatigue">
                    Pitcher FtG
                  </option>
                  <option value="hitter_outs">
                    Hitter Outs
                  </option>
                  <option value="pitcher_outs">
                    Pitcher Outs
                  </option>
                  <option value="hitter_stolen_base">
                    SB
                  </option>
                  <option value="pitcher_ip">
                    IP
                  </option>
                  <option value="k">
                    K Rating
                  </option>
                  <option value="gb">
                    GB Rating
                  </option>
                  <option value="fb">
                    FB Rating
                  </option>
                  <option value="bb">
                    BB Rating
                  </option>
                  <option value="1b">
                    1B Rating
                  </option>
                  <option value="1b_plus">
                    1B+ Rating
                  </option>
                  <option value="2b">
                    2B Rating
                  </option>
                  <option value="3b">
                    3B Rating
                  </option>
                  <option value="hr">
                    HR Rating
                  </option>
                </select>
              </label>

              <button
                type="button"
                className="card-sort-direction-button"
                onClick={() =>
                  onSortDirectionChange(
                    sortDirection ===
                    'desc'
                      ? 'asc'
                      : 'desc',
                  )
                }
              >
                {sortDirection ===
                'desc'
                  ? 'High to Low ↓'
                  : 'Low to High ↑'}
              </button>
            </div>

            {sortField === 'defense' &&
              !defensePosition && (
                <p className="card-sort-help">
                  Select a defense position
                  under Advanced Filters to
                  sort by its rating.
                </p>
              )}
          </section>

          <section className="advanced-filter-section">
            <button
              type="button"
              className={
                advancedOpen
                  ? 'advanced-filter-toggle open'
                  : 'advanced-filter-toggle'
              }
              onClick={() =>
                setAdvancedOpen(
                  (currentValue) =>
                    !currentValue,
                )
              }
              aria-expanded={advancedOpen}
            >
              <span>
                Advanced Filters
              </span>

              <strong>
                {completedAttributeCount +
                  (defensePosition &&
                  defenseRating !== ''
                    ? 1
                    : 0)}
              </strong>

              <span aria-hidden="true">
                {advancedOpen ? '−' : '+'}
              </span>
            </button>

            {advancedOpen && (
              <div className="advanced-filter-content">
                <div className="attribute-builder-field">
                  <div className="attribute-builder-heading">
                    <div>
                      <span>Attributes</span>

                      <small>
                        Every completed row must match.
                      </small>
                    </div>

                    <button
                      type="button"
                      className="add-attribute-button"
                      onClick={addCondition}
                    >
                      + Add Attribute
                    </button>
                  </div>

                  <div className="attribute-condition-list">
                    {attributeConditions.map(
                      (condition, index) => {
                        const chartAttributeSelected =
                          CHART_ATTRIBUTES.includes(
                            condition.attribute,
                          )

                        return (
                          <div
                            className="attribute-condition-row"
                            key={condition.id}
                          >
                            <span className="attribute-and-label">
                              {index === 0
                                ? 'Where'
                                : 'And'}
                            </span>

                            <div className="attribute-filter">
                              <select
                                value={
                                  condition.attribute
                                }
                                onChange={(event) =>
                                  updateCondition(
                                    condition.id,
                                    {
                                      attribute:
                                        event.target
                                          .value as AttributeFilter,
                                    },
                                  )
                                }
                              >
                                <option value="">
                                  Select attribute
                                </option>
                                <option value="points">Points</option>
                                <option value="hitter_fatigue">Hitter FtG</option>
                                <option value="hitter_on_base">On Base</option>
                                <option value="hitter_baserunning">BsR</option>
                                <option value="hitter_stolen_base">SB</option>
                                <option value="pitcher_fatigue">Pitcher FtG</option>
                                <option value="pitcher_control">Control</option>
                                <option value="outs">Outs</option>
                                <option value="pitcher_ip">IP</option>
                                <option value="k">K</option>
                                <option value="gb">GB</option>
                                <option value="fb">FB</option>
                                <option value="bb">BB</option>
                                <option value="1b">1B</option>
                                <option value="1b_plus">1B+</option>
                                <option value="2b">2B</option>
                                <option value="3b">3B</option>
                                <option value="hr">HR</option>
                              </select>

                              <select
                                value={
                                  condition.operator
                                }
                                onChange={(event) =>
                                  updateCondition(
                                    condition.id,
                                    {
                                      operator:
                                        event.target
                                          .value as AttributeOperator,
                                    },
                                  )
                                }
                              >
                                <option value="eq">=</option>
                                <option value="neq">≠</option>
                                <option value="lt">&lt;</option>
                                <option value="lte">≤</option>
                                <option value="gt">&gt;</option>
                                <option value="gte">≥</option>

                                {chartAttributeSelected && (
                                  <>
                                    <option value="includes">Includes</option>
                                    <option value="starts_at">Starts at</option>
                                    <option value="ends_at">Ends at</option>
                                  </>
                                )}
                              </select>

                              <input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                value={
                                  condition.value
                                }
                                onChange={(event) =>
                                  updateCondition(
                                    condition.id,
                                    {
                                      value:
                                        event.target.value,
                                    },
                                  )
                                }
                                placeholder={
                                  chartAttributeSelected
                                    ? 'Rating or chart #'
                                    : 'Value'
                                }
                              />
                            </div>

                            <button
                              type="button"
                              className="remove-attribute-button"
                              onClick={() =>
                                removeCondition(
                                  condition.id,
                                )
                              }
                              aria-label={`Remove attribute ${index + 1}`}
                            >
                              ×
                            </button>
                          </div>
                        )
                      },
                    )}
                  </div>
                </div>

                <div className="advanced-defense-block">
                  <span className="mini-filter-label">
                    Defense
                  </span>

                  <div className="defense-filter">
                    <select
                      value={defensePosition}
                      onChange={(event) =>
                        onDefensePositionChange(
                          event.target
                            .value as DefensePosition,
                        )
                      }
                    >
                      <option value="">
                        Select position
                      </option>
                      <option value="c">C</option>
                      <option value="1b">1B</option>
                      <option value="2b">2B</option>
                      <option value="3b">3B</option>
                      <option value="ss">SS</option>
                      <option value="lf">LF</option>
                      <option value="cf">CF</option>
                      <option value="rf">RF</option>
                    </select>

                    <select
                      value={defenseRating}
                      onChange={(event) =>
                        onDefenseRatingChange(
                          event.target.value,
                        )
                      }
                    >
                      <option value="">
                        Any rating
                      </option>

                      {DEFENSE_RATINGS.map(
                        (rating) => (
                          <option
                            value={rating}
                            key={rating}
                          >
                            {rating}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  )
}

export default FilterDrawer
