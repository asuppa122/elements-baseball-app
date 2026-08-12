export type DigitalReviewStatus = 'proposed' | 'clarification'

export type DigitalRuleReviewMarker = {
  id: string
  sectionId: string
  afterText: string
  status: DigitalReviewStatus
  title: string
  text: string
}

/**
 * Review-only digital gameplay layer.
 * These markers intentionally do not modify RULE_SECTIONS or the official rule text.
 * They record previously discussed app/game-engine decisions and unresolved digital
 * implementation questions so Anthony + James can approve / reject / revise them later.
 */
export const DIGITAL_RULE_REVIEW_MARKERS: DigitalRuleReviewMarker[] = [
  {
    id: 'active-season-roster-blueprint',
    sectionId: 'section-2',
    afterText: 'Elements Baseball recommends a 26-man overall roster size with a 6,000 point maximum, with each team consisting of 13 pitchers & 13 hitters, including at least 1 hitter that qualifies at: C, 1B, 2B, 3B, SS, LF, CF, and RF, along with 1 additional hitter to play at DH.',
    status: 'proposed',
    title: 'Proposed Digital Gameplay Update',
    text: 'The app will use the Active Season configuration to enforce the appropriate roster blueprint instead of using one fixed modern setup. For Season 10.1 (1925), the configured game setup is 18 players, a 4,000-point cap, and no designated hitter.',
  },
  {
    id: 'automatic-lineup-visibility',
    sectionId: 'section-2',
    afterText: 'To start each game, the home team announces their starting pitcher & away team their first hitter.',
    status: 'proposed',
    title: 'Proposed Digital Gameplay Update',
    text: 'Players will not manually post their lineups. Lineups will automatically become visible to both managers at the start of the game through the app.',
  },
  {
    id: 'pitch-swing-roll-handling',
    sectionId: 'section-2',
    afterText: 'Once the “pitch” number has been rolled & the swing chart selected, the offensive team then completes a die roll to determine the “swing” result as determined by the previously selected swing chart.',
    status: 'clarification',
    title: 'Digital Gameplay Clarification Needed',
    text: 'Confirm whether Pitch and Swing die rolls will be generated directly by the app or whether managers will continue rolling externally and entering the results. The official Pitch → advantage → Swing sequence should remain unchanged either way.',
  },
  {
    id: 'app-roster-source-of-truth',
    sectionId: 'section-4',
    afterText: 'Rosters must be posted in their entirety on each specific GM’s Elements League Workbook roster tab, with all 26 rosters slots being accounted for.',
    status: 'clarification',
    title: 'Digital Gameplay Clarification Needed',
    text: 'Confirm whether the roster saved in Team Builder becomes the official roster/eligibility source for app-based games, or whether the league workbook remains an additional required source during the transition to digital gameplay.',
  },
  {
    id: 'active-season-mlb-rules',
    sectionId: 'section-4',
    afterText: 'For era & year locked non-modern seasons, all games are to use the earliest locked year of the MLB rulebook for all MLB rules.',
    status: 'proposed',
    title: 'Proposed Digital Gameplay Update',
    text: 'The app will apply MLB rules from the configured Active Season year. Season-dependent rules therefore turn on or off automatically; for example, the 26-player roster format applies to 2020-present seasons and the automatic extra-inning runner applies to 2023-present seasons.',
  },
  {
    id: 'pregame-lineup-submit-reveal',
    sectionId: 'section-4',
    afterText: 'Prior to the start of each game, both GMs must individually post their full starting line-ups & starting pitcher in whichever #the-fields Discord channel the game is taking place.',
    status: 'proposed',
    title: 'Proposed Digital Gameplay Update',
    text: 'For app-based gameplay, each manager will submit their starting lineup and starting pitcher through the game setup flow. Once the pregame selections are submitted, the app will reveal the lineups to both managers instead of requiring a manual Discord post. Announced/submitted pregame selections are locked.',
  },
  {
    id: 'current-hitter-announcement',
    sectionId: 'section-5',
    afterText: 'Throughout the game, each offensive GM must always announce their current hitter prior to any die rolls taking place for that at bat.',
    status: 'clarification',
    title: 'Digital Gameplay Clarification Needed',
    text: 'Confirm whether the manual hitter announcement remains required when the app is already displaying the active hitter, card year, current On Base, fatigue effects, and batting-order game state to both managers.',
  },
  {
    id: 'results-reporting',
    sectionId: 'section-5',
    afterText: 'After the completion of each game, the winning GM submits the following information in the #results channel in Discord.',
    status: 'clarification',
    title: 'Digital Gameplay Clarification Needed',
    text: 'Confirm whether the completed game record and required usage/fatigue information will be submitted automatically by the app, or whether the Discord results report remains required in parallel.',
  },
  {
    id: 'rts-dbp-automation',
    sectionId: 'section-7',
    afterText: 'When there is a runner on 1B with less than 2 outs & the swing is a GB result, the defensive GM must opt to either take a singular automatic out or a standard GB double play attempt.',
    status: 'clarification',
    title: 'Digital Gameplay Clarification Needed',
    text: 'Confirm the digital execution model for RTS, double-play/triple-play attempts, and fielding checks: whether the app generates the required rolls and resolves the sequence automatically, or guides managers through the official steps while managers supply the rolls. The manager’s strategic choice must occur before the resolution sequence begins.',
  },
  {
    id: 'defensive-substitution-lock',
    sectionId: 'section-7',
    afterText: 'The defensive GM can issue a defensive substitution replacing any fielder with a new fielder off the bench, or replace the current pitcher with a new pitcher out of the bullpen, at any time so long as no die rolls have been made for the current at bat.',
    status: 'proposed',
    title: 'Proposed Digital Gameplay Update',
    text: 'Defensive substitutions and bullpen changes will be entered before the replacement player enters the game. Once the manager confirms/announces the change in the app, the choice is locked and the game state advances with that replacement.',
  },
  {
    id: 'offensive-substitution-lock',
    sectionId: 'section-7',
    afterText: 'When no die rolls have been completed against the current hitter, the offensive GM may substitute out an existing runner for a pinch runner &/or the current hitter for a pinch hitter off their bench so long as the replacement player has not yet appeared in the current game.',
    status: 'proposed',
    title: 'Proposed Digital Gameplay Update',
    text: 'Pinch hitters and pinch runners will be selected before entering the plate appearance/play state. Once the manager confirms/announces the substitution in the app, that choice is locked and the game state updates to the replacement player.',
  },
  {
    id: 'fatigue-calculation-automation',
    sectionId: 'section-8',
    afterText: 'Each player has a fatigue score on their card which states how many games of rest that a player needs between plate appearances for offensive fatigue scores & between pitching appearances for pitching fatigue scores in order to become fully rested, reset their fatigue score, & play in their next game without any lingering fatigue effects.',
    status: 'clarification',
    title: 'Digital Gameplay Clarification Needed',
    text: 'Confirm which pre-game and in-game fatigue adjustments the app should calculate and apply automatically versus which, if any, still require a manager acknowledgement. The underlying fatigue rules and thresholds remain the official source of truth.',
  },
]

export function markersAfter(sectionId: string, text: string) {
  return DIGITAL_RULE_REVIEW_MARKERS.filter((marker) => marker.sectionId === sectionId && marker.afterText === text)
}
