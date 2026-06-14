# NoOr Node App

NoOr is an Express, EJS, Prisma, and PostgreSQL app with authentication,
check-ins, leaderboard tracking, prayer requests, and Telegram bot linking.

## Requirements

- Node.js 24+
- PostgreSQL, or Docker with Compose
- A Telegram bot token if Telegram features are enabled

## Environment

Do not commit real environment values. Copy an example file and replace every
`change-me-*` placeholder before running the app.

```sh
cp .env.example .env
```

Important variables:

```env
NODE_ENV="development"
PORT="3000"
APP_PORT="3000"

POSTGRES_USER="change-me-db-user"
POSTGRES_PASSWORD="change-me-db-password"
POSTGRES_DB="change-me-db-name"
POSTGRES_PORT="5432"
DATABASE_URL="postgresql://change-me-db-user:change-me-db-password@localhost:5432/change-me-db-name?schema=public"

SESSION_COOKIE_NAME="session"
SESSION_DAYS="7"
APP_TIMEZONE="Europe/Riga"
CHECK_IN_RESET_HOUR="0"

TELEGRAM_BOT_TOKEN=""
APP_URL=""
CORS_ORIGIN=""

PGADMIN_DEFAULT_EMAIL="change-me@example.com"
PGADMIN_DEFAULT_PASSWORD="change-me-pgadmin-password"
```

Production should use `.env.production.example` as the template and must use
strong unique values for database passwords, Telegram token, and any deployment
domain settings.

## Local Development

Install dependencies:

```sh
npm install
```

Apply migrations:

```sh
npx prisma migrate dev
```

Generate Prisma client:

```sh
npx prisma generate
```

Run the app:

```sh
npm run dev
```

## Docker

Create `.env` first. Compose now requires database and pgAdmin credentials to be
provided through environment variables instead of using committed defaults.

Start app and PostgreSQL:

```sh
npm run docker:start
```

Start app, PostgreSQL, and the development pgAdmin override:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Clear only PostgreSQL data:

```sh
npm run docker:db:clear
```

Remove project containers, volumes, local images, and start again:

```sh
npm run docker:reset
```

Start production Compose in detached mode:

```sh
npm run docker:prod:start
```

The production Compose file keeps PostgreSQL inside the Docker network and does
not publish PostgreSQL to the host. In development, `docker-compose.dev.yml`
publishes PostgreSQL only to `127.0.0.1:${POSTGRES_PORT}`.

pgAdmin is development-only. Use the values from your local `.env` file to log
in. Create a pgAdmin server connection with:

```text
Host: postgres
Port: 5432
Database: value of POSTGRES_DB
Username: value of POSTGRES_USER
Password: value of POSTGRES_PASSWORD
```

## DigitalOcean Droplet Setup

For a fresh Ubuntu droplet, clone the repository and run the bootstrap script.
The script installs required server packages, Docker, Docker Compose plugin, and
Git. It also prepares `.env` from `.env.production.example` if `.env` does not
exist.

```sh
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/your-name/your-repo.git /opt/noor
cd /opt/noor
REPO_URL=https://github.com/your-name/your-repo.git sh scripts/digitalocean-install.sh
```

Edit production secrets:

```sh
nano /opt/noor/.env
```

Start the app:

```sh
cd /opt/noor
npm run docker:prod:start
```

If the droplet already has this repo, update and deploy with:

```sh
cd /opt/noor
git pull --ff-only
npm run docker:prod:start
```

One-command install and start is also supported after `.env` is ready:

```sh
REPO_URL=https://github.com/your-name/your-repo.git START_APP=true sh scripts/digitalocean-install.sh
```

The script intentionally refuses to start while `.env` still contains
`change-me` placeholders.

## Backup And Restore

Create a backup:

```sh
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > backup.sql
```

Restore from a backup:

```sh
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backup.sql
```

Stop containers:

```sh
docker compose down
```

Remove the database volume too:

```sh
docker compose down -v
```

## Architecture

- `src/controllers/` handles HTTP requests and responses.
- `src/services/` contains business logic.
- `src/repositories/` is the Prisma data access layer.
- `src/middleware/` contains auth, validation, errors, and view locals.
- `src/validators/` contains request schemas.
- `src/config/` contains environment, security, and path configuration.
- `src/prisma/` contains the reusable Prisma client and connection retry helper.
- `prisma/` contains the Prisma schema and migrations.

## Security Notes

- Real `.env` files are ignored by git.
- Example env files contain placeholders only.
- Passwords are stored as bcrypt hashes.
- Session cookies are HTTP-only.
- The database stores session token hashes, not raw session tokens.
- Telegram connect links use temporary one-time tokens.
- PostgreSQL is not exposed by the production Compose file.

## Useful Endpoints

Auth:

```sh
POST /auth/register
POST /auth/login
POST /auth/logout
GET /auth/me
```

Telegram:

```sh
GET /api/telegram/connect-link
POST /api/telegram/test-notification
```

Check-in and leaderboard:

```sh
GET /api/check-in/status
GET /api/leaderboard
POST /api/leaderboard/increment
POST /api/leaderboard/reset
```
