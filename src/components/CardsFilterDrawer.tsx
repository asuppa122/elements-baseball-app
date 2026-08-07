import type { ReactNode } from 'react'

export type UniversalSortOption<T extends string> = {
  value: T
  label: string
}

export type UniversalSelectOption = {
  value: string
  label: string
}

export type UniversalFilterField = {
  label: string
  value: string
  kind?: 'select' | 'search' | 'locked'
  placeholder?: string
  options?: UniversalSelectOption[]
  onChange?: (value: string) => void
}

type Props<TSort extends string> = {
  open: boolean
  onOpenChange: (open: boolean) => void
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  positionChips?: Array<{ value: string; label: string }>
  activePosition?: string
  onPositionChange?: (value: string) => void
  quickSortOptions: Array<UniversalSortOption<TSort>>
  quickFilterControls?: ReactNode
  sortValue: TSort
  sortDirection: 'asc' | 'desc'
  onQuickSort: (value: TSort) => void
  attributeSortValue: string
  attributeSortOptions: ReactNode
  onAttributeSortChange: (value: string) => void
  onDirectionToggle: () => void
  filterFields: UniversalFilterField[]
  onClearFilters: () => void
  children?: ReactNode
  footer?: ReactNode
}

export default function CardsFilterDrawer<TSort extends string>({
  open,
  onOpenChange,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  positionChips,
  activePosition,
  onPositionChange,
  quickSortOptions,
  quickFilterControls,
  sortValue,
  sortDirection,
  onQuickSort,
  attributeSortValue,
  attributeSortOptions,
  onAttributeSortChange,
  onDirectionToggle,
  filterFields,
  onClearFilters,
  children,
  footer,
}: Props<TSort>) {
  const quickSort = (
    <div className="cards-filter-sort-chip-row">
      {quickSortOptions.map(({ value, label }) => (
        <button
          type="button"
          className={sortValue === value ? 'cards-filter-sort-chip active' : 'cards-filter-sort-chip'}
          onClick={() => onQuickSort(value)}
          key={value}
        >
          {label}
          {sortValue === value && <span>{sortDirection === 'desc' ? '↓' : '↑'}</span>}
        </button>
      ))}
      {quickFilterControls}
    </div>
  )

  return (
    <>
      {positionChips && (
        <div className="cards-filter-position-chip-row" aria-label="Filter by position">
          {positionChips.map(({ value, label }) => (
            <button
              type="button"
              className={activePosition === value ? 'cards-filter-sort-chip active' : 'cards-filter-sort-chip'}
              onClick={() => onPositionChange?.(value)}
              key={value || 'all'}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <label className="cards-filter-player-search">
        <span>⌕</span>
        <input
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
        />
      </label>

      {!open && (
        <div className="cards-filter-compact-toolbar">
          {quickSort}
          <button
            type="button"
            className="cards-filter-expand-controls"
            onClick={() => onOpenChange(true)}
          >
            Filters &amp; Sort +
          </button>
        </div>
      )}

      {open && (
        <>
          <div className="cards-filter-expanded-controls-heading">
            <span>Filters &amp; Sort</span>
            <button type="button" onClick={() => onOpenChange(false)}>
              Collapse −
            </button>
          </div>

          <section className="cards-filter-sort-section">
            <div className="cards-filter-sort-layout">
              <div className="cards-filter-quick-sort-group">
                <span className="cards-filter-section-label">Quick Sort</span>
                {quickSort}
              </div>

              <div className="cards-filter-advanced-sort-row">
                <label>
                  <span>Attribute Sort</span>
                  <select
                    value={attributeSortValue}
                    onChange={(event) => onAttributeSortChange(event.target.value)}
                  >
                    {attributeSortOptions}
                  </select>
                </label>

                <button
                  type="button"
                  className="cards-filter-sort-direction-button"
                  onClick={onDirectionToggle}
                >
                  {sortDirection === 'desc' ? 'High to Low ↓' : 'Low to High ↑'}
                </button>
              </div>
            </div>
          </section>

          <section className="cards-filter-filter-section">
            <div className="cards-filter-grid">
              {filterFields.map((field) => (
                <label key={field.label}>
                  <span>{field.label}</span>
                  {field.kind === 'locked' ? (
                    <div className="uf-locked-value">{field.value}</div>
                  ) : field.kind === 'search' ? (
                    <input
                      type="search"
                      value={field.value}
                      onChange={(event) => field.onChange?.(event.target.value)}
                      placeholder={field.placeholder}
                    />
                  ) : (
                    <select
                      value={field.value}
                      onChange={(event) => field.onChange?.(event.target.value)}
                    >
                      {field.options?.map((option) => (
                        <option value={option.value} key={`${field.label}-${option.value}`}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              ))}

              <button
                type="button"
                className="cards-filter-clear-button"
                onClick={onClearFilters}
              >
                Clear Filters
              </button>
            </div>
          </section>

          {children}
          {footer}
        </>
      )}
    </>
  )
}
