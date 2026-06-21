# Calico — Patterns & Conventions

Developer and AI-agent reference for architecture decisions and coding conventions. Read this before writing any code.

> For the full API reference and DB schema see [specs/technical.md](specs/technical.md).
> For business context and user flows see [PROJECT.md](PROJECT.md).

---

## Architecture

### Layered Data Flow

**Never skip a layer.**

```
React Component
  → Frontend Service     (src/app/services/core/  — class singletons)
    → fetch('/api/...')
      → API Route Handler  (src/app/api/.../route.js)
        → Business Service   (src/lib/services/)
          → Repository         (src/lib/repositories/)
            → Prisma singleton   (src/lib/prisma.js)
              → PostgreSQL
```

New domains must implement all four layers. Use `notification`, `payment`, `session-attachment`, and `tutor-application` as templates.

### Server / Client Boundary

**Server-only** (`src/lib/`, `src/app/api/`):
Prisma, repositories, business services, Google APIs, JWT verification, bcrypt, S3 SDK, Brevo calls.

**Client-only** (`src/app/components/`, `src/app/services/`, `src/app/hooks/`, `src/app/context/`):
Browser APIs, `fetch('/api/...')` calls only, localStorage token management. Never import server modules here.

### Path Alias

`@/` → `src/`. Must be declared in **`tsconfig.json`** (Turbopack reads it; when `tsconfig.json` exists it shadows `jsconfig.json`). `next.config.mjs` adds a webpack alias too. Missing from `tsconfig.json` breaks every `@/` import under `next dev --turbopack`.

### Prisma Client

Singleton at `src/lib/prisma.js`. Never instantiate `PrismaClient` directly anywhere else.

---

## Auth

### Flow

1. `POST /api/auth/register` → hash password (bcrypt, 10 rounds) → create user → send verification email via Brevo → **no JWT issued**
2. User clicks link → `POST /api/auth/verify-email` marks `isEmailVerified = true`
3. `POST /api/auth/login` → bcrypt compare → reject with `EMAIL_NOT_VERIFIED` (403) if not verified → return JWT
4. Client stores JWT in `localStorage` as `calico_auth_token`
5. Protected requests send `Authorization: Bearer <token>`
6. App mount → `GET /api/auth/me` validates token and loads user into `SecureAuthContext`

JWT payload: `{ sub: userId, email, isTutorRequested, isTutorApproved, iat, exp }`. Expiry via `JWT_EXPIRATION` env var (default `7d`).

### Guards (`src/lib/auth/guards.js`)

| Guard | Use case | Mechanism |
|---|---|---|
| `authenticateRequest(request)` | Any authenticated user | Bearer JWT |
| `requireTutor(request)` | Authenticated + `isTutorApproved` | Bearer JWT |
| `requireAdminUser(request)` | Human admin — reads `role` **fresh from DB** on every request + `isActive` check + 30 req/min rate limit | Bearer JWT |
| `requireAdminSecret(request)` | Cron/scripts only — no user trace | `x-admin-secret` header |
| `requireAdmin` | **@deprecated** alias of `requireAdminSecret` | `x-admin-secret` header |

All guards return a `NextResponse` on failure. Early-return pattern everywhere:

```js
const auth = await authenticateRequest(request);
if (auth instanceof NextResponse) return auth;
// auth.sub is the userId — use this, never request body IDs
```

**Why `requireAdminUser` reads from DB:** A demoted admin is blocked immediately without requiring re-login. The JWT role would be stale.

---

## API Route Conventions

- Export named functions: `GET`, `POST`, `PUT`, `DELETE`
- Always `await params` before accessing (Next.js 15 requirement):
  ```js
  const { id } = await params;
  ```
- Validate request bodies with Zod at the API boundary
- Filter data on the server with Prisma `where` — never fetch all rows and filter in JS
- Return early on guard failure: `if (result instanceof NextResponse) return result;`

---

## Repository Conventions

- Named exports (not classes): `export async function findById(...) { ... }`
- Wrap Prisma queries only — no business logic inside repositories
- Strip sensitive fields from every response: `passwordHash`, `verificationToken`, `resetToken`, `otpCode`, `studentRating`
- Prefer IDs over emails for foreign keys (`tutorId`, not `tutorEmail`)

---

## Frontend Service Conventions

- Class-based singletons exported as instances:
  ```js
  export const UserService = new UserServiceClass();
  ```
- Use `authFetch` (not raw `fetch`) for authenticated requests

---

## Identity Rule

**Always take identity from `auth.sub` after authenticating — never from the request body or URL params.**

Trusting a client-supplied user ID is an IDOR vulnerability. The guard's return value is the only trusted source.

---

## Payments

### Server-Authoritative Pricing

The charge amount is always computed server-side. Any `amount` in the request body is ignored.

```
src/lib/payments/session-amount.js  — pure helpers: pricePerHour(), sessionDurationHours(), computeSessionAmount()
src/lib/payments/pricing.js         — resolveSessionAmount({ courseId, start, end }): loads course from DB, computes amount
src/lib/payments/fees.js            — commission split (Calico 15% / tutor 85%) + Wompi fee math + breakEvenPrice()
```

Never re-implement `× 0.15` / `× 0.85` inline — always use `fees.js`.

### Wompi Webhook

Must verify the HMAC signature against `WOMPI_INTEGRITY_SECRET` before mutating any payment or session state.

---

## Google Calendar

Events are created when a session is **accepted** (not when availability is set), and deleted when **canceled**. No calendar operations on any other state transition.

---

## Design System

Single source of truth: `src/app/styles/design-tokens.css`. Read the comment block at the top before adding any CSS.

### Token-only rule

Never use hardcoded hex, arbitrary px, or Tailwind color literals for these properties:

