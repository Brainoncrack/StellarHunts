# Accessibility audit — WCAG 2.1 AA (core flows)

**Date:** 2026-10-18
**Scope:** landing page, navigation, referral landing page, invite-friends
page, puzzle roadmap, error/404 pages, and the shared search, pagination and
status-state components.
**Target:** WCAG 2.1 Level AA.

## How this was audited

1. Manual source audit of the pages and shared components above against the
   WCAG 2.1 AA success criteria (perceivable, operable, understandable,
   robust).
2. Keyboard walkthrough of each core flow: skip link, tab order, mobile-menu
   toggle, menu dismissal, search field, pagination, retry actions.
3. Automated semantic/keyboard assertions in
   `frontend/tests/accessibility.test.jsx` (10 tests, run with
   `npm --prefix frontend test`).
4. The CI pipeline enforces the automated baselines:
   - `axe` against the production build (`@axe-core/cli`, fails on any
     violation),
   - Lighthouse accessibility ≥ 0.90, read from
     `frontend/a11y-baseline.json` by
     `frontend/scripts/check-a11y-baseline.js`,
   - both reports uploaded as the `accessibility-audit-reports` artifact.

The Lighthouse/axe steps require Chrome. They run in CI; in an environment
without Chrome, the local equivalent is the component test suite plus
`npm --prefix frontend run build` (see "Known limitations").

## Findings and fixes

| #   | Issue                                                                                          | WCAG criterion                             | Fix                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No way to bypass the navigation; tabs started at the logo                                      | 2.4.1 Bypass Blocks, 2.4.3 Focus Order     | Added a "Skip to main content" link as the first focusable element, visible on focus, targeting `#main-content`.                                              |
| 2   | Home, invite-friends and referral pages had no `<main>` landmark; some pages had more than one | 1.3.1 Info and Relationships, 2.4.1        | Every core page now renders exactly one `<main id="main-content" tabIndex={-1}>`; it is the skip-link target and receives programmatic focus.                 |
| 3   | Mobile menu button was an unlabelled icon with no state                                        | 4.1.2 Name, Role, Value, 2.1.1 Keyboard    | Added `aria-label` ("Open/Close navigation menu"), `aria-expanded`, `aria-controls`, `type="button"`; Escape closes the menu and returns focus to the toggle. |
| 4   | A `<Link>` was nested inside `<button>` (Connect Wallet)                                       | 4.1.2, 2.1.1                               | Button renders as its link child via `asChild` (Radix Slot), producing one interactive element with a single accessible name.                                 |
| 5   | Navigation text was `text-gray-300` on a 20%-opaque black bar over a white page (~1.2:1)       | 1.4.3 Contrast (Minimum)                   | Navbar background is now `bg-slate-950/90` (mobile menu `95%`), restoring ≥ 10:1 against the light navigation text.                                           |
| 6   | Search input had only a placeholder                                                            | 1.3.1, 3.3.2 Labels or Instructions, 4.1.2 | Input now has `type="search"`, a `name`, and an `aria-label` (configurable via the `label` prop).                                                             |
| 7   | Pagination used `role="list"` on a `div` with buttons as direct children                       | 1.3.1                                      | Replaced with `<ul>`/`<li>` list semantics; current page keeps `aria-current="page"`; page changes are announced with `aria-live="polite"`.                   |
| 8   | Loading state was purely visual; error state was not announced                                 | 4.1.3 Status Messages                      | Spinner has `role="status"` with visually hidden text; error state has `role="alert"`; retry button is `type="button"` with an accessible name.               |
| 9   | Decorative Lucide icons were exposed to screen readers                                         | 1.1.1 Non-text Content                     | Navigation, status, referral and error-page icons are `aria-hidden="true"` (and `focusable="false"` in the navbar).                                           |
| 10  | Referral link input had no accessible name; copy success was silent                            | 1.3.1, 4.1.3                               | Added `aria-label="Your referral link"` and a polite live region announcing "Referral link copied to clipboard".                                              |
| 11  | `global-error` document had no language                                                        | 3.1.1 Language of Page                     | Added `lang="en"`.                                                                                                                                            |
| 12  | Focus indicator was absent on some custom controls                                             | 2.4.7 Focus Visible                        | Existing global `:focus-visible` ring retained; all new controls inherit it, and the skip link has its own high-contrast focus style.                         |

Existing behaviour retained: reduced-motion support, visible focus ring on all
interactive elements, image `alt` text in `PuzzleCard`, `NftCard` and the
mint-success view, and Radix Dialog's focus trap/Escape handling in the admin
review modal.

