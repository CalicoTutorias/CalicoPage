# Feature: Tutorías en bloque (horas seguidas) con descuento escalonado + preferencias de agendamiento del tutor

> Rama: `feature/batch-tutorias` · Estado: **propuesta funcional (v1)** · Fecha: 2026-11-17
> Afecta: §2.2 Booking, §2.7 Cupones, §3.3 Disponibilidad, §3.6 Aceptar/Cancelar de `functional.md`; `PROJECT.md` (Pricing Model).

---

## 0. Resumen

1. El estudiante agenda **como hoy** (elige materia, día y 1 hora). Al final del checkout puede **sumar horas seguidas** (un solo bloque, un solo pago) o **agendar otra sesión**. La duración no es lo primero que ve.
2. El precio por hora **baja a medida que el bloque crece** (descuento marginal escalonado). Los tramos y quién asume el descuento los configura **Calico desde admin**; el tutor no participa de esa decisión.
3. El tutor tiene en su perfil una tarjeta simple **"Preferencias de agendamiento"** con dos ajustes:
   - **Máximo de horas seguidas** que le pueden reservar.
   - **Anticipación mínima** con la que acepta reservas.

Diseño: Figma, página "Iteración 0.2 - Malu", sección "Iteración 0.2 · Feature · Tutorías en bloque + preferencias del tutor" (E5c estado 1 h, E5c estado bloque, T7c, A1 admin, componente "Extender tutoría").

---

## 1. Estado actual (lo que ya existe y condiciona el diseño)

| Hecho en el código | Dónde | Implicación |
|---|---|---|
| Toda sesión de estudiante dura **exactamente 1 h** (`SLOT_DURATION_MS`, código `INVALID_DURATION`) | `src/lib/services/session.service.js` | Hay que reemplazar la regla por "N h enteras, 1 ≤ N ≤ máximo del tutor". |
| La sesión debe caber **dentro de un único bloque** de disponibilidad (`withinBlock`) | mismo archivo | Dos bloques contiguos (14–15 y 15–16) no permiten un bloque de 2 h. Hay que fusionar bloques adyacentes antes de validar. |
| `Schedule.minBookingNotice` (Int, default **24**) **existe en BD y en `PUT /api/schedules/me`, pero no se valida en ningún lado y no tiene UI** | `prisma/schema.prisma`, `availability.repository.js` | La "anticipación" ya tiene columna; falta enforcement + UI. **Ojo:** activarlo tal cual impondría 24 h a todos los tutores (ver §5.3). |
| `maxSessionsPerDay` cuenta **sesiones**, no horas | `countTutorSessionsOnDate` | Un bloque de 4 h contaría como 1 → hay que pasar a contar horas. |
| El "día" de `maxSessionsPerDay` se calcula con `setUTCHours(0…)` | `validateBookingRequest` | **Bug existente:** en Bogotá (UTC-5) una sesión de las 19:00 cae en el día UTC siguiente. Con bloques largos se nota más. Corregir usando la zona del tutor. |
| Precio = `basePrice del curso × horas`; Calico fija precios, el tutor no | `session-amount.js`, `PROJECT.md` | El descuento debe ser una **regla global de Calico**, no un precio por tutor. |
| `Payment` ya separa `originalAmount / discountAmount / amount / tutorPayoutBase` y los cupones tienen absorción `CALICO` vs `SHARED` | `fees.js`, schema `Payment` | El descuento por bloque encaja en el mismo modelo sin cambiar la contabilidad. |
| Cancelación: estudiante ≥ 6 h reembolso total; tutor puede cancelar hasta 6 h antes | `functional.md` §3.6, `PROJECT.md` | Afecta el piso de la anticipación mínima (§5.3). |

---

## 2. Decisiones de diseño (y por qué)

### D1. Un bloque = **una** `Session` de N horas (no N sesiones enlazadas)
- **A favor:** un solo pago Wompi, un evento de Google Calendar/Meet, una aceptación, una reseña, un flujo de cancelación. Reusa casi todo.
- **En contra:** no hay cancelación parcial (todo o nada) y las métricas que cuentan "sesiones" dejan de representar carga de trabajo → hay que mirar **horas**.
- **Alternativa descartada para v1:** `batchId` agrupando N sesiones de 1 h. Permite reembolsos parciales, pero multiplica eventos de calendario, aceptaciones y estados inconsistentes (2 aceptadas, 1 rechazada). Solo vale la pena si se quieren **paquetes en días distintos** (ver §9, v2).

