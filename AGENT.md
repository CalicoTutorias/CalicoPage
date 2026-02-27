# Calico Monitorias - Agent Guide

**Unified documentation for developers and AI coding assistants**

---

## 🚀 Quick Start

```bash
# 1. Clone and install
npm install

# 2. Setup environment
cp .env.example .env.local
# Edit .env.local with your Firebase and Google credentials

# 3. Run
npm run dev
```

**Verify:** Visit `http://localhost:3000` → should see homepage  
**Verify API:** Visit `http://localhost:3000/api/courses` → should return JSON

---

## 📖 Project Overview

**Calico** is a marketplace connecting tutors and students. Students search for tutors, view availability, and book sessions. Tutors manage schedules via Google Calendar, accept/decline bookings, and track earnings.

### Architecture Decision: Monolithic Next.js

**Why monolith?** Originally built as separate React frontend + NestJS backend, then unified into Next.js for:
- ✅ Single deployment
- ✅ No CORS issues
- ✅ Shared types/code between frontend and backend
- ✅ Lower infrastructure costs
- ✅ Simpler development (one server)

### Stack

- **Framework:** Next.js 15 (App Router)
- **Frontend:** React 19, Tailwind CSS, shadcn/ui
- **Backend:** Next.js API Routes
- **Database:** Firebase Firestore
- **Auth:** Firebase Authentication
- **External APIs:** Google Calendar API, Google Drive API
- **Validation:** Zod
- **Testing:** Jest + Testing Library

---

## 🏗️ Architecture

### Directory Structure

```
src/
├── app/                          # Next.js App Router
│   ├── api/                     # 🔴 SERVER: API Routes (Backend)
│   │   ├── availability/       # Tutor availability endpoints
│   │   ├── calendar/           # Google Calendar OAuth & operations
│   │   ├── calico-calendar/    # Calico shared calendar
│   │   ├── courses/            # Course management
│   │   ├── majors/             # Academic majors
│   │   ├── tutoring-sessions/  # Session booking & management
│   │   └── users/              # User profiles & tutors list
│   │
│   ├── components/              # 🔵 CLIENT: React UI Components
│   ├── services/                # 🔵 CLIENT: API clients (call /api/*)
│   │   ├── core/               # Main service classes
│   │   ├── utils/              # Helper services
│   │   └── integrations/       # External integrations
│   ├── hooks/                   # 🔵 CLIENT: Custom React hooks
│   ├── context/                 # 🔵 CLIENT: React Context providers
│   └── (pages)/                 # 🔵 CLIENT: Frontend pages/routes
│
├── lib/                          # 🔴 SERVER: Shared server-side logic
│   ├── firebase/
│   │   └── admin.js            # Firebase Admin SDK initialization
│   ├── repositories/            # Data Access Layer (Firestore CRUD)
│   │   ├── availability.repository.js
│   │   ├── tutoring-session.repository.js
│   │   ├── user.repository.js
│   │   ├── academic.repository.js
│   │   └── slot-booking.repository.js
│   └── services/                # Business Logic Layer
│       ├── availability.service.js
│       ├── calendar.service.js
│       ├── calico-calendar.service.js
│       ├── tutoring-session.service.js
│       ├── user.service.js
│       ├── slot.service.js
│       └── academic.service.js
│
└── components/ui/                # shadcn/ui component library
```

### Data Flow

```
User Action (Browser)
    ↓
React Component (src/app/components/)
    ↓
Frontend Service (src/app/services/core/)
    ↓
    fetch('/api/endpoint')
    ↓
API Route Handler (src/app/api/endpoint/route.js)
    ↓
Business Logic Service (src/lib/services/)
    ↓
Repository (src/lib/repositories/)
    ↓
Firebase Firestore
```

**Example Flow:**
1. User clicks "Book Session" → `SessionConfirmationModal.jsx`
2. Calls `TutoringSessionService.bookSession()` → frontend service
3. Makes `POST /api/tutoring-sessions` → API route
4. Calls `tutoringSessionService.createSession()` → business logic
5. Calls `tutoringSessionRepository.create()` → database operation
6. Firestore write happens

### Server vs Client Code

