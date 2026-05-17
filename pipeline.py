"""
YouTube AI Reel Automation Pipeline - 100% FREE Resources
=========================================================
Free tools used:
  - Script: Claude API (free tier) or Ollama (local, fully free)
  - Voiceover: Coqui TTS (local, free) or gTTS (Google TTS, free)
  - Visuals: Pexels API (free tier - 200 req/hr)
  - Subtitles: OpenAI Whisper (local, free)
  - Video edit: FFmpeg (free, open source)
  - Thumbnail: Pillow + freefont (free)
  - Upload: YouTube Data API v3 (free quota: 10,000 units/day)
  - Scheduler: GitHub Actions cron (free) or system cron
  - Orchestration: This script + python-dotenv

Setup:
  pip install requests gtts pillow openai-whisper yt-dlp python-dotenv anthropic
  Install FFmpeg: https://ffmpeg.org/download.html
"""

import os, json, time, subprocess, textwrap, re
from pathlib import Path
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

# ─────────────────────────────────────────────
# CONFIG  (edit these for your channel)
# ─────────────────────────────────────────────
CHANNEL_NICHE   = "AI and technology tips"       # Your niche
LANGUAGE        = "en"                            # Language code
POSTS_PER_DAY   = 1
PUBLISH_HOUR    = 18                              # 6 PM local time
OUTPUT_DIR      = Path("output")
ASSETS_DIR      = Path("assets")                 # Put logo.png here
FONT_PATH       = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# API Keys (put in .env file)
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")   # free tier available
PEXELS_API_KEY    = os.getenv("PEXELS_API_KEY", "")      # free at pexels.com/api
YOUTUBE_CLIENT_SECRETS = os.getenv("YOUTUBE_CLIENT_SECRETS", "client_secrets.json")

OUTPUT_DIR.mkdir(exist_ok=True)
ASSETS_DIR.mkdir(exist_ok=True)


# ═══════════════════════════════════════════════════════
# STAGE 1 — SCRIPT GENERATION (Claude free tier)
# ═══════════════════════════════════════════════════════

def generate_script(topic: str = None) -> dict:
    """Generate a 60-second YouTube Shorts script using Claude API (free tier)."""
    import anthropic

    if not topic:
        topic = get_trending_topic()

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    prompt = f"""You are a viral YouTube Shorts scriptwriter for a channel about {CHANNEL_NICHE}.

Write a punchy 60-second script for topic: "{topic}"

Return ONLY valid JSON with this structure:
{{
  "title": "Clickable title under 60 chars",
  "description": "2-3 sentence description with keywords",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "search_query": "3-word Pexels search term for B-roll",
  "script": "Full narration script, conversational, 130-160 words max",
  "hook": "First 3 seconds hook sentence only"
}}"""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",   # cheapest, fastest
        max_tokens=800,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = response.content[0].text.strip()
    # Strip markdown fences if present
    raw = re.sub(r"```json|```", "", raw).strip()
    data = json.loads(raw)
    print(f"[Stage 1] Script ready: {data['title']}")
    return data


def get_trending_topic() -> str:
    """Pick a topic from a rotating seed list (no API needed)."""
    import random
    topics = [
        "5 AI tools that replace paid software",
        "How to automate your morning routine with AI",
        "ChatGPT prompts that 99% of people don't know",
        "Free AI tools better than paid ones in 2025",
        "How to use Claude AI to make money online",
        "Python automation tricks that save hours",
        "Best free alternatives to expensive software",
        "How AI is changing content creation in 2025",
    ]
    return random.choice(topics)


# ═══════════════════════════════════════════════════════
# STAGE 2 — VOICEOVER (gTTS - 100% free, no API key)
# ═══════════════════════════════════════════════════════

def generate_voiceover(script_text: str, output_path: Path) -> Path:
    """Convert script to MP3 using Google Text-to-Speech (free, no key needed)."""
    from gtts import gTTS

    tts = gTTS(text=script_text, lang=LANGUAGE, slow=False)
    mp3_path = output_path / "voiceover.mp3"
    tts.save(str(mp3_path))

    # Speed up slightly (1.15x) using FFmpeg for more energetic delivery
    sped_path = output_path / "voiceover_fast.mp3"
    subprocess.run([
        "ffmpeg", "-y", "-i", str(mp3_path),
        "-filter:a", "atempo=1.15",
        str(sped_path)
    ], capture_output=True)

    print(f"[Stage 2] Voiceover saved: {sped_path}")
    return sped_path


def get_audio_duration(audio_path: Path) -> float:
    """Get duration of audio file in seconds using FFprobe."""
    result = subprocess.run([
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_streams", str(audio_path)
    ], capture_output=True, text=True)
    info = json.loads(result.stdout)
    return float(info["streams"][0]["duration"])


# ═══════════════════════════════════════════════════════
# STAGE 3 — VISUALS (Pexels API - free tier)
# ═══════════════════════════════════════════════════════

