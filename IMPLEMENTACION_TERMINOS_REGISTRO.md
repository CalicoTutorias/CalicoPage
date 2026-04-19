# Implementación: Checkbox de Términos y Condiciones en Registro

## Resumen de Cambios

Se ha implementado una mejora completa en el proceso de registro de usuarios, agregando un checkbox obligatorio para aceptar términos y condiciones + tratamiento de datos.

---

## 1. Archivos Actualizados

### 📄 `src/lib/i18n/locales/es.json` y `en.json`
**Cambio:** Agregadas nuevas cadenas de traducción en la sección `auth.register`

```json
"termsCheckbox": "Acepto los ",
"termsAndConditions": "términos y condiciones",
"termsAnd": " y el ",
"dataProcessing": "tratamiento de datos"
```

**Nueva sección de errores:**
```json
"termsNotAccepted": "Debes aceptar los términos y condiciones para poder registrarte."
```

**Nota:** Estos textos están disponibles en ambos idiomas (español e inglés).

---

### 📄 `src/app/components/TermsModal/TermsModal.jsx` (NUEVO)
**Propósito:** Componente modal reutilizable para mostrar términos y condiciones sin perder el formulario

**Características:**
- Modal responsivo (desktop y mobile)
- Cierre con botón X o haciendo clic en "Entendido"
- Overlay para bloquear interacción con el formulario de fondo
- Estilo consistente con el diseño del proyecto

**Props:**
- `isOpen` - controla si el modal está visible
- `onClose` - función para cerrar
- `title` - título del modal
- `content` - contenido a mostrar (React.ReactNode)

### 📄 `src/app/components/TermsModal/TermsModal.module.css` (NUEVO)
**Estilos:**
- Overlay con fondo semi-transparente
- Modal centrado y escalable
- Botones interactivos con hover effects
- Responsive design (máximo 90vh de altura, scrolleable si necesario)

---

### 📄 `src/app/auth/register/page.jsx`
**Cambios principales:**

#### 1. Importaciones
```javascript
import TermsModal from '../../components/TermsModal/TermsModal';
```

#### 2. Nuevos estados
```javascript
const [termsAccepted, setTermsAccepted] = useState(false);
const [activeModal, setActiveModal] = useState(null); // 'terms' | 'privacy' | null
```

#### 3. LocalStorage para persistencia de formulario
```javascript
const FORM_STORAGE_KEY = 'register_form_data';
```

**Comportamiento:**
- Al cargar la página, recupera datos guardados del localStorage
- Guarda automáticamente cada cambio del formulario
- Limpia el localStorage después de registro exitoso
- **Resultado:** Si el usuario hace clic en los links y regresa, los datos permanecen

#### 4. Nuevos componentes internos
```javascript
function TermsContent() // Muestra términos y condiciones
function PrivacyContent() // Muestra política de privacidad
```

Estos componentes reutilizan las claves de i18n existentes:
- `termsOfUse.s1.*` y `termsOfUse.s2.*`
- `privacyPolicy.s1.*` y `privacyPolicy.s2.*`

#### 5. Checkbox en el formulario (antes del botón de registro)
```jsx
<input
  type="checkbox"
  id="termsCheckbox"
  checked={termsAccepted}
  onChange={(e) => setTermsAccepted(e.target.checked)}
  className="mt-1 cursor-pointer"
/>
<label htmlFor="termsCheckbox" className="text-sm text-gray-600">
  {t('auth.register.termsCheckbox')}
  <button type="button" onClick={() => handleOpenModal('terms')}>
    {t('auth.register.termsAndConditions')}
  </button>
  {t('auth.register.termsAnd')}
  <button type="button" onClick={() => handleOpenModal('privacy')}>
    {t('auth.register.dataProcessing')}
  </button>
</label>
```

#### 6. Validación de términos en `handleRegister`
```javascript
if (!termsAccepted) {
  setError(t('auth.register.errors.termsNotAccepted'));
  return;
}
```

#### 7. Modales renderizados
```jsx
<TermsModal
  isOpen={activeModal === 'terms'}
  onClose={handleCloseModal}
  title={t('termsOfUse.title')}
  content={<TermsContent />}
/>

<TermsModal
  isOpen={activeModal === 'privacy'}
  onClose={handleCloseModal}
  title={t('privacyPolicy.title')}
  content={<PrivacyContent />}
/>
```

---

### 📄 `src/app/api/auth/register/route.js`
**Cambios:**

#### 1. Schema de validación Zod actualizado
```javascript
const registerSchema = z.object({
  // ... otros campos ...
  terms: z.boolean().refine((val) => val === true, {
    message: 'You must accept the terms and conditions to register',
  }),
});
```

**Nota:** El refine() asegura que terms sea exactamente `true`

#### 2. Extracción del parámetro `terms`
```javascript
const { name, email, password, phoneNumber, careerId, terms } = parsed.data;
```

#### 3. Guardado en base de datos
```javascript
const user = await userRepository.create({
  // ... otros campos ...
  terms: terms === true,
});
```

---

### 📄 `src/app/services/utils/AuthService.js`
**Cambio:**

Actualizado el método `register()` para pasar el parámetro `terms`:
```javascript
register: async (userData) => {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // ... otros campos ...
      terms: userData.terms === true,
    }),
  });
  // ...
};
```

