# Deuda técnica y opciones para el error de conexiones a la base de datos

> Última actualización: 2026-08-22
> Contexto: error `PrismaClientKnownRequestError — too many clients already` en Sentry (`GET /api/course-notify-subscriptions/me`). Instancia actual: RDS PostgreSQL `db.t4g.micro` (2 vCPU, 1 GB RAM, `max_connections` = 112). Picos observados: ~70 conexiones simultáneas en la última semana. Hosting de la app: Vercel (serverless).

---

## 1. Deuda técnica — Código

| Ítem | Prioridad | Descripción | Riesgo si no se atiende |
|---|---|---|---|
| Historial de migraciones de Prisma roto | 🔴 Alta | Una migración vieja referencia `reviews.tutor_id`, columna que no existía en ese punto del historial. Hoy el equipo usa `pnpm db:push` en vez de `migrate dev`/`migrate deploy`. | Sin historial confiable de schema; alguien nuevo no puede levantar la DB desde cero; cada `db push` amplía la brecha. |
| Llamadas "fire-and-forget" sin `await` en rutas serverless | 🔴 Alta | En `academic.service.js` (`approveTutorCourse`, `sendCourseRequestNotification`) y `course-notify.service.js` se dispara trabajo async con Prisma sin esperarlo (`.catch()` suelto). | En Vercel, la plataforma puede congelar el proceso apenas se responde al cliente, dejando conexiones a Postgres a medio abrir hasta que expiran por timeout — candidato principal a explicar el error de conexiones. |
| Sin CI/CD automatizado | 🔴 Alta | No existe `.github/workflows`. Hay tests con Jest pero nada los corre automáticamente en cada PR. | Regresiones pueden llegar a producción sin que nadie lo note antes del deploy. |
| Sin health check de base de datos | 🟡 Media | Existen `/api/health/wompi` y `/api/health/s3`, pero no `/api/health/db`. | Sin señal temprana de saturación de conexiones antes de que explote en Sentry. |
| Tests de endpoints admin diferidos | 🟡 Media | Los 12 endpoints bajo `/api/admin/**` y sus servicios orquestadores no tienen cobertura de tests. | Riesgo medio de regresión no detectada en cambios futuros. |
| Endpoints admin legacy sin auditoría | 🟡 Media | `/api/admin/course-prices/**` y `/api/admin/tutor-courses/**` usan `x-admin-secret` en vez de `requireAdminUser`. | Acciones administrativas sin registro de qué persona las hizo. |
| Middleware de Edge para rutas admin no implementado | 🟡 Media | `jsonwebtoken` no corre en el Edge runtime de Next.js; falta migrar a `jose`. | Si una ruta nueva de `/api/admin/**` olvida llamar a `requireAdminUser`, queda sin ninguna capa de protección superior. |
| Suspensión de tutor con cascada incompleta | 🟡 Media | No borra eventos de Google Calendar, no dispara reembolsos de Wompi, no notifica a estudiantes afectados. | Carga operativa manual para el equipo de soporte, creciente con el volumen. |
| Plantillas de email 11/12/13 no creadas en Brevo | 🟡 Media | Referenciadas en código pero inexistentes en el dashboard de Brevo; el envío falla en silencio. | Tutores no reciben notificación de aprobación/rechazo/suspensión. |
| 2FA no implementado para cuentas admin | 🟢 Baja | `User.otpCode` ya existe en el schema, no se usa para TOTP. | Bajo por ahora; relevante si crece el equipo admin. |
| Sin límite de reaplicaciones de tutor | 🟢 Baja | Un aplicante rechazado puede reaplicar sin límite. | Puede inflar la cola de "Pending". |

---

## 2. Deuda técnica — Infraestructura (AWS)

| Ítem | Prioridad | Descripción | Riesgo si no se atiende |
|---|---|---|---|
| Multi-AZ no confirmado (probablemente apagado) | 🟡 Media | Instancia `db.t4g.micro` single-instance; sin failover automático confirmado. | Un fallo de hardware subyacente deja la app sin base de datos hasta reprovisión manual. |
| Backups automáticos no verificados / nunca restaurados | 🟡 Media | Solo hay práctica de snapshot manual antes de cambios riesgosos, documentada en `BACKLOG.md`. | Un backup nunca probado no es un backup confiable. |
| Security Group de la RDS sin confirmar alcance | 🟡 Media | No verificado si el acceso está limitado a IPs/rangos específicos o abierto a `0.0.0.0/0`. | Superficie de ataque innecesaria sobre una base con datos de pago y personales. |
| Sin alarmas de CloudWatch | 🟡 Media | No hay alertas configuradas sobre `DatabaseConnections`, `CPUUtilization`, `FreeStorageSpace`. | Los problemas se detectan de forma reactiva (vía Sentry) en vez de proactiva. |
| Uso de Glue sin confirmar | 🟢 Baja | Aparece en la factura con \$0.00; no hay referencia a Glue en el código de la app. | Riesgo de costo sorpresa si algún job/crawler queda corriendo sin supervisión. |
| Sin AWS Budgets / alertas de costo | 🟢 Baja | No hay notificación configurada ante un salto de gasto mensual. | Cambios de infraestructura (proxy, instancia más grande) podrían sorprender en la factura. |
| Sin Infraestructura como Código (IaC) | 🟢 Baja | RDS, VPC, S3, KMS configurados manualmente en la consola ("ClickOps"), sin Terraform/CloudFormation. | Cambios de configuración no quedan versionados ni son reproducibles entre ambientes. |
| Rotación de llave KMS no confirmada | 🟢 Baja | No verificado si la rotación automática anual está activa. | Higiene de seguridad a mediano plazo. |

