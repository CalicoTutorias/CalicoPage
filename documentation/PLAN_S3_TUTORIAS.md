# Plan: Solicitud de Tutorías con Adjuntos S3

> Estado: **COMPLETADA** — 10 bloques implementados, 44 tests pasando.

---

## Resumen

Mejorar el flujo de agendamiento para que el estudiante pueda describir qué quiere repasar y adjuntar material de apoyo. Los tutores reciben un correo con enlace a una página de detalle donde ven el material (si tienen permiso) y aceptan/rechazan.

---

## Bloque 1 — Schema de Prisma

- [x] **1.1** Agregar campo `topicsToReview` (`String`, opcional para no romper sesiones existentes) al modelo `Session`.
- [x] **1.2** Crear modelo `SessionAttachment`:
  ```
  model SessionAttachment {
    id          String   @id @default(uuid()) @db.Uuid
    sessionId   String   @db.Uuid
    session     Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
    s3Key       String              // clave en S3 (ruta completa)
    fileName    String              // nombre original del archivo
    fileSize    Int                 // bytes
    mimeType    String              // ej. application/pdf, image/png
    uploadedAt  DateTime @default(now())

    @@map("session_attachments")
  }
  ```
- [x] **1.3** Agregar relación inversa `attachments SessionAttachment[]` en `Session`.
- [x] **1.4** Ejecutar `prisma db push` para aplicar cambios al esquema (migración tiene drift, se usó push).
- [x] **1.5** Ejecutar `npm run db:generate` para regenerar el Prisma Client.

---

## Bloque 2 — Backend: Repositorio y Servicio de Attachments

- [x] **2.1** Crear `src/lib/repositories/session-attachment.repository.js`:
  - `createMany(sessionId, attachments[])` — inserción bulk.
  - `findBySessionId(sessionId)` — listar adjuntos de una sesión.
  - `deleteBySessionId(sessionId)` — borrar registros (para cleanup).
- [x] **2.2** Crear `src/lib/services/session-attachment.service.js`:
  - `generateUploadUrls(files[])` — genera presigned PUT URLs para N archivos (usa `s3.generateUploadUrl`). Retorna `[{ s3Key, uploadUrl, fileName }]`. El `s3Key` sigue el patrón `session-attachments/{batchId}/{timestamp}-{sanitizedFileName}`.
  - `registerAttachments(sessionId, attachmentsMeta[])` — crea registros `SessionAttachment` tras confirmación de pago.
  - `getAuthorizedDownloadUrls(sessionId, requesterId)` — valida permisos, genera presigned GET URLs. Reglas de acceso:
    1. Es el estudiante creador de la sesión → **permitido siempre**.
    2. Es el tutor asignado y la sesión está `Pending` → **permitido** (está evaluando).
    3. Es el tutor asignado y la sesión está `Accepted` → **permitido** (preparando clase).
    4. Cualquier otro caso → **denegado** (Rejected, Canceled, otro tutor, etc.).
  - `cleanupOrphanedFiles(s3Keys[])` — elimina archivos de S3 si el pago falla o la sesión se cancela.
- [x] **2.3** Implementar estrategia de **Orphan Cleanup** con S3 Object Tagging:
  - Al generar presigned PUT URLs, usar `PutObjectCommand` con tag `status=unconfirmed`.
  - Al confirmar el pago y registrar attachments, actualizar el tag a `status=confirmed` (vía `PutObjectTaggingCommand`).
  - Documentar la configuración de una **S3 Lifecycle Rule** que elimine objetos con tag `status=unconfirmed` después de 24 horas.
  - Esto cubre el caso donde el estudiante sube archivos pero aborta el pago o el pago falla.

---

## Bloque 3 — Backend: Rutas de API

