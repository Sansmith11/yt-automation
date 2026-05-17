# YouTube AI Automation Pipeline — Complete Setup Guide
## 100% Free Resources Only

---

## What you'll get
- Daily YouTube Shorts posted automatically
- AI-written scripts (Claude Haiku — cheapest tier)
- AI voiceover (Google TTS — completely free)
- Free stock B-roll (Pexels API — 20k req/month free)
- Auto-generated subtitles (Whisper — runs locally, free)
- Thumbnail auto-created (Pillow — free Python library)
- Auto-uploaded + scheduled (YouTube API — free quota)
- Daily trigger (GitHub Actions cron — free tier)

---

## Step 1 — Install system tools

### FFmpeg (video editing engine)
```bash
# Ubuntu / Debian / WSL
sudo apt update && sudo apt install -y ffmpeg

# macOS
brew install ffmpeg

# Windows (PowerShell as Admin)
winget install ffmpeg
```

Verify: `ffmpeg -version`

### Python 3.10+
```bash
python --version   # Should be 3.10 or higher
```

---

## Step 2 — Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/yt-automation
cd yt-automation
pip install -r requirements.txt
cp .env.example .env
```

---

## Step 3 — Get API Keys (all free)

### A) Claude API Key (Anthropic)
1. Go to https://console.anthropic.com
2. Sign up → API Keys → Create Key
3. Free $5 credit on signup (~500 videos with Haiku model)
4. Paste into `.env` as `ANTHROPIC_API_KEY`

### B) Pexels API Key
1. Go to https://www.pexels.com/api/
2. Sign up → "Your API key" shown on dashboard
3. Free: 200 requests/hour, 20,000/month
4. Paste into `.env` as `PEXELS_API_KEY`

### C) YouTube Data API v3
1. Go to https://console.cloud.google.com
2. Create project → Enable APIs → Search "YouTube Data API v3" → Enable
3. Credentials → Create Credentials → OAuth 2.0 Client ID
4. Application type: Desktop App → Download JSON
5. Rename to `client_secrets.json`, put in project root
6. Free quota: 10,000 units/day (1 upload = ~1600 units → ~6 uploads/day free)

---

## Step 4 — First-time YouTube OAuth

Run once to authenticate with your YouTube channel:

```bash
python -c "
from google_auth_oauthlib.flow import InstalledAppFlow
import pickle
flow = InstalledAppFlow.from_client_secrets_file(
    'client_secrets.json',
    ['https://www.googleapis.com/auth/youtube.upload']
)
creds = flow.run_local_server(port=0)
with open('token.pickle', 'wb') as f:
    pickle.dump(creds, f)
print('Auth complete! token.pickle saved.')
"
```

This opens a browser, log in with your YouTube channel account. After first auth, `token.pickle` is reused automatically.

---

## Step 5 — Add logo (optional)

Put your channel logo at `assets/logo.png` (PNG with transparency, ~200x200px).
It will be placed in the top-right corner of every thumbnail.

---

## Step 6 — Test run

```bash
# With auto-generated topic
python pipeline.py

# With custom topic
python pipeline.py "5 free AI tools every creator needs"
```

Watch the console output for each stage. The final video appears in `output/TIMESTAMP/final.mp4`.

First run downloads Whisper model (~150MB) — takes a minute.

---

## Step 7 — Set up daily automation (GitHub Actions)

1. Push the project to a GitHub repo (can be private)
2. Go to Repo → Settings → Secrets and variables → Actions
3. Add these secrets:

| Secret name | Value |
|-------------|-------|
| `ANTHROPIC_API_KEY` | Your Claude API key |
| `PEXELS_API_KEY` | Your Pexels API key |
| `YOUTUBE_CLIENT_SECRETS` | Contents of client_secrets.json |
| `YOUTUBE_TOKEN` | Base64 of token.pickle (see below) |

To encode token.pickle:
```bash
base64 -w 0 token.pickle   # Linux/WSL
base64 token.pickle         # macOS
```
Copy the output as the `YOUTUBE_TOKEN` secret.

4. Push `.github/workflows/daily_post.yml` to repo
5. Actions tab → Enable workflows → Done!

Every day at 6 AM UTC it runs automatically.

---

## Step 8 — Customise your niche

Edit `pipeline.py` top section:
```python
CHANNEL_NICHE = "personal finance tips for millennials"   # your niche
LANGUAGE      = "en"       # hi = Hindi, ta = Tamil, etc.
PUBLISH_HOUR  = 18         # 6 PM UTC (adjust for your audience)
```

Add your own topic seeds in `get_trending_topic()` to match your niche.

---

## Cost summary

| Tool | Cost |
|------|------|
| Claude Haiku API | ~$0.003/script after free credit |
| gTTS (Google TTS) | Free, no key needed |
| Pexels API | Free (20k req/month) |
| Whisper (local) | Free, runs on your CPU |
| FFmpeg | Free, open source |
| Pillow thumbnails | Free, Python library |
| YouTube Data API | Free (10k units/day) |
| GitHub Actions | Free (2000 min/month) |
| **Total for 30 videos** | **~$0 (using free credits)** |

---

## Troubleshooting

**FFmpeg not found**: Ensure FFmpeg is in your PATH. Run `which ffmpeg`.

**Whisper slow**: Use `model = whisper.load_model("tiny")` for faster (less accurate) subtitles.

**YouTube quota exceeded**: Reduce to every other day, or apply for quota increase in Google Cloud Console (free).

**gTTS sounds robotic**: Swap to `pyttsx3` for offline TTS or use `edge-tts` (Microsoft Edge TTS, free):
```bash
pip install edge-tts
edge-tts --voice en-US-GuyNeural --text "Hello" --write-media output.mp3
```

**Pexels clips unrelated**: Edit the `search_query` in the Claude prompt to be more specific.
