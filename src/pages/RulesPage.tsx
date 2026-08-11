import { useMemo, useState } from 'react'
import { RULE_SECTIONS } from '../data/rulesData'

const QUICK_RULES = [
  { label: 'Pitch vs. Swing', section: 'section-2', query: 'pitch number', demoKey: 'pitch-vs-swing' },
  { label: 'Fielding Checks', section: 'section-7', query: 'fielding check', demoKey: 'fielding-checks' },
  { label: 'Extra Bases', section: 'section-7', query: 'extra base', demoKey: 'extra-bases' },
  { label: 'Stolen Bases', section: 'section-7', query: 'stolen base', demoKey: 'stolen-bases' },
  { label: 'Bunting', section: 'section-7', query: 'bunt', demoKey: 'bunting' },
  { label: 'Fatigue', section: 'section-8', query: 'fatigue', demoKey: 'fatigue' },
]

const SUBSECTION_TITLES = new Set([
  'Fielding Scores & Checks',
  'Managerial Defensive Decisions',
  'Managerial Running Decisions',
  'Bunting',
  'Chartless Players',
  'Fatigue Score Overview',
  'Pre-Game Fatigue Effects',
  'In-Game Distance Fatigue Effects',
  'In-Game Performance Fatigue Effects',
])

const SECTION_ROMAN: Record<number, string> = {
  1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII',
}

type RuleLine = { depth: number; text: string }

function normalizedDepth(line: RuleLine) {
  // The Cards source contains a few top-level image headings represented at depth 0.
  return Math.max(1, line.depth)
}

function numberedLines(sectionNumber: number, lines: readonly RuleLine[]) {
  const counters = [0, 0, 0, 0, 0, 0]
  return lines.map((line) => {
    if (!line.text.trim()) return { ...line, ruleNumber: '' }
    const depth = normalizedDepth(line)
    counters[depth - 1] += 1
    for (let index = depth; index < counters.length; index += 1) counters[index] = 0
    const nested = counters.slice(0, depth).filter((value) => value > 0)
    return { ...line, ruleNumber: [sectionNumber, ...nested].join('.') }
  })
}

function classifyRule(text: string) {
  const lower = text.toLowerCase()
  if (SUBSECTION_TITLES.has(text.trim())) return 'subsection'
  if (lower.startsWith('for example:') || lower.startsWith('example:')) return 'example'
  if (lower.startsWith('please note')) return 'note'
  if (text.includes(' = ') || text.includes('=')) return 'formula'
  if (lower.includes('exception') || lower.startsWith('if ')) return 'conditional'
  return 'rule'
}

function makeAnchor(sectionId: string, text: string) {
  return `${sectionId}-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`
}

