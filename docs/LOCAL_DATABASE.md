# Local Database Setup

This project should be developed against a personal local PostgreSQL database. Do not point local development to the shared AWS RDS production database.

Production and preview environment variables live in Vercel, so local changes to `.env.local` do not affect deployed environments.

## Goal

Each developer gets:

- A private PostgreSQL container on their machine.
- A local `.env.local` file pointing to that database.
- A schema created from `prisma/schema.prisma`.
- Optional seed data for local testing.

## Prerequisites

### macOS with Docker Desktop

Install these once:

```bash
brew install node
brew install --cask docker
```

Enable `pnpm` through Corepack:

```bash
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm --version
```

If `corepack` is not found after installing Node with Homebrew, run it directly:

```bash
/opt/homebrew/bin/corepack enable
/opt/homebrew/bin/corepack prepare pnpm@10.33.4 --activate
```

Then make sure Docker Desktop is open.

### macOS with Colima

If you use Colima instead of Docker Desktop, install the Docker CLI and Colima:

```bash
brew install node
brew install docker docker-compose colima
```

Start Colima before running any Docker commands:

```bash
colima start
docker context use colima
docker ps
```

Then enable `pnpm` through Corepack:

```bash
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm --version
```

If `corepack` is not found after installing Node with Homebrew, run it directly:

```bash
/opt/homebrew/bin/corepack enable
/opt/homebrew/bin/corepack prepare pnpm@10.33.4 --activate
```

### Windows

Recommended setup:

1. Install Docker Desktop for Windows.
2. Enable WSL 2 when Docker asks for it.
3. Install Node.js from `https://nodejs.org/`.
4. Open PowerShell, Windows Terminal, or a WSL terminal.

Enable `pnpm`:

```powershell
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm --version
```

If `corepack` is not found on Windows, close and reopen the terminal after installing Node. If it still does not appear, install `pnpm` directly:

```powershell
npm install -g pnpm@10.33.4
pnpm --version
```

Make sure Docker Desktop is running before continuing.

## First-Time Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start the local database:

   ```bash
   docker compose up -d postgres
   ```

3. Create `.env.local` in the project root:

   ```bash
   DATABASE_URL="postgresql://calico:calico@localhost:5432/calico_local"
   DATABASE_SSL_REJECT_UNAUTHORIZED=false

   JWT_SECRET="local-dev-secret-change-me-local-only"
   JWT_EXPIRATION=7d

   NEXT_PUBLIC_APP_URL=http://localhost:3000
   NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000
   ```

   Add any integration-specific secrets only when you need that feature locally, for example Wompi, Google Calendar, Brevo, or S3.

   If you prefer to reuse an existing `.env` file instead of creating `.env.local`, make a private backup first:

   ```bash
   cp .env .env.remote.backup
   ```

   Then replace only the local development values in `.env`, especially `DATABASE_URL`. Restore the backup only when you intentionally need to point local code at the remote environment.

4. Generate the Prisma client:

   ```bash
   pnpm db:generate
   ```

5. Create/update the local database schema:

   ```bash
   pnpm db:push
   ```

   Use `db:push` for now. The migration history currently cannot bootstrap a fresh database cleanly; see `docs/BACKLOG.md`.

6. Seed local reference data:

   ```bash
   pnpm db:seed
   ```

   Optional: add fake users, tutors, sessions, reviews, payments, and admin data for UI testing:

   ```bash
   pnpm db:seed:test
   ```

   The testing seed creates these local-only accounts:

   ```txt
   admin.test@calico.local         / CalicoTest123!
   student.test@calico.local       / CalicoTest123!
   tutor.test@calico.local         / CalicoTest123!
   pending.tutor.test@calico.local / CalicoTest123!
   ```

   The admin account has `ADMIN` role and is also an approved tutor, so it can be used to test privileged admin screens and tutor flows.

7. Start the app:

   ```bash
   pnpm dev
   ```

8. Open:

   ```txt
   http://localhost:3000
   ```

## Daily Workflow

Start the database:

```bash
docker compose up -d postgres
```

If you are on macOS with Colima, make sure Colima is running first:

```bash
colima start
docker compose up -d postgres
```

Start the app:

```bash
pnpm dev
```

Open Prisma Studio when you want to inspect or edit local data:

```bash
pnpm db:studio
```

Stop the database without deleting data:

```bash
docker compose stop postgres
```

## Reset Your Local Database

This deletes only your local Docker database volume.

```bash
docker compose down -v
docker compose up -d postgres
pnpm db:push
pnpm db:seed
```

## Environment Rules

- Local development uses `.env.local`.
- Vercel deployments use Vercel environment variables.
- Never use the production AWS RDS `DATABASE_URL` in `.env.local`.
- Never commit `.env.local`; `.env*` is already ignored by `.gitignore`.
- If you need shared testing data, export/import a sanitized dump instead of connecting everyone to the same database.

## Troubleshooting

If port `5432` is already in use, either stop the other PostgreSQL service or change the compose port to another local port, for example:

```yaml
ports:
  - "5433:5432"
```

Then use:

```bash
DATABASE_URL="postgresql://calico:calico@localhost:5433/calico_local"
```

If the app still shows old Prisma or Next errors after config changes:

```bash
rm -rf .next
pnpm dev
```

If Prisma cannot connect, check the container:

```bash
docker compose ps
docker compose logs postgres
```
