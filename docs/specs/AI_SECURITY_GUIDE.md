# AI Security Guide

## Purpose

This document defines mandatory security rules for this repository. It applies to every human developer and every AI coding agent that generates, modifies, or reviews code here, including but not limited to: Claude Code, Cursor, GitHub Copilot, OpenAI Codex, and Windsurf.

Every new feature, refactor, and bug fix must comply with the rules in this document. No Pull Request may introduce an exception to these rules. If a rule cannot be followed for a specific case, the PR description must explain why, and the change requires explicit approval from a maintainer before merge — it cannot be decided unilaterally by an AI agent or by a single contributor.

This is not a theoretical security primer. It states exactly what to do and what not to do, using this project's actual stack and actual files.

### Project stack (reference)

- Framework: Next.js 15.5 (App Router, Turbopack in dev), React 19 / react-dom 19. Monolith: frontend + API routes in one app.
- Database / ORM: Prisma 7.6 (`@prisma/client`, `@prisma/adapter-pg`), `pg` driver, PostgreSQL on AWS RDS.
- Auth: custom JWT (`jsonwebtoken`), `bcrypt` for password hashing, `zod` for input/schema validation. No NextAuth.
- UI: Tailwind CSS v4, shadcn/ui, Radix UI primitives. Not security-relevant but listed for completeness.
- External integrations: AWS SDK v3 (S3 + presigned URLs), `googleapis` / `google-auth-library` (Google Calendar, Google OAuth), Wompi (Colombian payment gateway, integrated via direct `fetch`, no SDK).
- Testing: Jest 29, `@testing-library/react`, `@playwright/test` for E2E.
- Package manager: pnpm 10.33.4, pinned via `packageManager` in `package.json`. Settings (`overrides`, `onlyBuiltDependencies`) live in `pnpm-workspace.yaml`, not in `package.json`, per pnpm 10 conventions.

### CI/CD reference

`.github/workflows/ci.yml` runs on every PR into `dev` and must pass before merge:

```yaml
- name: Install Dependencies
  run: pnpm install --frozen-lockfile

- name: Security Audit
  run: pnpm audit --audit-level=low

- name: Run Tests
  run: pnpm test
```