| Property | Required token group |
|---|---|
| `border-radius` | `--radius-xs/sm/md/lg/xl` |
| `box-shadow` (elevation) | `--elev-1/2/3/modal`, `--elev-1-up/2-up` |
| `font-size` (body/UI) | `--type-xs/caption/label/body-sm/body/body-lg` |
| `font-size` (headings) | `--type-h3/h2/h1/display` |
| `font-family` | `--font-sans-stack` |
| `max-width` (page-level) | `--app-shell-max-width`, `--modal-max-width`, `--form-narrow/default/wide` |
| `color` | `--calico-*` tokens only |

Allowed literals (intentional exceptions): `border-radius: 9999px` (pills), `50%` (circles), `3px` on scrollbar pseudo-elements, micro sizes ≤10px for badges/indicators, existing `clamp()` expressions, `em` units.

### Color palette

| Token | Value | Use |
|---|---|---|
| `--calico-green` | `#289656` | Marketplace green — CTAs, success |
| `--calico-orange` | `#ff9505` | Brand orange — icons, decoration |
| `--calico-orange-text` | `#b45309` | Orange **for text** (WCAG AA 5.2:1) |
| `--calico-orange-text-hover` | `#c2410c` | Hover state for orange text |
| `--calico-blue-tutor` | `#006bb3` | Tutor zone only — never in student pages |
| `--calico-ink` | `#15251f` | Primary dark text |
| `--calico-body-muted` | `#5c6f66` | Secondary text / placeholders |

**Tutor zone accent is `--calico-blue-tutor` (`#006bb3`), not Tailwind blue (`#3b82f6` / `#2563eb`).**

### Session status colors

```css
/* Completed */  background: var(--calico-green-success-soft); color: var(--calico-green-success-dark);
/* Pending */    background: var(--calico-warning-soft);       color: var(--calico-warning-text);
/* Canceled */   background: var(--calico-danger-soft);        color: var(--calico-danger-strong);
/* Scheduled */  background: var(--calico-info-soft);          color: var(--calico-info-text);
```

### Breakpoints

Only these 5 values. No custom breakpoints.

| px | Name | Use |
|---|---|---|
| 480 | xs | Phones only |
| 640 | sm | Landscape phones / small tablets |
| 768 | md | Tablets, nav splits |
| 1024 | lg | Small desktops |
| 1280 | xl | Full desktops |

Off-by-one values allowed only for cascade exclusion (`max-width: 1023px` paired with `min-width: 1024px`).

### Button

Always use `<Button>` from `src/components/ui/button.jsx`. Never author bespoke button CSS.

| Variants | Sizes |
|---|---|
| `default`, `cta`, `tutor`, `success`, `destructive`, `outline`, `secondary`, `ghost`, `link` | `sm`, `default`, `lg`, `xl`, `pill`, `icon`, `icon-sm`, `icon-lg` |

For toggle groups (period filters, tab switchers) use `<Button>` with conditional `variant` + `aria-pressed` — do not install `ToggleGroup`.

### Adding a new token

Add it to `design-tokens.css` and document it in the comment block at the top of that file.

---

## i18n

The entire UI is bilingual ES/EN. Never hardcode user-facing text.

```
src/lib/i18n/index.jsx           — I18nProvider + useI18n() hook
src/lib/i18n/locales/es.json     — Spanish (default locale)
src/lib/i18n/locales/en.json     — English
```

### Usage

```jsx
const { t, locale, formatCurrency, formatDate } = useI18n();

t('namespace.key')                              // simple lookup
t('namespace.key', { var })                     // interpolation
t(n === 1 ? 'x.item_one' : 'x.item_other', { count: n })  // plurals (manual — no auto-pluralization)
```

Locale persists to `localStorage` + cookie. `formatCurrency` / `formatDate` use `Intl` with `es-CO` / `en-US`.

### Rules

1. **One namespace per view** — group a screen's keys under one top-level object (e.g. `tutorProfile`, `search`, `availability`)
2. **Parity always** — every key must exist in both `es.json` and `en.json`. Missing keys emit `console.warn('[i18n] Missing translation…')` in dev
3. **Never translate DB data** — tutor names, course names, reviews, bios, and `COP` go as-is
4. **Use formatCurrency / formatDate** — never let formatting fall back to the browser locale
5. **Decorative images** — use `alt=""` (not a fixed-language string) so screen readers skip them
6. **Validate JSON after editing** — trailing commas silently break the whole locale:
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('src/lib/i18n/locales/en.json','utf8'))"
   ```

---

## Testing

- Framework: Jest + `next/jest` + jsdom
- Discovery: `**/__tests__/**/*.{js,jsx}` and `**/tests/**/*.{js,jsx}` — co-located near source or under `src/__tests__/`
- Setup file: `src/setupTests.js`

### Mocking strategy

- **Service-level unit tests**: mock collaborators at the module boundary (`jest.mock('@/lib/repositories/...')`) so real service logic runs inside the test
- **Integration tests**: mock `@/lib/prisma` (singleton) and `@/lib/auth/middleware`, then exercise the real handler → service → repository chain
- **Never mock the DB with fakes when an integration test is expected to catch schema drift**

### Conventions

- Fixtures centralized in `src/__tests__/fixtures/` — never duplicate shapes inline
- Always `await params` as `Promise.resolve({ id: '...' })` in route handler tests (Next.js 15)
- Add `@jest-environment node` at top of API route test files
- Test name pattern: `test_should_<verb>_<condition>` — names appear directly in CI failure logs

### Commands

```bash
pnpm test                                      # single run
pnpm test:watch                                # watch mode
pnpm exec jest path/to/file.test.js            # single file
pnpm exec jest -t "test name"                  # by name
```