### D2. Descuento **marginal escalonado** (cada hora adicional vale menos), no porcentaje plano sobre el total
- Comunica exactamente lo pedido: "el valor de cada tutoría cambia según se paguen más".
- Evita el "precipicio" de un descuento plano por umbral (3 h = 10 % pero 2 h = 0 %), que incentiva comprar horas que no se van a usar.
- Tope: a partir de la 4.ª hora el precio marginal ya no baja más.

### D3. El descuento es una política de Calico, configurable en admin
- Tramos, activación, combinación con cupones y **quién lo asume** (`CALICO` vs `SHARED`, mismo modelo que los cupones) se editan en **Admin · Descuentos por bloque**. El tutor no ve ni decide nada sobre el descuento.
- Recomendación de default: `SHARED` (ver números en §4). Con `CALICO`, un bloque de 4 h deja a Calico menos neto que uno de 2 h; la pantalla de admin lo advierte.
- Contrapartida: con `SHARED` el tutor recibe menos por hora en bloques sin haberlo elegido. Debe comunicarse en los términos del tutor antes de activarlo.

### D4. Las horas del bloque son **enteras** (1, 2, 3, 4…)
Los tramos son por hora. 90 min se deja fuera de v1 (no está permitido hoy para estudiantes).

---

## 3. Reglas de precio

### 3.1 Tabla de descuento marginal (valores iniciales, editables en admin)

| Hora del bloque | Descuento sobre esa hora | Ej. curso 35 000/h |
|---|---|---|
| 1.ª | 0 % | 35 000 |
| 2.ª | 5 % | 33 250 |
| 3.ª | 10 % | 31 500 |
| 4.ª y siguientes | 15 % | 29 750 |

Total de un bloque de N horas = `Σ basePrice × (1 − tier(i))`, redondeado a COP.

| Bloque | Lista | Paga | Ahorro | Precio/hora efectivo |
|---|---|---|---|---|
| 1 h | 35 000 | 35 000 | 0 % | 35 000 |
| 2 h | 70 000 | 68 250 | 2,5 % | 34 125 |
| 3 h | 105 000 | 99 750 | 5,0 % | 33 250 |
| 4 h | 140 000 | 129 500 | 7,5 % | 32 375 |

- **Single source of truth:** nuevo `src/lib/payments/batch-discount.js` (puro, importable desde cliente y servidor, mismo patrón que `session-amount.js`). `resolveSessionAmount` lo usa; ningún componente recalcula descuentos inline.
- Los tramos viven en BD (nueva tabla `BatchDiscountConfig`: `tiers` JSON, `absorber`, `stacksWithCoupons`, `appliesToManual`, `isActive`, `updatedById`) y se editan desde admin (§7b). `batch-discount.js` recibe la config ya leída: la función sigue siendo pura.
- Si el descuento está desactivado en admin, se pueden reservar igual varias horas seguidas a precio de lista.

### 3.2 Reparto (fees)

| Campo `Payment` | Valor |
|---|---|
| `originalAmount` | `basePrice × N` |
| `batchDiscountAmount` (**nuevo**) | `originalAmount − totalConDescuentoPorBloque` |
| `discountAmount` | `batchDiscountAmount + descuentoCupón` |
| `amount` | lo que cobra Wompi |
| `tutorPayoutBase` | `originalAmount − batchDiscountAmount` (SHARED) − parte del cupón si el cupón es `SHARED` |

Se agrega `batchDiscountAmount` para poder separar en el dashboard cuánto descuento vino de bloques y cuánto de cupones (hoy todo cae en `discountAmount`).

### 3.3 Cupones + bloque
- **Se acumulan**: el cupón se aplica **sobre el precio ya descontado por bloque**.
- Se mantiene el piso de 1 500 COP y la excepción del cupón 100 %.
- Riesgo: un cupón `CALICO` grande + bloque largo puede dejar margen negativo. Mitigación v1: el admin ve el margen proyectado al crear el cupón (ya existe la lógica en `fees.js`); si se quiere ser conservador, flag `stacksWithBatch` en `Coupon` (default `true`).

---

## 4. Números: por qué `SHARED` y no `CALICO`

Curso de 35 000/h, Wompi 2,65 % + 700 + IVA por transacción.

| Escenario | Tutor recibe | Calico neto |
|---|---|---|
| 4 sesiones sueltas de 1 h (4 pagos) | 119 000 | 13 253 |
| Bloque 4 h, descuento `SHARED` | 110 075 | **14 508** |
| Bloque 4 h, descuento `CALICO` | 119 000 | **5 583** |
| Bloque 2 h, descuento `CALICO` | 59 500 | 5 765 |