| Context | Location | Can Use | Cannot Use |
|---------|----------|---------|------------|
| 🔴 **Server** | `src/lib/`, `src/app/api/` | Firebase Admin SDK, Google APIs, Direct env vars, Node.js modules | Browser APIs (window, localStorage), Firebase Client SDK |
| 🔵 **Client** | `src/app/components/`, `src/app/services/`, `src/app/hooks/` | Firebase Client SDK, Browser APIs, fetch() to `/api/*` | Firebase Admin SDK, Direct server env vars, Node.js fs/path |

---

## 🤖 For AI Coding Assistants

### How to Use This Guide

You are working with **GitHub Copilot CLI**, **Claude Code**, or similar AI assistant. This section ensures you work **effectively, minimally, and correctly**.

#### Core Principles

1. **MINIMALIST CODE**
   - Write the **smallest possible change** to achieve the goal
   - Avoid redundant code, unnecessary comments, verbose patterns
   - Prefer one clear line over five explanatory ones
   - Delete unused code instead of commenting it out

2. **BOLD AND DECISIVE**
   - Make architectural decisions confidently based on existing patterns
   - Don't ask for permission for standard changes (adding fields, fixing bugs)
   - Use established patterns without reinventing them

3. **COST-CONSCIOUS (Firebase Free Tier)**
   - **NEVER** pull entire collections to filter client-side
   - **ALWAYS** add `limit` to queries (default: 50)
   - **ALWAYS** filter on the server, not client
   - Reuse query results within a request instead of re-fetching

4. **SOLID FOUNDATIONS**
   - Follow the existing layered architecture (API → Service → Repository)
   - Validate inputs at API boundaries with Zod
   - Return explicit HTTP status codes and error messages
   - Log safely (never log tokens, emails, private keys)

### Things to ALWAYS Do

✅ **Use existing patterns:**
```javascript
// API Route pattern
export async function GET(request, { params }) {
  const resolvedParams = await params; // Next.js 15 requirement
  const { id } = resolvedParams;
  try {
    const result = await serviceFunction(id);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

✅ **Limit Firestore queries:**
```javascript
// In repositories
const snapshot = await db.collection('tutoringSessions')
  .where('tutorId', '==', tutorId)
  .limit(limit || 50) // ALWAYS add limit
  .get();
```

✅ **Validate API inputs:**
```javascript
import { z } from 'zod';

