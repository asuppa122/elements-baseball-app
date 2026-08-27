export type StandingRow = {
  manager: string
  wins: number
  losses: number
  games: number
  rs: number
  ra: number
  sourceName?: string
}

// Source of truth: Document1 -> STANDINGS workbook, synced via
// scripts/import-standings-refresh.mjs on 2026-08-27.
// Current standings include only managers with at least one Season 10.1 game.
export const CURRENT_STANDINGS: StandingRow[] = [
  {manager:'Will',wins:20,losses:23,games:43,rs:210,ra:217},
  {manager:'Anthony',wins:28,losses:25,games:53,rs:291,ra:239},
  {manager:'Eric',wins:19,losses:23,games:42,rs:201,ra:256},
  {manager:'Ryan',wins:6,losses:8,games:14,rs:83,ra:80},
  {manager:'Zeek',wins:2,losses:4,games:6,rs:28,ra:37},
  {manager:'James',wins:2,losses:1,games:3,rs:11,ra:9},
  {manager:'Ben',wins:1,losses:0,games:1,rs:3,ra:2},
  {manager:'Nate',wins:3,losses:5,games:8,rs:39,ra:54},
  {manager:'Chuck',wins:8,losses:8,games:16,rs:76,ra:74},
  {manager:'Jeremiah',wins:36,losses:28,games:64,rs:340,ra:314},
]

// Display/reference only. All-time values NEVER feed Season 10 milestone progress.
// Source of truth: Document1 -> STANDINGS -> Overall Standings.
export const ALL_TIME_STANDINGS: StandingRow[] = [
  {manager:'Will',wins:669,losses:547,games:1216,rs:5225,ra:4638},
  {manager:'Anthony',wins:618,losses:595,games:1213,rs:5082,ra:4693},
  {manager:'Eric',wins:538,losses:620,games:1158,rs:4426,ra:5072},
  {manager:'John',wins:405,losses:389,games:794,rs:3289,ra:3197},
  {manager:'Ryan',wins:375,losses:374,games:749,rs:3040,ra:3096},
  {manager:'Zeek',wins:196,losses:194,games:390,rs:1611,ra:1603},
  {manager:'Mark',wins:130,losses:154,games:284,rs:1124,ra:1216},
  {manager:'James',wins:138,losses:133,games:271,rs:1141,ra:1191},
  {manager:'Ben',wins:117,losses:140,games:257,rs:859,ra:863},
  {manager:'Nate',wins:110,losses:104,games:214,rs:1110,ra:967},
  {manager:'Chuck',wins:105,losses:106,games:211,rs:892,ra:931},
  {manager:'Matt',wins:70,losses:89,games:159,rs:624,ra:757},
  {manager:'Jeremiah',wins:73,losses:91,games:164,rs:713,ra:864},
  {manager:'Ramel',wins:8,losses:9,games:17,rs:72,ra:107},
  {manager:'Daniel',wins:9,losses:5,games:14,rs:67,ra:62},
  {manager:'Zach',wins:4,losses:8,games:12,rs:28,ra:43},
  {manager:'Brad',wins:3,losses:6,games:9,rs:41,ra:47},
  {manager:'Jaycen',wins:2,losses:7,games:9,rs:45,ra:48},
  {manager:'Miles',wins:2,losses:2,games:4,rs:14,ra:13},
  {manager:'Sisu',wins:1,losses:0,games:1,rs:7,ra:2},
  {manager:'PFly',wins:0,losses:0,games:0,rs:0,ra:0},
]
