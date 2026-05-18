# 🎓 Calico Monitorias

> Marketplace platform connecting tutors and students, built with Next.js 15

**Calico** helps students find tutors, book sessions, and manage their learning journey. Tutors can publish availability via Google Calendar, accept bookings, and track earnings.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://reactjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-blue?logo=postgresql)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

##  Features

-  **Tutor Discovery** - Search and filter tutors by course, major, and availability
-  **Google Calendar Integration** - Automatic sync with tutor schedules
-  **Session Management** - Book, reschedule, and track tutoring sessions
-  **Payment Integration** - Wompi payment processing
- 🔐 **Custom JWT Auth** - bcrypt + jsonwebtoken, email verification gate
- 📊 **Analytics** - Track sessions, earnings, and student progress

---

## 🚀 Quick Start

```bash
# Clone and install
git clone https://github.com/yourusername/calico-monitorias.git
cd calico-monitorias
npm install

# Setup environment
cp .env.example .env.local
# Edit .env.local with your credentials

# Run development server
npm run dev
```

Visit `http://localhost:3000` to see the app running.

** For architecture, conventions and API reference, see [documentation/CLAUDE.md](documentation/CLAUDE.md)**

---

## 🏗️ Architecture

**Monolithic Next.js** - Frontend and backend unified in a single application.

```
src/
├── app/
│   ├── api/              # 🔴 Backend API Routes
│   ├── components/       # 🔵 React Components
│   ├── services/         # 🔵 API Clients
│   └── (pages)/          # 🔵 Frontend Routes
│
└── lib/
    ├── services/         # 🔴 Business Logic
    └── repositories/     # 🔴 Database Access
```

**Data Flow:**
```
Component → Service → API Route → Business Logic → Repository → Prisma → PostgreSQL
```

**Benefits:**
- ✅ Single deployment
- ✅ No CORS issues
- ✅ Shared code/types
- ✅ Lower costs

---

## 🎨 Sistema de Diseño Visual

Calico usa un sistema de tokens CSS centralizado para garantizar consistencia visual. **Todo color, sombra, espaciado y tipografía debe venir de un token — nunca usar hexadecimales propios directamente.**

### Archivo fuente único de verdad

```
src/app/styles/design-tokens.css   ← paleta completa, tipografía, espaciado, elevación
src/app/globals.css                ← importa tokens, define @theme para Tailwind
```

### Paleta principal

| Token | Valor | Uso |
|-------|-------|-----|
| `--calico-green` | `#289656` | Verde marketplace — CTAs, bordes de éxito |
| `--calico-orange` | `#ff9505` | Naranja brand — íconos, gradientes, decoración |
| `--calico-orange-text` | `#b45309` | Naranja **legible** en texto (WCAG AA 5.2:1) |
| `--calico-orange-text-hover` | `#c2410c` | Hover de naranja en texto |
| `--calico-blue-tutor` | `#006bb3` | Azul exclusivo de la zona tutor |
| `--calico-ink` | `#15251f` | Texto oscuro principal |
| `--calico-body-muted` | `#5c6f66` | Texto secundario / placeholders |

### Estados semánticos de sesión

```css
/* Completado */   background: var(--calico-green-success-soft); color: var(--calico-green-success-dark);
/* Pendiente */    background: var(--calico-warning-soft);        color: var(--calico-warning-text);
/* Cancelado */    background: var(--calico-danger-soft);         color: var(--calico-danger-strong);
/* Programado */   background: var(--calico-info-soft);           color: var(--calico-info-text);
```

### Contexto de rol

- **Zona estudiante** — acento naranja (`--calico-orange`, `--calico-orange-text`)
- **Zona tutor** — acento azul (`--calico-blue-tutor`) — nunca en páginas de estudiante
- **Marketing / auth** — verde + naranja en combinación

### Reglas rápidas para el equipo