- [x] **3.1** `POST /api/attachments/presigned-urls` (auth requerida):
  - Body: `{ files: [{ fileName, mimeType, fileSize }] }`.
  - Validación Zod: max 5 archivos, max 10 MB por archivo, mimeTypes permitidos (`application/pdf`, `image/*`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`).
  - Retorna `{ urls: [{ s3Key, uploadUrl, fileName }], batchId }`.
- [x] **3.2** `GET /api/sessions/[id]/attachments` (auth requerida):
  - Llama a `getAuthorizedDownloadUrls(sessionId, auth.sub)`.
  - Retorna `{ attachments: [{ id, fileName, fileSize, mimeType, downloadUrl }] }` o 403 si no tiene permiso.
- [x] **3.3** Modificar el flujo de creación de sesión en `wompi.service.js`:
  - Recibir `topicsToReview` y `attachmentsMeta` (array de `{ s3Key, fileName, fileSize, mimeType }`) en los metadatos del pago.
  - Al crear la sesión, guardar `topicsToReview` y llamar a `registerAttachments()`.
- [x] **3.4** Modificar `POST /api/payments/create-intent`:
  - Aceptar `topicsToReview` (string, obligatorio) y `attachments` (array, opcional) en el body.
  - Pasar estos datos al metadata del payment intent.

---

## Bloque 4 — Backend: Notificación por Email al Tutor

- [x] **4.1** Crear template en Brevo (o documentar su creación manual) para "Nueva solicitud de tutoría":
  - Params: `TUTOR_NAME`, `STUDENT_NAME`, `COURSE_NAME`, `SESSION_DATE`, `TOPICS_PREVIEW` (primeros 150 chars del topicsToReview), `DETAIL_LINK`, `ATTACHMENT_COUNT`.
- [x] **4.2** Agregar `TEMPLATE_IDS.NEW_SESSION_REQUEST` (ID: 6) en `email.service.js`.
- [x] **4.3** Crear función `sendNewSessionRequestEmail(tutorEmail, tutorName, params)` en `email.service.js`.
- [x] **4.4** Invocar este email en `wompi.service.js` → `processSuccessfulPayment()`, fire-and-forget con doble protección (try/catch + `.catch()`).

---

## Bloque 5 — Frontend: Componente de Upload de Archivos

- [x] **5.1** Crear componente reutilizable `FileUploader` en `src/app/components/FileUploader/`:
  - Props: `onFilesChange(files[])`, `maxFiles=5`, `maxSizeMB=10`, `acceptedTypes`.
  - UI: Zona de drag-and-drop + botón de selección manual.
  - Muestra lista de archivos seleccionados con nombre, tamaño, botón de eliminar.
  - Validación client-side de tipo y tamaño.
- [x] **5.2** Crear hook `useFileUpload` en `src/app/hooks/`:
  - Gestiona el estado de subida: `idle`, `uploading`, `success`, `error`.
  - Llama a `POST /api/attachments/presigned-urls` → sube cada archivo a S3 vía `fetch(PUT, url)`.
  - Trackea progreso por archivo (usando `XMLHttpRequest` para `onprogress`).
  - **Manejo de errores por archivo**: si un archivo falla al subir (error de red, timeout), NO bloquea el resto. Se marca ese archivo con estado `error` en la UI, permitiendo reintento individual o continuar sin él.
  - Retorna `{ uploadFiles(files), progress, isUploading, uploadedFiles, error, retryFile(index) }`.

---

## Bloque 6 — Frontend: Integración en Flujo de Booking

- [x] **6.1** Modificar `SessionConfirmationModal.jsx`:
  - Agregar campo `textarea` obligatorio para "¿Qué temas quieres repasar?" antes del botón de pago.
  - Agregar sección opcional con `FileUploader` para adjuntar material.
  - Deshabilitar botón de pago si `topicsToReview` está vacío.
- [x] **6.2** Modificar `PaymentService.createWompiPayment()`:
  - Enviar `topicsToReview` y `attachments` (metadatos de archivos subidos) al backend.
- [x] **6.3** Flujo completo:
  1. Estudiante escribe qué quiere repasar.
  2. (Opcional) Selecciona archivos → se suben a S3 con presigned URLs → barra de progreso.
  3. Clic en "Pagar" → se envía `topicsToReview` + metadata de archivos al backend.
  4. Webhook de Wompi crea la sesión con adjuntos.

---

## Bloque 7 — Frontend: Página de Detalle de Solicitud (Tutor)

- [x] **7.1** Crear página `/sessions/[id]/detail` (o ruta equivalente dentro del dashboard del tutor):
  - Fetch `GET /api/sessions/:id` + `GET /api/sessions/:id/attachments`.
  - Mostrar:
    - Información del estudiante (nombre, carrera).
    - Curso y horario solicitado.
    - Texto de `topicsToReview` completo.
    - Lista de adjuntos con botón de descarga (presigned URLs).
    - Botones "Aceptar" / "Rechazar" (si `status === 'Pending'`).
  - Estados condicionales:
    - **Pending**: Todo visible + botones de acción.
    - **Accepted (por este tutor)**: Todo visible, sin botones de acción, badge "Aceptada".
    - **Accepted (por otro tutor)**: Mensaje "Esta solicitud ya fue tomada por otro tutor", sin archivos ni temas.
    - **Canceled/Rejected**: Mensaje de estado, sin archivos ni temas.
- [x] **7.2** Componente `AttachmentList`:
  - Renderiza la lista de archivos con íconos por tipo (PDF, imagen, documento).
  - Botón de descarga que abre presigned URL en nueva pestaña.
  - Indicador de carga mientras se obtienen las URLs.

---

## Bloque 8 — Frontend: Vista del Estudiante

- [x] **8.1** En la vista de "Mis sesiones" del estudiante, mostrar el campo `topicsToReview` en el detalle de cada sesión.
- [x] **8.2** Mostrar lista de archivos adjuntos que el estudiante subió (con opción de descarga).
- [x] **8.3** Badge de estado visible (`Pendiente`, `Aceptada`, `Rechazada`, `Cancelada`).

---

## Bloque 9 — Seguridad y Access Control

- [x] **9.1** Validar en `getAuthorizedDownloadUrls` que solo usuarios autorizados obtengan URLs de descarga:
  - Estudiante creador: siempre.
  - Tutor asignado + sesión `Pending` o `Accepted`: permitido.
  - Cualquier otro caso: 403 Forbidden.
- [x] **9.2** Presigned URLs de descarga con expiración corta (15 minutos).
- [x] **9.3** Validar en el frontend que no se muestren links de descarga si el backend responde 403.
- [x] **9.4** Sanitizar nombres de archivo antes de usarlos como S3 keys (remover caracteres especiales, limitar longitud, sanitizar extensión).
- [x] **9.5** Validar `Content-Type` en el backend al generar presigned PUT URLs (solo tipos permitidos).
- [x] **9.6** Vincular `ContentLength` en presigned PUT URL para prevenir bypass de tamaño declarado.
- [x] **9.7** Añadir tag `status=unconfirmed` en presigned PUT URL + header `x-amz-tagging` en cliente XHR.
- [x] **9.8** Crear configuración CORS de S3 (`infra/s3-cors.json`) — solo `PUT`/`GET`, headers restringidos.
- [x] **9.9** Crear Lifecycle Rule de S3 (`infra/s3-lifecycle.json`) — eliminar objetos con tag `status=unconfirmed` tras 24h.

---

## Bloque 10 — Tests

- [x] **10.1** Tests unitarios para `session-attachment.service.js` (22 tests):
  - Generación de presigned URLs (batchId, sanitización, ContentLength, tagging).
  - Lógica de autorización (7 escenarios: estudiante OK, tutor Pending OK, tutor Accepted OK, tutor Rejected DENIED, tutor Canceled DENIED, otro tutor DENIED, sesión inexistente NOT_FOUND).
  - Registro de adjuntos (happy path + array vacío).
  - Resiliencia de cleanup (Promise.allSettled no crashea con fallos parciales de S3).
  - deleteSessionAttachments (DB + S3, y caso sin adjuntos).
- [x] **10.2** Tests de integración para las rutas de API (11 tests):
  - `POST /api/attachments/presigned-urls` — validación Zod (10MB, MIME, 5 archivos, tamaño 0, fileName requerido).
  - Autenticación 401 sin token.
  - Happy path con todos los MIME types válidos.
  - Manejo de errores del servicio (VALIDATION_ERROR → 400, inesperado → 500).
- [x] **10.3** Tests del hook `useFileUpload` (11 tests):
  - Validación client-side de tipos MIME, tamaño, y límite de archivos.
  - Aceptación parcial (válidos + inválidos mezclados).
  - No llamar a API cuando no hay archivos pendientes.
  - removeFile, uploadedFiles, isUploading.

---

## Notas Técnicas

### Patrón S3 Key
```
session-attachments/{batchId}/{timestamp}-{sanitizedFileName}
```
- `batchId`: UUID generado al solicitar presigned URLs (antes del pago). Agrupa archivos de una misma solicitud.
- `timestamp`: epoch en ms para evitar colisiones.
- `sanitizedFileName`: nombre original sin caracteres especiales.

### Flujo de Datos Completo
```
Estudiante:
  1. Selecciona slot en calendario
  2. SessionConfirmationModal se abre
  3. Escribe topicsToReview (obligatorio)
  4. (Opcional) Sube archivos → POST /api/attachments/presigned-urls → PUT directo a S3
  5. Clic "Pagar" → POST /api/payments/create-intent (incluye topicsToReview + attachmentsMeta)
  6. Wompi procesa pago → Webhook → Session creada con topicsToReview + SessionAttachments

Tutor:
  7. Recibe email con enlace a /sessions/{id}/detail
  8. Ve topicsToReview + descarga archivos (presigned GET URLs)
  9. Acepta o Rechaza
```

### Límites
| Restricción | Valor |
|-------------|-------|
| Max archivos por sesión | 5 |
| Max tamaño por archivo | 10 MB |
| Tipos permitidos | PDF, PNG, JPG, JPEG, DOC, DOCX |
| Expiración presigned PUT URL | 5 minutos |
| Expiración presigned GET URL | 15 minutos |
| Max longitud topicsToReview | 2000 caracteres |

### Configuración CORS del Bucket S3

Se debe configurar CORS en el bucket `calico-uploads` para permitir subidas directas desde el browser:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://tu-dominio-produccion.com"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Aplicar vía AWS CLI:
```bash
aws s3api put-bucket-cors --bucket calico-uploads --cors-configuration file://cors.json
```

### S3 Lifecycle Rule para Orphan Cleanup

Configurar una regla de ciclo de vida en el bucket que elimine objetos con tag `status=unconfirmed` después de 24 horas:

```json
{
  "Rules": [
    {
      "ID": "cleanup-unconfirmed-attachments",
      "Filter": { "Tag": { "Key": "status", "Value": "unconfirmed" } },
      "Status": "Enabled",
      "Expiration": { "Days": 1 }
    }
  ]
}
```

Aplicar vía AWS CLI:
```bash
aws s3api put-bucket-lifecycle-configuration --bucket calico-uploads --lifecycle-configuration file://lifecycle.json
```

### Dependencias Nuevas
Ninguna — todo se implementa con AWS SDK v3 (ya instalado), Prisma (ya instalado), y APIs nativas del browser (`fetch`, `XMLHttpRequest` para progreso).

---

## Feature Completada

> **Estado final: COMPLETADA** — 2026-04-10
>
> Todos los bloques (1-10) implementados y verificados.
> **44 tests pasando** (3 suites: servicio, API, hook).
>
> ### Pendiente de infraestructura (manual en AWS Console/CLI):
> 1. Aplicar CORS: `aws s3api put-bucket-cors --bucket calico-uploads --cors-configuration file://infra/s3-cors.json`
> 2. Aplicar Lifecycle Rule: `aws s3api put-bucket-lifecycle-configuration --bucket calico-uploads --lifecycle-configuration file://infra/s3-lifecycle.json`
> 3. Crear template ID 6 en Brevo con los params documentados en `email.service.js`
> 4. Actualizar `AllowedOrigins` en CORS con el dominio de producción real
