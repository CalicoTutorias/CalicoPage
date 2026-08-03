# Backlog de implementación — Plan de Marketing Fase 1 (Tracción y Validación)

> Traducción del Plan de Marketing a **tareas de código** ejecutables, con prioridad asignada.
> Cada tarea tiene: ID, bloque del plan, impacto, esfuerzo, prioridad, dueño (micro-rol) y criterio de aceptación.
>
> Documentos relacionados: [PROJECT.md](../PROJECT.md) · [PATTERNS.md](../PATTERNS.md) · [specs/technical.md](../specs/technical.md) · [BACKLOG.md](../BACKLOG.md) (deuda técnica)

---

## 1. Sistema de priorización

Matriz **Impacto × Esfuerzo**. El impacto se mide contra la North Star Metric (tutorías agendadas por semana); el esfuerzo en días-persona de desarrollo.

| | **S** (< 1 día) | **M** (1–3 días) | **L** (> 3 días) |
|---|---|---|---|
| **Impacto Alto** | 🔴 **P0** | 🔴 **P0** | 🟠 **P1** |
| **Impacto Medio** | 🔴 **P0** | 🟠 **P1** | 🟡 **P2** |
| **Impacto Bajo** | 🟡 **P2** | 🟡 **P2** | ⚪ **P3** |

| Prioridad | Significado | Cuándo se ejecuta |
|---|---|---|
| 🔴 **P0** | Bloquea medir o bloquea la campaña. Sin esto, el resto del plan corre a ciegas. | Bloque 1 — antes de pegar el primer afiche |
| 🟠 **P1** | Habilita un canal de adquisición o retención concreto del plan. | Bloques 2–3 |
| 🟡 **P2** | Mejora la conversión o el LTV, pero el canal ya funciona sin ello. | Bloque 4 / relleno de sprint |
| ⚪ **P3** | Nice-to-have. Solo si sobra capacidad; candidato a descartar. | Backlog frío |

**Dueños** (micro-roles del plan):
- **GT** = Growth Técnico y Producto (todas las tareas de este documento son suyas salvo indicación)
- **OPS** = Operaciones, Relaciones y Crecimiento (aporta copy, listas, contenido; no toca código)

**Regla de oro:** no se pasa de bloque sin haber medido el anterior. Una tarea P0 sin terminar bloquea su bloque completo.

---

## 2. Diagnóstico: qué existe hoy y qué falta

Auditoría del repo al 2026-07-22 (rama `feature/admin-news`):