## Keyboard-only walkthrough

| Flow        | Expected result                                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Page load   | First `Tab` focuses "Skip to main content"; `Enter` moves focus to main content.                                                   |
| Navigation  | Second `Tab` reaches the logo; subsequent tabs visit Play Now, Leaderboard, Learn, Invite Friends, Connect Wallet.                 |
| Mobile menu | `Enter`/`Space` on the menu button expands it and sets `aria-expanded="true"`; `Escape` closes it and returns focus to the button. |
| Search      | The field is reachable and announced as "Search"; typing filters without a pointer.                                                |
| Pagination  | `Tab` reaches Previous, page numbers, Next; `Enter` activates; the current page is announced.                                      |
| Error retry | `Tab` reaches "Try again"; `Enter` retries.                                                                                        |

## Verification

```bash
# Component-level keyboard and semantics tests
npm --prefix frontend test -- tests/accessibility.test.jsx

# Full frontend suite (see known limitations for pre-existing failures)
npm --prefix frontend test

# Production audit (requires Chrome, as used by CI)
npm --prefix frontend run build
npx --yes @axe-core/cli@4.10.2 http://127.0.0.1:3000 --exit
npx --yes lighthouse@12.8.2 http://127.0.0.1:3000 \
  --only-categories=accessibility --output=json \
  --output-path=/tmp/lighthouse-a11y.json --quiet
node frontend/scripts/check-a11y-baseline.js /tmp/lighthouse-a11y.json
```

## Known limitations

- Admin screens (`/admin/*`) are outside the core-flow scope of this audit.
  `AdminLayout` renders a `<main>` and the puzzle-submission page renders a
  second one; that pre-existing double landmark should be collapsed to a
  single `<main>` in a follow-up.
- Lighthouse cannot be executed in an environment without Chrome; the
  checked-in CI job is the authoritative source for the ≥ 0.90 score.
- The frontend test suite has pre-existing failures unrelated to
  accessibility (wallet hook/jsdom environment, some route-mocking tests).
  `tests/accessibility.test.jsx` passes independently and is included in
  `npm test`.
- Colour contrast is enforced for the audited pages only; new components
  should be checked against 1.4.3 before merge.

## Additional criteria to verify (recommended follow-up checks)

The audit above covers the issues found in the source review. The criteria
below were not individually recorded as findings; each should be confirmed
(manually or with tooling) on the core flows, and any failure logged as a new
numbered finding. Status is "to verify" until someone has checked it.

| Criterion                                         | What to check                                                                                              | How                                                    | Status    |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------- |
| 1.3.1 / 2.4.6 Headings and Labels                 | One `<h1>` per page, no skipped heading levels, headings describe their sections                           | Heading outline in a screen reader or browser devtools | To verify |
| 2.4.2 Page Titled                                 | Every core page and the 404/error pages have a unique, descriptive `<title>`                               | Inspect `<title>` per route                            | To verify |
| 2.4.4 Link Purpose (In Context)                   | No ambiguous "Click here" / "Learn more" links without context                                             | Links list in a screen reader                          | To verify |
| 1.4.4 Resize Text                                 | Content remains usable at 200% browser zoom with no loss of content                                        | Manual zoom                                            | To verify |
| 1.4.10 Reflow                                     | No horizontal scrolling at 320 CSS px width (except content that needs 2-D layout)                         | Responsive devtools at 320px                           | To verify |
| 1.4.11 Non-text Contrast                          | Focus ring, input borders, icons that convey meaning and the pagination current-page indicator reach 3:1   | Contrast checker                                       | To verify |
| 1.4.12 Text Spacing                               | No clipped or overlapping text when line-height, paragraph, letter and word spacing are increased          | Text-spacing bookmarklet                               | To verify |
| 1.4.13 Content on Hover or Focus                  | Any tooltip/popover is dismissible, hoverable and persistent                                               | Manual                                                 | To verify |
| 1.3.4 Orientation                                 | No lock to portrait or landscape                                                                           | Rotate device/emulator                                 | To verify |
| 1.3.5 Identify Input Purpose                      | Inputs collecting personal data use appropriate `autocomplete` values                                      | Source review of forms                                 | To verify |
| 2.1.2 No Keyboard Trap                            | Focus can always leave the mobile menu, dialogs and any wallet modal                                       | Keyboard walkthrough                                   | To verify |
| 2.5.3 Label in Name                               | Visible button/link text is contained in the accessible name (e.g. "Connect Wallet")                       | Accessibility tree                                     | To verify |
| 3.2.1 / 3.2.2 On Focus / On Input                 | Focusing or typing in search or other fields does not trigger unexpected navigation or context change      | Manual                                                 | To verify |
| 3.2.3 Consistent Navigation                       | Navigation order and labels are the same across all core pages                                             | Compare pages                                          | To verify |
| 3.3.1 / 3.3.3 Error Identification and Suggestion | Any form that can fail names the field in error and says how to fix it, not by colour alone                | Submit invalid input                                   | To verify |
| 4.1.3 Status Messages (route changes)             | Client-side route changes move focus or announce the new page so screen reader users know the view changed | Screen reader walkthrough                              | To verify |

