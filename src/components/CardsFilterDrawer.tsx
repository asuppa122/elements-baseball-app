import type { ReactNode } from 'react'
import type {
  UniversalFilterField,
  UniversalSelectOption,
  UniversalSortOption,
} from './UniversalFilterDrawer'

export type {
  UniversalFilterField,
  UniversalSelectOption,
  UniversalSortOption,
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
  contextControls?: ReactNode
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
  contextControls,
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
}: Props<TSort>) {
  return (
    <>
      <div className="cards-control-bar">
        <div className="cards-control-group cards-control-group-filters">
          <span className="cards-control-heading">Filters</span>
          <button
            type="button"
            className={open ? 'cards-filter-main-button active' : 'cards-filter-main-button'}
            aria-expanded={open}
            onClick={() => onOpenChange(!open)}
          >
            <span aria-hidden="true">▽</span>
            {open ? 'Hide Filters' : 'Open Filters'}
          </button>
        </div>

        <div className="cards-control-group cards-control-group-context">
          {contextControls}
        </div>

        <div className="cards-control-group cards-control-group-quick-sort">
          <span className="cards-control-heading">Quick Sort</span>
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
        </div>

        <div className="cards-control-group cards-control-group-sort-by">
          <span className="cards-control-heading">Sort By</span>
          <div className="cards-filter-sort-by-row">
            <select
              aria-label="Sort cards by attribute"
              value={attributeSortValue}
              onChange={(event) => onAttributeSortChange(event.target.value)}
            >
              {attributeSortOptions}
            </select>
            <button
              type="button"
              className="cards-filter-sort-direction-button"
              onClick={onDirectionToggle}
            >
              {sortDirection === 'desc' ? 'High to Low ↓' : 'Low to High ↑'}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <section className="cards-filter-detail-panel" aria-label="Detailed card filters">
          <div className="cards-filter-detail-primary-row">
            <label className="cards-filter-player-search">
              <span>⌕</span>
              <input
                type="search"
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
              />
            </label>

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
          </div>

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

          {children}
        </section>
      )}
    </>
  )
}
