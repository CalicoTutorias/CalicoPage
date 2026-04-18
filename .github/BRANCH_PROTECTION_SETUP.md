# 🔐 GitHub Branch Protection Configuration

Este archivo contiene comandos para configurar protecciones de rama en tu repositorio GitHub.

## Opción 1: Mediante GitHub CLI (Recomendado)

```bash
# Instalar GitHub CLI si aún no lo tienes
# macOS: brew install gh
# Windows: choco install gh
# Linux: Ver https://cli.github.com/

# Autenticarse con GitHub
gh auth login

# Configurar main branch
gh api repos/{owner}/{repo}/branches/main/protection \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  -d '{
    "required_status_checks": {
      "strict": true,
      "contexts": [
        "Security Audit & Build",
        "security-audit (security-audit)",
        "security-audit (build-and-test)",
        "security-audit (lint-check)",
        "security-audit (summary)"
      ]
    },
    "enforce_admins": true,
    "require_code_reviews": true,
    "require_linear_history": false,
    "dismiss_stale_reviews": false,
    "require_conversation_resolution": true
  }'

# Configurar dev branch
gh api repos/{owner}/{repo}/branches/dev/protection \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  -d '{
    "required_status_checks": {
      "strict": true,
      "contexts": [
        "Security Audit & Build"
      ]
    },
    "enforce_admins": false,
    "require_code_reviews": true,
    "require_linear_history": false,
    "dismiss_stale_reviews": true
  }'
```

**Reemplazar:**
- `{owner}` = Tu usuario/organización (ej: `MxrixLu`)
- `{repo}` = Tu repositorio (ej: `Monitorias`)

---

## Opción 2: Mediante GitHub Web Interface

### Paso 1: Ir a Settings

```
GitHub → Repository Settings → Branches
```

### Paso 2: Agregar Regla de Protección

Click en **"Add rule"**

### Paso 3: Configurar para `main`

**Basic settings:**
- Branch name pattern: `main`
- ✅ Require a pull request before merging
  - ✅ Require approvals: `1`
  - ✅ Dismiss stale pull request approvals when new commits are pushed
  - ✅ Require review from code owners

**Protection rules:**
- ✅ Require status checks to pass before merging
  - ✅ Require branches to be up to date before merging
  - Status checks that must pass:
    - `Security Audit & Build`
    - `security-audit (security-audit)`
    - `security-audit (build-and-test)`
    - `security-audit (lint-check)`

**Advanced options:**
- ✅ Include administrators
- ✅ Require code review before merging
- ✅ Require conversation resolution before merging

---

## Opción 3: Configuración Predefinida para dev

Para una rama más relajada pero con auditoría:

```bash
gh api repos/{owner}/{repo}/branches/dev/protection \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  -d '{
    "required_status_checks": {
      "strict": true,
      "contexts": ["Security Audit & Build"]
    },
    "enforce_admins": false,
    "require_code_reviews": true,
    "require_linear_history": false,
    "dismiss_stale_reviews": true,
    "require_conversation_resolution": false
  }'
```

---

## 📋 Configuración Recomendada por Rama

### **main** (Producción)
```
Stricto: Todos los checks + 2 approvals + Admin override disabled
```

### **dev** (Desarrollo)
```
Moderado: Checks + 1 approval + Admin override permitido
```

---

## ✅ Verificar Configuración

```bash
# Ver protecciones de main
gh api repos/{owner}/{repo}/branches/main/protection

# Ver protecciones de dev
gh api repos/{owner}/{repo}/branches/dev/protection

# Listar todas las ramas protegidas
gh api repos/{owner}/{repo}/branches \
  --jq '.[] | select(.protected) | .name'
```

---

## 🚨 Excepciones de Admin

Si necesitas que los admins puedan mergear sin cumplir checks:

```bash
# Deshabilitar: include_admins = false
gh api repos/{owner}/{repo}/branches/main/protection \
  -X PUT \
  -d '{"enforce_admins": false}'
```

---

## 📊 Configuración Alternativa: Strict Security

Para máxima seguridad (ej: fintech, healthcare):

```bash
gh api repos/{owner}/{repo}/branches/main/protection \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  -d '{
    "required_status_checks": {
      "strict": true,
      "contexts": [
        "Security Audit & Build",
        "security-audit (security-audit)",
        "security-audit (build-and-test)",
        "security-audit (lint-check)",
        "Dependency Check"
      ]
    },
    "enforce_admins": true,
    "require_code_reviews": true,
    "required_approving_review_count": 2,
    "require_linear_history": true,
    "dismiss_stale_reviews": false,
    "require_conversation_resolution": true,
    "restrictions": {
      "teams": ["team-name"],
      "users": ["admin-user"]
    }
  }'
```

---

## 🔍 Casos de Uso

### Caso 1: Permitir hotfixes de emergencia

```bash
# Crear rama protegida pero con menos restricciones
gh api repos/{owner}/{repo}/branches/hotfix/protection \
  -X PUT \
  -d '{
    "required_status_checks": {
      "strict": false,
      "contexts": []
    },
    "enforce_admins": false
  }'
```

### Caso 2: Requiere aprobación de owner de código

```bash
# Require code owners approval
gh api repos/{owner}/{repo}/branches/main/protection \
  -X PUT \
  -d '{
    "required_pull_request_reviews": {
      "dismiss_stale_reviews": false,
      "require_code_owner_reviews": true
    }
  }'
```

---

## 🛠️ Troubleshooting

### Error: "Status check not found"

**Causa:** El nombre del check en la API no coincide con el workflow.

**Solución:**
```bash
# Ver nombres exactos de checks disponibles
gh api repos/{owner}/{repo}/commits/{branch}/check-runs

# O ver runs recientes
gh run list -R {owner}/{repo} --limit 10
```

### Error: "enforce_admins already set"

**Solución:** Usar `-X PUT` en lugar de `-X POST`

### No aparece el botón "Merge"

**Causa:** Checks aún no están listos.

**Solución:**
1. Esperar a que terminen los workflows
2. O hacer push a rama protegida para forzar ejecución

---

## 📚 Referencias

- [GitHub Branch Protection API](https://docs.github.com/en/rest/branches/branch-protection)
- [GitHub CLI Branch Protection](https://cli.github.com/manual/gh_api)
- [Required Status Checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#required-status-checks)

---

**Para tu proyecto Monitorias:**

```bash
# Tu configuración específica:
gh api repos/MxrixLu/Monitorias/branches/main/protection \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  -d '{
    "required_status_checks": {
      "strict": true,
      "contexts": [
        "Security Audit & Build"
      ]
    },
    "enforce_admins": true,
    "require_code_reviews": true,
    "required_approving_review_count": 1,
    "require_conversation_resolution": true
  }'
```

Ejecutar después de hacer commit de los workflows.