- Con `CALICO`, el bloque de 4 h le deja a Calico **menos que el de 2 h**: el descuento crece más rápido que la comisión. Insostenible con 15 % de comisión.
- Con `SHARED`, Calico gana ~9 % más que con 4 sesiones sueltas solo por amortizar la tarifa fija de Wompi.
- **Supuesto frágil:** todo esto asume que el descuento **genera horas incrementales**. Si los estudiantes que igual iban a reservar 3 h (p. ej. antes de un parcial) ahora pagan 5 % menos, el tutor pierde sin ganar volumen. Medir (§8) antes de subir los tramos.

---

## 5. Preferencias de agendamiento del tutor

Nueva sección en el perfil del tutor (`/home/profile` en modo tutor, o pestaña en `/tutor/disponibilidad`). Persiste en `Schedule` (ya existe 1:1 con el tutor).

### 5.1 Campos

| Campo | Columna | Tipo / rango | Default propuesto | Nuevo |
|---|---|---|---|---|
| Máximo de horas seguidas | `Schedule.maxConsecutiveHours` | Int 1–4 | **2** | Sí |
| Anticipación mínima | `Schedule.minBookingNotice` (horas) | Opciones: 2, 6, 12, 24, 48 | **2** para tutores existentes; 12 para nuevos | Ya existe (sin enforcement) |

UI del tutor: solo esos dos ajustes, en una tarjeta en Mi perfil (modo tutor). El límite diario sigue siendo `maxSessionsPerDay` en backend, pero se valida contando **horas** (un bloque de 3 h suma 3); no se expone en esta iteración.

### 5.2 Reglas de validación (servidor, en `validateBookingRequest`)
1. `N = (end − start) / 1h` entero y `1 ≤ N ≤ maxConsecutiveHours` → si no, `INVALID_DURATION`.
2. El intervalo completo cae en disponibilidad publicada **fusionando bloques contiguos** del mismo día → si no, `OUTSIDE_AVAILABILITY`.
3. `start − now ≥ minBookingNotice` → si no, nuevo código `BOOKING_NOTICE_TOO_SHORT` (agregarlo a `booking-refusals.js` / `SLOT_POLICY_CODES`).
4. Horas ya reservadas ese día (zona del tutor) + N ≤ `maxHoursPerDay` → `MAX_SESSIONS_REACHED` (renombrar mensaje a horas).
5. Overlap con buffer: sin cambios, pero sobre el intervalo completo.
6. Estas reglas son de "slot policy": se relajan en el fulfilment post-pago, igual que hoy.

### 5.3 Ojo con la anticipación mínima
- **Hoy, en la práctica, es 0** (la columna dice 24 pero no se valida). Si se activa con el valor guardado, todos los tutores pasan a exigir 24 h de golpe y se caen las reservas de último minuto (pico pre-parcial). Por eso la migración debe **reescribir** el valor de los existentes a 2 h y dejar que cada tutor lo suba.
- **Interacción con la ventana de cancelación de 6 h:** si la anticipación es < 6 h, el tutor puede recibir una reserva que ya está dentro de la ventana en la que no puede cancelar. Opciones: (a) piso de 6 h, (b) permitir < 6 h pero solo si el tutor no tiene auto-aceptar (puede rechazar). **Recomendación:** (b) — rechazar no penaliza.
- Cambiar la configuración **no afecta reservas existentes**.

### 5.4 Cambios en visibilidad
`MIN_LISTING_HOURS` (3 h libres en 7 días) debe calcularse respetando la anticipación: horas dentro de la ventana de anticipación no son reservables y no deberían contar.

---

## 6. Flujo del estudiante

1. **Perfil del tutor (E4):** sin cambios. Elige materia, día y una hora como hoy.
2. **Checkout (E5), estado 1 h:** al final del resumen aparece el bloque **"¿Necesitas más tiempo?"**:
   - **Agregar 1 hora seguida**: muestra la franja siguiente, su precio y su descuento (ej. 16:00–17:00 · $ 42.750 · −5 %). Solo aparece si la hora siguiente está libre (con buffer), respeta la anticipación y no supera el máximo del tutor.
   - **Agendar otra sesión con [tutor]**: vuelve al calendario del tutor; en v1 es otra reserva y otro pago, sin descuento.
3. **Checkout, estado bloque:** al agregar horas, el bloque se vuelve un stepper − / + con la duración y el rango. El resumen muestra el precio de cada hora, el precio de lista, el descuento por bloque, el cupón y el total. El stepper anticipa el precio de la hora siguiente.
4. **Pago:** `create-intent` recibe `start` y `end` (o `durationHours`) y recalcula todo en servidor. El monto del cliente se ignora.
5. **Confirmación:** un evento de calendario/Meet por el bloque completo.