1. **Busca el token antes de escribir un color** — Si no existe, agrégalo a `design-tokens.css`
2. **Azul tutor ≠ Tailwind blue** — `#006bb3` (Calico), no `#2563eb` / `#3b82f6`
3. **Naranja en texto** → usa `--calico-orange-text` (#b45309), no `--calico-orange` (#ff9505) — el naranja puro tiene ratio 2.5:1 y no pasa WCAG AA
4. **Focus rings** — `box-shadow: 0 0 0 3px rgba(...)` (exactamente 4 valores) — el quinto `0` rompe el ring
5. **Agregar token nuevo** → documentarlo en el bloque de comentarios del archivo `design-tokens.css`

### Qué NO hacer

```css
/* ❌ Prohibido — Tailwind blues hardcodeados */
color: #2563eb;
background: rgba(59, 130, 246, 0.12);

/* ❌ Prohibido — hex arbitrario fuera del sistema */
color: #1a237e;
border-color: #8892d6;

/* ✅ Correcto */
color: var(--calico-blue-tutor);
background: rgba(0, 107, 179, 0.12);
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 15 (App Router) |
| **Frontend** | React 19, Tailwind CSS, shadcn/ui |
| **Backend** | Next.js API Routes |
| **Database** | PostgreSQL + Prisma ORM |
| **Auth** | Custom JWT (bcrypt + jsonwebtoken) |
| **APIs** | Google Calendar, Google Drive, Wompi, Brevo, AWS S3 |
| **Validation** | Zod |
| **Testing** | Jest + Testing Library |

---

##  Documentation

- **[documentation/CLAUDE.md](documentation/CLAUDE.md)** - Architecture, conventions, DB schema, full API reference
- **[documentation/ADMIN_DASHBOARD_PLAN.md](documentation/ADMIN_DASHBOARD_PLAN.md)** - Admin panel design & execution status
- **[documentation/testing/STUDENT_BOOKING_TESTS.md](documentation/testing/STUDENT_BOOKING_TESTS.md)** - Student booking test suite
- **[documentation/flujo_materias](documentation/flujo_materias)** - Tutor lifecycle & course approval flow (business spec)

---

## 🚢 Deployment

### Vercel (Recommended)

```bash
vercel deploy
```

### Docker

```bash
docker build -t calico-monitorias .
docker run -p 3000:3000 calico-monitorias
```

** Important:** After deployment, complete Google OAuth setup once:
1. Visit `https://your-domain.com/api/calendar/auth`
2. Login with `calico.tutorias@gmail.com`
3. Grant permissions

See the External Services / Google Calendar section in [documentation/CLAUDE.md](documentation/CLAUDE.md) for details.

---

## 🤝 Contributing

### For Developers

1. Read [documentation/CLAUDE.md](documentation/CLAUDE.md) first
2. Follow the minimalist coding principles
3. Filter on the server with Prisma `where` (never fetch all rows then filter in JS)
4. Validate inputs with Zod
5. Test locally before pushing
6. **Visual** — Never hardcode colors; always use a CSS token from `design-tokens.css` (see [Sistema de Diseño Visual](#-sistema-de-diseño-visual))

### For AI Agents

This project has specific guidelines for AI coding assistants:
- **Be minimalist** - Write the smallest possible change
- **Filter on the server** - Never fetch all rows then filter in JS; use Prisma `where`
- **Follow patterns** - API → Service → Repository
- **CSS tokens only** - Read `src/app/styles/design-tokens.css` before writing any color. The Cursor rule `.cursor/rules/css-design-system.mdc` will auto-load guidance for all `.css` files
- **Check [documentation/CLAUDE.md](documentation/CLAUDE.md)** for complete guidelines

---

##  Known Issues

- **DB inconsistencies** - Mixed use of `tutorId` vs `tutorEmail` (prefer IDs in new code)
- **Next.js 15** - Must `await params` in dynamic routes
- **Identity from JWT** - Extract `auth.sub` after `authenticateRequest`; never trust IDs from the request body/URL (IDOR)

See [documentation/CLAUDE.md](documentation/CLAUDE.md) for details and conventions.

---

## 📝 Scripts

```bash
npm run dev          # Development server
npm run build        # Production build
npm start            # Start production server
npm test             # Run tests
npm run lint         # Lint code
```

---

## 📧 Contact

- **Project:** Calico Monitorias
- **Email:** calico.tutorias@gmail.com

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Made with ❤️ for better education**
