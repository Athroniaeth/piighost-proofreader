# Deploy on Coolify

The repo is set up so Coolify can deploy the whole stack from `compose.yaml` with no per-environment file edits.

## 1. Create the application

In Coolify, add a new resource:

- **Resource type**: Docker Compose
- **Git repository**: this repo's URL
- **Branch**: `main` (or whichever you ship from)
- **Build pack**: Docker Compose
- **Compose file**: `compose.yaml` (the default)

Coolify reads `include: [compose.infra.yml]` and brings up all four services: `piighost-api`, `redis`, `backend`, `frontend`.

## 2. Set the environment variables

In the Coolify dashboard for this application, add:

| Variable | Required | Notes |
|---|---|---|
| `LITELLM_MODEL` | yes | e.g. `gpt-4o-mini`, `openai/gpt-4.5-turbo`, etc. |
| `LITELLM_API_KEY` | yes | API key for the LiteLLM provider |
| `LITELLM_API_BASE` | yes | Endpoint base URL (LiteLLM proxy / OpenAI / Anthropic / etc.) |
| `PIIGHOST_API_KEY` | optional | If set, piighost-api enforces it on incoming requests |

The compose file references them via `${VAR}`, Coolify injects them at deploy time. `PIIGHOST_API_URL` is hardcoded to `http://piighost-api:8000` for the backend (docker network), so you do not set it here.

## 3. Public exposure

`compose.yaml` declares `SERVICE_FQDN_FRONTEND=/` on the frontend service. Coolify reads it and provisions a Traefik FQDN routing `/` to the frontend container's port 80. No further configuration needed — the auto-generated URL appears in the Coolify dashboard after the first deploy. You can override it with your own domain in the same dashboard.

The other three services (`backend`, `piighost-api`, `redis`) have no `SERVICE_FQDN_*`, so they stay internal to the Coolify-managed docker network. `nginx.conf` reverse-proxies `/api/` from the frontend container to `backend:8001`, which is reachable internally.

## 4. Volumes

Coolify persists the `redis-data` volume between deploys, so piighost-api's cache survives restarts. No other state is stored.

## 5. Healthchecks

`piighost-api` and `redis` already have healthchecks defined; Coolify uses them to gate deployment success. The frontend and backend boot fast enough that they don't need explicit checks — Coolify falls back to "container is running" status.

## 6. Trigger a deploy

Push to the configured branch, or click "Deploy" in the Coolify dashboard. Build time is around 3-5 minutes on a small VM (the bigger image is `piighost-api` from `ghcr.io` — pulled, not built).

## 7. After deploy

- Health check: `https://<your-fqdn>/api/health` should return `{"status":"ok"}`
- Upload a PDF on the public URL to confirm the full pipeline works
- Optional: enable Coolify's auto-deploy on push so each commit ships automatically

## Streamlit legacy UI

`docker compose --profile legacy up streamlit` is local-only. Coolify ignores `profiles:` by default, so the Streamlit service is never deployed remotely.

## Troubleshooting

- **Frontend can't reach backend**: confirm the nginx container can resolve `backend` (the docker network is intact). Most often a CORS issue is actually misrouted `/api/` due to a stale build — redeploy.
- **piighost-api crash on boot**: `pipeline.py` import error. Make sure the file at the repo root matches the piighost API version. Tail the container logs in Coolify.
- **LLM call fails**: check `LITELLM_API_BASE` is reachable from inside the Coolify network (Cloudflare/firewall blocking is common). Backend logs surface the error in the `error` SSE event.
