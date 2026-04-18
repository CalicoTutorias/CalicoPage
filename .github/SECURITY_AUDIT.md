# 🔒 Auditorías de Seguridad en CI/CD

Este documento explica cómo están configuradas las auditorías de seguridad en el pipeline de CI/CD del proyecto.

## 📋 Workflows Implementados

### 1. 🔒 Security Audit (`security-audit.yml`)
Ejecuta auditorías de seguridad regulares en todos los PRs y commits.

**Características:**
- ✅ `npm audit --audit-level=moderate` (bloquea moderado+)
- ✅ Verifica vulnerabilidades críticas y altas
- ✅ Se ejecuta automáticamente cada lunes a las 9:00 AM UTC
- ✅ Genera reportes detallados de vulnerabilidades
- ✅ Sube artefactos con resultados de auditoría

**Qué hace:**
```bash
npm audit --audit-level=moderate
# Falla si hay vulnerabilidades MODERADAS o ALTAS
```

### 2. 🔨 Build & Test (`build-and-test.yml`)
Verifica que el código sea seguro, se compile y pasen todos los tests.

**Características:**
- ✅ NPM Audit (nivel moderado)
- ✅ ESLint (linting)
- ✅ Build de Next.js
- ✅ Ejecución de tests
- ✅ Análisis de código con CodeQL (GitHub Advanced Security)

### 3. 🛡️ Branch Protection (`branch-protection.yml`)
Protege las ramas `main` y `dev` contra merges sin pasar seguridad.

**Características:**
- ✅ Bloquea merge si hay vulnerabilidades
- ✅ Verifica versiones de dependencias críticas
- ✅ Requiere aprobación adicional para main
- ✅ Crea checks de estado en el PR

---

## 🚀 Cómo Configurar

### Paso 1: Habilitar Workflows en GitHub

1. Ve a tu repositorio en GitHub
2. Opción **Settings → Actions → General**
3. Asegúrate de que "Actions" está habilitado
4. En "Workflow permissions", selecciona:
   - ✅ "Read and write permissions"
   - ✅ "Allow GitHub Actions to create and approve pull requests"

### Paso 2: Configurar Protección de Ramas

#### Para `main`:
1. **Settings → Branches → Add rule**
2. **Branch name pattern:** `main`
3. Habilita:
   - ✅ "Require a pull request before merging"
   - ✅ "Require status checks to pass before merging"
   - ✅ "Require branches to be up to date before merging"
   - ✅ "Require code reviews before merging" (mínimo 1 aprobación)
   - ✅ "Dismiss stale pull request approvals when new commits are pushed"

4. Selecciona estos checks como requeridos:
   - ✅ "Security Audit"
   - ✅ "Build & Test"
   - ✅ "CodeQL"
   - ✅ "Security Gate Check"

#### Para `dev`:
1. **Settings → Branches → Add rule**
2. **Branch name pattern:** `dev`
3. Habilita:
   - ✅ "Require a pull request before merging"
   - ✅ "Require status checks to pass before merging"
   - ✅ "Require branches to be up to date before merging"

4. Selecciona estos checks como requeridos:
   - ✅ "Security Audit"
   - ✅ "Build & Test"

---

## 🔍 Cómo Leer los Resultados

### ✅ Cuando TODO está OK:
```
✅ Security Audit - PASS
✅ Build & Test - PASS  
✅ CodeQL Analysis - PASS
✅ Branch Protection - PASS
```

### ❌ Cuando hay problemas:

**Si npm audit falla:**
```bash
# En tu rama local
npm audit fix
npm audit        # Verificar que pasó

# Commit y push
git add package.json package-lock.json
git commit -m "fix: security vulnerabilities"
git push origin tu-rama
```

**Si el build falla:**
```bash
# Ejecutar localmente
npm run build
npm run lint
npm test
```

---

## 📊 Monitoreo Continuo

### Auditoría Programada
- Se ejecuta automáticamente cada **lunes a las 9:00 AM UTC**
- Si encuentra vulnerabilidades, se abre un issue

### En cada Push/PR
- Se ejecuta `npm audit` automáticamente
- Bloquea merge si hay vulnerabilidades moderadas o altas

### CodeQL Analysis
- Ejecuta análisis estático de seguridad
- Detecta problemas de lógica y patrones inseguros
- Genera reporte detallado

---

## 🛠️ Configuración de Herramientas Adicionales

### Dependabot (Opcional - Recomendado)

Para actualizaciones automáticas de dependencias:

1. **Settings → Security & analysis → Dependabot**
2. Habilita:
   - ✅ "Dependabot alerts"
   - ✅ "Dependabot security updates"
   - ✅ "Dependabot version updates"

3. Crea `.github/dependabot.yml`:
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "03:00"
    open-pull-requests-limit: 10
    reviewers:
      - "tu-usuario"
    labels:
      - "dependencies"
      - "npm"
```

---

## 📈 Métricas de Seguridad

### Antes de los Workflows:
- ❌ 10 CVEs sin parches
- ❌ Sin verificación automática
- ❌ Riesgo de desplegar código vulnerable

### Después de los Workflows:
- ✅ 0 CVEs en main/dev
- ✅ Verificación automática en cada PR
- ✅ Bloqueo de merges inseguros
- ✅ Auditorías programadas semanales

---

## 🚨 Troubleshooting

### Error: "Security Audit failed"
```bash
# 1. Verifica localmente
npm audit --audit-level=moderate

# 2. Arregla vulnerabilidades
npm audit fix
npm audit fix --force  # Si es necesario

# 3. Verifica que pasó
npm run build
npm test

# 4. Commit y push
git add .
git commit -m "fix: patch security vulnerabilities"
git push
```

### Error: "Required checks failed"
- Espera a que todos los workflows se completen
- Verifica el tab "Checks" en el PR
- Haz click en cada check fallido para ver detalles

### Los workflows no corren
1. Verifica que Actions está habilitado
2. Comprueba los permisos en Settings
3. Revisa `.github/workflows/` existen los archivos
4. Haz push a la rama - deben trigger automáticamente

---

## 📚 Referencias

- [GitHub Actions Documentation](https://docs.github.com/es/actions)
- [npm audit](https://docs.npmjs.com/cli/v9/commands/npm-audit)
- [GitHub CodeQL](https://codeql.github.com/)
- [Dependabot](https://docs.github.com/es/code-security/dependabot)

---

## ✅ Checklist Final

- [ ] Workflows creados en `.github/workflows/`
- [ ] Branch protection habilitado para `main`
- [ ] Branch protection habilitado para `dev`
- [ ] Checks requeridos configurados
- [ ] Equipo notificado de nuevos requisitos
- [ ] Documentación compartida

---

**Última actualización:** 18 de Abril, 2026
**Mantenedor:** Security Team
