# Rightsly — Docker deployment (Ubuntu Server 24.04)

Three long-running containers (plus one-shot setup and backup services):

- **web** — nginx serving the built React frontend, proxying `/api/*` to the API
- **api** — Express API server (Node 24, prebuilt bundle)
- **db** — PostgreSQL 16 with a persistent volume

## 1. Prerequisites (once per server)

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc >/dev/null
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu noble stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER   # log out/in afterwards
```

## 2. Configure

Copy the repository to the server (git clone, rsync, etc.), then:

```bash
cd <repo>/deploy
cp .env.example .env
nano .env    # set POSTGRES_PASSWORD, JWT_SECRET (openssl rand -hex 32), APP_BASE_URL
```

## 3. First deployment

```bash
cd <repo>/deploy
docker compose up -d --build
```

That single command starts Postgres, creates/updates the schema (`db-push`),
creates the initial admin account from `.env` if the user table is empty, then starts the API and
web frontend. The `db-push` and `seed` containers run to completion and exit —
seeing them as "Exited (0)" in `docker compose ps -a` is normal.

Only the `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` account from `.env`
is seeded. No Legal, Finance, Sales, or other default accounts are created.
Set `SEED_DEMO_DATA=true` in `.env` before the first `up` if you
want demo data for evaluation.

To wipe and re-seed later: set `SEED_FORCE=true` in `.env`, run
`docker compose up -d` once, then remove it (it deletes ALL existing data).

The app is now at `http://<server>:${WEB_PORT:-8081}`.

Sign in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` values configured in `.env`.

## 4. Updating to a new version

```bash
cd <repo> && git pull
cd deploy
docker compose up -d --build   # rebuilds, applies schema changes, restarts
```

## 5. HTTPS / production domain

Put a TLS-terminating reverse proxy in front of the `web` port — e.g. Caddy:

```bash
sudo apt install -y caddy
# /etc/caddy/Caddyfile
#   rights.example.com {
#       reverse_proxy 127.0.0.1:8081
#   }
sudo systemctl reload caddy
```

Set `APP_BASE_URL=https://rights.example.com` in `.env` and
`docker compose up -d` again. (The API already runs `trust proxy`, and nginx
forwards `X-Forwarded-Proto`.)

Note: the PWA install prompt and the service worker only activate over HTTPS.

## 6. Operations

```bash
docker compose logs -f api          # API logs
docker compose ps                   # status
docker compose restart api          # restart one service
docker exec -it rightsly-db-1 psql -U rightsly rightsly   # SQL console
```

### Automated backups and recovery

The dedicated `backup` service creates a PostgreSQL **custom-format** dump and
a compressed archive of the uploaded-object volume. Each dated backup directory
contains `database.dump`, `objectdata.tar.gz`, `SHA256SUMS`, and `MANIFEST.txt`.
It uses a concurrency lock and writes to a temporary directory before an atomic
rename. Completed backups older than 30 days are removed (override with
`BACKUP_RETENTION_DAYS` in `.env`).

Choose a host-owned backup location before deployment; it is bind-mounted into
the one-shot backup container and must be protected like production data:

```bash
mkdir -p /srv/rightsly-backups
chmod 700 /srv/rightsly-backups
# deploy/.env
BACKUP_DIR=/srv/rightsly-backups
BACKUP_RETENTION_DAYS=30
```

Install this host crontab entry to run daily at **2:00 AM** (replace the path
with the absolute checkout path). Docker Compose reads credentials from `.env`;
the command does not put them in cron arguments or output.

```cron
0 2 * * * cd /opt/rightsly/deploy && /usr/bin/docker compose run --rm backup >> /var/log/rightsly-backup.log 2>&1
```

An operator may run the same `docker compose run --rm backup` command manually.
Do not use `docker compose up` for this one-shot service.

**Safe restore procedure (maintenance window required):**

1. Stop application writers: `docker compose stop api web`. Do not delete the
   existing database or object volume until the backup checksum is verified.
2. Verify the selected backup: `cd /srv/rightsly-backups/rightsly-YYYY-MM-DD &&
   sha256sum -c SHA256SUMS`. Abort on any failure.
3. Create a fresh, empty target database/volume or preserve the current volumes
   as a rollback point. Never restore over the only copy of production data.
4. Restore the database from a PostgreSQL client/container compatible with
   PostgreSQL 16:
   `pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error --dbname="$PGDATABASE" database.dump`.
   Configure the target with protected `PGHOST`, `PGDATABASE`, `PGUSER`, and
   `PGPASSWORD` environment variables (or a protected `.pgpass` file), never
   with a password command-line argument or shell history.
5. Extract `objectdata.tar.gz` into the configured `objectdata` volume at
   `/var/lib/rightsly/objects`, preserving paths and ownership appropriate for
   the API's `app` user. Do not expose this volume through nginx.
6. Start `api` and `web`, validate a representative attachment and application
   login, then retain the pre-restore volumes until validation is complete.

The backup is for operational disaster recovery; use the authorized in-app
portable export for data exchange. Full Admin exports include every application
table. Content Admin exports exclude the restricted Users and Audit Log datasets.

## Notes

- Authentik SSO and SendGrid email are optional; they stay dormant while their
  env vars are blank. To enable SSO, set the three `AUTHENTIK_*` vars and add
  `${APP_BASE_URL}/api/auth/sso/callback` as the redirect URI in Authentik.
- In Docker, uploads are stored in the persistent `rightsly_objectdata` volume
  at `/var/lib/rightsly/objects` in the API container. `LOCAL_OBJECT_STORAGE_DIR`
  selects this filesystem fallback and `JWT_SECRET` (or `SESSION_SECRET`) is
  required to HMAC its short-lived, upload-only URLs. Back up this volume along
  with `rightsly_pgdata`; never expose or mount its files through the web
  server. Without `LOCAL_OBJECT_STORAGE_DIR`, development continues to use
  Replit App Storage and its existing `PRIVATE_OBJECT_DIR` configuration.
  Keep `LOCAL_OBJECT_STORAGE_DIR` set to the default unless changing the API
  container mount target in `docker-compose.yml` as well.
- The frontend is built with `BASE_PATH=/` (a Docker build arg) — it must be
  served at the domain root, which the nginx config does.