## Screen reader and assistive technology matrix

Automated tools catch roughly a third of issues, so manual passes with real
assistive technology are recommended before major releases.

| Platform | Screen reader | Browser          | Flows to run                                                    |
| -------- | ------------- | ---------------- | --------------------------------------------------------------- |
| Windows  | NVDA          | Firefox / Chrome | Skip link, navigation, search, pagination, retry, referral copy |
| macOS    | VoiceOver     | Safari           | Same flows                                                      |
| iOS      | VoiceOver     | Safari           | Mobile menu, referral copy, invite-friends                      |
| Android  | TalkBack      | Chrome           | Mobile menu, search, pagination                                 |

Also test with: keyboard only (no pointer), 200% zoom, Windows High Contrast /
forced-colors mode, and `prefers-reduced-motion: reduce`.

For each pass, record: what was announced, anything unlabelled or announced
twice, and whether focus landed where expected after each action.

## Test coverage by finding

| Finding                     | Automated coverage                              | Manual coverage                        |
| --------------------------- | ----------------------------------------------- | -------------------------------------- |
| 1–2 Skip link and landmarks | Component tests (`accessibility.test.jsx`), axe | Keyboard walkthrough                   |
| 3 Mobile menu               | Component tests (aria state, Escape)            | Keyboard and screen reader             |
| 4 Nested interactive        | axe (`nested-interactive`)                      | Keyboard                               |
| 5 Contrast                  | axe / Lighthouse contrast checks                | Visual review on real backgrounds      |
| 6 Search label              | Component tests, axe                            | Screen reader                          |
| 7 Pagination                | Component tests                                 | Screen reader                          |
| 8 Status messages           | Component tests (`role` queries)                | Screen reader announcement             |
| 9 Decorative icons          | axe                                             | Screen reader (no stray announcements) |
| 10 Referral input/copy      | Component tests                                 | Screen reader announcement of copy     |
| 11 Language                 | axe (`html-has-lang`)                           | None needed                            |
| 12 Focus visible            | Not automated                                   | Keyboard walkthrough                   |

Gaps to close: focus visibility (12) and live-region announcements (8, 10)
have no reliable automated check, so rely on the manual matrix above.

## Definition of done for new UI

Before merging any new page or component:

- [ ] Uses semantic elements first (`button`, `a`, `ul`, `label`, headings); ARIA only where HTML cannot express the role
- [ ] Every interactive element is reachable and operable by keyboard, with a visible focus indicator
- [ ] Every control has an accessible name that includes its visible label
- [ ] Informative images have meaningful `alt`; decorative images/icons are hidden from assistive technology
- [ ] Text and UI component contrast meet 1.4.3 and 1.4.11
- [ ] Dynamic changes (loading, errors, success) are announced via `role="status"` / `role="alert"` or a live region
- [ ] Page has one `<main>`, a unique `<title>` and a logical heading outline
- [ ] Works at 320px width and 200% zoom
- [ ] `tests/accessibility.test.jsx` extended for the new component, and CI axe/Lighthouse still pass

## Follow-ups

- [ ] Collapse the double `<main>` landmark in the admin puzzle-submission page (see Known limitations)
- [ ] Run and record results for the "Additional criteria to verify" table; promote any failures to numbered findings
- [ ] Perform one full screen reader pass (NVDA + VoiceOver at minimum) and attach notes to this document
- [ ] Extend the audit scope to `/admin/*` and the wallet connection flow once `/connect-wallet` exists
- [ ] Fix or quarantine the pre-existing unrelated frontend test failures so `npm test` is a clean signal
- [ ] Consider adding a Playwright + `@axe-core/playwright` job to cover interactive states (open menu, open dialogs, error states) that a single page-load axe run does not reach
- [ ] Re-audit after any significant redesign of the navbar, search or pagination components