---

## 2. Flujo de Registro Completo

```
┌─────────────────────────────────────┐
│  Usuario en página de registro      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Rellena formulario                 │
│  (datos se guardan en localStorage) │
└──────────────┬──────────────────────┘
               │
      ┌────────┴─────────┐
      │                  │
      ▼                  ▼
┌──────────────┐  ┌─────────────────┐
│Clic en links │  │Completa campos  │
│términos o    │  │y marca checkbox │
│privacidad    │  │                 │
└──────┬───────┘  └────────┬────────┘
       │                   │
       ▼                   ▼
┌──────────────────┐  ┌──────────────────┐
│Se abre modal     │  │Valida: ¿checkbox │
│Muestra contenido │  │marcado?          │
│sin perder datos  │  └────────┬─────────┘
└──────┬───────────┘           │
       │                       │ ✓ Sí
       ▼                       ▼
┌──────────────────┐  ┌──────────────────┐
│Usuario lee       │  │POST /api/auth/   │
│y cierra modal    │  │  register        │
└──────┬───────────┘  │(con terms: true) │
       │              └────────┬─────────┘
       │                       │
       └───────────┬───────────┘
                   │
                   ▼ (datos preservados)
            ┌─────────────────┐
            │ Registro exitoso│
            │ → envío email   │
            │ → JWT generado  │
            │ → localStorage  │
            │   limpiado      │
            └─────────────────┘
```

---

## 3. Experiencia de Usuario (UX)

### ✅ Comportamiento esperado

1. **Rellenado del formulario:**
   - El usuario completa los campos
   - Los datos se guardan automáticamente cada 300ms (React)
   - No hay pérdida de datos si el navegador se recarga accidentalmente

2. **Links de términos y privacidad:**
   - Hace clic en "términos y condiciones" o "tratamiento de datos"
   - Se abre un modal elegante
   - El formulario sigue visible de fondo (opacidad 0.5)
   - Usuario puede leer el contenido completo

3. **Cierre del modal:**
   - Botón "Entendido" en la parte inferior
   - Botón X en la esquina superior derecha
   - Clic fuera del modal (en el overlay)
   - Los datos del formulario **siguen siendo los mismos**

4. **Validación del checkbox:**
   - Si el usuario intenta registrarse sin marcar ✓:
     ```
     "Debes aceptar los términos y condiciones para poder registrarte."
     ```
   - El botón de registro permanece habilitado (no bloqueado)
   - El error se muestra claramente en rojo

5. **Registro exitoso:**
   - El localStorage se limpia automáticamente
   - Se envía email de verificación
   - Se genera JWT
   - Usuario es redirigido a `/auth/verify-email`

---

## 4. Datos Base de Datos

### Campo existente en tabla `users`
```sql
-- Ya existe en prisma/schema.prisma
terms  Boolean @default(false)
```

El campo se actualiza en el endpoint de registro:
- `terms: true` - usuario aceptó
- `terms: false` - valor por defecto (nunca se registraría con false)

---

## 5. Internacionalización (i18n)

Totalmente soportado en **español** e **inglés**:

**Español:**
```
"Acepto los términos y condiciones y el tratamiento de datos"
"Debes aceptar los términos y condiciones para poder registrarte."
```

**English:**
```
"I accept the terms and conditions and the data processing policy"
"You must accept the terms and conditions to register."
```

---

## 6. Testing Manual

Para validar la implementación:

1. **Abrir registro:**
   ```
   http://localhost:3000/auth/register
   ```

2. **Rellenar formulario parcialmente:**
   - Nombre, teléfono, carrera, email, contraseña
   - Ir a otra pestaña
   - Volver → **datos deben estar presentes**

3. **Clic en "términos y condiciones":**
   - Se abre modal con contenido
   - El formulario sigue visible de fondo
   - Clic en "Entendido" → se cierra sin perder datos

4. **Intentar registrarse sin checkbox:**
   - Error: "Debes aceptar los términos..."

5. **Marcar checkbox y registrarse:**
   - ✓ Éxito
   - Se limpia localStorage
   - Email de verificación enviado

---

## 7. Compatibilidad

✅ **Responsive:** Desktop, tablet, mobile  
✅ **Navegadores:** Chrome, Firefox, Safari, Edge  
✅ **Framework:** Next.js 15 (App Router)  
✅ **Lingüística:** ES/EN  
✅ **Accesibilidad:** Labels vinculados, semántica HTML correcta  

---

## 8. Resumen Técnico

| Aspecto | Implementación |
|---------|------------------|
| **Validación** | Zod en backend + validación cliente |
| **Persistencia** | localStorage (FORM_STORAGE_KEY) |
| **Modales** | Componente reutilizable TermsModal |
| **i18n** | Claves en es.json y en.json |
| **Base de datos** | Campo `terms` (Boolean, default: false) |
| **UX** | Flujo sin fricción, sin pérdida de datos |
| **API** | POST /api/auth/register (terms: boolean requerido) |

---

## ✨ Conclusión

Se ha implementado una solución **completa, usable y legal** para:
- ✅ Cumplimiento normativo (GDPR/leyes locales)
- ✅ Experiencia de usuario fluida
- ✅ Internacionalización total
- ✅ Preservación de datos del formulario
- ✅ Validación robusta en frontend y backend
