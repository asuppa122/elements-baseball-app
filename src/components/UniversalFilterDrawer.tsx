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
  sortValue: TSort
  sortDirection: 'asc' | 'desc'
  onQuickSort: (value: TSort) => void
  attributeSortValue: string
  attributeSortOptions: ReactNode
  onAttributeSortChange: (value: string) => void
  onDirectionToggle: () => void
  filterFields: UniversalFilterField[]
  onClearFilters: () => void
  onClearAppliedFilters?: () => void
  children?: ReactNode
  footer?: ReactNode
  appliedFilters?: Array<{ id: string; label: string; onRemove: () => void }>
}

export default function UniversalFilterDrawer<TSort extends string>({
  open,
  onOpenChange,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  positionChips,
  activePosition,
  onPositionChange,
  quickSortOptions,
  sortValue,
  sortDirection,
  onQuickSort,
  attributeSortValue,
  attributeSortOptions,
  onAttributeSortChange,
  onDirectionToggle,
  filterFields,
  onClearFilters,
  onClearAppliedFilters,
  children,
  footer,
  appliedFilters = [],
}: Props<TSort>) {
  const quickSort = (
    <div className="tb-filter-sort-chip-row">
      {quickSortOptions.map(({ value, label }) => (
        <button
          type="button"
          className={sortValue === value ? 'tb-filter-sort-chip active' : 'tb-filter-sort-chip'}
          onClick={() => onQuickSort(value)}
          key={value}
        >
          {label}
          {sortValue === value && <span>{sortDirection === 'desc' ? '↓' : '↑'}</span>}
        </button>
      ))}
    </div>
  )

  return (
    <>
      {positionChips && (
        <div className="tb-filter-position-chip-row" aria-label="Filter by position">
          {positionChips.map(({ value, label }) => (
            <button
              type="button"
              className={activePosition === value ? 'tb-filter-sort-chip active' : 'tb-filter-sort-chip'}
              onClick={() => onPositionChange?.(value)}
              key={value || 'all'}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <label className="tb-filter-search">
        <span>⌕</span>
        <input
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
        />
      </label>

      {!open && (
        <div className="tb-filter-compact-toolbar">
          {quickSort}
          <button
            type="button"
            className="tb-filter-expand-button"
            onClick={() => onOpenChange(true)}
          >
            Filters &amp; Sort +
          </button>
        </div>
      )}

      {open && (
        <>
          <div className="tb-filter-heading">
            <span>Filters &amp; Sort</span>
            <button type="button" onClick={() => onOpenChange(false)}>
              Collapse −
            </button>
          </div>

          <div className={appliedFilters.length > 0 ? 'tb-filter-workspace has-applied-filters' : 'tb-filter-workspace'}>
            <div className="tb-filter-workspace-main">
          <section className="tb-filter-sort-section">
            <div className="tb-filter-sort-layout">
              <div className="tb-filter-quick-group">
                <span className="tb-filter-section-label">Quick Sort</span>
                {quickSort}
              </div>

              <div className="tb-filter-attribute-group">
                <label>
                  <span>Sort By</span>
                  <select
                    value={attributeSortValue}
                    onChange={(event) => onAttributeSortChange(event.target.value)}
                  >
                    {attributeSortOptions}
                  </select>
                </label>

                <button
                  type="button"
                  className="tb-filter-direction-button"
                  onClick={onDirectionToggle}
                >
                  {sortDirection === 'desc' ? 'High to Low ↓' : 'Low to High ↑'}
                </button>
              </div>
            </div>
          </section>

          <section className="tb-filter-fields-section">
            <div className="tb-filter-fields-grid">
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
                className="tb-filter-clear-button"
                onClick={onClearFilters}
              >
                Clear Filters
              </button>
            </div>
          </section>

          {children}
          {footer}
            </div>

            {appliedFilters.length > 0 && (
              <aside className="tb-applied-filters tb-filter-applied-panel" aria-label="Applied filters">
                <div className="tb-applied-filter-heading">
                  <span className="tb-filter-section-label">Applied Filters</span>
                  <button type="button" onClick={onClearAppliedFilters ?? onClearFilters}>Clear All</button>
                </div>
                <div className="tb-applied-filter-chip-row">
                  {appliedFilters.map((filter) => (
                    <button
                      type="button"
                      className="tb-applied-filter-chip"
                      onClick={filter.onRemove}
                      key={filter.id}
                      aria-label={`Remove ${filter.label} filter`}
                    >
                      <span>{filter.label}</span>
                      <strong aria-hidden="true">×</strong>
                    </button>
                  ))}
                </div>
              </aside>
            )}
          </div>
        </>
      )}
    </>
  )
}
