---
name: stack-data
description: Calico usa PostgreSQL + Prisma ORM, NO Firestore/Firebase. Modelo de materias es `Course`. Catálogo pequeño (<40 materias).
metadata:
  type: project
---

Calico (CalicoPage) persiste **todos** los datos en PostgreSQL accedidos vía Prisma ORM. NO usa Firestore ni Firebase para datos. Migró de Firebase → PostgreSQL en algún punto; quedan referencias legadas obsoletas en comentarios de código (p.ej. [page.jsx:141](src/app/home/buscar-tutores/page.jsx#L141), [TutorSearchService.js:106](src/app/services/utils/TutorSearchService.js#L106) mencionan "Firestore users.courses") y un string i18n en `en.json:1726` ("Firebase Authentication") — todos obsoletos, ignorar.

- Schema: `prisma/schema.prisma` (datasource `postgresql`), cliente generado en `src/generated/prisma`, singleton en `src/lib/prisma.js`.
- Modelo de materias: `model Course` → `id` (uuid), `code` (unique), `name`, `complexity` (enum), `basePrice`, `departmentId`; relaciones `Topic`, `TutorCourse`, `Session`, `Review`, `CoursePrice`.
- Arquitectura en 4 capas: Componente → Frontend Service (`src/app/services/`) → API Route (`src/app/api/.../route.js`) → Business Service (`src/lib/services/`) → Repository (`src/lib/repositories/`) → Prisma.
- Catálogo de materias: **menos de 40** a fecha 2026-05-21. Volumen pequeño.
- La página de búsqueda (`src/app/home/buscar-tutores/`) tiene dos modos vía tabs: buscar por **materias** y buscar por **tutores**.

**Why:** Aluciné Firestore dos veces en conversaciones porque mi memoria de perfil estaba congelada en el stack viejo y porque el código tiene comentarios legados. El usuario corrigió explícitamente: "ya no usamos Firestore, solo PostgreSQL".

**How to apply:** Para búsqueda/persistencia/queries razonar siempre en Postgres + Prisma. Agregar campos a materia = editar `schema.prisma` + `npm run db:migrate`. CLAUDE.md (`documentation/CLAUDE.md`) es la fuente correcta del stack. Regla del proyecto: filtrar en servidor con Prisma `where`, nunca traer todo y filtrar en JS — pero ojo: con <40 materias el client-side actual no es crítico. Ver [[stack-data]] relacionado con [[user-profile]].
