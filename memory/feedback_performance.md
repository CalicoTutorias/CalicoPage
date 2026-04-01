---
name: Performance patterns validated in Calico
description: Anti-patterns found and fixes applied during performance audits of this codebase
type: feedback
---

Usar datos del AuthContext/useAuth en lugar de re-fetchear el usuario desde la API.

**Why:** Profile page pasó de 3s → ~200ms eliminando el fetch de getUserById y leyendo directo de `useAuth`.

**How to apply:** Siempre que un componente necesite uid/email/name/isTutor, usar `useAuth()` o `useUser()` hook. Solo fetchear si se necesitan datos extra del perfil no presentes en el contexto.

---

Notificaciones: hacer lazy load (al abrir el dropdown) en vez de eager load en mount.

**Why:** Header renderiza en CADA página. Los dropdowns de notificaciones disparaban 2 reads a Firebase en cada page load, contribuyendo al agotamiento del free tier.

**How to apply:** Usar el patrón `if (next && !loading && notifications.length === 0) loadNotifications()` dentro del click handler del botón.

---

No usar Math.random() directamente en el render/JSX de un componente.

**Why:** Genera valores distintos en cada re-render, causando re-renders innecesarios de hijos y mismatch de hidratación server/client.

**How to apply:** Envolver con `useMemo(..., [dependencia])` para estabilizar el valor entre renders.

---

Separar efectos independientes: no mezclar fetches sin dependencias de usuario con fetches que sí las necesitan en un mismo Promise.all.

**Why:** En TutorHome, `getMaterias()` (sin email) bloqueaba junto con `getTutorStats(email)` bajo un solo `loading` state. Las materias podían renderizarse antes.

**How to apply:** Usar dos `useEffect` separados: uno sin deps para datos globales (materias/cursos), otro con `[user?.email]` para datos del usuario.

---

Extraer lógica de fetch repetida a `useCallback` en vez de duplicarla.

**Why:** TutoringSummary tenía el mismo bloque fetch+filter+sort en `fetchSessions` y `handleSessionUpdate` (~40 líneas duplicadas).

**How to apply:** Crear `fetchUpcomingSessions = useCallback(async () => {...}, [user.email, userType])` y reusar en ambos.
