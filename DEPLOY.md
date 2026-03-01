# DragonSlayer — Railway Deployment Guide

## Architecture
Two Railway services in one project:
1. **Frontend** — Next.js (this repo root) → https://dragonslayer-production.up.railway.app
2. **Backend** — FastAPI + PostgreSQL (`/backend` folder)

---

## 1. PostgreSQL

In Railway → New → Database → PostgreSQL.
Copy the `DATABASE_URL` — you'll need it for the backend service.

---

## 2. Backend Service

In Railway → New Service → GitHub Repo → select **DragonSalyer**, set **Root Directory** to `/backend`.

**Environment Variables:**
```
DATABASE_URL       = (from Railway PostgreSQL)
FRONTEND_URL       = https://<your-frontend>.up.railway.app
ADMIN_TOKEN        = <long random secret — generate with: openssl rand -hex 32>
TELEGRAM_BOT_TOKEN = (from @BotFather)
PORT               = 8000
```

Railway auto-detects `railway.json` and runs:
```
uvicorn main:app --host 0.0.0.0 --port $PORT
```

Tables are created automatically on first boot.

---

## 3. Frontend Service

In Railway → New Service → GitHub Repo → select **DragonSalyer**, leave Root Directory empty (repo root).

**Environment Variables:**
```
NEXT_PUBLIC_API_URL = https://<your-backend>.up.railway.app
PORT                = 3000
```

---

## 4. Telegram Bot

In @BotFather:
1. `/newbot` → name it **DragonSlayer** → get token
2. `/setmenubutton` → set URL to `https://<frontend>.up.railway.app/twa`
3. Set `TELEGRAM_BOT_TOKEN` on the backend service

To register `/dragon` command in your existing XrpnomicsBot:
```python
from backend.bot.dragonslayer_handler import DragonSlayerTWAHandler

dragon_handler = DragonSlayerTWAHandler()
application.add_handlers(dragon_handler.get_handlers())
```

Update `TWA_BASE_URL` in `backend/bot/dragonslayer_handler.py` to your deployed frontend URL.

---

## 5. Embed Whitelist (Admin)

Add a domain to the embed whitelist:
```bash
curl -X POST https://<backend>.up.railway.app/api/admin/embed/origins \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"origin": "https://yourwebsite.com", "label": "Main site"}'
```

List origins:
```bash
curl https://<backend>.up.railway.app/api/admin/embed/origins \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

Disable an origin:
```bash
curl -X PATCH "https://<backend>.up.railway.app/api/admin/embed/origins/1?enabled=false" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

---

## 6. Embed Snippet

For any whitelisted site, add this `<iframe>`:
```html
<iframe
  src="https://<frontend>.up.railway.app/embed"
  width="430"
  height="780"
  frameborder="0"
  allow="vibrate"
  style="border-radius: 16px; box-shadow: 0 8px 40px rgba(0,0,0,0.4);"
></iframe>
```

To auto-connect a wallet on load:
```html
<iframe src="https://<frontend>.up.railway.app/embed?wallet=rYourWalletAddress" ...></iframe>
```

---

## 7. TWA Entry Point

The game loads at `/twa` for Telegram. The route auto-calls:
- `POST /api/auth/twa` to register/identify the Telegram user
- `GET /api/save/:player_id` to load the server-side save
- `POST /api/save/:player_id` every 30 seconds to sync progress

---

## Local Development

```bash
# Frontend
cp .env.local.example .env.local
# Edit NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev

# Backend
cd backend
cp .env.example .env
# Edit DATABASE_URL, ADMIN_TOKEN
pip install -r requirements.txt
python main.py
```
