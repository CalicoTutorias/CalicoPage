# Calico Monitorias

> Marketplace platform connecting tutors and students, built with Next.js 15

Calico helps university students in Colombia find peer tutors, book sessions, and manage their learning journey. Tutors manage availability via Google Calendar, accept bookings, and track earnings.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://reactjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-blue?logo=postgresql)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Features

- **Tutor Discovery** — Search and filter tutors by course, major, and availability
- **Google Calendar Integration** — Automatic sync with tutor schedules
- **Session Management** — Book, reschedule, and track tutoring sessions
- **Session Attachments** — Students attach study material (PDF/PNG/JPG/DOC) at booking or later from history; secure presigned S3 download links
- **Payment Integration** — Wompi checkout with server-authoritative pricing (price/hour × session length)
- **Custom JWT Auth** — bcrypt + jsonwebtoken, email verification gate
- **Admin Panel** — Tutor moderation, dashboard KPIs, audit log, growth analytics, user directory
- **Bilingual (i18n)** — Full Spanish/English UI via a custom locale provider

---

## Quick Start

```bash
# Clone and install (project uses pnpm)
git clone https://github.com/yourusername/calico-monitorias.git
cd calico-monitorias
pnpm install

# Setup environment
# For local development, use a personal local PostgreSQL DB.
# Follow docs/LOCAL_DATABASE.md to create .env.local and start Postgres.

# Run development server
pnpm dev
```

Visit `http://localhost:3000`.

---

## Architecture

Monolithic **Next.js 15 (App Router)** — frontend and backend in one package.

```
src/
├── app/
│   ├── api/          — API Route Handlers (server)
│   ├── components/   — React components (client)
│   ├── services/     — Frontend service singletons (client)
│   └── (pages)/      — Next.js page routes
│
└── lib/
    ├── services/     — Business logic (server)
    └── repositories/ — Database access via Prisma (server)
```

Data flow: `Component → Service → API Route → Business Service → Repository → Prisma → PostgreSQL`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Frontend | React 19, Tailwind CSS v4, shadcn/ui |
| Backend | Next.js API Routes |
| Database | PostgreSQL + Prisma ORM |
| Auth | Custom JWT (bcrypt + jsonwebtoken) |
| APIs | Google Calendar, Google Drive, Wompi, Brevo, AWS S3 |
| Validation | Zod |
| i18n | Custom React context — ES/EN JSON locales |
| Testing | Jest + Testing Library |

---

## Commands

```bash
pnpm dev              # Dev server on :3000 (Turbopack)
pnpm build            # Production build
pnpm start            # Production server (after build)
pnpm lint             # ESLint
pnpm test             # Jest single run
pnpm test:watch       # Jest watch mode

# Database
pnpm db:generate      # Regenerate Prisma client
pnpm db:push          # Push schema changes (use instead of migrate — see docs/BACKLOG.md)
pnpm db:studio        # Prisma Studio UI
pnpm db:seed          # Seed departments and careers
```

---

## Documentation

| File | Content |
|---|---|
| [docs/PROJECT.md](docs/PROJECT.md) | Product overview, user flows, pricing model, cancellation policy |
| [docs/LOCAL_DATABASE.md](docs/LOCAL_DATABASE.md) | Local PostgreSQL setup for each developer |
| [docs/PATTERNS.md](docs/PATTERNS.md) | Architecture, conventions, auth, design system, i18n rules |
| [docs/specs/functional.md](docs/specs/functional.md) | Detailed user flows and business rules |
| [docs/specs/technical.md](docs/specs/technical.md) | DB schema, all API routes, env vars, external services |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Active tech debt |

---

## Deployment

### Vercel

```bash
vercel deploy
```

### Docker

```bash
docker build -t calico-monitorias .
docker run -p 3000:3000 calico-monitorias
```

After deployment, complete Google OAuth setup once:
1. Visit `https://your-domain.com/api/calendar/auth`
2. Login with `calico.tutorias@gmail.com`
3. Grant permissions

---

## Contributing

1. Read [docs/PATTERNS.md](docs/PATTERNS.md) first
2. Follow the layered architecture — never skip a layer
3. Filter on the server with Prisma `where` (never fetch all rows and filter in JS)
4. Use CSS tokens only — read `src/app/styles/design-tokens.css` before writing any color
5. All user-facing text goes through `t()` with keys in both `es.json` and `en.json`
6. Identity comes from `auth.sub` after authenticating — never from the request body

---

## Contact

- Email: calico.tutorias@gmail.com
- Instagram: @calico.tutorias

---

## License

MIT License — see [LICENSE](LICENSE) for details.