### Cancelación / reprogramación
- Todo o nada (una `Session`). Reembolso total si ≥ 6 h antes; reembolso del monto **pagado** (con descuento).
- Reprogramar mantiene la duración; si el nuevo horario no admite N horas, el estudiante debe cancelar.
- Cancelación parcial → v2.

---

## 7. Flujo del tutor
- **Mi perfil (modo tutor) → Preferencias de agendamiento:** máximo de horas seguidas (1–4) y anticipación mínima (2/6/12/24/48 h). Guardar aplica a reservas nuevas.
- **Solicitudes:** la tarjeta muestra la duración ("Bloque de 3 h · 14:00–17:00"); acepta o rechaza el bloque completo.
- **Pagos:** la fila muestra horas y, si aplica, el descuento por bloque.
- **Estadísticas:** agregar "horas dictadas" junto a "sesiones".

## 7b. Admin · Descuentos por bloque (`/home/admin/descuentos`)
- Nueva entrada en el grupo **Dinero** del menú admin, junto a Cupones (`AdminShell` → `NAV_GROUPS`).
- Edita: activar/desactivar, tramos por hora (1.ª fija en 0 %, se pueden agregar tramos), quién asume (`CALICO` / `SHARED`), "se combina con cupones", "aplica a tutorías manuales".
- Simulación por materia: paga el estudiante / ahorro / recibe el tutor / neto de Calico, calculado con `fees.js`. Aviso cuando con `CALICO` el neto de 4 h queda por debajo del de 2 h.
- Seguridad: `requireAdminUser`; cada guardado escribe en `admin_audit_log` y la tarjeta "Últimos cambios" muestra los dos más recientes.
- Validación servidor: tramos no decrecientes, 0–50 %, cobro mínimo 1 500 COP.

---

---

## 8. Métricas para validar (antes de dar por bueno el descuento)
- Distribución de duración de reservas antes/después (¿aparecen bloques de 2–4 h o solo se abarata lo que ya pasaba?).
- Horas por estudiante por mes y GMV por tutor participante vs no participante.
- Quejas o bajas de tutores tras activar `SHARED` (señal de que no compensa).
- Margen neto Calico por hora vendida (dashboard: separar `batchDiscountAmount`).
- Tasa de cancelación por duración (bloques largos se cancelan más → todo-o-nada duele más).

---

## 9. Fuera de alcance v1 (v2)
- **Paquetes en días distintos** (ej. 4 h repartidas en la semana con un solo pago): requiere `batchId`, reembolsos parciales, N eventos de calendario.
- Cancelación parcial de un bloque.
- Tramos de descuento por curso o editables por el tutor (rompería "Calico fija precios").
- Duraciones fraccionarias (90 min).

---

## 10. Impacto técnico (checklist)
- [ ] `prisma/schema.prisma`: `Schedule.maxConsecutiveHours`; `Payment.batchDiscountAmount`; tabla `BatchDiscountConfig`. Migración en RDS (`prisma migrate deploy`) **antes** de desplegar el cliente; backfill `minBookingNotice = 2` para existentes.
- [ ] `src/lib/payments/batch-discount.js` (puro) + tests; integrar en `session-amount.js` / `pricing.js` / `checkout.js` / `coupon-math.js`.
- [ ] `session.service.js`: duración variable, fusión de bloques contiguos, anticipación, horas/día en zona del tutor (fix bug UTC).
- [ ] `booking-refusals.js`: `BOOKING_NOTICE_TOO_SHORT`.
- [ ] `/api/schedules/me`: validar nuevos campos con Zod (rangos de §5.1).
- [ ] Slot generation (`useTutorAvailability`, `availability/joint`, `listing-visibility.js`): filtrar por duración y anticipación.
- [ ] UI: componente "Extender tutoría" + escalera de precio en `agendar`; tarjeta "Preferencias de agendamiento" en perfil tutor; página admin `/home/admin/descuentos` + entrada en `AdminShell`; API `GET/PUT /api/admin/batch-discount`. Todo con tokens y `useI18n()` (ES/EN).
- [ ] Dashboard admin y pagos del tutor: mostrar descuento por bloque y horas.
- [ ] Actualizar `functional.md` §2.2, §2.7, §3.3, §3.6, tabla de reglas, y `PROJECT.md` Pricing Model.

## 11. Decisiones abiertas (para el equipo)
1. ¿Tramos 0/5/10/15 de arranque?
2. ¿`SHARED` o `CALICO` por defecto, y cómo se comunica a los tutores si es `SHARED`?
3. ¿Default de `maxConsecutiveHours` = 2 o 1?
4. ¿Anticipación < 6 h permitida (con rechazo) o piso duro de 6 h?
5. "Agendar otra sesión": ¿en v2 se paga junto con la primera (carrito) y con descuento?
