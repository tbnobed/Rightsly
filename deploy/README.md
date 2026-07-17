# Rightsli — Docker deployment (Ubuntu Server 24.04)

Three containers:

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
seeds initial users if the database is empty (`seed`), then starts the API and
web frontend. The `db-push` and `seed` containers run to completion and exit —
seeing them as "Exited (0)" in `docker compose ps -a` is normal.

To wipe and re-seed demo data later: set `SEED_FORCE=true` in `.env`, run
`docker compose up -d` once, then remove it (it deletes all existing data).

The app is now at `http://<server>:${WEB_PORT:-8081}`.

Default seeded logins: `admin@tbn.org / Admin1234!` (also `legal@`, `finance@`,
`sales@` — change these immediately in production).

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
docker exec -it rightsli-db-1 psql -U rightsli rightsli   # SQL console
```

**Backups** — the database lives in the `rightsli_pgdata` volume:

```bash
docker exec rightsli-db-1 pg_dump -U rightsli rightsli | gzip > backup-$(date +%F).sql.gz
```

## Notes

- Authentik SSO and SendGrid email are optional; they stay dormant while their
  env vars are blank. To enable SSO, set the three `AUTHENTIK_*` vars and add
  `${APP_BASE_URL}/api/auth/sso/callback` as the redirect URI in Authentik.
- File uploads use Replit object storage in the cloud environment; on a
  self-hosted server that feature requires alternative storage configuration.
- The frontend is built with `BASE_PATH=/` (a Docker build arg) — it must be
  served at the domain root, which the nginx config does.