`pnpm audit --audit-level=low` is a hard gate. Any code change that introduces a dependency with a known vulnerability of any severity (including "low") will fail CI. See [CI/CD Security Rules](#cicd-security-rules) for the full policy.

---

## Security Principles

Every principle below is mandatory. "Allowed" and "prohibited" examples are taken from or modeled directly on this codebase.

### 1. Never trust client input

Any value from the request — body, query string, headers, route params, cookies — is attacker-controlled until validated server-side. This includes IDs, amounts, statuses, roles, and metadata.

**Allowed:**
```javascript
// src/app/api/payments/confirm-payment/route.js
// Status, amount and metadata are re-fetched from Wompi using the private key.
// The client only supplies the transaction id.
const transaction = await wompiApi.fetchTransaction(clientTransactionData.id);
const { status, amount_in_cents, reference } = transaction; // from Wompi, not from body
```

**Prohibited:**
```javascript
// NEVER trust a client-supplied status/amount directly:
const { status, amount_in_cents } = await request.json();
if (status === 'APPROVED') {
  await WompiService.processSuccessfulPayment({ status, amount_in_cents });
}
```

### 2. Always validate authorization server-side

Authentication (who is this user) is never sufficient by itself. Every privileged action must separately check whether this specific authenticated user is allowed to perform this specific action.

**Allowed:**
```javascript
// src/app/api/payments/[id]/route.js (PUT)
const admin = await requireAdminUser(request);
if (admin instanceof NextResponse) return admin;
```

**Prohibited:**
```javascript
// Authenticating is not authorizing:
const user = await authenticateRequest(request);
if (user instanceof NextResponse) return user;
// missing: is this user allowed to change a payment's status?
await paymentRepo.updateStatus(id, status);
```

### 3. Always validate ownership

A user being authenticated and having the right role is still not enough if the action targets a specific record (a payment, a session, an availability block). The route must verify that the authenticated user owns — or is otherwise entitled to — that specific record.

**Allowed:**
```javascript
// src/app/api/payments/[id]/route.js (GET)
if (String(payment.studentId) !== String(user.sub) && String(payment.tutorId) !== String(user.sub)) {
  return Response.json({ success: false, error: 'Unauthorized' }, { status: 403 });
}
```

**Prohibited:**
```javascript
// Fetching by ID with no ownership check at all:
const payment = await paymentRepo.findById(id);
return Response.json({ success: true, payment }); // any authenticated user can read any payment
```

### 4. Least privilege

Guards, queries, and responses should request and expose the minimum required for the task. Do not use an admin-capable mechanism where a scoped one suffices, and do not select more Prisma fields than the handler needs.

**Allowed:**
```javascript
const user = await prisma.user.findUnique({
  where: { id: auth.sub },
  select: { isTutorApproved: true, isActive: true }, // only what requireTutor needs
});
```

**Prohibited:**
```javascript
const user = await prisma.user.findUnique({ where: { id: auth.sub } }); // full record, including passwordHash
```

### 5. Defense in depth

Do not rely on a single layer. The JWT, the route guard, the service layer, and the Prisma `where` clause should each independently narrow what is allowed, so that a bug in one layer does not become a full bypass.

**Allowed:** `requireTutor()` re-checks `isTutorApproved` and `isActive` against the DB on every call (not just at login), in addition to the JWT signature check in `authenticateRequest()`. See [Authentication Rules](#authentication-rules).

**Prohibited:** Trusting `isTutorApproved` from the JWT payload alone to gate a tutor-only mutation, with no DB re-check.

### 6. Fail closed

On any ambiguity, missing configuration, or unexpected error in a security check, deny access. Never default to "allow" when a check cannot be completed.

**Allowed:**
```javascript
// src/lib/auth/guards.js — requireAdminSecret
const secret = process.env.ADMIN_SECRET;
if (!secret) {
  console.error('[requireAdminSecret] ADMIN_SECRET env var is not configured');
  return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 });
}
```

**Prohibited:**
```javascript
const secret = process.env.ADMIN_SECRET;
if (secret && provided !== secret) return unauthorized();
// if ADMIN_SECRET is unset, this silently allows everyone through
```

### 7. Secure by default

New endpoints, new fields, and new Prisma selects must start from the most restrictive configuration and be opened up deliberately, not the other way around. An endpoint with no explicit auth guard is a bug, not a draft.

**Allowed:** Every route handler in `src/app/api/**/route.js` starts with an explicit guard call (`authenticateRequest`, `requireTutor`, `requireAdminUser`, or `tryAuthenticateRequest` when public access with optional enrichment is intentional and documented in a comment).

**Prohibited:** A new `route.js` with no guard call, on the assumption that "it's just a GET, it's probably fine."

---

## Authentication Rules

Authentication in this project is custom JWT (`jsonwebtoken`), not a third-party auth provider. The token is signed in [src/lib/auth/jwt.js](src/lib/auth/jwt.js) and verified in [src/lib/auth/middleware.js](src/lib/auth/middleware.js).

Mandatory rules:

1. **Never trust JWT claims alone when the decision is security-relevant.** The JWT payload (`role`, `isTutorApproved`, etc.) reflects the state at the time the token was issued. For any privileged action, re-read the relevant flag from the database.
2. **Every request must go through `authenticateRequest()` (or `tryAuthenticateRequest()` for optional auth) before any other logic runs.** Do not parse `Authorization` headers manually in a route.
3. **Session freshness must be validated against the database on every request**, not only at login. This project does so via `checkSessionFreshness()` inside `authenticateRequest()` / `tryAuthenticateRequest()`, which checks two things from the DB: `isActive` and `tokenVersion`.
4. **Password changes and resets must invalidate previously issued tokens.** This is implemented by incrementing `User.tokenVersion` (see `bumpTokenVersion` calls in `change-password` and `reset-password` routes). A token whose `tokenVersion` claim does not match the current DB value must be rejected with `TOKEN_REVOKED`.
5. **Suspending a user (`isActive = false`) must immediately deny all further requests with their existing tokens.** Do not wait for token expiry.

### Authentication middleware — implementation reference

[src/lib/auth/middleware.js](src/lib/auth/middleware.js):

```javascript
async function checkSessionFreshness(payload) {
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { isActive: true, tokenVersion: true },
  });

  if (!user || !user.isActive) {
    return { error: 'Account disabled', code: 'ACCOUNT_DISABLED' };
  }

  const payloadVersion = payload.tokenVersion ?? 0;
  const currentVersion = user.tokenVersion ?? 0;
  if (payloadVersion !== currentVersion) {
    return { error: 'Token revoked', code: 'TOKEN_REVOKED' };
  }

  return null;
}

export async function authenticateRequest(request) {
  const token = extractToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Missing or malformed Authorization header' }, { status: 401 });
  }
  const result = verifyToken(token);
  if (!result.success) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: 401 });
  }
  const staleness = await checkSessionFreshness(result.payload);
  if (staleness) {
    return NextResponse.json(staleness, { status: 401 });
  }
  return result.payload;
}
```

`authenticateRequest` and `tryAuthenticateRequest` are `async`. Every call site must `await` them. An un-awaited call returns a `Promise`, which is never `instanceof NextResponse` and never has `.sub` — this silently breaks both the 401 short-circuit and any downstream identity check.

**Allowed (protected route):**
```javascript
export async function GET(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const callerId = String(auth.sub ?? '');
  // ... proceed
}
```

**Prohibited:**
```javascript
export async function GET(request, { params }) {
  const auth = authenticateRequest(request); // missing await — auth is a Promise
  if (auth instanceof NextResponse) return auth; // never true
  const callerId = String(auth.sub ?? ''); // undefined
}
```

**Prohibited:**
```javascript
// Manually decoding the JWT instead of using the shared middleware:
const token = request.headers.get('authorization')?.replace('Bearer ', '');
const payload = jwt.decode(token); // jwt.decode does NOT verify the signature
```

### Protected routes — role/capability guards

Guards live in [src/lib/auth/guards.js](src/lib/auth/guards.js):

- `authenticateRequest(request)` — any authenticated, active, non-revoked user.
- `requireTutor(request)` — authenticated AND `isTutorApproved === true` AND `isActive === true`, both re-checked against the DB on every call.
- `requireAdminUser(request)` — authenticated AND DB `role === 'ADMIN'` (read fresh from DB, never from the JWT) AND `isActive`, plus a rate limit (30 req/min/admin). **Use this for any human-admin action.**
- `requireAdminSecret(request)` — static `x-admin-secret` header check. Reserved for service-to-service / cron jobs only. Never use for a human-triggered action, because it carries no user identity for audit logging.
- `isAdmin(userId)` — plain boolean check, for routes that are owner-scoped but should *also* allow an admin through (does not short-circuit with a `NextResponse`).

There is no generic `requireRole(role)` helper. Use the named guard that matches the access level required. Do not write a new ad-hoc role check inline in a route — if no existing guard fits, add one to `guards.js` following the same pattern (re-read from DB, return payload or `NextResponse`).

---

## Authorization Rules

This is one of the most important sections in this document. Read it fully before adding or modifying any endpoint.

**Authentication is not authorization.** Knowing who the caller is says nothing about what they are allowed to do or see.

### Roles in this project

The `Role` enum in `prisma/schema.prisma` has exactly two values:

```prisma
enum Role {
  STUDENT
  ADMIN
}
```

**There is no `TUTOR` value in the `Role` enum.** "Tutor" is a capability, not a role: it is represented by `User.isTutorApproved` (boolean), orthogonal to `role`. A user with `role = STUDENT` and `isTutorApproved = true` is a tutor. Do not write `auth.role === 'TUTOR'` or `user.role === 'TUTOR'` anywhere — that comparison is always false and is a sign the access check was not actually applied. Use `requireTutor()` (DB-checked) to gate tutor-only actions, and `requireAdminUser()` / `isAdmin()` (DB-checked) to gate admin-only actions.

Effective access levels in this codebase:

- **STUDENT** — default role, no special flags. Can read/manage only their own resources (own payments, own sessions, own profile, own reviews).
- **TUTOR** — a `STUDENT` (or, in principle, an `ADMIN`) with `isTutorApproved = true`. Can manage their own availability, their own tutor profile, sessions where they are the assigned tutor.
- **ADMIN** — `role = 'ADMIN'`. Can access and mutate cross-user resources (approve tutors, mark payouts paid, suspend users), gated exclusively through `requireAdminUser()`.

### Every endpoint must validate permissions and ownership

Two separate questions must both be answered by every handler that touches a specific resource:

1. **Permission**: does this caller's role/capability allow this *type* of action at all?
2. **Ownership**: does this caller have a specific relationship to *this* resource instance (its `studentId`, `tutorId`, owner field), or are they an admin?

**Incorrect** — authentication only, no ownership, no role check:
```javascript
// GET /api/users/:id
export async function GET(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id } });
  return NextResponse.json({ user }); // any logged-in user can read any other user's full record
}
```

**Correct** — ownership OR admin, explicit field selection:
```javascript
// GET /api/users/:id
export async function GET(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const isOwner = String(auth.sub) === String(id);
  const admin = isOwner ? false : await isAdmin(auth.sub);
  if (!isOwner && !admin) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, profilePictureUrl: true },
  });
  return NextResponse.json({ success: true, user });
}
```

### Role-scoped data exposure

Some endpoints legitimately return different shapes of the same resource depending on the caller's role. This is correct, but the role-gating must happen server-side, never by trusting a client-supplied "view mode".

**Allowed** — [src/app/api/tutors/[id]/route.js](src/app/api/tutors/[id]/route.js):
```javascript
const auth = await tryAuthenticateRequest(request);
const callerId = auth ? String(auth.sub ?? '') : null;
const isAdmin = auth?.role === 'ADMIN';
const isOwner = callerId && callerId === tutorUserId;
const showSensitive = isOwner || isAdmin;

if (showSensitive) {
  publicTutor.email = tutorProfile.user.email;
  publicTutor.totalEarning = tutorProfile.totalEarning ? parseFloat(tutorProfile.totalEarning) : 0;
}
```

**Prohibited:**
```javascript
const { view } = await request.json(); // or a query param
if (view === 'owner') {
  publicTutor.email = tutorProfile.user.email; // client decides what it sees
}
```

A note on `auth.role` read directly from the JWT payload (as in the tutor example above and in `src/app/api/sessions/[id]/route.js`): this is acceptable **only** for soft, read-only view enrichment where a stale role claim has no integrity impact (e.g., showing one extra field to someone who was an admin a few minutes ago and just got demoted). It must **never** be used to gate a mutation or a financial action — those must go through `requireAdminUser()`, which re-reads `role` from the DB on every call.

### Middleware/guard pattern for role checks

```javascript
const admin = await requireAdminUser(request);
if (admin instanceof NextResponse) return admin; // 401/403/429 short-circuit
// admin.sub is the actor's id — use it for audit logging
```

```javascript
const auth = await requireTutor(request);
if (auth instanceof NextResponse) return auth;
// auth.sub is the tutor's id, isTutorApproved/isActive already confirmed fresh from DB
```

---

## Endpoint Creation Checklist

Every new API route handler must have an explicit answer to each item before merge:

- [ ] Is authentication required? If not, is that intentional and stated in a comment (e.g. a public listing endpoint)?
- [ ] Which guard applies: `authenticateRequest`, `tryAuthenticateRequest`, `requireTutor`, `requireAdminUser`, or `requireAdminSecret`?
- [ ] Is ownership validation required (does the route operate on a specific record with an owner field)?
- [ ] Can the current implementation let a user access or mutate another user's resource by changing an ID in the URL or body?
- [ ] Does the response expose sensitive fields (`passwordHash`, `verificationToken`, `resetToken`, `otpCode`, `studentRating`/`studentRatingCount` outside the documented exceptions, internal-only metadata)?
- [ ] Does the response return more fields than the caller's role is entitled to see?
- [ ] Are all inputs (body, query, params) validated with a `zod` schema before use?
- [ ] Is every `amount`/`status`/`role`/foreign-key ID taken from a trusted, server-derived source rather than the request body?
- [ ] Are Prisma queries scoped with an explicit `where` (and `select`) rather than fetching broadly and filtering in JavaScript?

### Endpoint template (Next.js App Router)

```javascript
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware'; // or requireTutor / requireAdminUser
import prisma from '@/lib/prisma';

const bodySchema = z.object({
  // Define every accepted field explicitly. Reject unknown shapes by default
  // (do not use .passthrough() unless the route genuinely needs to forward
  // an upstream payload, as in the Wompi confirm-payment route).
});

export async function POST(request, { params }) {
  // 1. AUTHENTICATION — pick the narrowest guard that fits.
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  // 2. INPUT VALIDATION — never use request data before this point.
  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 },
    );
  }

  // 3. OWNERSHIP — resolve the target resource and verify the caller owns it
  //    (or is an admin), before reading or mutating anything else.
  const { id } = await params;
  const resource = await prisma.someModel.findUnique({ where: { id } });
  if (!resource) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  if (String(resource.ownerId) !== String(auth.sub)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  // 4. BUSINESS LOGIC — delegate to a service, not inline Prisma calls here.

  // 5. OUTPUT — return only what the caller is entitled to see.
  return NextResponse.json({ success: true /*, resource: sanitized */ });
}
```

---

## IDOR Prevention Rules

IDOR (Insecure Direct Object Reference) is the single highest-impact bug class in this codebase, because nearly every resource is identified by a plain ID passed through the URL or body.

**Never trust the following identifiers when they arrive from the client** (URL param, query string, or request body) as proof of identity or entitlement:

`userId`, `tutorId`, `studentId`, `paymentId`, `sessionId`, `notificationId`, `courseId`, `availabilityId`, `reviewId`, `tutorApplicationId`, `attachmentId`

A client-supplied ID is only ever a *pointer* to a resource to look up. It is never, by itself, evidence that the caller is allowed to read or mutate that resource. Identity comes exclusively from `auth.sub` (the JWT subject, validated by `authenticateRequest`) — never from a body or URL field, even one literally named `userId`.

**Allowed** — verify ownership after the lookup, using the authenticated identity, not the client-supplied one:
```javascript
// src/app/api/payments/[id]/route.js
const payment = await paymentRepo.findById(parseInt(id, 10));
if (!payment) {
  return Response.json({ success: false, error: 'Payment not found' }, { status: 404 });
}
if (String(payment.studentId) !== String(user.sub) && String(payment.tutorId) !== String(user.sub)) {
  return Response.json({ success: false, error: 'Unauthorized' }, { status: 403 });
}
```

**Prohibited** — trusting a body field as the actor's identity:
```javascript
// NEVER do this — studentId comes from the body, not from the JWT
const { studentId } = await request.json();
await paymentRepo.markPaid(paymentId, studentId);
```

**Allowed** — scoping the query itself by the authenticated user, instead of fetching by ID alone and checking afterward, when the data model allows it:
```javascript
const availability = await prisma.availability.findFirst({
  where: { id, tutorId: auth.sub }, // ownership baked into the WHERE clause
});
if (!availability) {
  return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
}
```

**Allowed** — confirming the authenticated student is a participant in a Wompi-driven flow, sourced from the durable server-side record, not from the client:
```javascript
// src/app/api/payments/confirm-payment/route.js
const transactionStudentId = String(metadata.studentId ?? '').trim();
if (!transactionStudentId || transactionStudentId !== authenticatedUserId) {
  return NextResponse.json(
    { success: false, error: 'Cannot confirm payment for another student' },
    { status: 403 },
  );
}
```

**Prohibited** — list endpoints that filter in application code instead of in the query:
```javascript
const all = await prisma.notification.findMany(); // fetches every user's notifications
const mine = all.filter((n) => n.userId === auth.sub); // IDOR risk if this filter is ever forgotten downstream, plus a data-exposure and performance problem
```

---

## Database Access Rules

Prisma 7.6 is the only data-access layer (`src/lib/prisma.js` is the singleton client; never instantiate a second `PrismaClient`).

1. **Never use an unrestricted `findMany()`** on a user-scoped or sensitive model. Every `findMany` on `User`, `Payment`, `Session`, `Notification`, `Availability`, `TutorApplication`, `StudentReview`, etc. must have a `where` that scopes to the authenticated user, unless the caller has been verified as admin via `requireAdminUser`/`isAdmin`.
2. **Never return a complete Prisma record** from an API route. Use `select` (or sanitize via the repository layer, e.g. `sanitizeUser()`) to exclude sensitive fields before the object reaches `NextResponse.json(...)`.
3. **Always filter by the authenticated user's id**, taken from `auth.sub`, not from any client-supplied field.
4. **Use explicit `select`** instead of relying on `include` defaults or returning the whole model, especially for `User` and `TutorProfile`, which carry sensitive/financial fields.
5. **Use the `where` clause itself for ownership validation** where the schema allows a compound lookup (`findFirst({ where: { id, ownerId } })`), rather than fetching by id alone and checking in application code — this fails closed if the check is ever accidentally removed downstream, because a non-owned record simply will not be found.
6. **Wrap multi-step mutations that move financial state in a Prisma transaction** (`prisma.$transaction`), and re-verify ownership/role inside the transaction if the operation is sensitive (e.g. moving funds between `nextPayment` and `totalEarning`).

**Allowed:**
```javascript
const sensitiveFieldsExcluded = await prisma.user.findUnique({
  where: { id: auth.sub },
  select: { isTutorApproved: true, isActive: true, role: true },
});
```

**Prohibited:**
```javascript
const user = await prisma.user.findUnique({ where: { id: auth.sub } });
return NextResponse.json({ user }); // leaks passwordHash, verificationToken, resetToken, otpCode
```

**Allowed** — sanitization at the repository boundary, [src/lib/repositories/user.repository.js](src/lib/repositories/user.repository.js):
```javascript
const SENSITIVE_FIELDS = ['passwordHash', 'verificationToken', 'resetToken', 'resetTokenExpiry', 'otpCode', 'otpCodeExpiry'];
const PRIVATE_FIELDS = ['studentRating', 'studentRatingCount'];

function sanitize(user) {
  if (!user) return null;
  const clean = { ...user };
  for (const field of [...SENSITIVE_FIELDS, ...PRIVATE_FIELDS]) {
    delete clean[field];
  }
  return clean;
}
export { sanitize as sanitizeUser };
```
Every repository function that returns a `User` to an API route must pass it through `sanitizeUser()` (or an equivalent explicit `select`) before it leaves the repository layer. Do not add a new field to the `User` model that contains a credential, secret, or token without also adding it to `SENSITIVE_FIELDS`.

**Allowed** — ownership baked into `findFirst`:
```javascript
const block = await prisma.availability.findFirst({ where: { id, tutorId: auth.sub } });
```

**Prohibited:**
```javascript
const all = await prisma.session.findMany(); // no where clause at all
```

---

## Payment Security Rules

The payment integration is with Wompi (Colombian gateway), called via direct `fetch`, not an SDK. Reference implementation: [src/app/api/payments/webhook/route.js](src/app/api/payments/webhook/route.js), [src/lib/services/wompi-api.service.js](src/lib/services/wompi-api.service.js), [src/app/api/payments/confirm-payment/route.js](src/app/api/payments/confirm-payment/route.js), [src/lib/payments/pricing.js](src/lib/payments/pricing.js).

Mandatory rules:

1. **Never trust `status`, `amount_in_cents`, or `metadata` from the client.** Whether the entry point is the webhook or the client-side confirmation fallback, these values must always be re-fetched from Wompi's server-to-server API (`WOMPI_PRIVATE_KEY`) or validated via HMAC against the webhook payload — never read directly off `request.json()`.
2. **Always verify the webhook signature before processing any event.** Use `verifyEventChecksum()`, which computes `SHA-256(tx.id + tx.status + tx.amount_in_cents + tx.currency + timestamp + WOMPI_EVENTS_SECRET)` and compares it to the received checksum with `crypto.timingSafeEqual` (constant-time, to prevent timing attacks). A plain `===` string comparison on a signature is not acceptable.
3. **Never create a payment, session, or any business record before the payment is confirmed `APPROVED`** by Wompi's own response, not by the client's claim.
4. **Always validate the paid amount against the server-computed expected amount** (`resolveSessionAmount()`, which prices off the course's `basePrice` and session duration in the DB) before processing — never off a client-supplied `amount`.
5. **Processing must be idempotent.** Both the webhook and the confirm-payment fallback can fire for the same transaction; dedupe by Wompi's transaction id (`wompiId`) inside `processSuccessfulPayment()` before creating a session/payment record.

**Allowed** — webhook signature verification, [src/app/api/payments/webhook/route.js](src/app/api/payments/webhook/route.js):
```javascript
const eventsSecret = process.env.WOMPI_EVENTS_SECRET;
if (!eventsSecret) {
  console.error('[Wompi Webhook] WOMPI_EVENTS_SECRET is not configured');
  return Response.json({ success: false, error: 'Server misconfiguration' }, { status: 500 });
}
const signatureValid = wompiApi.verifyEventChecksum(eventBody, eventsSecret);
if (!signatureValid) {
  console.error('[Wompi Webhook] Invalid event checksum — request rejected');
  return Response.json({ success: false, error: 'Invalid signature' }, { status: 401 });
}
```

**Allowed** — checksum comparison, constant-time, [src/lib/services/wompi-api.service.js](src/lib/services/wompi-api.service.js):
```javascript
const computed = crypto.createHash('sha256').update(raw).digest('hex');
const a = Buffer.from(computed);
const b = Buffer.from(receivedChecksum);
if (a.length !== b.length) return false;
return crypto.timingSafeEqual(a, b);
```

**Prohibited:**
```javascript
if (computedChecksum === receivedChecksum) { /* ... */ } // not constant-time; also accepts a forged status with no secret check if this line is ever skipped
```

**Allowed** — re-fetching the authoritative transaction instead of trusting the client body, [src/app/api/payments/confirm-payment/route.js](src/app/api/payments/confirm-payment/route.js):
```javascript
const transaction = await wompiApi.fetchTransaction(clientTransactionData.id); // GET against Wompi, WOMPI_PRIVATE_KEY
const { status, amount_in_cents, reference } = transaction; // never from request body
```

**Prohibited:**
```javascript
const { status, amount_in_cents, metadata } = await request.json();
if (status === 'APPROVED') {
  await WompiService.processSuccessfulPayment({ status, amount_in_cents, metadata }); // forgeable
}
```

**Allowed** — amount reconciliation against server-side pricing:
```javascript
const priced = await resolveSessionAmount({ courseId, startTimestamp, endTimestamp });
const expectedAmount = Math.round(priced.amount * 100);
if (Math.abs(Number(amount_in_cents) - expectedAmount) > 1) {
  return NextResponse.json({ success: false, error: 'Amount mismatch' }, { status: 400 });
}
```

---

## Sensitive Data Rules

1. **No secrets in source code.** All credentials (`JWT_SECRET`, `ADMIN_SECRET`, `WOMPI_PRIVATE_KEY`, `WOMPI_EVENTS_SECRET`, `WOMPI_INTEGRITY_SECRET`, AWS keys, Google OAuth client secret, DB connection string) must be read via `process.env`, never hardcoded, never written into a comment, a test fixture, or a default value.
2. **No credentials in commits**, including in seed scripts, migration files, or example `.env` files. `.env*` is excluded via `.gitignore` (line 34) — do not remove that exclusion, and do not add a new env file pattern without the same exclusion.
3. **No API keys in commit messages or PR descriptions.**
4. **Use environment variables locally** (`.env`, `.env.local`, loaded via `dotenv`), and a secret manager (GitHub Secrets in CI, the deployment platform's secret store in production) for any non-local environment.
5. **Never log sensitive data**: no `console.log`/`console.error` of full `User` objects, JWTs, passwords, Wompi keys, or webhook secrets. Log identifiers (`userId`, `transactionId`) instead of payloads.

**Allowed:**
```javascript
const secret = process.env.ADMIN_SECRET;
if (!secret) {
  console.error('[requireAdminSecret] ADMIN_SECRET env var is not configured'); // logs the condition, not the secret
}
```

**Prohibited:**
```javascript
console.log('Admin check', { provided, secret }); // leaks the secret to logs
console.log('User payload', user); // may include passwordHash if not sanitized yet
```

---

## API Response Rules

1. **Return the minimum required data.** Build response objects field-by-field (as in the `publicTutor` pattern in `src/app/api/tutors/[id]/route.js`) rather than spreading an entire Prisma record into the response.
2. **Never expose internal identifiers unnecessarily** (e.g. internal audit log ids, suspension actor ids) to non-admin callers.
3. **Never expose secrets** — JWTs other than the one issued to the caller, `ADMIN_SECRET`, Wompi keys, S3 credentials.
4. **Never expose stack traces or raw error messages from the database/ORM to the client.** Catch errors, log the detail server-side, and return a generic message.
5. **Use `zod` to validate input on the way in.** Where a response shape has meaningful invariants (e.g. an admin-only payload vs a public payload), keep the two shapes structurally distinct in code rather than conditionally deleting fields from one shared object after the fact, to avoid an accidental field surviving a refactor.

**Allowed** — generic error response, no stack trace:
```javascript
} catch (error) {
  console.error('[PUT /api/payments/[id]]:', error.message); // server-side detail
  return Response.json({ success: false, error: 'Internal server error' }, { status: 500 }); // generic to the client
}
```

**Prohibited:**
```javascript
} catch (error) {
  return Response.json({ success: false, error: error.message, stack: error.stack }, { status: 500 });
}
```

**Allowed** — explicit field selection on the way out:
```javascript
const publicTutor = {
  id: tutorProfile.userId,
  name: tutorProfile.user.name,
  bio: tutorProfile.bio,
  rating: overallRating,
};
if (isOwner || isAdmin) {
  publicTutor.email = tutorProfile.user.email;
  publicTutor.totalEarning = tutorProfile.totalEarning ? parseFloat(tutorProfile.totalEarning) : 0;
}
```

**Prohibited:**
```javascript
return NextResponse.json({ tutor: tutorProfile }); // includes every Prisma field, every relation, regardless of caller
```

---

## File Upload Rules

File uploads go through AWS S3 with presigned URLs (the server never proxies the file bytes). Reference: [src/app/api/attachments/presigned-urls/route.js](src/app/api/attachments/presigned-urls/route.js), [src/lib/services/session-attachment.service.js](src/lib/services/session-attachment.service.js).

1. **Validate file type via an explicit MIME allowlist**, never a blocklist, and never trust the file extension alone.
2. **Validate file size server-side** before issuing the presigned URL — do not rely on client-side size checks only.
3. **Bind the resulting S3 object key to the authenticated user/session**, so one user cannot overwrite or reference another user's uploaded file by guessing a key.
4. **Prevent path traversal** in any client-supplied file name — sanitize before it becomes part of an S3 key.
5. **Validate ownership of the parent resource** (e.g. the session the attachment belongs to) before issuing the presigned URL, not just the caller's identity in isolation.

**Allowed** — MIME and size allowlist, [src/app/api/attachments/presigned-urls/route.js](src/app/api/attachments/presigned-urls/route.js):
```javascript
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const fileSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE),
});
```

**Prohibited:**
```javascript
// Trusting the extension instead of an explicit MIME allowlist:
if (fileName.endsWith('.pdf') || fileName.endsWith('.jpg')) { /* accept */ }
```

**Allowed** — S3 key namespaced so files cannot collide or be guessed across unrelated resources, plus ownership of the parent session checked before issuing the URL (`session-attachment.service.js`): key layout is `session-attachments/{subject-slug}/{YYYY-MM}/{batchId}/{sanitized-name}`, where `batchId` is generated server-side and the route verifies the caller is a participant of the target session before this function is ever called.

**Prohibited:**
```javascript
const key = `uploads/${fileName}`; // client-controlled name, no namespacing, no ownership binding, collision/path-traversal risk
await s3.putObject({ Key: key, ... });
```

---

## Code Review Security Checklist

Every PR must be checked against this list before approval. A reviewer (human or AI) that approves a PR without verifying these items is not doing a security review, regardless of how thorough the functional review was.

- [ ] **Authentication** — does every new/modified route call `authenticateRequest`, `tryAuthenticateRequest`, `requireTutor`, or `requireAdminUser` (or `requireAdminSecret` for service-to-service only) before doing anything else?
- [ ] **Authorization** — beyond authentication, is there an explicit role/capability check appropriate to the action?
- [ ] **Ownership** — for any route that operates on a specific resource ID, is ownership (or admin override) verified against the authenticated user's `auth.sub`, not against a client-supplied field?
- [ ] **IDOR** — can any ID accepted from the client (path, query, or body) be swapped to access another user's data? Walk through the happy path with a different user's ID mentally.
- [ ] **Data Exposure** — does any response include fields beyond what the caller's role/ownership entitles them to (sensitive `User` fields, other users' financial data, internal audit metadata)?
- [ ] **Payments** — if the change touches `src/app/api/payments/**` or `src/lib/services/wompi*`, is every status/amount/metadata value sourced from Wompi's verified response or server-side pricing, never from the client body?
- [ ] **Secrets** — no hardcoded credentials, no secrets in logs, no new `.env`-pattern files excluded from `.gitignore` removed or weakened.
- [ ] **Input Validation** — is every request body/query validated with a `zod` schema before use?
- [ ] **Output Filtering** — is the response built from explicit fields or a `sanitize*()` helper, not a raw Prisma object?
- [ ] **File Access** — for upload/attachment routes, is MIME/size validated server-side and is the S3 key bound to an authenticated owner?
- [ ] **Logging** — does any new log statement print a full user object, token, password, or secret?

---

## Instructions For AI Coding Agents

These instructions apply specifically to any AI agent (Claude Code, Cursor, GitHub Copilot, OpenAI Codex, Windsurf, or other) generating or modifying code in this repository.

### Before generating code

1. Identify the authentication requirement for the change: does it touch a route, a guard, or auth-adjacent logic? If so, identify which guard (`authenticateRequest`, `tryAuthenticateRequest`, `requireTutor`, `requireAdminUser`, `requireAdminSecret`) applies, using the definitions in [Authentication Rules](#authentication-rules).
2. Identify the authorization requirement: which role/capability is required, and is there an existing guard for it, or does a new one need to follow the same DB-re-check pattern?
3. Identify the ownership requirement: does the change operate on a record with an owner field (`studentId`, `tutorId`, `userId`, etc.)? If so, plan the ownership check before writing the handler body.
4. Identify the affected roles (`STUDENT`, `ADMIN`, and the `isTutorApproved` capability — remember there is no `TUTOR` enum value, see [Authorization Rules](#authorization-rules)) and confirm the change does not silently grant or remove access for any of them.

### Before creating endpoints

1. Validate access control against the [Endpoint Creation Checklist](#endpoint-creation-checklist) — every item must have an explicit answer, not an assumption.
2. Validate data exposure risk: list every field the response will contain and justify each one for the caller's role.
3. Validate privilege escalation risk: could this endpoint, combined with another existing endpoint, let a `STUDENT` reach an `ADMIN`-only effect (e.g. writing a field that a privileged process reads later without re-checking)?
4. Verify compliance with the [Endpoint Creation Checklist](#endpoint-creation-checklist) explicitly, item by item, in the PR description if the change adds a new route.

### Before approving or finalizing changes

1. Search for IDOR risk: trace every client-supplied ID used in a Prisma query and confirm it is paired with an ownership check.
2. Search for broken access control: confirm every new/modified handler has a guard call as its first statement (after JSON/body parsing only if required earlier).
3. Search for sensitive data exposure: confirm no `passwordHash`, `verificationToken`, `resetToken`, `otpCode`, raw `studentRating`/`studentRatingCount` (outside the documented exceptions), or other-user financial fields leave an API response.
4. Verify [Database Access Rules](#database-access-rules): no unrestricted `findMany`, explicit `select` used, ownership in `where` where feasible.
5. Verify [Payment Security Rules](#payment-security-rules) for any change touching `payments/` or `wompi*`: status/amount/metadata must originate from Wompi's verified response, never the client.

### If uncertain

**Do not assume authorization.** If it is not clear from the existing code whether a given role/ownership combination should be allowed, do not guess in either direction (do not assume access should be granted, and do not silently restrict access either). Require explicit validation: either find the authoritative existing pattern elsewhere in the codebase that answers the question, or flag the ambiguity to a human reviewer in the PR description instead of resolving it unilaterally.

---

## CI/CD Security Rules

### Dependency security

- `pnpm audit --audit-level=low` must pass in CI on every PR into `dev`. This is a hard gate — see `.github/workflows/ci.yml`. Any vulnerability at any severity level (including "low") fails the build.
- Package versions must be free of known vulnerabilities at merge time. Do not merge a PR that pins a vulnerable transitive dependency "temporarily."
- Use `pnpm-workspace.yaml` → `overrides` to force a safe version of a vulnerable transitive dependency when the direct dependency has not yet released a fix. Do not put `overrides`/`onlyBuiltDependencies` back into `package.json`'s `pnpm` field — pnpm 10 does not read settings from there; it reads them from `pnpm-workspace.yaml`.

### Configuration files

- `.github/workflows/ci.yml` must include the security audit step (`pnpm audit --audit-level=low`) in addition to the test step. Do not remove or weaken this step to make a PR pass.
- `.github/dependabot.yml` must be configured for daily scans of the `npm` ecosystem (pnpm is npm-ecosystem-compatible for Dependabot purposes) at the repository root.
- Branch protection on `dev`/`main` must require the CI status check to pass before merge. Do not bypass branch protection to merge a failing security check.

### Package manager

- pnpm `10.33.4` is the pinned version (`packageManager` field in `package.json`). Do not run `npm install` or `yarn` in this repository — it will create a conflicting lockfile and defeat the `overrides`/audit setup.
- CI must use `pnpm install --frozen-lockfile`, never plain `pnpm install`, so a PR cannot silently change resolved dependency versions without updating `pnpm-lock.yaml` in the same commit.

### Current CI/CD configuration (reference)

[.github/workflows/ci.yml](.github/workflows/ci.yml):
```yaml
name: CI Test Suite

on:
  pull_request:
    branches: [dev]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install Dependencies
        run: pnpm install --frozen-lockfile

      - name: Security Audit
        run: pnpm audit --audit-level=low

      - name: Create .env file
        run: echo "${{ secrets.ENV_FILE }}" > .env

      - name: Run Tests
        run: pnpm test
```

[.github/dependabot.yml](.github/dependabot.yml):
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "daily"
    open-pull-requests-limit: 10
```

### Dependabot configuration policy

- Daily security scans against the dependency tree (`schedule.interval: daily`).
- Dependabot opens automatic PRs for vulnerable dependencies; these PRs must pass the same `pnpm audit --audit-level=low` gate as any other PR before merge.
- Group non-security version bumps where practical to reduce review overhead, but never group a security fix with an unrelated dependency bump — security PRs should be reviewable and mergeable independently.

### Infrastructure security

- PostgreSQL runs on AWS RDS and must not be exposed directly to the public internet; all access goes through Prisma from the application layer, using credentials from environment variables, never hardcoded.
- AWS S3 access for uploads/downloads is via presigned URLs with a bounded expiry — the application never holds or exposes long-lived public S3 URLs for user-uploaded content.
- Secrets (`JWT_SECRET`, `ADMIN_SECRET`, Wompi keys, AWS credentials, Google OAuth client secret, DB connection string) are managed via GitHub Secrets in CI (`${{ secrets.ENV_FILE }}`) and via environment variables in every other environment. None of these are committed to the repository.

---

## Definition of Done (Security)

A feature is **not done** if any of the following is true:

- Authorization validation is missing for any new or modified endpoint.
- Ownership validation is missing for any endpoint that operates on a specific resource ID.
- Role validation is missing or relies on a JWT claim alone for a privileged/mutating action.
- A plausible IDOR exists: a client-supplied ID can be swapped to reach another user's resource.
- Any secret, credential, or token is exposed in source code, logs, commit history, or an API response.
- Any route lacks an explicit authentication guard, without a documented reason for being public.
- `pnpm audit --audit-level=low` fails for the dependency set introduced or touched by the change.
- Security-relevant behavior (new guard, new ownership check, new payment-trust boundary) has no corresponding test.

A feature can only be considered done once every item above is satisfied, the [Code Review Security Checklist](#code-review-security-checklist) has been walked through, and CI (including the `pnpm audit --audit-level=low` step) is green.
