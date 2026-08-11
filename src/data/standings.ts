export type StandingRow = {
  manager: string
  wins: number
  losses: number
  games: number
  rs: number
  ra: number
  sourceName?: string
}

// Source of truth: Document1 → STANDINGS workbook snapshot supplied/verified August 10, 2026.
// Current standings include only managers with at least one Season 10.1 game.
export const CURRENT_STANDINGS_UPDATED = 'Workbook snapshot • August 10, 2026'

export const CURRENT_STANDINGS: StandingRow[] = [
  {manager:'Will',wins:19,losses:23,games:42,rs:205,ra:216},
  {manager:'Anthony',wins:26,losses:20,games:46,rs:260,ra:201},
  {manager:'Eric',wins:19,losses:23,games:42,rs:201,ra:256},
  {manager:'Ryan',wins:3,losses:6,games:9,rs:52,ra:56},
  {manager:'Zeek',wins:2,losses:4,games:6,rs:28,ra:37},
  {manager:'James',wins:2,losses:1,games:3,rs:11,ra:9},
  {manager:'Ben',wins:1,losses:0,games:1,rs:3,ra:2},
  {manager:'Nate',wins:3,losses:3,games:6,rs:35,ra:40},
  {manager:'Chuck',wins:7,losses:7,games:14,rs:60,ra:60},
  {manager:'Jeremiah',wins:29,losses:24,games:53,rs:280,ra:258},
]

// Display/reference only. All-time values NEVER feed Season 10 milestone progress.
// Source of truth: Document1 → STANDINGS → Overall Standings.
export const ALL_TIME_STANDINGS: StandingRow[] = [
  {manager:'Will',wins:668,losses:547,games:1215,rs:5220,ra:4637},
  {manager:'Anthony',wins:616,losses:590,games:1206,rs:5051,ra:4655},
  {manager:'Eric',wins:538,losses:620,games:1158,rs:4426,ra:5072},
  {manager:'John',wins:405,losses:389,games:794,rs:3289,ra:3197},
  {manager:'Ryan',wins:372,losses:372,games:744,rs:3009,ra:3072},
  {manager:'Zeek',wins:196,losses:194,games:390,rs:1611,ra:1603},
  {manager:'Mark',wins:130,losses:154,games:284,rs:1124,ra:1216},
  {manager:'James',wins:138,losses:133,games:271,rs:1141,ra:1191},
  {manager:'Ben',wins:117,losses:140,games:257,rs:859,ra:863},
  {manager:'Nate',wins:110,losses:102,games:212,rs:1106,ra:953},
  {manager:'Chuck',wins:104,losses:105,games:209,rs:876,ra:917},
  {manager:'Matt',wins:70,losses:89,games:159,rs:624,ra:757},
  {manager:'Jeremiah',wins:66,losses:87,games:153,rs:653,ra:808},
  {manager:'Ramel',wins:8,losses:9,games:17,rs:72,ra:107},
  {manager:'Daniel',wins:9,losses:5,games:14,rs:67,ra:62},
  {manager:'Zach',wins:4,losses:8,games:12,rs:28,ra:43},
  {manager:'Brad',wins:3,losses:6,games:9,rs:41,ra:47},
  {manager:'Jaycen',wins:2,losses:7,games:9,rs:45,ra:48},
  {manager:'Miles',wins:2,losses:2,games:4,rs:14,ra:13},
  {manager:'Sisu',wins:1,losses:0,games:1,rs:7,ra:2},
  {manager:'PFly',wins:0,losses:0,games:0,rs:0,ra:0},
]
