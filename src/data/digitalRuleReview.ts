export type DigitalReviewStatus = 'approved' | 'proposed' | 'clarification'

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
 *
 * `approved` markers are rule amendments Anthony approved on 2026-11-01. The
 * official text above them still mirrors the Google Doc word for word; each
 * marker carries the approved wording until the Google Doc itself is amended
 * (IMPLEMENTATION_PLAN.md §2 lists the edits).
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
  {
    id: "approved-walks-forced-only",
    sectionId: "section-7",
    afterText: "BB, 1B, & 1B+ swing results = All existing runners automatically advance 1 base.",
    status: 'approved',
    title: "Approved Rule Amendment — 2026-11-01",
    text: "Approved (Anthony, 2026-11-01): a BB swing result awards the hitter 1B and advances only forced runners; runners who are not forced stay on their base, so a runner on 3B scores on a walk only with the bases loaded (an RBI). Intentional walks move runners the same way. 1B and 1B+ are unchanged. The app has always played walks this way; the Google Doc line is to be updated to match.",
  },
  {
    id: "approved-walkoff",
    sectionId: "section-7",
    afterText: "When a hitter reaches base via a BB, 1B, 1B+, 2B, 3B, or HR swing result, all existing runners automatically advance a specific amount of bases as outlined below.",
    status: 'approved',
    title: "Approved Rule Amendment — 2026-11-01",
    text: "Approved (OBR 7.01(g), 5.08, 9.06(f)–(g)): in the bottom of the 9th or any later inning the game ends the moment the winning run scores. Later runs on that play do not count — except on a HR, where every run counts (every Elements HR is out of the park). A game-ending hit is credited with no more bases than the winning runner advanced, and no extra-base decision or 1B+ steal follows it.",
  },
  {
    id: "approved-lock-ibb",
    sectionId: "section-7",
    afterText: "The defensive GM can issue an intentional walk to the current hitter so long as no die rolls have been made for the current at bat.",
    status: 'approved',
    title: "Approved Rule Amendment — 2026-11-01",
    text: "Approved (2026-11-01): once any stolen-base attempt resolves during a plate appearance — a natural steal, a second steal of home, or a squeeze 1–7 — no further manager action is allowed in that plate appearance, whether the steal succeeded or failed: no intentional walk, pinch hitter, pinch runner, pitching change, defensive substitution, Infield In or bunt. If a caught stealing ends the inning, the same batter leads off next inning and the lock resets.",
  },
  {
    id: "approved-lock-substitution",
    sectionId: "section-7",
    afterText: "When no die rolls have been completed against the current hitter, the offensive GM may substitute out an existing runner for a pinch runner &/or the current hitter for a pinch hitter off their bench so long as the replacement player has not yet appeared in the current game.",
    status: 'approved',
    title: "Approved Rule Amendment — 2026-11-01",
    text: "Approved (2026-11-01): no pinch hitter or pinch runner after any stolen-base attempt has resolved in the current plate appearance (see the intentional-walk note).",
  },
  {
    id: "approved-lock-defense",
    sectionId: "section-7",
    afterText: "The defensive GM can issue a defensive substitution replacing any fielder with a new fielder off the bench, or replace the current pitcher with a new pitcher out of the bullpen, at any time so long as no die rolls have been made for the current at bat.",
    status: 'approved',
    title: "Approved Rule Amendment — 2026-11-01",
    text: "Approved (2026-11-01): no defensive substitution or pitching change after any stolen-base attempt has resolved in the current plate appearance.",
  },
  {
    id: "approved-infield-in-home-dp",
    sectionId: "section-7",
    afterText: "All standard GB double play, 3B-to-1B double play, & 3B-to-2B-to-1B triple play attempts cannot be attempted on a runner heading toward home plate unless the defensive GM has also declared “infield-in” prior to any die rolls for an at bat.",
    status: 'approved',
    title: "Approved Rule Amendment — 2026-11-01",
    text: "Approved (2026-11-01): double-play and triple-play attempts are never made on a runner heading toward home. With Infield In, the only out at home plate on a GB result is the bases-loaded force described below.",
  },
  {
    id: "approved-infield-in-availability",
    sectionId: "section-7",
    afterText: "When there are runners on base with less than 2 out, the defensive GM may opt to declare “infield-in” prior to any die rolls in an at bat, which results in the following.",
    status: 'approved',
    title: "Approved Rule Amendment — 2026-11-01",
    text: "Approved (2026-11-01): Infield In may be declared only with a runner on 3B and fewer than 2 outs, with the outcomes below. It is judged when the swing result is given: if by then there are 2 outs or the bases are empty, it has no effect.",
  },
  {
    id: "approved-infield-in-hold",
    sectionId: "section-7",
    afterText: "When there is a runner on 2B, a runner on 3B, runners on both 2B & 3B, or runners on both 1B & 3B, & the swing is a GB result, all existing runners “hold” at their base unless forced to advance 1 base, & the runner heading to 1B is out on a GB result.",
    status: 'approved',
    title: "Approved Rule Amendment — 2026-11-01",
    text: "Approved (2026-11-01): with runners on 1B & 3B, the hitter reaches 1B safely, the runner on 1B is forced to 2B and the runner on 3B holds — no out is recorded and the bases are loaded. Contact play stays available on every hold state (2B, 3B, 2B & 3B, 1B & 3B).",
  },
  {
    id: "approved-squeeze",
    sectionId: "section-7",
    afterText: "If the standard die roll is 1-7, the runner on 3B is automatically out on an unsuccessful stolen base attempt of home & no squeeze bunt attempt occurs.",
    status: 'approved',
    title: "Approved Rule Amendment — 2026-11-01",
    text: "Approved (2026-11-01): a squeeze 1–7 is a caught stealing of home. If it is the third out, the inning ends without completing the plate appearance and the same batter leads off the next inning. On 16–19 with two outs, the batter-runner is the third out at 1B, so the run does not score.",
  },
  {
    id: "approved-distance-threshold",
    sectionId: "section-8",
    afterText: "For each out that all pitchers record pitching beyond their card IP length, -2 is subtracted from their current Control score in the current game until the pitcher is removed.",
    status: 'approved',
    title: "Approved Rule Amendment — 2026-11-01",
    text: "Approved (2026-11-01): the -2 begins with the out that completes the card IP length and applies to every out after it (3.0 IP: 9th out; 5.0: 15th; 6.0: 18th; 6.2: 20th; 7.0: 21st), unless the Shutout Bonus applies.",
  },
  {
    id: "approved-distance-example",
    sectionId: "section-8",
    afterText: "For example: A pitcher with a Control 6 score has pitched 0.2 IP past their card IP length with no other active fatigue effects. This pitcher will have a Control 2 score for the next hitter (-2 for each out recorded beyond their card IP length totaling -4).",
    status: 'approved',
    title: "Approved Rule Amendment — 2026-11-01",
    text: "Amended example (2026-11-01): Control 6, card IP 6.0, records his 18th out and 2 more — Control 0 for the next hitter (-2 for each of outs 18, 19 and 20).",
  },
  {
    id: "approved-shutout-bonus",
    sectionId: "section-8",
    afterText: "For pitchers who have recorded at least 15 outs, allowed 0 earned runs & 0 inherited runners to score in the current game, they receive a “Shutout Bonus” & only -1 is subtracted from their Control score for each out in the current game that the pitcher records pitching beyond their card IP length. up until the pitcher has a Control score of 0 where the Control score remains until the pitcher is removed or allows an earned run.",
    status: 'approved',
    title: "Approved Rule Amendment — 2026-11-01",
    text: "Approved (2026-11-01): the Shutout Bonus begins on the out that completes the card IP length (or the 15th out, if later) and charges -1 for that out and each one after it, only while Control is above 0. It never restores Control: reductions already applied stay, and a pitcher at 0 or below stays where he is. An inherited runner scoring ends the bonus — reductions so far stay, no immediate -2, then -2 per later out.",
  },
  {
    id: "approved-shutout-example",
    sectionId: "section-8",
    afterText: "For example: A pitcher with a Control 6 score has pitched 1.1 IP past their card IP length having already pitched 5.0 IP & allowed 0 earned runs. This pitcher will have a Control 2 score for the next hitter (-1 for each 0.1 out recorded beyond their card IP length).",
    status: 'approved',
    title: "Approved Rule Amendment — 2026-11-01",
    text: "Amended example (2026-11-01): Control 6, card IP 5.0, 19 outs and no earned runs — Control 1 for the next hitter (-1 for each of outs 15 through 19).",
  },
  {
    id: "approved-shutout-short-ip",
    sectionId: "section-8",
    afterText: "Pitchers who have card IP scores of less than 5.0 IP have standard IP fatigue effects applied to them until they reach 15 outs & then these modified fatigue effects are applied going forward.",
    status: 'approved',
    title: "Approved Rule Amendment — 2026-11-01",
    text: "Clarified (2026-11-01): reductions applied before the 15th out stay when the Shutout Bonus begins — a card IP 3.0 pitcher already at Control -5 stays at -5.",
  },
  {
    id: "approved-earned-run-after-bonus",
    sectionId: "section-8",
    afterText: "If the current pitcher is over their card IP length & then allows an earned run, immediately subtract -2 from the current Control of the pitcher & then subtract -2 for each subsequent out recorded until the pitcher is removed from the game.",
    status: 'approved',
    title: "Approved Rule Amendment — 2026-11-01",
    text: "Approved (2026-11-01): the earned run here is a run charged to this pitcher (his own runner scoring). An inherited runner scoring never triggers this -2. Amended example: Control 1 after the bonus, then a HR — Control -1 for the following hitter; -3 after the next out.",
  },
  {
    id: "approved-efficiency",
    sectionId: "section-8",
    afterText: "Pitchers who retire the minimum number of batters faced in an appearance & are not appearing in back-to-back games having no rest days in between appearances are awarded an efficiency bonus +1 to their post game fatigue score.",
    status: 'approved',
    title: "Approved Rule Amendment — 2026-11-01",
    text: "Approved (2026-11-01): a pitcher qualifies when he faced at least 1 batter and his batters faced is no more than his outs recorded (double plays and caught stealing count toward outs), and he did not also make a rest appearance in his GM’s previous official game. A pitcher who faces no batter gets no efficiency reduction — and, with no completed plate appearance, incurs no rest at all.",
  },
]

export function markersAfter(sectionId: string, text: string) {
  return DIGITAL_RULE_REVIEW_MARKERS.filter((marker) => marker.sectionId === sectionId && marker.afterText === text)
}
