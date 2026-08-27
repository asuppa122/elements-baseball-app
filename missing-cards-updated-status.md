# Missing/Broken Card Images — Current Status

A clean, current-state snapshot of the "130 broken images" health-audit finding, distinct from
[IMAGE_PIPELINE.md](IMAGE_PIPELINE.md)'s chronological log of how each number was reached. Update
this file's tables when a row's status changes; leave the narrative "why" in `IMAGE_PIPELINE.md`.

Last updated: 2026-08-27.

## Summary

| Bucket | Count | Status |
|---|---|---|
| Broken `card_images` rows (pointed at nothing in R2) | 5 | ✅ Fixed and verified |
| Missing rows, real Drive match found | 8 | ✅ Fixed and verified |
| Missing rows, ladder-milestone-reroll artifacts | 30 | ✅ Closed — not a real gap |
| Missing rows, owner folder gone from Drive | 59 | 🔴 Escalated — possible data loss, pending James |
| Missing rows, no recorded owner at all | 27 | 🟡 Open — needs owner identification |
| **Total accounted for** | **129** | |

## 1. Broken rows — fixed (5)

`Bill Nuttall 1925 TOT`, `Evelio Hernandez 1956 WSH`, `Drew Butera 2015 KCR`,
`Connor Overton 2021 TOT`, `Grady Sizemore 2015 TOT`. Real source PNGs found in Drive, uploaded to
R2, `card_images` repointed. Verified via independent `HeadObjectCommand` checks.

## 2. Missing rows recovered from real Drive matches (8)

`Hobe Ferris 1907 BOS`, `Tex Pruiett 1908 BOS`, `Miller Huggins 1909 CIN`, `George McBride 1913 WSH`,
`George Strickland 1952 TOT`, `Cap Peterson 1968 WSA` (auto-confirmed), plus `Ed Klieman 1944 CLE`
and `Mike O'Berry 1982 CIN` (typo matches, visually confirmed by the project owner before import).
All 8 imported and verified via independent `HeadObjectCommand` checks.

## 3. Ladder-milestone-reroll artifacts — closed, not a gap (30)

Confirmed by James: a rejected reroll leaves a real generated `cards` row behind (real ratings, real
attributed owner) but never needed a sourced image, since no manager ends up keeping that specific
year-card. Closed on the strength of James's confirmation — but data independently corroborates only
part of it, not all 30 equally; full reasoning in `IMAGE_PIPELINE.md`'s 2026-08-27 entry. **No
further action needed on these**, but the three tiers below matter for how much weight this precedent
should carry if a similar case comes up later:

| Tier | Count | Evidence |
|---|---|---|
| Strong — independently confirmed | 11 | Same real player, different year, already imaged, **same owner's** folder |
| Weak — not counted as confirmed | 1 | Imaged sibling year exists, but owned by a *different* manager — likely unrelated |
| Unconfirmed — rests on James's word alone | 18 | Zero imaged variant anywhere in the catalog for that player, any year, any owner |

<details>
<summary>All 30 card_keys</summary>

```
Al Closter 1973 ATL          Army Cooper 1929 KCM         Bill Stoneman 1972 MON
Bobby Mathews 1881 TOT       Chad Cordero 2005 WSN        Ernie Walker 1913 SLB
Grover Powell 1963 NYM       Harry Gleason 1904 SLB       Harry Howell 1904 SLB
Hunter Hill 1904 SLB         Jack O'Connor 1904 SLB       Jason Giambi 2000 OAK
Jesse Burkett 1904 SLB       Jim Bottomley 1925 STL       Jim Scott 1911 CHW
Jim Thome 1991 CLE           Jimmy Dykes 1929 PHA         John Strohmayer 1973 MON
Johnny Damon 2000 KCR        Manny Ramirez 1998 CLE       Mickey Mantle 1954 NYY
Miguel Tejada 2000 OAK       Pat Hynes 1904 SLB           Pinky Swander 1904 SLB
Reggie Jackson 1985 CAL      Tim Hudson 1999 OAK          Tim Raines 1980 MON
Tom Jones 1904 SLB           Tom Young 1932 HG            Willie Sudhoff 1904 SLB
```
</details>

## 4. Escalated — possible data loss (59, owner folders: Zach 29 / Ramel 18 / Miles 12)

**No longer an access gap.** James (the archive owner) reports the Zach, Ramel, and Miles folders
appear to have disappeared from the master Drive entirely — not merely unshared with this pipeline.
This is a real, possible data-loss situation outside this pipeline's ability to fix in code. James is
attempting his own Drive-side recovery (Trash, activity history, direct search). **Pending his
results** — revisit this section once he reports back, either with recovered folders (route back
through the normal import path) or a confirmed loss (these 59 would need to be re-sourced from
scratch or accepted as permanently unavailable).

## 5. Open — no recorded owner (27)

Unrelated to the Drive-loss situation above. These 27 rows have no `ownership` value recorded at all
in the source data, so there's nothing to even search against — the one folder that might plausibly
apply (`Complete Sets/`) only covers 1969/1997/2022–2025, and none of these 27 cards' years fall in
that range. Needs someone (James or a manager) to identify who actually owns/submitted these before
any search is possible.
