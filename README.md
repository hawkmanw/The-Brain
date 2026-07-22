The Brain Portfolio optimizer for the online game Torn.
 ===============================================================================
  The Brain Charter
  ===============================================================================

  Mission
  -------
  Determine the mathematically optimal Torn stock portfolio using current market
  conditions, then recommend the sequence of actions that most improves the user's
  portfolio toward that optimum.

  Core Assumption
  ---------------
  The current portfolio is treated as a starting point,
  not as the desired destination.

  Brain first determines the portfolio it would build if starting from scratch
  using today's market conditions and available capital.

  Every recommendation is then evaluated by how much it moves the current
  portfolio toward that optimal portfolio.

  Guiding Principles
  ------------------
  • Optimization Engine, not Reporter.
  • Brain optimizes portfolios—not individual stocks.
  • Every holding is evaluated.
  • No holding is presumed correct.
  • No capital is presumed untouchable during analysis.
  • Recommendations remain practical and confidence-driven.
  • Every recommendation must be explainable.
  • Every widget answers one question well.
  • Never imply certainty.
  • Human judgment remains part of the process.
  • Remove redundant presentation before adding features.
  • One logical improvement per checkpoint.

  Non-Goals
  ---------
  • Strategic stock benefits are acknowledged but are not assigned speculative dollar values.

  • Do not optimize for every possible play style.

  • Do not hide assumptions from the user.

  • When trade-offs cannot be measured objectively,
    Brain informs the user rather than deciding for them.

  ===============================================================================
  */
    /*
   ────────────────────────────────────────────────────

   The Brain Design Charter

   The Brain's uniqueness comes from its intelligence, not its appearance.

   The Brain thinks once. Everything else is presentation.

   The Brain exists to help players make better decisions.

   It answers one question:

       "What should I do next?"

   The Brain reasons first. Presentation follows.

   The Brain speaks with one voice.

   The Brain reveals one thought at a time.
   
   The Brain speaks in plain language.

   It recommends actions using words every Torn player can understand.

   Financial terminology is used only when it improves understanding.

   Operation Chameleon Discovery:
   The Brain began life as a Torn widget. Operation Chameleon transforms the widget into The Brain.

   Whenever practical, the Brain is constructed from Torn's native UI components rather than recreating them. Appearance is inherited as a consequence.
   Prefer inheriting Torn's presentation over defining our own.

   Every new feature should make at least one existing piece of code simpler.
   
   The Brain speaks through a single interface.

   Before analysis, it welcomes the user.

   After analysis, it presents a recommendation,
   explains its reasoning,
   and provides supporting evidence.

   There is only one Brain.

   The Brain thinks once. The Brain speaks once.

   Only one box. One box to rule them all.

   Colors represent actions:

   🟢 KEEP SAVING
   🟠 REBALANCE
   🔵 BUY
   🔴 ERROR
   
   Evidence supports the recommendation.
   It never competes with it.

   The Brain never asks the player to read more than they need to make the next good decision.

   Occam's Razor

   Prefer removing code over adding code.
   Prefer composing native Torn components over
   recreating them.
   Prefer removing words over adding them.
   ────────────────────────────────────────────────────
   */
