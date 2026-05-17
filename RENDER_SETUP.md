# Render Deployment Guide — YouTube Automation Pipeline

## What Render will do
Run `pipeline.js` automatically every day at **6:00 AM UTC (11:30 AM IST)**
as a **Cron Job** service. Billed only for the seconds it actually runs (~$0.01/run).

---

## Step 1 — Push your project to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/yt-automation
git push -u origin main
```

> The repo can be **private** — Render supports private repos on all plans.

---

## Step 2 — One-time: get your YouTube token as base64

Before deploying, you need to generate `token.json` once on your local machine
(this is the OAuth token that lets the pipeline upload to YouTube without a browser).

```bash
# Run locally first:
node -e "
const { google } = require('googleapis');
const fs = require('fs');
const readline = require('readline');

const secrets = JSON.parse(fs.readFileSync('client_secrets.json', 'utf8'));
const { client_id, client_secret, redirect_uris } = secrets.installed || secrets.web;
const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

const url = auth.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/youtube.upload']
});
console.log('Visit:', url);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Paste the code: ', async (code) => {
  const { tokens } = await auth.getToken(code);
  fs.writeFileSync('token.json', JSON.stringify(tokens));
  console.log('token.json saved!');
  rl.close();
});
"
```

Then base64-encode it:
```bash
# Linux / WSL
base64 -w 0 token.json

# macOS
base64 token.json
```
Copy the output — you'll paste it as the `YOUTUBE_TOKEN` secret in Step 4.

---

## Step 3 — Create the Cron Job on Render

### Option A — Blueprint (recommended, one click)

1. Go to **https://dashboard.render.com/blueprints**
2. Click **New Blueprint Instance**
3. Connect your GitHub repo
4. Render reads `render.yaml` automatically and creates the cron job
5. Skip to **Step 4** to add secrets

### Option B — Manual (Dashboard UI)

1. Go to **https://dashboard.render.com** → **New +** → **Cron Job**
2. Connect your GitHub repo and branch (`main`)
3. Fill in:

| Field | Value |
|---|---|
| **Name** | `yt-automation` |
| **Runtime** | `Node` |
| **Schedule** | `0 6 * * *` |
| **Build Command** | `chmod +x build.sh && ./build.sh` |
| **Start Command** | `node pipeline.js` |
| **Instance Type** | Starter |

4. Click **Create Cron Job**

---

## Step 4 — Add Environment Variables (Secrets)

In the Render Dashboard → your cron job → **Environment** tab, add:

| Key | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Claude API key (`sk-ant-...`) |
| `PEXELS_API_KEY` | Your Pexels API key |
| `YOUTUBE_CLIENT_SECRETS` | Full JSON contents of `client_secrets.json` |
| `YOUTUBE_TOKEN` | Base64 string from Step 2 |
| `CHANNEL_NICHE` | e.g. `AI and technology tips` |
| `LANGUAGE` | `en` |
| `PUBLISH_HOUR` | `18` (6 PM UTC) |

> ⚠️ For `YOUTUBE_CLIENT_SECRETS`: open `client_secrets.json`, **select all**, copy, paste.

---

## Step 5 — Test a manual run

In the Render Dashboard → your cron job → click **Trigger Run**.

Watch the **Logs** tab — you should see:

```
[Stage 1] Script ready: <title>
[Stage 2] Voiceover saved: ...
[Stage 3] Downloaded clip 1/6 ...
[Stage 4] Video assembled: ...
[Stage 5] Thumbnail created: ...
[Stage 6] Uploading... 100%
[Stage 6] Uploaded: https://youtu.be/XXXXXXX
✅ Done!
```

---

## Schedule reference

| Cron expression | Meaning |
|---|---|
| `0 6 * * *` | Every day at 6:00 AM UTC (default) |
| `0 1 * * *` | Every day at 1:00 AM UTC (6:30 AM IST) |
| `0 18 * * *` | Every day at 6:00 PM UTC |
| `0 6 * * 1-5` | Weekdays only at 6 AM UTC |
| `0 6 * * 1` | Every Monday only |

Edit the schedule in **Dashboard → your cron job → Settings → Schedule**.

---

## Important limits

- Render stops a cron run after **12 hours** (pipeline runs in ~5–10 min, well within limit)
- Only **one run** is active at a time — no duplicate uploads
- Logs are retained for **7 days** on the Starter plan
- Output files (`output/`) are **not persisted** between runs (ephemeral disk) — that's fine, videos are uploaded to YouTube before the run ends

---

## Troubleshooting

**Build fails with `pip: command not found`**
→ Render's Node runtime includes Python. If missing, switch runtime to `Docker` and use the Dockerfile below.

**`ffmpeg: command not found`**
→ FFmpeg is pre-installed on Render's Ubuntu image. If missing: add `apt-get install -y ffmpeg` to `build.sh`.

**YouTube auth fails / token expired**
→ Re-run Step 2 locally, re-encode `token.json`, update the `YOUTUBE_TOKEN` secret.

**Pexels returns 0 clips**
→ Check `PEXELS_API_KEY` is set correctly. Pexels rate limit resets hourly.
