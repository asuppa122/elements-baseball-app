# Elements Baseball — Product Goal and Gameplay Vision

Written 2026-08-26. This is a durable product-direction document, not a one-time chat
note — it belongs alongside `MOBILE_PARITY_STANDARD.md` and
`RULEBOOK_COVERAGE_ARCHITECTURE.md` as a standing reference for how the gameplay
engine and UI should be judged going forward. See `GAMEPLAY_REFERENCE_NOTES.md` for the
ERA Baseball / Showdown 2000 research this document is responding to, and
`src/gameplay/README.md` for the engine-level framing of the same Rulebook-as-source-
of-truth principle stated here.

I want to clarify the end goal I am working toward with the **Elements Baseball website/app**, especially now that you have been able to inspect **ERA Baseball** and **Showdown 2000** through Playwright MCP.

Those products are useful references because they demonstrate what a digital MLB Showdown-style game can look and feel like in practice.

However, I do **not** want Elements Baseball to become a copy of either one.

The goal is:

> **Learn from what ERA and Showdown 2000 do well, understand how they organize and present gameplay, and then use those lessons to build the best possible version of Elements Baseball around our own Rulebook, league structure, visual identity, and gameplay decisions.**

## What I Want You to Take From ERA / Showdown 2000

Use them as references for things like:

* how a digital baseball game presents the current game state
* how pitcher vs. hitter interactions are displayed
* how pitch/swing rolls are communicated
* how the batter card and pitcher card are presented
* how runners and bases are shown
* how outs, inning, score, and count/state are surfaced
* how manager decisions appear
* how game actions are organized
* how substitutions and pitching changes are handled
* how the interface guides the user through the next legal action
* how much information is visible without overwhelming the screen
* how desktop gameplay flows spatially
* how game events/results are communicated to the manager

If you see a pattern that is especially effective, tell me **why it works** and whether it makes sense for Elements.

## What I Do NOT Want

Do not:

* copy their layout one-for-one
* reproduce their styling
* copy their wording
* copy their interaction patterns without evaluating whether they fit Elements rules
* force Elements mechanics into another game's workflow
* assume that because ERA or Showdown 2000 does something a certain way, Elements should do it too

They are **reference implementations**, not the source of truth.

## Elements Must Remain Elements

The source of truth for gameplay is the **Elements League Rulebook** and the digital gameplay decisions we have already established.

Elements has its own mechanics and requirements, including things like:

* RTS
* DBP
* RFO
* stolen-base decisions
* tag-up rules
* fielding rolls
* INF IN
* substitutions
* fatigue
* pitching changes
* season/year-dependent rules
* manager-specific decisions
* locked decisions once announced
* Elements roster/season configuration
* Elements-specific outcome handling

The interface should be designed around those mechanics.

## End Goal

I want a manager to eventually be able to open Elements Baseball and play a complete head-to-head game online from beginning to end.

That means the app should support:

**Game Setup**
→ managers / teams / active season
→ legal rosters
→ lineups
→ starting pitchers

**Gameplay**
→ pitcher/hitter matchup
→ pitch roll
→ advantage determination
→ swing roll
→ chart result
→ runner/defense resolution
→ manager decisions when required
→ score / outs / runners update
→ next batter

**Game Management**
→ substitutions
→ pinch hitters
→ pinch runners
→ pitching changes
→ fatigue
→ defensive changes
→ double switches
→ inning transitions
→ extra innings
→ game-ending conditions

**PvP Flow**
→ both managers see the same authoritative game state
→ the correct manager is prompted when a decision is required
→ illegal actions are not offered
→ confirmed/announced decisions lock when the Rules require it
→ the game continues once the decision resolves

The goal is not merely to simulate games in the background.

The goal is a **fully playable, understandable, polished manager-vs-manager Elements Baseball experience**.

## The App Should Know What Happens Next

A core design principle is that the engine should always understand:

> **What just happened?**
> → **What Elements rule applies?**
> → **Does a manager have a decision?**
> → **Which manager?**
> → **What actions are legal?**
> → **What roll/resolution is required?**
> → **What is the resulting game state?**
> → **What happens next?**

The UI should reflect that state rather than exposing a pile of generic baseball buttons at all times.

## Visual Goal

I want Elements to feel like its own polished baseball product.

The visual identity should continue to feel like **Elements Baseball**, including the black/gold direction and the visual language we have already established elsewhere in the app.

The gameplay screen should feel:

* modern
* baseball-specific
* clear
* immersive
* efficient
* visually exciting
* easy to understand during actual play

But not cluttered or overly game-like just for decoration.

The actual baseball cards should remain important visual objects.

## Use the References to Solve Problems, Not Define the Product

When you inspect ERA or Showdown 2000, I want your thought process to be:

> "This is how they solved this gameplay/UX problem. What can Elements learn from that?"

not:

> "This is how they built it, so Elements should look the same."

For example:

If ERA has a strong way of showing the pitcher/batter matchup, we can use the **concept of prioritizing that matchup visually** while designing an Elements-specific implementation.

If Showdown 2000 has an effective runner display, we can study why it is easy to understand and then create our own version around Elements runner decisions like RTS, RFO, DBP, etc.

## I Want Elements to Improve on the Existing Examples

One of my goals is to take advantage of the fact that Elements is being built specifically for our league and Rules.

Where other systems may require the manager to infer what to do next, Elements should be able to use its game-state engine to:

* surface only relevant actions
* explain outcomes clearly
* prevent illegal actions
* automatically track state
* guide managers through conditional rules
* make complex Elements situations easier to resolve online than they are manually

For example, rather than simply showing that the bases changed after a play, Elements can explicitly say:

**Fielder's Choice (FC) — Out at 2nd**

or:

**Safe — Run Scores, 1–1**

The digital version should use the engine's understanding of the Rules to make gameplay clearer.

## Desktop and Mobile

I want the complete gameplay experience available on both desktop and mobile.

Mobile should not be a stripped-down or compressed version.

The same:

* gameplay information
* cards
* decisions
* controls
* visual feedback
* manager capabilities

should exist on mobile, but the layout can reflow to fit the smaller screen.

Designing the gameplay architecture should account for both from the beginning.

## Testing Is Part of the Product Goal

I also want the engine to be something we can **trust**.

That is why we are building deterministic scenario testing around individual Rules rather than relying only on complete CPU simulations.

We should be able to deliberately test situations such as:

> 1 out + runners 1B/2B + DBP eligible + specific INF state + forced roll

and prove the exact expected result.

Complete-game simulations still matter, but they should complement targeted Rulebook testing rather than replace it.

## What I Want You to Do With the ERA / Showdown 2000 Research

Now that you have inspected those systems, I would like you to evaluate them through the lens of Elements.

Please identify:

1. **What ERA does particularly well that Elements could learn from.**
2. **What Showdown 2000 does particularly well.**
3. **Where their approaches would NOT fit Elements rules or goals.**
4. **What Elements should intentionally do differently.**
5. **Which gameplay UI concepts are worth adapting rather than copying.**
6. **How you would combine the best lessons from those references with the Elements Rulebook and existing app design.**
7. **What you think the ideal Elements gameplay screen hierarchy should eventually be.**
8. **What information should always be visible versus contextual/conditional.**
9. **How the interface should change when a manager decision like RTS, DBP, SB, RFO, substitution, or pitching change becomes available.**
10. **What opportunities Elements has to be better than the systems you inspected.**

Do not implement a redesign yet.

First, give me your assessment and recommended **Elements-specific gameplay design philosophy** based on what you saw.

The guiding principle is:

> **ERA and Showdown 2000 can teach us how digital MLB Showdown works. The Elements Rulebook, Elements league needs, and Elements visual identity should determine what our final product becomes.**
