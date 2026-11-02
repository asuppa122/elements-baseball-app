/**
 * What each column counts, shown on hover (and in the Advanced key, since a
 * phone has no hover). The Elements definitions are STATS_SPEC's; the chart
 * names follow Anthony's "OCHW (Own Chart Hit/Walk)".
 */
export const STAT_DEFS: Record<string, string> = {
  AB: 'At bats', R: 'Runs', H: 'Hits', RBI: 'Runs batted in', BB: 'Walks', SO: 'Strikeouts', HR: 'Home runs',
  IP: 'Innings pitched', ER: 'Earned runs', ERA: 'Earned run average (per 9 innings)', LOB: 'Left on base',
  PA: 'Plate appearances',
  OBA: 'On-base advantage: plate appearances in which the batter had the advantage',
  OCHO: 'Own Chart Out: chart outs made with the batter\'s advantage (on his own chart)',
  PCHW: 'Pitcher Chart Hit/Walk: hits and walks with the pitcher\'s advantage (on the pitcher\'s chart)',
  OBP: 'On-base percentage: (hits + walks) ÷ plate appearances',
  DEF: 'Positions played in the field',
  BF: 'Batters faced',
  ADV: 'Advantage: plate appearances in which the pitcher had the advantage, automatic ones included',
  OCHW: 'Own Chart Hit/Walk: hits and walks allowed with the pitcher\'s advantage (on his own chart), plus intentional walks',
  HCHO: 'Hitter Chart Out: chart outs with the batter\'s advantage (on the hitter\'s chart)',
  'ER (Advanced)': 'Elements ER: every run that scored while he was on the mound, charged to him or not (the Standard tab\'s ER counts only the earned runs charged to him)',
  'DBP/DBPa': 'Double plays turned / double-play attempts, per fielder taking part',
  'TBP/TBPa': 'Triple plays turned / triple-play attempts, per fielder taking part',
  'CS/SBa': 'As catcher: runners caught stealing / stolen-base attempts against him',
  OFA: 'Outfield assists: runners thrown out by this outfielder',
}