export default function RulesPage() {
  const [experience, setExperience] = useState<'rulebook' | 'demos'>('rulebook')
  const [activeSection, setActiveSection] = useState<string>(RULE_SECTIONS[0].id)
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)

  const normalizedSearch = search.trim().toLowerCase()
  const visibleSections = useMemo(() => {
    if (!normalizedSearch) {
      return showAll ? RULE_SECTIONS : RULE_SECTIONS.filter((section) => section.id === activeSection)
    }
    return RULE_SECTIONS
      .map((section) => ({
        ...section,
        lines: section.lines.filter((line) => line.text.toLowerCase().includes(normalizedSearch)),
      }))
      .filter((section) => section.title.toLowerCase().includes(normalizedSearch) || section.lines.length > 0)
  }, [activeSection, normalizedSearch, showAll])

  const activeSectionData = RULE_SECTIONS.find((section) => section.id === activeSection) ?? RULE_SECTIONS[0]
  const activeSubsections = activeSectionData.lines
    .filter((line) => SUBSECTION_TITLES.has(line.text.trim()))
    .map((line) => line.text.trim())

  const jumpToQuickRule = (section: string, query: string) => {
    setActiveSection(section)
    setShowAll(false)
    setSearch(query)
  }

  const selectSection = (sectionId: string) => {
    setActiveSection(sectionId)
    setShowAll(false)
    setSearch('')
  }

  return (
    <main className="league-content-page rules-page rules-page-v4">
      <section className="rules-hero rules-hero-v4">
        <div className="rules-bookplate">
          <span className="league-eyebrow">Official Elements Reference</span>
          <h1>{experience === 'rulebook' ? 'Elements Baseball League Rulebook' : 'Simulated Demos'}</h1>
          <p>{experience === 'rulebook'
            ? 'The authoritative Elements Baseball rules in their original section order and hierarchy.'
            : 'A separate visual-learning space for seeing selected game situations play out step by step.'}</p>
        </div>

        {experience === 'rulebook' ? (
          <label className="rules-global-search rules-global-search-v4">
            <span className="rules-search-medallion" aria-hidden="true">⌕</span>
            <div>
              <strong>Search the Rulebook</strong>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try “stolen base”, “double play”, “fatigue”…" />
            </div>
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear rule search">×</button>}
          </label>
        ) : (
          <div className="rules-demo-hero-card">
            <span>Visual Learning</span>
            <strong>Rulebook explains it. Demos will show it.</strong>
            <p>The demo workspace remains separate from the authoritative Rulebook.</p>
          </div>
        )}
      </section>

      <nav className="rules-experience-tabs rules-experience-tabs-v4" aria-label="Rules experiences">
        <button type="button" className={experience === 'rulebook' ? 'active' : ''} onClick={() => setExperience('rulebook')}>
          <span>Official Reference</span><strong>Rulebook</strong>
        </button>
        <button type="button" className={experience === 'demos' ? 'active' : ''} onClick={() => setExperience('demos')}>
          <span>Visual Learning</span><strong>Simulated Demos</strong>
        </button>
      </nav>

      {experience === 'rulebook' ? (
        <div className="rules-layout rules-layout-v4">
          <aside className="rules-nav-panel rules-nav-v4">
            <div className="rules-nav-heading rules-nav-heading-v4">
              <div>
                <span className="league-eyebrow">Contents</span>
                <span className="rules-nav-title">Table of Contents</span>
              </div>
              <small>{RULE_SECTIONS.length} sections</small>
            </div>

            <nav className="rules-toc">
              {RULE_SECTIONS.map((section) => (
                <button
                  type="button"
                  className={activeSection === section.id && !showAll && !normalizedSearch ? 'active' : ''}
                  onClick={() => selectSection(section.id)}
                  key={section.id}
                >
                  <span className="rules-nav-number">{SECTION_ROMAN[section.number]}</span>
                  <span className="rules-nav-copy"><strong>{section.title}</strong></span>
                </button>
              ))}
            </nav>

            {activeSubsections.length > 0 && !showAll && !normalizedSearch && (
              <div className="rules-subtoc">
                <span>In this section</span>
                {activeSubsections.map((title) => (
                  <a key={title} href={`#${makeAnchor(activeSectionData.id, title)}`}>{title}</a>
                ))}
              </div>
            )}

            <button type="button" className={showAll && !normalizedSearch ? 'rules-view-all active' : 'rules-view-all'} onClick={() => { setShowAll(true); setSearch('') }}>
              Read Full Rulebook
            </button>
          </aside>

          <section className="rules-reading-panel rules-reading-v4">
            <div className="quick-rules-panel quick-rules-v4">
              <div className="quick-rules-label">
                <span>In-Game Reference</span>
                <strong>Quick Rules</strong>
              </div>
              <div className="quick-rules-grid quick-rules-grid-v4">
                {QUICK_RULES.map((item) => (
                  <button type="button" onClick={() => jumpToQuickRule(item.section, item.query)} key={item.label}>
                    <span className="quick-rule-baseball" aria-hidden="true">⚾</span>
                    <strong>{item.label}</strong>
                    <small>Jump →</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="rules-document rules-document-v4" aria-live="polite">
              {normalizedSearch && (
                <div className="rules-search-summary rules-search-summary-v4">
                  <div><span>Search Results</span>Results for <strong>“{search.trim()}”</strong></div>
                  <button type="button" onClick={() => setSearch('')}>Clear Search</button>
                </div>
              )}

              {visibleSections.length === 0 ? (
                <div className="rules-empty">No rulebook entries match that search.</div>
              ) : visibleSections.map((section) => {
                const lines = numberedLines(section.number, section.lines)
                return (
                  <article className="rules-section rules-section-v4" key={section.id}>
                    <header className="rules-chapter-header">
                      <div className="rules-chapter-number">
                        <span>Section</span>
                        <strong>{SECTION_ROMAN[section.number]}</strong>
                      </div>
                      <div>
                        <span className="rules-section-kicker">Elements Baseball League Rulebook</span>
                        <h2>{section.title}</h2>
                      </div>
                    </header>

                    <div className="rules-document-body">
                      {lines.filter((line) => line.text.trim()).map((line, index) => {
                        const kind = classifyRule(line.text.trim())
                        const depth = normalizedDepth(line)
                        if (kind === 'subsection') {
                          return (
                            <div className="rules-subsection-heading" id={makeAnchor(section.id, line.text.trim())} key={`${section.id}-${index}`}>
                              <span>{line.ruleNumber}</span>
                              <h3>{line.text}</h3>
                            </div>
                          )
                        }
                        return (
                          <div className={`rules-clause rules-clause-depth-${Math.min(depth, 5)} rules-clause-${kind}`} key={`${section.id}-${index}`}>
                            <span className="rules-clause-number">{line.ruleNumber}</span>
                            <div className="rules-clause-content">
                              {kind === 'example' && <span className="rules-callout-label">Example</span>}
                              {kind === 'note' && <span className="rules-callout-label">Note</span>}
                              {kind === 'formula' && <span className="rules-callout-label">Rule Check</span>}
                              <p>{line.text}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        </div>
      ) : (
        <section className="rules-demos-workspace rules-demos-workspace-v4">
          <div className="rules-demos-heading">
            <div>
              <span className="league-eyebrow">Simulated Demos</span>
              <h2>Game Situations</h2>
              <p>The Rulebook remains authoritative. This separate workspace will demonstrate selected rules visually without rewriting them.</p>
            </div>
            <span className="league-status-pill">Structure Ready • Demos Coming Later</span>
          </div>
          <div className="rules-demo-grid">
            {QUICK_RULES.map((item, index) => (
              <article className="rules-demo-card rules-demo-card-v4" key={item.demoKey}>
                <span className="rules-demo-number">{String(index + 1).padStart(2, '0')}</span>
                <div className="rules-demo-card-copy">
                  <strong>{item.label}</strong>
                  <p>Visual example planned for this gameplay situation.</p>
                  <div className="rules-demo-mini-stage"><span>◆</span><i>→</i><span>⚾</span><i>→</i><span>◇</span></div>
                </div>
                <span className="rules-demo-coming-soon">Demo Coming Soon</span>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