def fetch_broll_clips(query: str, output_path: Path, count: int = 6) -> list[Path]:
    """Download free stock video clips from Pexels API."""
    import requests

    headers = {"Authorization": PEXELS_API_KEY}
    url = f"https://api.pexels.com/videos/search?query={query}&per_page={count}&orientation=portrait"
    resp = requests.get(url, headers=headers)
    resp.raise_for_status()
    videos = resp.json().get("videos", [])

    paths = []
    for i, vid in enumerate(videos[:count]):
        # Pick the SD file (smaller, faster download, free)
        files = sorted(vid["video_files"], key=lambda x: x.get("width", 0))
        video_url = next(
            (f["link"] for f in files if f.get("width", 0) <= 1080),
            files[0]["link"]
        )
        clip_path = output_path / f"clip_{i:02d}.mp4"
        dl = requests.get(video_url, stream=True, timeout=30)
        with open(clip_path, "wb") as f:
            for chunk in dl.iter_content(chunk_size=8192):
                f.write(chunk)
        paths.append(clip_path)
        print(f"[Stage 3] Downloaded clip {i+1}/{count}: {clip_path.name}")
        time.sleep(0.3)  # Respect rate limit

    return paths


# ═══════════════════════════════════════════════════════
# STAGE 4 — VIDEO EDITING (FFmpeg - free, open source)
# ═══════════════════════════════════════════════════════

def generate_subtitles(audio_path: Path, output_path: Path) -> Path:
    """Generate SRT subtitles from audio using Whisper (local, free)."""
    import whisper

    model = whisper.load_model("base")   # ~150MB, runs on CPU
    result = model.transcribe(str(audio_path))

    srt_path = output_path / "subtitles.srt"
    with open(srt_path, "w", encoding="utf-8") as f:
        for i, seg in enumerate(result["segments"], 1):
            start = format_srt_time(seg["start"])
            end   = format_srt_time(seg["end"])
            text  = seg["text"].strip()
            f.write(f"{i}\n{start} --> {end}\n{text}\n\n")

    print(f"[Stage 4a] Subtitles generated: {srt_path}")
    return srt_path


