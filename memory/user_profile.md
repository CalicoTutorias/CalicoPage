---
name: User profile
description: Developer working on Calico Monitorias, a Next.js 15 tutor marketplace
type: user
---

Desarrollador trabajando en Calico Monitorias — plataforma monolítica en Next.js 15 (App Router) donde estudiantes buscan tutores y tutores gestionan disponibilidad vía Google Calendar. Stack: React 19, Tailwind v4, shadcn/ui (JSX, no TSX), **PostgreSQL + Prisma ORM**, custom JWT auth (bcrypt + jsonwebtoken), AWS S3, Brevo (email), Wompi (payments), Google Calendar/Drive APIs, Zod validation.

NOTA: el proyecto migró de Firebase/Firestore a PostgreSQL + Prisma. Cualquier referencia a Firestore/Firebase en código o comentarios es legado obsoleto — NO asumir Firestore nunca. Ver [[stack-data]].

Tiene alta atención al rendimiento: aprueba optimizaciones que reduzcan queries innecesarias a la BBDD y percibe claramente los tiempos de carga (logró 3s→200ms en profile). Prefiere que las refactorizaciones vengan con justificación técnica clara, similar a un Performance Engineer Senior.