| Capacidad que el plan asume | Estado en el código |
|---|---|
| Analítica web / embudo de conversión | ❌ **No existe.** Cero `gtag`, GTM, PostHog o similar en `src/` |
| Captura de UTMs y atribución de origen | ❌ No existe. Ningún `utm_` en el repo |
| QR trackeables | ❌ No existe (depende de lo anterior) |
| Sistema de referidos / embajadores | ❌ No existe. Sin modelo, sin API, sin UI |
| Cupones o descuentos | ❌ No existe. `pricing.js` calcula precio × duración sin capa de descuento |
| Paquetes de sesiones (bundles) | ❌ No existe. `Payment` es 1:1 con `Session` |
| Emails transaccionales | ✅ Brevo con 13 plantillas (`src/lib/services/email.service.js`) |
| Email de bienvenida | ⚠️ Solo verificación de correo; no hay onboarding |
| Recordatorio 24h antes de la sesión | ❌ No existe. No hay cron ni job programado en el repo |
| Reactivación a 15 días | ❌ No existe |
| Métricas de retención/cohortes | ✅ Ya hay `/api/admin/metrics/*` (retention, cohorts, revenue, sessions, top-courses) |
| SEO / Open Graph / sitemap | ❌ `metadata` en [layout.jsx:17](../../src/app/layout.jsx#L17) es `title: "Calico", description: "Proyecto de monitorías"`. Sin OG, sin `sitemap.ts`, sin `robots.txt` |
| Captura de leads sin cuenta | ❌ `NotifyMeButton` exige login (devuelve 401 a anónimos) |
| Prueba social real en landing | ⚠️ Números **hardcodeados y falsos** ("150+ sesiones activas") en `es.json` |

**Conclusión:** el Bloque 1 del plan ("Instrumentación y Fundamentos") es, en código, casi todo trabajo nuevo. La buena noticia: el backend de métricas de admin ya existe y se puede reutilizar para la North Star.

---

## 3. Bloque 1 — Instrumentación y Fundamentos

> Objetivo del plan: *dejar la infraestructura lista para medir qué funciona y capturar a los primeros interesados.*

### MKT-01 · Instalar analítica de producto con embudo de conversión
🔴 **P0** · Impacto Alto · Esfuerzo M · GT

Sin esto ningún experimento del plan es medible. Elegir **una** herramienta (recomendación: PostHog Cloud — gratis hasta 1M eventos, embudos y cohortes sin construir nada) e instrumentar el embudo mínimo:

`landing_view → cta_click → register_start → register_complete → email_verified → search_tutor → booking_start → payment_success → session_completed`

Implementación: proveedor en [layout.jsx](../../src/app/layout.jsx) (`next/script` con `strategy="afterInteractive"`), helper `src/lib/analytics/` con `track(event, props)` no-op cuando falta la key, y llamadas desde los servicios de frontend existentes en `src/app/services/core/`.

**Aceptación:** los 9 eventos aparecen en el dashboard; el embudo landing→pago se puede leer sin tocar la base de datos. Consentimiento de cookies revisado contra [privacy-policy](../../src/app/privacy-policy).

### MKT-02 · Captura y persistencia de UTMs + origen de registro
🔴 **P0** · Impacto Alto · Esfuerzo M · GT

Middleware o hook de cliente que lea `utm_source/medium/campaign/content` de la URL, los guarde en `sessionStorage` + cookie de primera parte, y los envíe en `POST /api/auth/register`. Añadir a `User` los campos `acquisitionSource`, `acquisitionCampaign`, `acquisitionMedium`, `firstTouchAt` (migración Prisma contra RDS — ojo con el estado de migraciones descrito en [BACKLOG.md](../BACKLOG.md)).

**Aceptación:** un registro que entró por `?utm_source=afiche&utm_campaign=cafeteria-ml` queda etiquetado en BD y se puede agrupar en el panel de admin.

### MKT-03 · Landing de campaña con slug + generador de QR trackeables
🔴 **P0** · Impacto Alto · Esfuerzo M · GT

Ruta `/c/[slug]` que registra la visita y redirige a la landing/registro con los UTMs ya inyectados. Un QR por afiche/ubicación (`/c/cafeteria-ml`, `/c/biblioteca`, `/c/salon-ing`). Generación del PNG del QR con `qrcode` en un script de `scripts/` o una pantalla de admin.

**Aceptación:** OPS puede pedir un QR nuevo sin depender de un deploy; escanear un QR produce un evento atribuible a esa ubicación exacta.

### MKT-04 · Dashboard de North Star Metric en el panel de admin
🔴 **P0** · Impacto Alto · Esfuerzo S · GT

Ya existen `/api/admin/metrics/sessions` y `/retention`. Falta un widget en la cabecera de `src/app/home/admin` con **tutorías agendadas esta semana vs. semana anterior**, con delta y sparkline de 8 semanas. Usar `<Button>` y tokens de diseño (ver [PATTERNS.md](../PATTERNS.md)); nada de hex hardcodeado.

**Aceptación:** el equipo abre el panel y ve la NSM en menos de 5 segundos, sin exportar nada.

### MKT-05 · Correo de bienvenida / onboarding post-verificación
🔴 **P0** · Impacto Alto · Esfuerzo S · GT + OPS (copy)

Nueva plantilla Brevo (siguiente ID libre) disparada tras `POST /api/auth/verify-email`, diferenciada estudiante/tutor. CTA: "reserva tu primera tutoría" / "completa tu perfil de tutor".

**Aceptación:** el 100% de las cuentas verificadas recibe el correo; el clic al CTA llega con UTMs y se ve en el embudo de MKT-01.

### MKT-06 · Recordatorio automático 24 h antes de la sesión
🔴 **P0** · Impacto Alto · Esfuerzo M · GT

Es la pieza explícita del Bloque 1 del plan y además reduce no-shows (impacto directo en ingresos). No hay infraestructura de jobs: definir el mecanismo (Vercel Cron o EventBridge → ruta protegida con `requireAdminSecret`, que ya existe en [guards.js](../../src/lib/auth/guards.js)). Marca de idempotencia en `Session` (`reminderSentAt`) para no duplicar envíos.

**Aceptación:** una sesión confirmada para mañana genera exactamente un correo a estudiante y tutor; reintentos del cron no duplican.

### MKT-07 · Sincronización de contactos con la herramienta de email marketing
🟠 **P1** · Impacto Medio · Esfuerzo M · GT

El plan nombra Mailchimp; el producto ya usa **Brevo** para transaccional. **Recomendación: quedarse en Brevo** (listas + automatizaciones incluidas) y evitar un segundo proveedor, dos claves y dos plantillas. Sincronizar `User` → lista de Brevo con atributos `ROLE`, `CAREER`, `SESSIONS_COUNT`, `LAST_SESSION_AT`, `ACQUISITION_SOURCE`, respetando un flag `marketingOptIn`.

**Aceptación:** OPS puede segmentar "estudiantes de ISIS sin sesiones en 15 días" sin pedirle una consulta SQL a nadie.

### MKT-08 · Consentimiento de marketing y baja (opt-out)
🟠 **P1** · Impacto Medio · Esfuerzo S · GT

Checkbox en registro + toggle en perfil (`marketingOptIn`), respetado por MKT-05/07/13. Requisito legal (Ley 1581 de 2012, habeas data) antes de enviar cualquier correo no transaccional.

**Aceptación:** un usuario con `marketingOptIn = false` no recibe correos de campaña; sí sigue recibiendo transaccionales.

---

## 4. Bloque 2 — Guerrilla en campus y comunidad

### MKT-09 · Sistema de referidos (base para embajadores)
🟠 **P1** · Impacto Alto · Esfuerzo L · GT

Núcleo del programa de embajadores del plan. Modelo `Referral` (`referrerId`, `refereeId`, `code`, `status`, `rewardedAt`), código único por usuario, `/r/[code]` que atribuye el registro, y regla "1 tutoría gratis por cada 3 referidos que completen su primera sesión pagada". Cuenta el referido cuando el referido **completa y paga**, no cuando se registra — si no, se llena de cuentas fantasma.

Replicar las 4 capas (componente → servicio frontend → API route → servicio/repositorio), como indica [PATTERNS.md](../PATTERNS.md).

**Aceptación:** un embajador ve su código, sus referidos y su progreso 2/3; el crédito se otorga automáticamente al tercero.

### MKT-10 · Panel de embajadores en admin
🟡 **P2** · Impacto Medio · Esfuerzo M · GT

Vista para OPS: ranking de referidores, referidos por estado, créditos otorgados y pendientes. Sin esto, gestionar embajadores es una hoja de cálculo manual.

**Aceptación:** OPS liquida los premios del mes sin pedir acceso a la BD.

### MKT-11 · Crédito / saldo aplicable al checkout
🟠 **P1** · Impacto Alto · Esfuerzo L · GT

Prerrequisito real de MKT-09 y de las promociones: hoy [pricing.js](../../src/lib/payments/pricing.js) calcula precio server-side sin capa de descuento. Añadir `UserCredit` y aplicar el saldo **en el servidor**, antes de crear el intento de pago en Wompi, recalculando el split de comisiones con [fees.js](../../src/lib/payments/fees.js) (nunca reimplementar el 15/85 inline).

**Aceptación:** el crédito reduce el monto cobrado, el tutor sigue recibiendo su 85% del precio real de la sesión, y el `amount` del body sigue siendo ignorado.

### MKT-12 · Captura de leads sin cuenta ("avísame cuando haya tutor")
🟠 **P1** · Impacto Alto · Esfuerzo M · GT

Hoy `NotifyMeButton` devuelve 401 a los anónimos: el tráfico de afiches y de Instagram que aún no se registra se pierde entero. Permitir dejar solo el correo (+ curso de interés) sin cuenta, guardarlo en `CourseNotifySubscription` con `email` nullable-user, y hacer double opt-in.

**Aceptación:** un visitante anónimo deja su correo en menos de 15 segundos y recibe aviso cuando el curso tiene tutor.

---

## 5. Bloque 3 — Campaña "Sobrevive a Parciales"

### MKT-13 · Motor de cupones y descuentos
🟠 **P1** · Impacto Alto · Esfuerzo L · GT

El plan promete **10% en la primera sesión**. Modelo `Coupon` (`code`, `type` porcentaje/fijo, `value`, `maxRedemptions`, `perUserLimit`, `validFrom/validUntil`, `firstSessionOnly`, `courseId?`, `careerId?`) + `CouponRedemption`. Validación y aplicación **exclusivamente server-side** en el flujo de `payments/create-intent`.

**Aceptación:** `PARCIALES10` aplica 10% solo a la primera sesión de cada usuario, no es reutilizable, y expira sola en la fecha configurada.

### MKT-14 · Campo de cupón en el flujo de reserva
🟠 **P1** · Impacto Medio · Esfuerzo S · GT

UI del cupón en el paso de pago (`src/app/home/agendar`), con estado de validación, monto de descuento visible y el precio final antes de ir a Wompi. Texto bilingüe en `es.json`/`en.json`.

**Aceptación:** el estudiante ve "Antes $X · Ahora $Y · Ahorras $Z" antes de confirmar.

### MKT-15 · Correo de reactivación a los 15 días
🟠 **P1** · Impacto Alto · Esfuerzo M · GT

Job programado (misma infraestructura de MKT-06): usuarios cuya última sesión completada tiene 15 días y no tienen otra agendada. Plantilla Brevo con cupón o recomendación del curso más pedido de su carrera. Máximo un envío por usuario por ciclo.

**Aceptación:** la cohorte reactivada es medible en `/api/admin/metrics/retention`; ningún usuario recibe el correo dos veces.

### MKT-16 · Landing de campaña y página de precios/promos
🟠 **P1** · Impacto Medio · Esfuerzo M · GT + OPS (copy)

Página dedicada (`/parciales` o similar) con la propuesta de emergencia académica, precio, cómo funciona, FAQ y CTA a registro con cupón pre-aplicado. Es el destino de los QR y del link en bio de Instagram — hoy todo ese tráfico cae en una landing genérica.

**Aceptación:** la campaña tiene su propia URL, sus propios UTMs y su propia tasa de conversión en el embudo.

### MKT-17 · Soporte para "Repaso Masivo" (sesión grupal)
🟡 **P2** · Impacto Medio · Esfuerzo L · GT

El plan pide un repaso masivo online piloto. El modelo `SessionParticipant` ya existe, así que la base está: falta cupo (`maxParticipants`), precio por asistente y una página pública de inscripción. **Recomendación:** para el piloto, hacerlo por fuera (Meet + formulario + cobro manual) y solo construirlo si el piloto funciona. Evita 4–5 días de desarrollo sobre una hipótesis sin validar.

**Aceptación (si se construye):** 20 estudiantes se inscriben y pagan a un mismo evento sin intervención manual.

---

## 6. Bloque 4 — Oferta de tutores y LTV

### MKT-18 · Landing de captación de tutores ("Gana dinero compartiendo lo que sabes")
🟠 **P1** · Impacto Alto · Esfuerzo M · GT + OPS (copy)

Página pública `/ser-tutor` con ingreso estimado (calculadora: sesiones/semana × precio × 85%), requisitos, tiempos de aprobación y testimonios. Destino de la convocatoria de LinkedIn — hoy ese tráfico aterriza en un formulario sin contexto.

**Aceptación:** la convocatoria de LinkedIn apunta a una URL con UTMs propios y la conversión visita→solicitud es medible.

### MKT-19 · Paquetes de sesiones (5 tutorías con 15% de descuento)
🟡 **P2** · Impacto Alto · Esfuerzo L · GT

Palanca de LTV explícita del plan. Modelo `SessionPackage` + `UserPackageBalance`: se compra el paquete (un solo cobro Wompi), se descuentan sesiones del saldo al agendar. Ojo: el pago al tutor se sigue devengando **por sesión completada**, no al comprar el paquete — si no, se paga por trabajo no hecho y las devoluciones se vuelven un problema.

**Depende de:** MKT-11 (saldo aplicable al checkout).
**Aceptación:** comprar un paquete de 5 deja saldo 5; cada reserva lo baja a 4, 3…; el reporte de payouts sigue cuadrando.

### MKT-20 · Reporte de LTV y cohortes por origen de adquisición
🟡 **P2** · Impacto Medio · Esfuerzo M · GT

Extender `/api/admin/metrics/retention/cohorts` con LTV promedio, sesiones por usuario y recurrencia, segmentables por `acquisitionSource` (de MKT-02).

**Aceptación:** el equipo responde "¿los usuarios de afiche valen más que los de Instagram?" con un número.

### MKT-21 · Notificación al tutor de sesiones agendadas y recordatorio de disponibilidad
🟡 **P2** · Impacto Medio · Esfuerzo S · GT

Si no hay disponibilidad publicada, no hay oferta que vender. Recordatorio semanal a tutores aprobados con 0 bloques futuros.

**Aceptación:** cae el número de tutores aprobados con disponibilidad vacía.

---

## 7. Mejoras de la página web (conversión)

> Sección requerida por el criterio de aceptación. Todas apuntan a **convertir el tráfico** que traerán los afiches, QR e Instagram.

### WEB-01 · Quitar la prueba social falsa del hero
🔴 **P0** · Impacto Alto · Esfuerzo S · GT + OPS

`landing.hero.social.live` = *"150+ sesiones activas"* y `.sessions` = *"150+ sesiones confirmadas hoy"* están **hardcodeados en [es.json](../../src/lib/i18n/locales/es.json)** y no corresponden a datos reales. En un campus pequeño donde el voz a voz es el canal principal, que alguien lo note cuesta más de lo que aporta. Sustituir por métricas reales servidas desde `/api/admin/metrics` (o por señales verdaderas: "tutores verificados de tu facultad", "reseñas reales").

**Aceptación:** ningún número visible en la landing es inventado.

### WEB-02 · Bug de copy: variable de universidad vacía
🔴 **P0** · Impacto Medio · Esfuerzo S · GT

`landing.howItWorks.step1.description` dice *"…reseñas de otros estudiantes de  — todo centralizado aquí"*: falta la interpolación (doble espacio antes del guión). Igual revisar `hero.social.verified` (*"Verificado "* con espacio final). Verificar que la clave exista en **ambos** locales.

**Aceptación:** no queda ninguna interpolación vacía ni espacio colgante en la landing en ES y EN.

### WEB-03 · Metadata SEO, Open Graph y favicon social
🔴 **P0** · Impacto Alto · Esfuerzo S · GT

Hoy: `title: "Calico"`, `description: "Proyecto de monitorías"`, sin `openGraph`, sin `twitter`, sin imagen. Cada vez que alguien comparte el link por WhatsApp (el canal real del voz a voz) sale una tarjeta vacía. Añadir `metadata` completa en [layout.jsx](../../src/app/layout.jsx) + `opengraph-image` con la mascota Calico.

**Aceptación:** pegar calicotutorias.com en WhatsApp/Instagram muestra título, descripción e imagen de marca.

### WEB-04 · `sitemap.xml` y `robots.txt`
🟡 **P2** · Impacto Medio · Esfuerzo S · GT

`app/sitemap.js` + `app/robots.js` de Next 15, indexando landing, páginas de campaña, `/ser-tutor` y legales; bloqueando `/home/*` y `/api/*`.

**Aceptación:** Google Search Console indexa las páginas públicas y ninguna privada.

### WEB-05 · CTA único y jerárquico en el hero
🟠 **P1** · Impacto Alto · Esfuerzo S · GT + OPS

El hero ofrece "Comienza a aprender" y "Únete como tutor" con peso visual similar: dos audiencias compitiendo en el primer scroll. Dejar un CTA primario (estudiante, que es el objetivo de la Fase 1) y degradar el de tutor a enlace secundario que apunte a `/ser-tutor` (MKT-18).

**Aceptación:** un solo botón primario sobre el fold; el clic al CTA es un evento del embudo (MKT-01).

### WEB-06 · Prueba social real: reseñas y tutores destacados en la landing
🟠 **P1** · Impacto Alto · Esfuerzo M · GT

Ya hay reseñas reales en BD (`Review`, `/api/users/[id]/reviews`). Traer las 3–6 mejores a la landing con nombre, curso y calificación. Es el sustituto honesto de WEB-01 y lo que más mueve la aguja en educación, donde la confianza es la barrera.

**Aceptación:** la landing muestra reseñas reales, servidas desde la BD, con caché razonable.

### WEB-07 · Sección de precios y transparencia de costo
🟠 **P1** · Impacto Alto · Esfuerzo M · GT + OPS

Hoy hay que registrarse para saber cuánto cuesta una tutoría (`Course.basePrice` solo se ve dentro del producto). El precio oculto es una de las fugas de conversión más caras en marketplaces. Mostrar rango de precios por hora y qué incluye (pago protegido, Meet, reagendamiento).

**Aceptación:** un visitante anónimo sabe cuánto cuesta antes de registrarse.

### WEB-08 · FAQ orientada a objeciones
🟠 **P1** · Impacto Medio · Esfuerzo S · GT + OPS (copy)

Bloque de preguntas frecuentes: ¿cómo se verifican los tutores?, ¿qué pasa si cancelo?, ¿cómo se paga?, ¿es presencial u online?, ¿mi tutor es de mi universidad? Con `FAQPage` schema.org para SEO. La política de cancelación ya está definida en [PROJECT.md](../PROJECT.md).

**Aceptación:** las 5 objeciones más frecuentes del voz a voz están respondidas públicamente.

### WEB-09 · Registro sin fricción: reducir pasos hasta el primer valor
🟠 **P1** · Impacto Alto · Esfuerzo M · GT

Auditar el camino landing → registro → verificación de correo → buscar tutor. La verificación de correo es un muro duro (`isEmailVerified` bloquea el login): como mínimo, permitir **explorar tutores y precios sin cuenta** y pedir registro solo al reservar. Google Sign-In ya existe — hacerlo la opción primaria y visible.

**Aceptación:** el catálogo de tutores es navegable sin cuenta; el embudo muestra dónde se cae la gente.

### WEB-10 · Rendimiento y Core Web Vitals de la landing
🟡 **P2** · Impacto Medio · Esfuerzo M · GT

El tráfico de afiches y QR llega **por móvil y con datos móviles**. Medir con Lighthouse; optimizar imágenes con `next/image`, revisar el peso de `YarnPathOverlay` y las animaciones de scroll.

**Aceptación:** Lighthouse móvil ≥ 90 en Performance; LCP < 2.5 s en 4G simulada.

### WEB-11 · Landing en móvil como experiencia principal
🟠 **P1** · Impacto Alto · Esfuerzo M · GT

Auditoría dedicada del hero, el toggle estudiante/tutor y los CTAs en pantallas de 360–430 px. Un afiche con QR se escanea con una mano, de pie, en una cafetería.

**Aceptación:** el CTA primario es visible sin scroll en iPhone SE y Pixel; ningún elemento desborda horizontalmente.

### WEB-12 · Página pública de perfil de tutor (compartible)
🟡 **P2** · Impacto Medio · Esfuerzo M · GT

URL pública por tutor con nombre, cursos, reseñas y CTA a reservar — para que los propios tutores compartan su perfil en sus redes y grupos de WhatsApp (voz a voz con atribución). Cuidar la exposición de datos: nunca `studentRating`, correo ni teléfono (ver reglas de sanitización en [PATTERNS.md](../PATTERNS.md)).

**Aceptación:** un tutor comparte su link, se ve bien en WhatsApp (OG) y las visitas se atribuyen a él.

### WEB-13 · Banner de campaña configurable desde admin
🟡 **P2** · Impacto Bajo · Esfuerzo S · GT

Reutilizar el módulo `NewsPost` recién creado para publicar un banner en la landing (campaña, repaso masivo, promo) sin desplegar.

**Aceptación:** OPS publica una promo en la landing sin pedir un deploy.

### WEB-14 · Página de aterrizaje post-QR con continuidad visual
⚪ **P3** · Impacto Bajo · Esfuerzo S · GT

Que el afiche y la pantalla compartan mascota, color y mensaje. Detalle de coherencia de marca; solo cuando MKT-03 y MKT-16 estén vivos.

**Aceptación:** el usuario reconoce que llegó al sitio del afiche que acaba de escanear.

---

## 8. Resumen priorizado (todas las tareas con prioridad asignada)

**35 tareas · 100% priorizadas** (21 de plataforma/marketing + 14 de página web).

### 🔴 P0 — Bloque 1, antes de cualquier campaña (9)

| ID | Tarea | Esfuerzo |
|---|---|---|
| MKT-01 | Analítica de producto con embudo | M |
| MKT-02 | Captura y persistencia de UTMs | M |
| MKT-03 | Landing `/c/[slug]` + QR trackeables | M |
| MKT-04 | Widget de North Star Metric en admin | S |
| MKT-05 | Correo de bienvenida | S |
| MKT-06 | Recordatorio 24 h antes de la sesión | M |
| WEB-01 | Quitar prueba social falsa del hero | S |
| WEB-02 | Bug de copy: variable vacía | S |
| WEB-03 | Metadata SEO + Open Graph | S |

### 🟠 P1 — Habilitan los bloques 2 y 3 (16)

| ID | Tarea | Esfuerzo |
|---|---|---|
| MKT-07 | Sync de contactos con email marketing (Brevo) | M |
| MKT-08 | Consentimiento y opt-out de marketing | S |
| MKT-09 | Sistema de referidos | L |
| MKT-11 | Crédito/saldo aplicable al checkout | L |
| MKT-12 | Captura de leads sin cuenta | M |
| MKT-13 | Motor de cupones | L |
| MKT-14 | Campo de cupón en la reserva | S |
| MKT-15 | Correo de reactivación a 15 días | M |
| MKT-16 | Landing de campaña "Sobrevive a Parciales" | M |
| MKT-18 | Landing de captación de tutores | M |
| WEB-05 | CTA único y jerárquico en el hero | S |
| WEB-06 | Reseñas reales en la landing | M |
| WEB-07 | Precios visibles sin registro | M |
| WEB-08 | FAQ de objeciones | S |
| WEB-09 | Registro sin fricción | M |
| WEB-11 | Landing móvil como experiencia principal | M |

### 🟡 P2 — Bloque 4 y optimización (9)

| ID | Tarea | Esfuerzo |
|---|---|---|
| MKT-10 | Panel de embajadores | M |
| MKT-17 | Repaso masivo (sesión grupal) | L |
| MKT-19 | Paquetes de sesiones | L |
| MKT-20 | Reporte de LTV por origen | M |
| MKT-21 | Recordatorio de disponibilidad a tutores | S |
| WEB-04 | sitemap + robots | S |
| WEB-10 | Core Web Vitals | M |
| WEB-12 | Perfil público de tutor | M |
| WEB-13 | Banner de campaña desde admin | S |

### ⚪ P3 — Backlog frío (1)

| ID | Tarea | Esfuerzo |
|---|---|---|
| WEB-14 | Continuidad visual afiche→pantalla | S |

---

## 9. Orden de ejecución sugerido

**Sprint 1 (instrumentar + arreglar lo roto)** — WEB-01, WEB-02, WEB-03, MKT-04, MKT-05 · *Todo esfuerzo S: se cierra en una semana y desbloquea medir.*

**Sprint 2 (atribución)** — MKT-01, MKT-02, MKT-03, MKT-06 · *Sin esto los afiches del Bloque 2 no son evaluables.*

**Sprint 3 (conversión de la landing)** — WEB-05, WEB-06, WEB-07, WEB-08, WEB-11, MKT-12 · *Corre en paralelo a la guerrilla en campus.*

**Sprint 4 (promos)** — MKT-13, MKT-14, MKT-16, MKT-15, MKT-08, MKT-07 · *Debe estar listo ~2 semanas antes de la semana de parciales.*

**Sprint 5 (referidos y LTV)** — MKT-11 → MKT-09 → MKT-10, MKT-18, MKT-19, MKT-20.

**Dependencias duras:** MKT-02 → MKT-03/MKT-20 · MKT-11 → MKT-09/MKT-13/MKT-19 · MKT-06 → MKT-15 (misma infraestructura de jobs).

---

## 10. Tareas del plan que **no** son de código

Van al tablero de OPS, no a este backlog. Se listan para que no se pierdan y para marcar qué necesita apoyo de GT:

| Tarea del plan | Dueño | Apoyo de código |
|---|---|---|
| Definir calendario del semestre (fechas de parciales, semanas de ejecución) | OPS | Ninguno |
| Entrevistar y seleccionar 3–5 embajadores por carrera | OPS | MKT-09/10 al final |
| Diseñar el afiche físico con mascota Calico | OPS | QR de MKT-03 |
| Definir frecuencia y calendario editorial de Instagram | OPS | Ninguno |
| Definir promos concretas (montos, vigencias, condiciones) | OPS | Se cargan en MKT-13 |
| Contacto en frío con decanaturas y centros de apoyo | OPS | Ninguno |
| Convocatoria en LinkedIn | OPS | Aterriza en MKT-18 |
| Elegir formalmente la North Star Metric | Equipo | Se muestra en MKT-04 |

---

*Última actualización: 2026-07-22 · Auditoría sobre la rama `feature/admin-news`*
