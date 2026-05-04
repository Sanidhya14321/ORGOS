---
title: Remove focus role selector from hero demo
author: GitHub Copilot
status: Proposed
date: 2026-05-03
tags:
  - ui
  - landing-page
  - navigation
  - hero
---

# ADR 0001: Remove focus role selector from hero demo

## Context
The landing page hero included a "Focus role" selector inside the demo card. That control duplicated information already implied by the product narrative and introduced unnecessary interaction on the main page. In the current layout, it also competed visually with the navigation and made the hero feel inconsistent with the rest of the theme.

The landing page is intended to present ORGOS as a clean executive-oriented product surface. The hero should reinforce the theme, not introduce an extra control that distracts from navigation and primary calls to action.

## Decision
Remove the focus role selector from the hero demo entirely.

The hero demo now keeps only the organization size slider, the live simulation button, and the stat cards. The role-specific simulation text and dropdown state are also removed so the component stays focused on a single, lightweight interaction.

## Consequences
POS-001 The hero becomes simpler and easier to scan.
POS-002 The main page navigation and primary actions have less visual competition.
POS-003 The landing experience better matches the ORGOS theme and tone.
NEG-001 The demo shows less role-specific interactivity.
NEG-002 Any future role-based story needs a different surface or a dedicated interaction pattern.

## Alternatives
ALT-001 Keep the selector but move it into a collapsed advanced section. Rejected because it still adds cognitive overhead on the landing page.
ALT-002 Replace the selector with a static role summary. Rejected because the role selector itself was the part causing mismatch and distraction.
ALT-003 Keep the selector and restyle it to match the theme. Rejected because the core problem was unnecessary interaction, not just styling.

## Implementation Notes
IMP-001 Remove the role state, role type, and role-flow mapping from `HeroDemo`.
IMP-002 Preserve the organization size control and simulation counters so the hero still feels interactive.
IMP-003 Align surrounding hero cards and surfaces with the shared theme tokens to avoid dark/light contrast conflicts.

## Stakeholders
- Product/design: landing page clarity and brand alignment
- Frontend users: faster scan path to login and dashboard actions
- Engineering: simpler component state and fewer navigation regressions

## References
REF-001 [apps/web/components/hero-demo.tsx](../../apps/web/components/hero-demo.tsx)
REF-002 [apps/web/components/ui/cybernetic-bento-grid.tsx](../../apps/web/components/ui/cybernetic-bento-grid.tsx)
REF-003 [apps/web/components/ui/features.tsx](../../apps/web/components/ui/features.tsx)
