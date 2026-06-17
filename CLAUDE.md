# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Full reference lives in [documentation/CLAUDE.md](documentation/CLAUDE.md)** — exhaustive DB schema, every API route, external-service env vars, the design-token system and i18n rules. This root file is the quick orientation; read the detailed doc before touching auth, payments, the schema, or CSS.

## Package manager

Use **pnpm** (`pnpm@10.33.4`, pinned in `package.json`). The README still shows `npm` commands — ignore that; this project migrated to pnpm. Native deps that must build are allow-listed under `pnpm.onlyBuiltDependencies` (bcrypt, prisma, esbuild, tailwind oxide…).

## Commands

```bash
pnpm dev              # Dev server on :3000 (Turbopack)
pnpm build            # Production build (raises Node heap to 4 GB — default OOMs)
pnpm start            # Production server (after build)
pnpm lint             # ESLint (next/core-web-vitals)
pnpm test             # Jest single run
pnpm test:watch       # Jest watch mode
pnpm exec jest path/to/file.test.js   # Single test file
pnpm exec jest -t "name of the test"  # Single test by name

# Database (Prisma)
pnpm db:generate      # Regenerate client into src/generated/prisma/
pnpm db:migrate       # prisma migrate dev
pnpm db:push          # push schema without a migration
pnpm db:studio        # Prisma Studio UI
pnpm db:seed          # node prisma/seed.js (departments, careers)
```

Tests use `next/jest` + jsdom; discovery is `**/__tests__/**` and `**/tests/**` (`.js/.jsx`), co-located near source or under `src/__tests__/`. Setup file: `src/setupTests.js`. Note the `customExportConditions: ['node','node-addons']` in `jest.config.mjs` — required so jsdom picks the Node build of server SDKs under pnpm's strict `node_modules`.

## Architecture

Monolithic **Next.js 15 (App Router)**, React 19, Tailwind v4, shadcn/ui (JSX, not TSX), PostgreSQL + Prisma, custom JWT auth. Strict layered data flow — **never skip a layer**:

```
React Component → Frontend Service (src/app/services/core/, class singletons)
  → fetch('/api/...') → API Route (src/app/api/.../route.js)
    → Business Service (src/lib/services/) → Repository (src/lib/repositories/)
      → Prisma singleton (src/lib/prisma.js) → PostgreSQL
```

New domains replicate all four layers — use `notification`, `payment`, `session-attachment`, `tutor-application` as templates.

**Server/client boundary**: anything touching Prisma, repositories, business services, Google APIs, JWT verify, bcrypt, S3, or Brevo is server-only (`src/lib/`, `src/app/api/`). Browser code (`src/app/components|services|hooks|context`) only calls `fetch('/api/...')` and manages the token in `localStorage`.

**Path alias** `@/` → `src/`. It must be declared in `tsconfig.json` (Turbopack reads it and shadows `jsconfig.json`); `next.config.mjs` also adds a webpack alias. Missing it from `tsconfig.json` breaks every `@/` import under `next dev --turbopack`.

**Domain model note**: careers/majors are NOT an enum — they are the `Department` + `Career` tables (UUID PKs); `User.careerId` is an FK. `Course` belongs to a `Department`, **not** to a `Career` — there is no career↔course ("pensum") relation in the schema.

## Auth & roles

Custom JWT (bcrypt 10 rounds + jsonwebtoken). Client stores the token in `localStorage` as `calico_auth_token` and sends `Authorization: Bearer <token>`. Registration issues **no JWT** — email must be verified first (`isEmailVerified` is a hard login gate). Guards live in `src/lib/auth/guards.js`:

- `authenticateRequest` — any logged-in user
- `requireTutor` — authenticated AND `isTutorApproved`
- `requireAdminUser` — authenticated AND DB `role = 'ADMIN'` (read **fresh from DB**, not the JWT) + `isActive` + rate limit. **Use this for human admins.**
- `requireAdminSecret` (`x-admin-secret`) — service/cron only; `requireAdmin` is a deprecated alias.

Guards return a `NextResponse` on failure → early-return when `result instanceof NextResponse`.

## Non-obvious constraints (read before editing)

- **Server-authoritative pricing** — the Wompi charge is computed server-side (course price/hour × duration) via `src/lib/payments/pricing.js`; any `amount` in the request body is ignored. The fee/commission split (Calico 15% / tutor 85%, Wompi fees) has a single source of truth in `src/lib/payments/fees.js` — never re-implement `× 0.15`/`× 0.85` inline.
- **Identity from the JWT, never the body/URL** — take `auth.sub` after authenticating; trusting an ID from the request enables IDOR.
- **Never expose** `passwordHash`, `verificationToken`, `resetToken`, `otpCode`, `studentRating` (private) in API responses — repositories sanitize these.
- **Await `params`** in dynamic routes (Next 15): `const { id } = await params;`.
- **Filter on the server** with Prisma `where` — never fetch all rows then filter in JS.
- **Remote AWS RDS** — the DB is a remote RDS instance. A new Prisma field must be migrated against it (`pnpm exec prisma migrate deploy`) before the regenerated client selects that column, or reads of the table break.
- **Wompi webhook** must verify the HMAC against `WOMPI_INTEGRITY_SECRET` before mutating any payment/session.
- **Google Calendar** events are created when a session is **accepted** (not when availability is set) and deleted on **cancel**.

## Design system & i18n (enforced)

- **CSS tokens only** — every color/shadow/radius/spacing/font-size comes from a `var(--token)` defined in `src/app/styles/design-tokens.css`; no hardcoded hex or magic numbers. Tutor zone accent is `--calico-blue-tutor` (#006bb3), *not* Tailwind blue. Use `<Button>` from `src/components/ui/button.jsx` for all buttons — don't author bespoke button CSS. See the Design System section of documentation/CLAUDE.md for the full token/breakpoint rules.
- **No hardcoded user-facing text** — bilingual ES/EN via `useI18n()` (`src/lib/i18n`). Every key must exist in **both** `src/lib/i18n/locales/es.json` and `en.json` (default locale `es`). Use `t('namespace.key', { var })`; never translate DB data (names, courses, `COP`); format money/dates with `formatCurrency`/`formatDate`.