const schema = z.object({
  tutorId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const validated = schema.parse(body);
```

✅ **Use path aliases:**
```javascript
import { getFirestore } from '@/lib/firebase/admin';
import * as userService from '@/lib/services/user.service';
```

### Things to NEVER Do

❌ **Don't fetch entire collections:**
```javascript
// BAD - Pulls all documents then filters client-side
const all = await db.collection('users').get();
const tutors = all.docs.filter(doc => doc.data().role === 'tutor');
```

❌ **Don't use Firebase Admin in client code:**
```javascript
// BAD - Will crash in browser
import { getFirestore } from 'firebase-admin/firestore';
```

❌ **Don't expose secrets to client:**
```javascript
// BAD - Server-only env vars in client component
const apiKey = process.env.FIREBASE_PRIVATE_KEY;
```

❌ **Don't write redundant code:**
```javascript
// BAD - Unnecessary wrapper
function getUserById(id) {
  return userRepository.findById(id);
}

// GOOD - Just use the repository directly if no business logic
```

❌ **Don't make duplicate requests:**
```javascript
// BAD - Fetches user twice
const user = await userRepo.findById(userId);
const userName = (await userRepo.findById(userId)).name;

// GOOD - Reuse the result
const user = await userRepo.findById(userId);
const userName = user.name;
```

### Known Issues to Avoid

⚠️ **DB Field Inconsistencies**

The codebase has **inconsistent naming** across models. Some use `tutorId`, others use `tutorEmail`. This is a known issue from the "vibe-coded" origins.

**What to do:**
- When creating new code, prefer **IDs over emails** (e.g., `tutorId`, `studentId`)
- When reading existing code, check both field names
- Document which field you're using in comments if ambiguous

**Examples of inconsistency:**
```javascript
// Some files use:
{ tutorId: "abc123" }

// Others use:
{ tutorEmail: "tutor@example.com" }

// Some use both:
{ tutorId: "abc123", tutorEmail: "tutor@example.com" }
```

⚠️ **Over-Requesting Firebase**

The project has hit Firebase free tier limits due to unoptimized queries. Common patterns to avoid:

```javascript
// BAD - No limit, could fetch thousands
await db.collection('sessions').where('status', '==', 'active').get();

// BAD - Fetches all to count
const count = (await db.collection('users').get()).size;

// BAD - Multiple separate queries in a loop
for (const tutorId of tutorIds) {
  await db.collection('availability').where('tutorId', '==', tutorId).get();
}
```

**Fix patterns:**
```javascript
// GOOD - Add limit
await db.collection('sessions').where('status', '==', 'active').limit(50).get();

// GOOD - Use aggregation or estimate
// (Note: Firestore count() queries are billable but cheaper than full fetch)

// GOOD - Batch with 'in' operator (max 10 values)
await db.collection('availability')
  .where('tutorId', 'in', tutorIds.slice(0, 10))
  .get();
```

⚠️ **Next.js 15 Params Requirement**

Next.js 15 requires `params` to be awaited before accessing properties:

```javascript
// BAD - Will error
export async function GET(request, { params }) {
  const { id } = params;
}

// GOOD
export async function GET(request, { params }) {
  const resolvedParams = await params;
  const { id } = resolvedParams;
}
```

### How to Work Effectively

**When starting a task:**
1. Check existing patterns in similar files
2. Identify which layer needs changes (API → Service → Repository)
3. Make surgical, minimal changes
4. Verify Firebase queries have limits

**When stuck:**
1. Check this guide's Troubleshooting section
2. Look at similar working implementations
3. Verify environment variables are set

**When you see problematic code:**
- Only fix it if it's related to your task
- Don't refactor working code unless asked
- Document issues for future fixes

---

## 💻 Development Setup

### Environment Variables

Create `.env.local` in project root:

```env
# ====================================
# FIREBASE CLIENT (Browser - Public)
# ====================================
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=calico-tutorias.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=calico-tutorias
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=calico-tutorias.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-ABC123

# ====================================
# FIREBASE ADMIN (Server - Private)
# ====================================
# Option 1: Individual fields
FIREBASE_PROJECT_ID=calico-tutorias
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@calico-tutorias.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Private-Key-Here\n-----END PRIVATE KEY-----\n"

# Option 2: Full service account JSON (alternative)
# GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"calico-tutorias",...}'

# ====================================
# GOOGLE OAUTH (For Calendar API)
# ====================================
GOOGLE_CLIENT_ID=123456789-abc123.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123xyz
GOOGLE_REDIRECT_URI=http://localhost:3000/api/calendar/callback

# ====================================
# GOOGLE CALENDAR
# ====================================
CALICO_CALENDAR_ID=calico.tutorias@gmail.com

# ====================================
# PAYMENT (Wompi)
# ====================================
NEXT_PUBLIC_WOMPI_PUBLIC_KEY=pub_test_abc123

# ====================================
# APP CONFIG
# ====================================
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000
```

### Firebase Setup

1. **Create Firebase Project** (if not exists)
   - Go to https://console.firebase.google.com
   - Create project: `calico-tutorias`

2. **Enable Authentication**
   - Authentication → Sign-in method
   - Enable: Email/Password

3. **Create Firestore Database**
   - Firestore Database → Create database
   - Start in **test mode** (for development)
   - Location: Choose closest region

4. **Create Collections**

Run this in Firestore console or via Firebase Admin:

```javascript
// Required collections:
- users/           // User profiles (tutors & students)
- course/          // Available courses
- major/           // Academic majors
- tutoringSessions/ // Booking records
- availability/    // Tutor availability blocks
```

**Example documents:**

```javascript
// users/{userId}
{
  email: "user@example.com",
  name: "John Doe",
  role: "tutor", // or "student"
  courses: ["Calculus I", "Algebra"],
  calendarConnected: true,
  createdAt: Timestamp
}

// tutoringSessions/{sessionId}
{
  tutorId: "abc123",
  studentId: "xyz789",
  course: "Calculus I",
  scheduledStart: Timestamp,
  scheduledEnd: Timestamp,
  status: "pending", // pending|active|completed|cancelled
  tutorApprovalStatus: "pending", // pending|approved|declined
  createdAt: Timestamp
}

// availability/{availId}
{
  tutorId: "abc123",
  eventId: "gcal_event_id",
  course: "Calculus I",
  start: Timestamp,
  end: Timestamp,
  createdAt: Timestamp
}
```

5. **Get Service Account Key**
   - Project Settings → Service Accounts
   - Generate new private key
   - Download JSON file
   - Extract values for `.env.local`

### Google OAuth Setup (CRITICAL - One-Time Setup)

**The Challenge:** Google Calendar API requires OAuth, but tutors shouldn't authorize individually. We use **one shared account** (`calico.tutorias@gmail.com`) that all tutors' events go into.

**Initial Setup (Do This ONCE):**

1. **Create Google Cloud Project**
   - Go to https://console.cloud.google.com
   - Create project: `Calico Monitorias`
   - Enable APIs: Google Calendar API, Google Drive API

2. **Create OAuth Credentials**
   - APIs & Services → Credentials
   - Create OAuth 2.0 Client ID
   - Application type: Web application
   - Authorized redirect URIs:
     ```
     http://localhost:3000/api/calendar/callback
     https://your-production-domain.com/api/calendar/callback
     ```
   - Save Client ID and Client Secret to `.env.local`

3. **Authorize the Calico Account (ONE TIME PER ENVIRONMENT)**

   This is the **tricky part** that must be done once per deployment environment:

   ```bash
   # Start your dev server
   npm run dev

   # Visit the auth URL
   # Open browser: http://localhost:3000/api/calendar/auth

   # Login with: calico.tutorias@gmail.com
   # Grant all permissions (Calendar, Drive)

   # You'll be redirected to callback page
   # Tokens are saved in cookies/server
   ```

   **What happens:**
   - OAuth flow exchanges code for tokens
   - `access_token` - short-lived (1 hour)
   - `refresh_token` - long-lived (persists)
   - Server stores refresh_token to get new access_tokens automatically

   **For Production:**
   - Do the same flow in production environment
   - Only needs to be done once unless tokens are revoked
   - Store refresh_token securely (environment variable or secret manager)

4. **Verify Connection**

   ```bash
   curl http://localhost:3000/api/calendar/check-connection
   ```

   Should return:
   ```json
   {
     "connected": true,
     "hasAccessToken": true,
     "hasRefreshToken": true,
     "tokenValid": true
   }
   ```

**Troubleshooting OAuth:**

```bash
# Check OAuth configuration
curl http://localhost:3000/api/calendar/diagnostics

# If tokens expired, re-authorize
# Visit: http://localhost:3000/api/calendar/auth

# Disconnect and start fresh
curl -X POST http://localhost:3000/api/calendar/disconnect
```

### Running Locally

```bash
# Development
npm run dev              # Start dev server on :3000

# Production build
npm run build           # Build for production
npm start               # Start production server

# Testing
npm test                # Run tests once
npm run test:watch      # Watch mode
npm run test:ci         # CI mode

# Linting
npm run lint            # ESLint check
```

### Verification Checklist

- [ ] Dev server runs without errors
- [ ] Homepage loads at `http://localhost:3000`
- [ ] API endpoint works: `http://localhost:3000/api/courses`
- [ ] Firebase connection: `http://localhost:3000/api/users/tutors`
- [ ] Google Calendar connected: `http://localhost:3000/api/calendar/check-connection`

---

## 🎯 Best Practices

### Firebase Cost Control

**Context:** The project hit Firebase free tier limits (50k reads/day) due to over-requesting. Follow these patterns:

#### 1. Always Add Limits

```javascript
// BAD
const sessions = await db.collection('tutoringSessions')
  .where('tutorId', '==', tutorId)
  .get();

// GOOD
const sessions = await db.collection('tutoringSessions')
  .where('tutorId', '==', tutorId)
  .limit(50)
  .get();
```

#### 2. Filter on Server, Not Client

```javascript
// BAD - Fetches all, filters in memory
const allTutors = await db.collection('users').get();
const available = allTutors.docs.filter(doc => 
  doc.data().calendarConnected === true
);

// GOOD - Filters in query
const availableTutors = await db.collection('users')
  .where('calendarConnected', '==', true)
  .limit(50)
  .get();
```

#### 3. Use Pagination

```javascript
// Use cursor-based pagination
const firstPage = await db.collection('tutoringSessions')
  .orderBy('createdAt', 'desc')
  .limit(20)
  .get();

const lastVisible = firstPage.docs[firstPage.docs.length - 1];

const nextPage = await db.collection('tutoringSessions')
  .orderBy('createdAt', 'desc')
  .startAfter(lastVisible)
  .limit(20)
  .get();
```

#### 4. Batch Operations

```javascript
// BAD - Individual writes
for (const session of sessions) {
  await db.collection('tutoringSessions').doc(session.id).update(session);
}

// GOOD - Batch write (500 ops limit)
const batch = db.batch();
sessions.forEach(session => {
  const ref = db.collection('tutoringSessions').doc(session.id);
  batch.update(ref, session);
});
await batch.commit();
```

#### 5. Reuse Query Results

```javascript
// BAD - Same query twice
export async function updateSession(id, data) {
  const session = await findById(id);
  // ... validation logic
  const currentSession = await findById(id); // Wasteful!
  // ... update logic
}

// GOOD - Reuse
export async function updateSession(id, data) {
  const session = await findById(id);
  // ... validation logic using session
  // ... update logic using session
}
```

### Code Style: Minimalism

**Philosophy:** Code should be **as simple as possible, but no simpler.**

✅ **Good:**
```javascript
export async function getActiveSessions(tutorId) {
  return await db.collection('tutoringSessions')
    .where('tutorId', '==', tutorId)
    .where('status', '==', 'active')
    .limit(50)
    .get();
}
```

❌ **Over-engineered:**
```javascript
/**
 * Retrieves all active tutoring sessions for a given tutor
 * @param {string} tutorId - The unique identifier of the tutor
 * @returns {Promise<QuerySnapshot>} A promise resolving to active sessions
 * @throws {Error} If tutorId is invalid or database query fails
 */
export async function getActiveSessions(tutorId) {
  // Validate input parameter
  if (!tutorId || typeof tutorId !== 'string') {
    throw new Error('Invalid tutorId provided');
  }
  
  // Log the operation for debugging
  console.log(`Fetching active sessions for tutor: ${tutorId}`);
  
  try {
    // Query Firestore for matching documents
    const result = await db.collection('tutoringSessions')
      .where('tutorId', '==', tutorId)
      .where('status', '==', 'active')
      .limit(50)
      .get();
    
    // Log success
    console.log(`Successfully fetched ${result.size} sessions`);
    
    return result;
  } catch (error) {
    // Log error and rethrow
    console.error('Error fetching active sessions:', error);
    throw error;
  }
}
```

**When to comment:**
- Complex business logic that isn't obvious
- Workarounds for library bugs
- Non-obvious performance optimizations

**When NOT to comment:**
- Obvious code (`// Set name to user name`)
- Function signatures (use clear names instead)
- Every single line

### Repository Pattern

All database operations go through repositories in `src/lib/repositories/`:

```javascript
// src/lib/repositories/user.repository.js
import { getFirestore } from '../firebase/admin';

export async function findById(id) {
  const db = getFirestore();
  const doc = await db.collection('users').doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

export async function findByEmail(email) {
  const db = getFirestore();
  const snapshot = await db.collection('users')
    .where('email', '==', email)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

export async function create(data) {
  const db = getFirestore();
  const ref = await db.collection('users').add({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  return ref.id;
}

export async function update(id, data) {
  const db = getFirestore();
  await db.collection('users').doc(id).update({
    ...data,
    updatedAt: new Date()
  });
}
```

### Service Pattern

Business logic in `src/lib/services/`:

```javascript
// src/lib/services/user.service.js
import * as userRepository from '../repositories/user.repository';

export async function getUserById(id) {
  const user = await userRepository.findById(id);
  if (!user) {
    throw new Error(`User ${id} not found`);
  }
  return user;
}

export async function getTutors(course = null, limit = 50) {
  const tutors = await userRepository.findByRole('tutor', limit);
  
  if (course) {
    return tutors.filter(t => t.courses?.includes(course));
  }
  
  return tutors;
}

export async function updateProfile(userId, data) {
  // Validate
  if (data.email) {
    const existing = await userRepository.findByEmail(data.email);
    if (existing && existing.id !== userId) {
      throw new Error('Email already in use');
    }
  }
  
  // Update
  await userRepository.update(userId, data);
  return await userRepository.findById(userId);
}
```

### API Route Pattern

API routes in `src/app/api/*/route.js`:

```javascript
// src/app/api/users/[id]/route.js
import { NextResponse } from 'next/server';
import * as userService from '@/lib/services/user.service';
import { z } from 'zod';

export async function GET(request, { params }) {
  const resolvedParams = await params; // Next.js 15
  const { id } = resolvedParams;
  
  try {
    const user = await userService.getUserById(id);
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.message.includes('not found') ? 404 : 500 }
    );
  }
}

export async function PUT(request, { params }) {
  const resolvedParams = await params;
  const { id } = resolvedParams;
  
  try {
    const body = await request.json();
    
    // Validate
    const schema = z.object({
      name: z.string().optional(),
      email: z.string().email().optional(),
      courses: z.array(z.string()).optional()
    });
    const validated = schema.parse(body);
    
    // Update
    const user = await userService.updateProfile(id, validated);
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

### Security Guidelines

1. **Never expose Admin SDK to client**
   ```javascript
   // BAD - In client component
   import { getFirestore } from 'firebase-admin/firestore';
   
   // GOOD - In API route
   import { getFirestore } from '@/lib/firebase/admin';
   ```

2. **Validate all inputs**
   ```javascript
   const schema = z.object({
     tutorId: z.string().min(1),
     date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
   });
   const validated = schema.parse(body);
   ```

3. **Safe logging**
   ```javascript
   // BAD
   console.log('User logged in:', user);
   
   // GOOD
   console.log('User logged in:', user.id);
   ```

4. **Return appropriate status codes**
   ```javascript
   // 200: Success
   // 400: Bad request (invalid input)
   // 401: Unauthorized (not logged in)
   // 403: Forbidden (logged in but no permission)
   // 404: Not found
   // 500: Server error
   ```

---

## ⚠️ Known Issues

### DB Model Inconsistencies

**Problem:** Fields are named inconsistently across the codebase.

**Examples:**
- Some use `tutorId`, others use `tutorEmail`
- Some use `studentId`, others use `studentEmail`
- Some use `scheduledStart`, others use `startTime`

**This happened because:** The project was "vibe-coded" initially, then built incrementally with AI assistance without a unified schema.

**What to do:**
- **When creating new code:** Use IDs (`tutorId`, `studentId`) not emails
- **When reading existing code:** Check which fields are actually used
- **When it breaks:** Look for both naming conventions

**Common field names:**
```javascript
// Preferred (use these in new code)
tutorId, studentId, courseId, userId

// Legacy (you might find these)
tutorEmail, tutorMail, studentEmail, studentMail

// Time fields
scheduledStart, scheduledEnd  // Preferred
startTime, endTime            // Legacy
```

### Over-Requesting Patterns

**Problem:** The app hit Firebase daily limits due to inefficient queries.

**Anti-patterns to avoid:**

```javascript
// 1. No limit
await db.collection('sessions').get();

// 2. Client-side filtering
const all = await db.collection('users').get();
const tutors = all.docs.filter(d => d.data().role === 'tutor');

// 3. Multiple queries in loop
for (const id of ids) {
  await db.collection('availability').where('tutorId', '==', id).get();
}

// 4. Duplicate queries
const user = await getUser(id);
// ... 10 lines later
const userName = (await getUser(id)).name; // Wasteful!
```

**Fix patterns:**

```javascript
// 1. Always limit
await db.collection('sessions').limit(50).get();

// 2. Server-side filtering
await db.collection('users').where('role', '==', 'tutor').limit(50).get();

// 3. Batch with 'in' operator
await db.collection('availability')
  .where('tutorId', 'in', ids.slice(0, 10))
  .get();

// 4. Reuse results
const user = await getUser(id);
const userName = user.name;
```

### Missing Firestore Collections

**Problem:** Some collections don't exist in Firestore yet.

If you see errors like:
```
Collection 'course' not found. Returning empty array.
Error: 5 NOT_FOUND
```

**Solution:** The code handles this gracefully by returning empty arrays. To fix properly:
1. Go to Firebase Console
2. Create the missing collection
3. Add sample documents

### Next.js 15 Params Requirement

**Problem:** Dynamic route params must be awaited.

**Error message:**
```
Route "/api/users/[id]" used `params.id`. 
`params` should be awaited before using its properties.
```

**Fix:**
```javascript
// Before (causes error)
export async function GET(request, { params }) {
  const { id } = params;
}

// After (correct)
export async function GET(request, { params }) {
  const resolvedParams = await params;
  const { id } = resolvedParams;
}
```

**Files affected:** All dynamic routes in `src/app/api/*/[param]/route.js`

---

## 📡 API Reference

Base URL: `http://localhost:3000/api`

### Availability

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/availability` | GET | List availabilities (query: tutorId, course, startDate, endDate, limit) |
| `/availability/check-event` | GET | Check if event exists (query: eventId) |
| `/availability/create` | POST | Create availability in Google Calendar + Firestore |
| `/availability/delete` | DELETE | Delete availability (query: eventId, calendarId) |
| `/availability/sync` | POST | Sync from Google Calendar |
| `/availability/sync-intelligent` | POST | Smart sync (only new events) |
| `/availability/slots/available` | GET | Get available time slots (query: tutorId) |
| `/availability/slots/generate` | POST | Generate hourly slots |

### Calendar (Google OAuth)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/calendar/auth` | GET | Redirect to Google OAuth (one-time setup) |
| `/calendar/auth-url` | GET | Get OAuth URL as JSON |
| `/calendar/callback` | GET | OAuth callback (automatic) |
| `/calendar/check-connection` | GET | Verify tokens are valid |
| `/calendar/create-event` | POST | Create calendar event |
| `/calendar/delete-event` | DELETE | Delete calendar event |
| `/calendar/diagnostics` | GET | Check OAuth configuration |

### Calico Calendar

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/calico-calendar/status` | GET | Check Calico Calendar connection |
| `/calico-calendar/tutoring-session` | POST | Create tutoring session in shared calendar |
| `/calico-calendar/tutoring-session/[eventId]` | GET/PUT/DELETE | Manage session event |

### Tutoring Sessions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/tutoring-sessions` | GET/POST | List or create sessions |
| `/tutoring-sessions/[id]` | GET/PUT | Get or update session |
| `/tutoring-sessions/[id]/accept` | POST | Tutor accepts session |
| `/tutoring-sessions/[id]/decline` | POST | Tutor declines session |
| `/tutoring-sessions/[id]/cancel` | POST | Cancel session |
| `/tutoring-sessions/[id]/complete` | POST | Mark session complete |
| `/tutoring-sessions/student/[studentId]` | GET | Student's sessions |
| `/tutoring-sessions/tutor/[tutorId]` | GET | Tutor's sessions |
| `/tutoring-sessions/tutor/[tutorId]/pending` | GET | Tutor's pending approvals |

### Users

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/users/tutors` | GET | List all tutors (query: course, limit) |
| `/users/[id]` | GET/PUT | Get or update user profile |

### Courses & Majors

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/courses` | GET/POST | List or create courses |
| `/courses/[id]` | GET/PUT/DELETE | Manage course |
| `/majors` | GET/POST | List or create majors |
| `/majors/[id]` | GET/PUT/DELETE | Manage major |

### Example Usage

**Get available tutors for a course:**
```bash
curl "http://localhost:3000/api/users/tutors?course=Calculus+I&limit=10"
```

**Create availability:**
```bash
curl -X POST http://localhost:3000/api/availability/create \
  -H "Content-Type: application/json" \
  -d '{
    "tutorId": "abc123",
    "accessToken": "ya29.a0...",
    "title": "Calculus Tutoring",
    "date": "2026-03-01",
    "startTime": "14:00",
    "endTime": "16:00",
    "course": "Calculus I"
  }'
```

**Book a session:**
```bash
curl -X POST http://localhost:3000/api/tutoring-sessions \
  -H "Content-Type: application/json" \
  -d '{
    "tutorId": "abc123",
    "studentId": "xyz789",
    "course": "Calculus I",
    "scheduledStart": "2026-03-01T14:00:00Z",
    "scheduledEnd": "2026-03-01T15:00:00Z"
  }'
```

---

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Production deployment
vercel --prod
```

**Environment Variables:**
- Go to Vercel Dashboard → Project → Settings → Environment Variables
- Add all variables from `.env.local`
- **CRITICAL:** Must set `GOOGLE_REDIRECT_URI` to production URL:
  ```
  GOOGLE_REDIRECT_URI=https://your-domain.vercel.app/api/calendar/callback
  ```

**After deployment:**
1. Visit `https://your-domain.vercel.app/api/calendar/auth`
2. Login with `calico.tutorias@gmail.com`
3. Grant permissions (one-time setup)
4. Verify: `https://your-domain.vercel.app/api/calendar/check-connection`

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Build
RUN npm run build

# Expose and run
EXPOSE 3000
CMD ["npm", "start"]
```

**Build and run:**
```bash
docker build -t calico-monitorias .
docker run -p 3000:3000 --env-file .env.local calico-monitorias
```

### Environment Variables in Production

**Vercel:** Project Settings → Environment Variables  
**Docker:** Use `.env` file or `-e` flags  
**AWS/GCP:** Use Secrets Manager or Parameter Store

**CRITICAL:** Update `GOOGLE_REDIRECT_URI` for production domain.

---

## 🔧 Troubleshooting

### Firebase Admin Not Initialized

**Error:**
```
Error: Firebase Admin not initialized
```

**Fix:**
1. Check `.env.local` has `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
2. Restart dev server
3. Verify private key includes `\n` newlines

### Google OAuth Errors

**Error:** `redirect_uri_mismatch`

**Fix:**
1. Go to Google Cloud Console → Credentials
2. Edit OAuth 2.0 Client
3. Add redirect URI: `http://localhost:3000/api/calendar/callback`
4. Save and wait 5 minutes

**Error:** `invalid_grant`

**Fix:**
1. Refresh token expired or revoked
2. Re-authorize: Visit `http://localhost:3000/api/calendar/auth`
3. Login with `calico.tutorias@gmail.com` again

### CORS Errors

**Error:**
```
Access to fetch at 'http://localhost:3001/api/...' from origin 'http://localhost:3000' has been blocked by CORS
```

**Fix:**
This shouldn't happen in monolithic setup. You're likely calling wrong URL.

1. Check `src/config/api.js` - should NOT have external URL
2. Frontend services should call `/api/*` not `http://localhost:3001/api/*`

### Module Not Found

**Error:**
```
Cannot find module '../../../../lib/services/...'
```

**Fix:**
1. Check `jsconfig.json` has path alias: `"@/*": ["src/*"]`
2. Use alias: `import * as service from '@/lib/services/...'`
3. Restart your IDE/editor

### Build Errors

**Error:** `params is not awaitable`

**Fix:** Update dynamic routes to await params (see Known Issues)

**Error:** `firebase-admin` in client bundle

**Fix:** You're importing Admin SDK in client code. Use Firebase Client SDK instead.

### Empty API Responses

**Problem:** APIs return `[]` for courses, majors, sessions

**Cause:** Firestore collections don't exist yet

**Fix:**
1. Go to Firebase Console → Firestore
2. Create collections: `course`, `major`, `users`, `tutoringSessions`, `availability`
3. Add sample documents

**Quick test:**
```bash
# Create a course
curl -X POST http://localhost:3000/api/courses \
  -H "Content-Type: application/json" \
  -d '{"name": "Calculus I", "code": "MAT101"}'
```

### Token Refresh Issues

**Problem:** `access_token` expires after 1 hour

**Solution:** Server should auto-refresh using `refresh_token`. Check:
```javascript
// src/lib/services/calendar.service.js
export async function refreshAccessToken(refreshToken) {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials;
}
```

---

## 📚 Additional Resources

- **Next.js Docs:** https://nextjs.org/docs
- **Firebase Docs:** https://firebase.google.com/docs
- **Google Calendar API:** https://developers.google.com/calendar/api/guides/overview
- **shadcn/ui:** https://ui.shadcn.com

---

## 📝 Notes

**Last Updated:** February 2026  
**Architecture Version:** 2.0 (Monolithic Next.js)  
**Target:** AI Agents & Human Developers

**Contributing:**
When working on this codebase, remember:
- Be minimalist
- Be bold
- Control costs
- Follow patterns
- Document issues

---

**Need help?** Check existing implementations in similar files. Most answers are in the code.
