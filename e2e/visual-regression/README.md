# Visual Regression Tests — Booking Flow

Pixel-diff snapshots of the student booking surfaces using Playwright. These
catch CSS regressions that Jest's DOM snapshots cannot — `display: none` slips,
broken `flex-wrap`, font fallbacks, color drift in design tokens, etc.

> **Why a separate runner?** Jest runs in `jsdom`, which has no layout engine
> and no rendering. `toMatchSnapshot()` only diffs HTML strings.
> `toHaveScreenshot()` (Playwright) renders in real Chromium / WebKit and
> compares PNGs byte-aware with anti-aliasing tolerance.

## What's covered

| Surface | Spec |
|---------|------|
| Tutor search results page | `booking-flow.spec.js → Tutor Search` |
| Session history page (mixed past/upcoming) | `booking-flow.spec.js → Session History` |
| `SessionBookedModal` confirmation | skipped — wire up once a `/test/...` mount page or Storybook story exists |

API responses are stubbed via `page.route()` so the tests are deterministic and
don't require a live database.

## First-time install (deliberate opt-in)

Playwright + browser binaries add ~250 MB. Install only when you're ready to
adopt the workflow:

```bash
npm install --save-dev @playwright/test
npx playwright install --with-deps chromium
```

Add these scripts to `package.json`:

```jsonc
{
  "scripts": {
    "e2e:vr":         "playwright test e2e/visual-regression",
    "e2e:vr:update":  "playwright test e2e/visual-regression --update-snapshots",
    "e2e:vr:ui":      "playwright test e2e/visual-regression --ui"
  }
}
```

## Running

```bash
# First run on a clean checkout: records the baseline images
npm run e2e:vr:update

# Subsequent runs: diff against the committed baseline
npm run e2e:vr

# Interactive debugger
npm run e2e:vr:ui
```

Recorded baselines land in `e2e/visual-regression/booking-flow.spec.js-snapshots/`.
**Commit them to git** — they are the contract.

## Updating a baseline

After an intentional UI change:

```bash
npm run e2e:vr:update
git add e2e/visual-regression/**/*.png
git commit -m "vr: update snapshots after navbar redesign"
```

Reviewers should diff the PNGs visually in the PR — GitHub shows a slider for
image diffs.

## CI integration

```yaml
# .github/workflows/visual-regression.yml
name: visual-regression
on:
  pull_request:
    paths:
      - 'src/app/components/**'
      - 'src/app/home/**'
      - 'e2e/visual-regression/**'
  workflow_dispatch:

jobs:
  vr:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: npm }
      - run: npm ci
      - run: npm run db:generate
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: CI=1 npm run e2e:vr
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

The CI job builds once with `next build` then `next start`s, instead of using
`next dev`. This avoids HMR-induced layout shimmer and makes screenshots
byte-stable across runs.

## Determinism checklist

If a screenshot flakes between runs, check:

- [ ] **Animations disabled** — `expect.toHaveScreenshot` config sets `animations: 'disabled'`.
- [ ] **Fonts loaded** — `await page.waitForFunction(() => document.fonts.ready)` before snapshotting if the page uses webfonts.
- [ ] **Network idle** — `await page.waitForLoadState('networkidle')` before snapshotting.
- [ ] **Time-dependent UI** — pin `Date.now()` via `page.addInitScript` if the layout depends on the clock.
- [ ] **Locale / timezone** — pinned globally to `es-CO` / `America/Bogota` in `playwright.config.js`.

## When to prefer Storybook + Chromatic over Playwright

For a component library evolving fast, Storybook stories + Chromatic's hosted
diff service is lower-friction than wiring test mount pages. Migrate when:

- you have ≥10 component-level visual specs, OR
- designers want to review snapshots without checking out git, OR
- you need cross-browser baselines without managing Playwright projects.

Until then, Playwright keeps it in-tree with no SaaS dependency.
