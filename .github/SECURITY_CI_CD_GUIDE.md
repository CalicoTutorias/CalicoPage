# 🔒 CI/CD Security Audit Configuration

## Overview

Este proyecto incluye auditorías de seguridad automáticas integradas en GitHub Actions para garantizar que todas las dependencias se verifiquen antes de que el código se mergee.

## Workflows Configurados

### 1. **Security Audit & Build** (`security-audit.yml`)

Se ejecuta en:
- ✅ Cada **push** a `main` y `dev`
- ✅ Cada **Pull Request** a `main` y `dev`

**Jobs incluidos:**
- 🔒 **Security Audit**: Verifica vulnerabilidades en npm
- 🏗️ **Build & Test**: Compila el proyecto y ejecuta tests
- 📝 **Lint Check**: Valida el código con ESLint
- 📊 **Summary**: Resume el estado de todas las verificaciones

**Niveles de severidad:**
- 🔴 **Critical**: FALLA el build (exit code 1)
- 🟡 **Moderate**: ADVERTENCIA (permite continuar)

---

### 2. **Dependency Check** (`dependency-check.yml`)

Se ejecuta:
- ✅ **Manualmente** (workflow_dispatch)
- ✅ **Automáticamente** cada **lunes a las 9 AM UTC**
- ✅ Cuando cambia **package.json** o **package-lock.json**

**Características:**
- Genera reportes detallados en JSON
- Comenta automáticamente en PRs
- Guarda artefactos por 30 días

---

## 📋 Configuración Recomendada

### Opción 1: Strict (Recomendado para producción)

Rechaza PRs con cualquier vulnerabilidad:

```yaml
# En security-audit.yml
- name: 🔍 NPM Security Audit
  run: npm audit --audit-level=moderate
  continue-on-error: false  # ← FALLA si hay vulnerabilidades moderadas+
```

### Opción 2: Warning (Advertencia sin bloqueo)

Permite PRs pero notifica sobre vulnerabilidades:

```yaml
- name: 🔍 NPM Security Audit
  run: npm audit --audit-level=moderate
  continue-on-error: true  # ← Solo ADVIERTE, no falla
```

---

## 🔧 Requisitos Previos

### En tu repositorio GitHub:

1. **Branch Protection Rules** (Recomendado)
   - Ve a: **Settings → Branches → Branch protection rules**
   - Requiere que los checks pasen antes de mergear:
     ```
     ✅ Security Audit & Build (REQUIRED)
     ✅ Dependency Check (OPTIONAL)
     ```

2. **Secrets** (Opcional)
   - Si necesitas variables de entorno en el build:
   ```
   Settings → Secrets → New repository secret
   
   Ejemplo:
   NEXT_PUBLIC_APP_URL = https://yourapp.com
   DATABASE_URL = postgresql://...
   ```

---

## 📊 Interpretación de Resultados

### ✅ Build Exitoso
```
✓ Compiled successfully
Test Suites: 2 passed
found 0 vulnerabilities
```

### ⚠️ Advertencias (No bloquea)
```
ESLint warnings:
  - Missing export variable names
  
Moderadas vulnerabilidades encontradas:
  npm audit fix available
```

### ❌ Build Fallido
```
found CRITICAL vulnerabilities
Exit code: 1
PR bloqueada hasta que se corrija
```

---

## 🚀 Instalación

### Paso 1: Verificar archivos creados

```bash
ls -la .github/workflows/
# Debe mostrar:
# security-audit.yml
# dependency-check.yml
```

### Paso 2: Hacer commit

```bash
git add .github/workflows/
git commit -m "ci: add security audit workflows to CI/CD pipeline"
git push origin dev
```

### Paso 3: Crear Pull Request

```bash
# El workflow se ejecutará automáticamente
# Verás los resultados en el PR bajo "Checks"
```

---

## 📝 Cómo Leer los Resultados

### En el PR:

```
All checks have passed ✅
  ├── 🔒 Security Audit & Build (PASSED)
  ├── 🏗️ Build & Test (PASSED)
  ├── 📝 Lint Check (PASSED)
  └── 📊 Security Summary (PASSED)
```

### Artifacts Generados:

- `npm-audit-report.json` - Reporte JSON completo de npm audit
- `coverage-report/` - Cobertura de tests
- `dependency-audit-reports/` - Reportes detallados de dependencias

---

## 🔐 Mejores Prácticas

### 1. Revisar Vulnerabilidades Regularmente

```bash
# Localmente antes de hacer push
npm audit
npm audit fix  # Parchar automáticamente
```

### 2. Mantener Dependencias Actualizadas

```bash
# Semanalmente
npm update
npm test
```

### 3. Configurar Dependabot (GitHub)

Settings → Code security → Dependabot:
- ✅ Enable Dependabot alerts
- ✅ Enable Dependabot security updates
- ✅ Enable Dependabot version updates

---

## 🛠️ Solucionar Problemas

### Problema: "found 0 vulnerabilities" pero falla el build

**Solución:**
```bash
# Limpiar caché
npm cache clean --force
rm package-lock.json
npm install
npm audit
```

### Problema: Tests fallan en CI pero pasan localmente

**Solución:**
```bash
# Usar la misma versión de Node
node --version  # Local
# Asegúrate que sea 18.x (como en el workflow)
```

### Problema: Workflow no se ejecuta

**Verificar:**
1. Push a `dev` o `main` ✅
2. Archivo está en `.github/workflows/` ✅
3. Sintaxis YAML es válida ✅
4. Branch protection rules están configuradas ✅

---

## 📚 Referencias Útiles

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [npm audit CLI](https://docs.npmjs.com/cli/v10/commands/npm-audit)
- [Branch Protection Rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Dependabot](https://docs.github.com/en/code-security/dependabot)

---

## ✨ Comandos Útiles

```bash
# Ver logs de un workflow fallido
gh run view <run-id> --log

# Triggear un workflow manualmente
gh workflow run security-audit.yml

# Descargar artefactos
gh run download <run-id> -n npm-audit-report
```

---

**Creado:** 18 de Abril de 2026  
**Última actualización:** 18 de Abril de 2026