---

## 3. Opciones para resolver el error de conexiones a la base de datos

Costos estimados en USD, on-demand, región `us-east-1`, referencia agosto 2026. Todos son aproximados — el consumo real varía según uso.

| Opción | Precio promedio | Ventajas | Desventajas | Para qué necesidad sirve |
|---|---|---|---|---|
| **1. Arreglar el patrón "fire-and-forget"** (`await` o `waitUntil` de Vercel) | **\$0** — solo cambio de código | Ataca la causa más probable del error actual sin agregar infraestructura ni costo. Mejora la confiabilidad general de cualquier trabajo async futuro. | No aumenta el techo real de conexiones (sigue en 112); si el tráfico legítimo crece, el problema puede volver. Requiere auditar todo el código en busca del mismo patrón. | Tráfico actual, mientras la fuga sea la causa real del problema. Primer paso obligatorio antes de invertir en infraestructura. |
| **2. RDS Proxy** (AWS nativo) | ~**\$21.90/mes** adicionales (2 vCPU mínimo × \$0.015/vCPU-hora × 730h) sobre el costo actual de la RDS (~\$11.68/mes) → **~\$33.58/mes total en base de datos** | Totalmente gestionado por AWS, multiplexa cientos de conexiones de clientes hacia un puñado de conexiones reales a Postgres. Failover más rápido. Se integra sin salir del ecosistema AWS. | Casi triplica el gasto mensual actual de la base de datos. Mínimo de 2 vCPU aunque la app sea chica. Requiere configuración de red adicional (mismo VPC/subnets). | Tráfico medio-alto y creciente, con ráfagas de muchas conexiones concurrentes generadas por el modelo serverless — sin importar cuántos procesos las disparen. |
| **3. PgBouncer autogestionado en EC2** | ~**\$3.07/mes** (`t4g.nano`) a ~**\$6.13/mes** (`t4g.micro`) | La opción más barata que resuelve el problema de forma estructural. Control total sobre la configuración del pool. | Vos administrás parches del sistema operativo, reinicios y monitoreo. Es un punto único de falla: si esa instancia cae, se pierde el pooling (agregar redundancia sube el costo). | Tráfico bajo-medio con presupuesto mínimo, y con capacidad interna para dar mantenimiento a un servidor pequeño. |
| **4. Prisma Accelerate** (gestionado por Prisma) | **Gratis** hasta 60,000 operaciones/mes (luego \$0.006 por cada 1,000); egress \$0.08/GiB pasado el primer 2 KiB gratis por query. Planes pagos desde **\$29/mes** si se necesita más volumen. | Cero infraestructura propia. Pooling global pensado específicamente para serverless/edge. No cambia el modelo de despliegue actual (Vercel). La capa gratuita probablemente cubre el tráfico de hoy. | Se depende de un proveedor externo además de AWS. Agrega una capa de red (mitigado por sus ubicaciones edge). Requiere adaptar la cadena de conexión en `prisma.js`. | Tráfico bajo a alto sin querer gastar en infraestructura propia ni cambiar de proveedor de hosting; escala automáticamente con el uso real. |
| **5. Migrar el hosting de la app a EC2** | Desde ~**\$12.26/mes** (`t4g.small`, sin alta disponibilidad) hasta **\$50+/mes** (con Load Balancer y redundancia real) | Elimina de raíz el modelo de múltiples procesos efímeros abriendo conexiones. Control total del runtime. Sin límites de un proveedor serverless. | Se pierde el deploy automático, TLS gestionado, CDN y preview deployments de Vercel. El equipo pasa a operar parches, CI/CD propio, monitoreo. Si se escala horizontalmente sin cuidado, se puede reintroducir el mismo problema de conexiones. | Solo tiene sentido si, más allá de este bug puntual, se busca control general de infraestructura a futuro (workers, jobs largos, WebSockets). No es la respuesta más eficiente solo para este error. |
| **6. Subir la clase de instancia de RDS** (ej. `db.t4g.small`, 2 GB RAM) | ~**\$23/mes** (aprox. el doble del costo actual) | Cambio de un clic, sin tocar código ni arquitectura. `max_connections` sube proporcionalmente (~225). | No resuelve la causa raíz: si hay una fuga de conexiones, seguirá ocurriendo, solo tardará más en notarse. El tráfico real seguirá creciendo y el techo sigue siendo fijo. | Solo como mitigación de corto plazo mientras se implementan las otras soluciones — no como solución definitiva. |
| **7. Migrar la base a Neon** (Postgres serverless, fuera de AWS) | **\$0/mes** en el tier gratis (0.5 GB storage, 100 horas de cómputo, autoscaling hasta 2 CU) — probablemente cubre el tráfico actual. Si se excede, plan Launch a **\$0.106/CU-hora** + **\$0.35/GB-mes** de storage. | Pooling de conexiones integrado de fábrica, pensado específicamente para funciones serverless. Compatible 1:1 con Postgres/Prisma (solo cambia el `DATABASE_URL`). Branching de base de datos (copias instantáneas para probar migraciones sin tocar producción — ayuda también con la deuda de migraciones rotas). Tier gratis real, sin pausas por inactividad. | Se sale del ecosistema AWS: la conexión ya no va por la VPC privada, sino por internet con TLS. Requiere migrar los datos (`pg_dump`/`pg_restore`, sencillo por ser Postgres nativo) y actualizar la documentación del proyecto que asume RDS. Se depende de un proveedor nuevo además de AWS/Vercel. | Tráfico bajo-medio, buscando la combinación más barata y con mejor experiencia de desarrollo, sin querer operar infraestructura de pooling propia. |
| **8. Migrar la base a Supabase** (Postgres + plataforma, fuera de AWS) | **\$0/mes** en el tier gratis (500 MB DB, 200 conexiones realtime) o **\$25/mes** en el plan Pro (8 GB DB, 100 GB storage, pooler dedicado). | PgBouncer dedicado incluido desde el plan Micro Compute en adelante — resuelve el pooling sin configurar nada aparte. Dashboard todo-en-uno (auth, storage, funciones) por si en el futuro se quiere consolidar más servicios en un solo lugar. | El tier gratis se **pausa automáticamente tras ~1 semana de inactividad** (hay que reactivarlo a mano). Igual que Neon, implica salir de AWS, migrar datos y actualizar documentación. | Similar a Neon, pero mejor opción si a futuro se quiere consolidar auth/storage/funciones en una sola plataforma en vez de tener piezas separadas (hoy S3 aparte, JWT propio, etc.). |

