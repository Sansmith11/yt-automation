# Vercel Deployment Guide — YouTube Automation Pipeline

## How Vercel works differently from Render

| | Render | Vercel |
|---|---|---|
| Type | Long-running container | Serverless functions |
| Cron trigger | Shell script runs directly | HTTP GET → your API route |
| FFmpeg / Whisper | ✅ Pre-installed | ❌ Not available |
| Max run time | 12 hours | 300 seconds (Pro) |
| Free cron runs | Unlimited (billed/second) | 1x per day (Hobby) |

Because Vercel is **serverless**, heavy binaries (FFmpeg, Whisper) can't run there.
The Vercel version uses **cloud APIs** instead — all free tier.

---

## Free APIs needed (Vercel version only)

| Stage | Local/Render tool | Vercel replacement | Free tier |
|---|---|---|---|
| Voiceover | edge-tts (local) | **ElevenLabs** | 10,000 chars/month |
| Video edit | FFmpeg (local) | **Shotstack** | 3 min rendered/month |
| Subtitles | Whisper (local) | *(handled by Shotstack)* | — |
| Thumbnail | Pillow (local) | **Cloudinary** | 25 transforms/month |

### Get your free API keys

**ElevenLabs** (voiceover)
1. Go to https://elevenlabs.io → Sign up free
2. Profile → API Keys → Copy key
3. Note your Voice ID from the Voices page (or use default `21m00Tcm4TlvDq8ikWAM`)

**Shotstack** (video assembly)
1. Go to https://shotstack.io → Sign up free (no credit card)
2. Dashboard → API Keys → copy the **sandbox** key (starts with `t`)
3. Free sandbox: unlimited renders at low resolution with watermark
4. Free production: 3 min/month rendered video (no watermark)

**Cloudinary** (thumbnail)
1. Go to https://cloudinary.com → Sign up free
2. Dashboard shows your **Cloud Name**, **API Key**, **API Secret**
3. Free: 25 GB storage, 25 transformations/month

---

## Step 1 — Push project to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/yt-automation
git push -u origin main
```

---

## Step 2 — Get YouTube token (one-time, run locally)

```bash
node -e "
import('@anthropic-ai/sdk');
import { google } from 'googleapis';
import fs from 'fs';
import readline from 'readline';

const secrets = JSON.parse(fs.readFileSync('client_secrets.json', 'utf8'));
const { client_id, client_secret, redirect_uris } = secrets.installed || secrets.web;
const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
const url = auth.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/youtube.upload'] });
console.log('Visit:', url);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Paste the code: ', async code => {
  const { tokens } = await auth.getToken(code);
  const b64 = Buffer.from(JSON.stringify(tokens)).toString('base64');
  console.log('YOUTUBE_TOKEN (base64):', b64);
  rl.close();
});
"
```

Copy the printed base64 string — paste it as the `YOUTUBE_TOKEN` env var in Step 4.

---

## Step 3 — Deploy to Vercel

### Option A — Vercel Dashboard (recommended)

1. Go to https://vercel.com → **Add New Project**
2. Import your GitHub repo
3. Framework preset: **Other**
4. Leave build settings empty (Vercel auto-detects `vercel.json`)
5. Click **Deploy**

### Option B — Vercel CLI

```bash
npm install -g vercel
vercel login
vercel --prod
```

---

## Step 4 — Add Environment Variables

In **Vercel Dashboard → your project → Settings → Environment Variables**, add:

| Variable | Value | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | ✅ |
| `PEXELS_API_KEY` | your Pexels key | ✅ |
| `ELEVENLABS_API_KEY` | your ElevenLabs key | ✅ |
| `SHOTSTACK_API_KEY` | your Shotstack key | ✅ |
| `CLOUDINARY_CLOUD_NAME` | e.g. `dxxxxxx` | ✅ |
| `CLOUDINARY_API_KEY` | from Cloudinary dashboard | ✅ |
| `CLOUDINARY_API_SECRET` | from Cloudinary dashboard | ✅ |
| `YOUTUBE_CLIENT_SECRETS` | full JSON of `client_secrets.json` | ✅ |
| `YOUTUBE_TOKEN` | base64 string from Step 2 | ✅ |
| `CRON_SECRET` | any random string (e.g. `myS3cr3t`) | ✅ |
| `CHANNEL_NICHE` | e.g. `AI and technology tips` | optional |
| `LANGUAGE` | `en` | optional |
| `PUBLISH_HOUR` | `18` | optional |
| `ELEVENLABS_VOICE_ID` | voice ID from ElevenLabs | optional |

After adding variables, **redeploy** for them to take effect:
```bash
vercel --prod
```

---

## Step 5 — Check your cron job

1. Vercel Dashboard → your project → **Settings → Cron Jobs**
2. You should see `/api/cron` scheduled at `0 6 * * *`
3. Click **Run** to trigger it manually
4. Check **Logs** → **Functions** tab for output

---

## Step 6 — Test locally

```bash
# Install Vercel CLI
npm install -g vercel

# Pull env vars from Vercel to local .env
vercel env pull .env.local

# Start local dev server
vercel dev

# In another terminal, trigger the cron manually:
curl -H "x-cron-secret: myS3cr3t" http://localhost:3000/api/cron
```

---

## Hobby vs Pro plan limits

| Limit | Hobby (free) | Pro ($20/month) |
|---|---|---|
| Cron frequency | Once per day max | Any frequency |
| Max function duration | 60 seconds | 300 seconds |
| Cron timing precision | ±59 minutes | ±1 minute |
| Runtime logs retention | 1 hour | 1 day |

> ⚠️ **Important**: The pipeline takes ~3–5 minutes to run (Shotstack render).  
> You **need Pro plan** (`maxDuration: 300`) for the function to not time out.  
> On Hobby, the function times out at 60s — the Shotstack render continues in background but the response fails.

**Workaround for Hobby**: Split into two functions:
1. `/api/cron` — submits the job, returns render ID (fast, < 5s)
2. `/api/check-render?id=XXX` — polls Shotstack and uploads when done (triggered by a second cron or webhook)

---

## Troubleshooting

**Cron not running**
→ Check Vercel Dashboard → Settings → Cron Jobs — must show your route.
→ Redeploy after any `vercel.json` change.

**Function timeout (504)**
→ You're on Hobby plan. Upgrade to Pro or use the two-function split above.

**ElevenLabs quota exceeded**
→ Use edge-tts via a small proxy server, or switch to Google Cloud TTS (free 1M chars/month with API key).

**Shotstack watermark on video**
→ Using sandbox key. Switch to production key for 3 free unwatermarked minutes/month.

**YouTube token expired**
→ Re-run Step 2 locally, update `YOUTUBE_TOKEN` env var in Vercel, redeploy.
