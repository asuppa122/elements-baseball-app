import { useMemo, useState } from 'react'
import { RULE_SECTIONS } from '../data/rulesData'
import { DIGITAL_RULE_REVIEW_MARKERS, markersAfter } from '../data/digitalRuleReview'
import michaelHarrisCard from '../assets/rulebook/section-3a-michael-harris-ii.jpeg'
import framberValdezCard from '../assets/rulebook/section-3b-framber-valdez.jpeg'
import evanPhillipsCard from '../assets/rulebook/section-3c-evan-phillips.jpeg'
import yadierMolinaCard from '../assets/rulebook/section-3c-yadier-molina.jpeg'
import lukeWilliamsCard from '../assets/rulebook/section-3d-luke-williams.jpeg'

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
  'This is an image of a typical hitter’s card:',
  'This is an image of a typical pitcher’s card:',
  'These are images of standard 2-way player cards:',
  'This is an image of an atypical player card:',
])

const SECTION_ROMAN: Record<number, string> = {
  1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII',
}


const RULEBOOK_CARD_MEDIA: Record<string, { images: { src: string; alt: string }[]; layout?: 'single' | 'pair' }> = {
  'This is an image of a typical hitter’s card:': {
    images: [{ src: michaelHarrisCard, alt: 'Michael Harris II example hitter card from the Elements Baseball League Rulebook' }],
    layout: 'single',
  },
  'This is an image of a typical pitcher’s card:': {
    images: [{ src: framberValdezCard, alt: 'Framber Valdez example pitcher card from the Elements Baseball League Rulebook' }],
    layout: 'single',
  },
  'These are images of standard 2-way player cards:': {
    images: [
      { src: evanPhillipsCard, alt: 'Evan Phillips example two-way card from the Elements Baseball League Rulebook' },
      { src: yadierMolinaCard, alt: 'Yadier Molina example two-way card from the Elements Baseball League Rulebook' },
    ],
    layout: 'pair',
  },
  'This is an image of an atypical player card:': {
    images: [{ src: lukeWilliamsCard, alt: 'Luke Williams example atypical player card from the Elements Baseball League Rulebook' }],
    layout: 'single',
  },
}

function RulebookCardMedia({ title }: { title: string }) {
  const media = RULEBOOK_CARD_MEDIA[title]
  if (!media) return null
  return (
    <figure className={`rules-card-media rules-card-media-${media.layout ?? 'single'}`}>
      <div className="rules-card-media-grid">
        {media.images.map((image) => (
          <div className="rules-card-media-frame" key={image.src}>
            <img src={image.src} alt={image.alt} loading="lazy" />
          </div>
        ))}
      </div>
    </figure>
  )
}

function DigitalReviewMarker({ marker }: { marker: (typeof DIGITAL_RULE_REVIEW_MARKERS)[number] }) {
  const isProposal = marker.status === 'proposed'
  return (
    <aside className={`rules-digital-marker rules-digital-marker-${marker.status}`} data-review-id={marker.id}>
      <div className="rules-digital-marker-icon" aria-hidden="true">{isProposal ? '◆' : '?'}</div>
      <div className="rules-digital-marker-copy">
        <span>{marker.title}</span>
        <p>{marker.text}</p>
      </div>
      <div className="rules-digital-marker-status">{isProposal ? 'Review' : 'Open Question'}</div>
    </aside>
  )
}

type RuleLine = { depth: number; text: string }

function normalizedDepth(line: RuleLine) {
  // The Cards source contains a few top-level image headings represented at depth 0.
  return Math.max(1, line.depth)
}

function alphaLabel(value: number, upper = false) {
  const letter = String.fromCharCode((upper ? 65 : 97) + ((value - 1) % 26))
  return letter
}

function hierarchyLabel(level: number, value: number) {
  if (level === 1) return `${alphaLabel(value, true)}.`
  if (level === 2) return `${value}.`
  if (level === 3) return `${alphaLabel(value)} )`.replace(' )', ')')
  if (level === 4) return `(${value})`
  if (level === 5) return `(${alphaLabel(value)})`
  const romans = ['i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii','xiii','xiv','xv','xvi','xvii','xviii','xix','xx']
  return `(${romans[value - 1] ?? value})`
}

function numberedLines(_sectionNumber: number, lines: readonly RuleLine[]) {
  const counters = [0, 0, 0, 0, 0, 0]
  let hasSubsections = lines.some((line) => SUBSECTION_TITLES.has(line.text.trim()))
  let insideSubsection = false

  return lines.map((line) => {
    if (!line.text.trim()) return { ...line, ruleNumber: '' }
    const isSubsection = SUBSECTION_TITLES.has(line.text.trim())
    if (isSubsection) {
      counters[0] += 1
      for (let index = 1; index < counters.length; index += 1) counters[index] = 0
      insideSubsection = true
      return { ...line, ruleNumber: hierarchyLabel(1, counters[0]) }
    }

    // Match the Google Doc's legal-outline hierarchy: A. → 1. → a) → (1) → (a) → (i).
    // Once a named subsection begins, source depths are relative to that subsection.
    const sourceDepth = Math.max(1, line.depth)
    const level = hasSubsections && insideSubsection ? Math.min(6, sourceDepth + 1) : Math.min(6, sourceDepth)
    counters[level - 1] += 1
    for (let index = level; index < counters.length; index += 1) counters[index] = 0
    return { ...line, ruleNumber: hierarchyLabel(level, counters[level - 1]) }
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

            <div className="rules-digital-review-legend" aria-label="Digital gameplay review markers">
              <div>
                <span className="rules-digital-legend-title">Digital Gameplay Review Layer</span>
                <small>Official Rulebook text remains unchanged. Highlighted items are separate review markers.</small>
              </div>
              <div className="rules-digital-legend-items">
                <span className="rules-digital-legend-proposed"><i>◆</i> Proposed Digital Gameplay Update</span>
                <span className="rules-digital-legend-clarification"><i>?</i> Digital Gameplay Clarification Needed</span>
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
                        const reviewMarkers = markersAfter(section.id, line.text.trim())
                        if (kind === 'subsection') {
                          return (
                            <div key={`${section.id}-${index}`}>
                              <div className="rules-subsection-heading" id={makeAnchor(section.id, line.text.trim())}>
                                <span>{line.ruleNumber}</span>
                                <h3>{line.text}</h3>
                              </div>
                              {section.id === 'section-3' && <RulebookCardMedia title={line.text.trim()} />}
                              {reviewMarkers.map((marker) => <DigitalReviewMarker marker={marker} key={marker.id} />)}
                            </div>
                          )
                        }
                        return (
                          <div key={`${section.id}-${index}`}>
                            <div className={`rules-clause rules-clause-depth-${Math.min(depth, 5)} rules-clause-${kind}`}>
                              <span className="rules-clause-number">{line.ruleNumber}</span>
                              <div className="rules-clause-content">
                                {kind === 'example' && <span className="rules-callout-label">Example</span>}
                                {kind === 'note' && <span className="rules-callout-label">Note</span>}
                                {kind === 'formula' && <span className="rules-callout-label">Rule Check</span>}
                                <p>{line.text}</p>
                              </div>
                            </div>
                            {reviewMarkers.map((marker) => <DigitalReviewMarker marker={marker} key={marker.id} />)}
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