### Recomendación de secuencia

1. **Arreglar el código** (opción 1) — gratis, ataca la causa más probable, se puede hacer ya.
2. **Confirmar con monitoreo** (`DatabaseConnections` en modo "Maximum", 1 minuto) si el error desaparece.
3. Si el tráfico real sigue empujando cerca del límite de 112 conexiones, comparar dos caminos según qué tan atada se quiera quedar la base a AWS:
   - **Quedarse en AWS**: evaluar **Prisma Accelerate** primero (mejor relación costo/gestión, capa gratuita probablemente suficiente hoy) y dejar **RDS Proxy** como alternativa nativa de AWS si se prefiere no depender de un tercero o el tráfico crece mucho más.
   - **Salir de AWS para la base de datos**: **Neon** es la opción más barata y de mejor manejo para el tráfico actual, con pooling nativo y probablemente gratis; **Supabase** es la alternativa si además interesa consolidar auth/storage/funciones en una sola plataforma a futuro.
4. Tratar la **migración a EC2** (opción 5) como una decisión estratégica aparte, no como respuesta a este error puntual.
5. Usar el **upsize de instancia** (opción 6) solo como parche temporal si hace falta más margen mientras se implementa alguna de las anteriores.

---

## Fuentes de precios

- [AWS RDS Proxy Pricing](https://www.amazonaws.cn/en/rds/proxy/pricing/)
- [db.t4g.micro pricing — Economize Cloud](https://www.economize.cloud/resources/aws/pricing/rds/db.t4g.micro/)
- [t4g.nano pricing — Economize Cloud](https://www.economize.cloud/resources/aws/pricing/ec2/t4g.nano/)
- [t4g.micro pricing — Economize Cloud](https://www.economize.cloud/resources/aws/pricing/ec2/t4g.micro/)
- [t4g.small pricing — Economize Cloud](https://www.economize.cloud/resources/aws/pricing/ec2/t4g.small/)
- [Prisma Accelerate pricing / GitHub discussion](https://github.com/prisma/prisma/discussions/23942)