def format_srt_time(seconds: float) -> str:
    td = timedelta(seconds=seconds)
    total = int(td.total_seconds())
    h, rem = divmod(total, 3600)
    m, s   = divmod(rem, 60)
    ms     = int((td.total_seconds() - total) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def assemble_video(
    clips: list[Path],
    audio_path: Path,
    srt_path: Path,
    output_path: Path,
    duration: float
) -> Path:
    """Assemble final 9:16 video with FFmpeg."""
    # 1. Write concat list for clips
    concat_file = output_path / "concat.txt"
    with open(concat_file, "w") as f:
        # Repeat clips to fill audio duration
        total = 0
        while total < duration + 2:
            for c in clips:
                f.write(f"file '{c.resolve()}'\n")
                total += 5  # approx 5s per clip
                if total > duration + 5:
                    break

    # 2. Concat clips → trim to audio length → scale to 9:16 → burn subtitles → mix audio
    final_path = output_path / "final.mp4"
    filter_complex = (
        "[0:v]"
        "scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,"
        "setsar=1,"
        f"trim=duration={duration},"
        "setpts=PTS-STARTPTS"
        "[vid];"
        f"[vid]subtitles='{srt_path}':"
        "force_style='Fontname=DejaVu Sans Bold,FontSize=18,"
        "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
        "BorderStyle=3,Outline=2,Shadow=1,"
        "Alignment=2,MarginV=60'"
        "[vout]"
    )

    cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", str(concat_file),
        "-i", str(audio_path),
        "-filter_complex", filter_complex,
        "-map", "[vout]",
        "-map", "1:a",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-shortest",
        "-movflags", "+faststart",
        str(final_path)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("[FFmpeg error]", result.stderr[-500:])
        raise RuntimeError("FFmpeg assembly failed")

    print(f"[Stage 4] Video assembled: {final_path}")
    return final_path


# ═══════════════════════════════════════════════════════
# STAGE 5 — THUMBNAIL (Pillow - free, no API)
# ═══════════════════════════════════════════════════════

def create_thumbnail(title: str, clip_path: Path, output_path: Path) -> Path:
    """Extract frame from video + overlay bold title text as thumbnail."""
    from PIL import Image, ImageDraw, ImageFont
    import textwrap as tw

    # Extract frame at 3 seconds from first clip
    frame_path = output_path / "thumb_frame.jpg"
    subprocess.run([
        "ffmpeg", "-y", "-i", str(clip_path),
        "-ss", "3", "-vframes", "1",
        "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720",
        str(frame_path)
    ], capture_output=True)

    img = Image.open(frame_path).convert("RGB")
    draw = ImageDraw.Draw(img)
    W, H = img.size  # 1280x720

    # Dark overlay for readability
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 140))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(img)

    # Try to load font, fallback to default
    try:
        font_big  = ImageFont.truetype(FONT_PATH, 72)
        font_small = ImageFont.truetype(FONT_PATH, 36)
    except Exception:
        font_big  = ImageFont.load_default()
        font_small = font_big

    # Wrap and center title
    lines = tw.wrap(title.upper(), width=18)
    y = H // 2 - (len(lines) * 80) // 2
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font_big)
        tw_ = bbox[2] - bbox[0]
        draw.text(((W - tw_) // 2 + 2, y + 2), line, font=font_big, fill=(0, 0, 0))
        draw.text(((W - tw_) // 2, y), line, font=font_big, fill=(255, 220, 50))
        y += 88

    # Add logo if available
    logo_path = ASSETS_DIR / "logo.png"
    if logo_path.exists():
        logo = Image.open(logo_path).convert("RGBA")
        logo.thumbnail((120, 120))
        img.paste(logo, (W - 140, 20), logo)

    thumb_path = output_path / "thumbnail.jpg"
    img.save(str(thumb_path), "JPEG", quality=92)
    print(f"[Stage 5] Thumbnail created: {thumb_path}")
    return thumb_path


# ═══════════════════════════════════════════════════════
# STAGE 6 — UPLOAD TO YOUTUBE (YouTube Data API v3 - free)
# ═══════════════════════════════════════════════════════

def upload_to_youtube(
    video_path: Path,
    thumbnail_path: Path,
    title: str,
    description: str,
    tags: list[str],
    publish_at: datetime = None
) -> str:
    """Upload video to YouTube with metadata. Returns video ID."""
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    import pickle

    SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
    token_file = Path("token.pickle")

    # Auth (runs browser first time, cached after)
    if token_file.exists():
        with open(token_file, "rb") as f:
            creds = pickle.load(f)
    else:
        flow = InstalledAppFlow.from_client_secrets_file(YOUTUBE_CLIENT_SECRETS, SCOPES)
        creds = flow.run_local_server(port=0)
        with open(token_file, "wb") as f:
            pickle.dump(creds, f)

    youtube = build("youtube", "v3", credentials=creds)

    # Build publish time (ISO 8601 UTC)
    if publish_at is None:
        publish_at = datetime.utcnow() + timedelta(hours=1)
    publish_str = publish_at.strftime("%Y-%m-%dT%H:%M:%S.000Z")

    body = {
        "snippet": {
            "title": title[:100],
            "description": description + "\n\n#Shorts #AI #Tech",
            "tags": tags,
            "categoryId": "28",        # Science & Technology
            "defaultLanguage": LANGUAGE,
        },
        "status": {
            "privacyStatus": "private",    # Change to "public" when ready
            "publishAt": publish_str,
            "selfDeclaredMadeForKids": False,
        }
    }

    media = MediaFileUpload(str(video_path), chunksize=-1, resumable=True)
    request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)

    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            print(f"[Stage 6] Uploading... {int(status.progress() * 100)}%")

    video_id = response["id"]
    print(f"[Stage 6] Uploaded: https://youtu.be/{video_id}")

    # Set thumbnail
    youtube.thumbnails().set(
        videoId=video_id,
        media_body=MediaFileUpload(str(thumbnail_path))
    ).execute()
    print(f"[Stage 6] Thumbnail set.")

    return video_id


# ═══════════════════════════════════════════════════════
# MAIN ORCHESTRATOR
# ═══════════════════════════════════════════════════════

def run_pipeline(topic: str = None):
    """Run the full pipeline end-to-end for one video."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = OUTPUT_DIR / timestamp
    run_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*55}")
    print(f"  YouTube Automation Pipeline  |  {timestamp}")
    print(f"{'='*55}\n")

    # Stage 1: Script
    script_data = generate_script(topic)
    (run_dir / "script.json").write_text(json.dumps(script_data, indent=2))

    # Stage 2: Voiceover
    audio_path = generate_voiceover(script_data["script"], run_dir)
    duration   = get_audio_duration(audio_path)

    # Stage 3: B-roll clips
    clips = fetch_broll_clips(script_data["search_query"], run_dir, count=6)

    # Stage 4a: Subtitles
    srt_path = generate_subtitles(audio_path, run_dir)

    # Stage 4b: Assemble video
    video_path = assemble_video(clips, audio_path, srt_path, run_dir, duration)

    # Stage 5: Thumbnail
    thumb_path = create_thumbnail(script_data["title"], clips[0], run_dir)

    # Stage 6: Upload
    publish_time = datetime.utcnow().replace(hour=PUBLISH_HOUR, minute=0, second=0)
    if publish_time < datetime.utcnow():
        publish_time += timedelta(days=1)

    video_id = upload_to_youtube(
        video_path, thumb_path,
        script_data["title"],
        script_data["description"],
        script_data["tags"],
        publish_at=publish_time
    )

    print(f"\n✅ Done! Video ID: {video_id}")
    print(f"   Scheduled for: {publish_time.strftime('%Y-%m-%d %H:%M UTC')}")
    return video_id


if __name__ == "__main__":
    import sys
    topic = " ".join(sys.argv[1:]) or None
    run_pipeline(topic)
