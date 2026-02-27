# 🎓 Calico Monitorias

> Marketplace platform connecting tutors and students, built with Next.js 15

**Calico** helps students find tutors, book sessions, and manage their learning journey. Tutors can publish availability via Google Calendar, accept bookings, and track earnings.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://reactjs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange?logo=firebase)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## ✨ Features

- 🔍 **Tutor Discovery** - Search and filter tutors by course, major, and availability
- 📅 **Google Calendar Integration** - Automatic sync with tutor schedules
- 📚 **Session Management** - Book, reschedule, and track tutoring sessions
- 💳 **Payment Integration** - Wompi payment processing
- 🔐 **Firebase Auth** - Secure authentication for students and tutors
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

**📖 For complete setup guide, see [AGENT.md](AGENT.md)**

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
Component → Service → API Route → Business Logic → Repository → Firestore
```

**Benefits:**
- ✅ Single deployment
- ✅ No CORS issues
- ✅ Shared code/types
- ✅ Lower costs

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 15 (App Router) |
| **Frontend** | React 19, Tailwind CSS, shadcn/ui |
| **Backend** | Next.js API Routes |
| **Database** | Firebase Firestore |
| **Auth** | Firebase Authentication |
| **APIs** | Google Calendar, Google Drive |
| **Validation** | Zod |
| **Testing** | Jest + Testing Library |

---

## 📚 Documentation

- **[AGENT.md](AGENT.md)** - Complete guide for developers and AI agents
- **[API_ENDPOINTS.md](API_ENDPOINTS.md)** - API reference
- **[MONOLITH_ARCHITECTURE.md](MONOLITH_ARCHITECTURE.md)** - Architecture details
- **[FIRESTORE_SETUP.md](FIRESTORE_SETUP.md)** - Database setup
- **[PROJECT_ERRORS_ANALYSIS.md](PROJECT_ERRORS_ANALYSIS.md)** - Known issues

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

**⚠️ Important:** After deployment, complete Google OAuth setup once:
1. Visit `https://your-domain.com/api/calendar/auth`
2. Login with `calico.tutorias@gmail.com`
3. Grant permissions

See [AGENT.md](AGENT.md#google-oauth-setup-critical---one-time-setup) for details.

---

## 🤝 Contributing

### For Developers

1. Read [AGENT.md](AGENT.md) first
2. Follow the minimalist coding principles
3. Always add `limit` to Firestore queries
4. Validate inputs with Zod
5. Test locally before pushing

### For AI Agents

This project has specific guidelines for AI coding assistants:
- **Be minimalist** - Write the smallest possible change
- **Be cost-conscious** - Never pull full collections
- **Follow patterns** - API → Service → Repository
- **Check [AGENT.md](AGENT.md#for-ai-coding-assistants)** for complete guidelines

---

## ⚠️ Known Issues

- **DB inconsistencies** - Mixed use of `tutorId` vs `tutorEmail` (prefer IDs in new code)
- **Over-requesting** - Project hit Firebase limits; always use `limit` in queries
- **Next.js 15** - Must `await params` in dynamic routes

See [AGENT.md](AGENT.md#known-issues--pitfalls) for details and fixes.

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
