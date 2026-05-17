/**
 * YouTube AI Reel Automation Pipeline - Node.js Version
 * ======================================================
 * Free tools used:
 *   - Script:     Claude API (Haiku model - cheapest)
 *   - Voiceover:  Google TTS via gtts-node or edge-tts CLI
 *   - Visuals:    Pexels API (free tier - 200 req/hr)
 *   - Subtitles:  Whisper via whisper-node (local, free)
 *   - Video edit: FFmpeg (free, open source) via fluent-ffmpeg
 *   - Thumbnail:  Sharp + Canvas (free)
 *   - Upload:     YouTube Data API v3 (free quota)
 *   - Scheduler:  GitHub Actions cron (free) or node-cron
 *
 * Setup:
 *   npm install
 *   cp .env.example .env   # fill in your API keys
 *   node pipeline.js
 */

import Anthropic from "@anthropic-ai/sdk";
import fetch from "node-fetch";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { execSync, spawn } from "child_process";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import sharp from "sharp";
import { createCanvas, loadImage, registerFont } from "canvas";
import { google } from "googleapis";
import readline from "readline";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────
// CONFIG  (edit these for your channel)
// ─────────────────────────────────────────────
const CHANNEL_NICHE = process.env.CHANNEL_NICHE || "AI and technology tips"; // Your niche
const LANGUAGE = process.env.LANGUAGE || "en";
const POSTS_PER_DAY = 1;
const PUBLISH_HOUR = parseInt(process.env.PUBLISH_HOUR || "18", 10);
const OUTPUT_DIR = path.join(__dirname, "output");
const ASSETS_DIR = path.join(__dirname, "assets");
const FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

// API Keys (from .env)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || "";
const YOUTUBE_CLIENT_SECRETS =
  process.env.YOUTUBE_CLIENT_SECRETS || "client_secrets.json";

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(ASSETS_DIR, { recursive: true });

// ═══════════════════════════════════════════════════════
// STAGE 1 — SCRIPT GENERATION (Claude Haiku - cheapest)
// ═══════════════════════════════════════════════════════

async function generateScript(topic = null) {
  if (!topic) topic = getTrendingTopic();

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const prompt = `You are a viral YouTube Shorts scriptwriter for a channel about ${CHANNEL_NICHE}.

Write a punchy 60-second script for topic: "${topic}"

Return ONLY valid JSON with this structure:
{
  "title": "Clickable title under 60 chars",
  "description": "2-3 sentence description with keywords",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "search_query": "3-word Pexels search term for B-roll",
  "script": "Full narration script, conversational, 130-160 words max",
  "hook": "First 3 seconds hook sentence only"
}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  let raw = response.content[0].text.trim();
  // Strip markdown fences if present
  raw = raw.replace(/```json|```/g, "").trim();
  const data = JSON.parse(raw);
  console.log(`[Stage 1] Script ready: ${data.title}`);
  return data;
}

function getTrendingTopic() {
  const topics = [
    "5 AI tools that replace paid software",
    "How to automate your morning routine with AI",
    "ChatGPT prompts that 99% of people don't know",
    "Free AI tools better than paid ones in 2025",
    "How to use Claude AI to make money online",
    "Python automation tricks that save hours",
    "Best free alternatives to expensive software",
    "How AI is changing content creation in 2025",
  ];
  return topics[Math.floor(Math.random() * topics.length)];
}

// ═══════════════════════════════════════════════════════
// STAGE 2 — VOICEOVER (edge-tts CLI - 100% free)
// ═══════════════════════════════════════════════════════

async function generateVoiceover(scriptText, outputDir) {
  const mp3Path = path.join(outputDir, "voiceover.mp3");
  const fastPath = path.join(outputDir, "voiceover_fast.mp3");

  // Use edge-tts (pip install edge-tts) — Microsoft Neural TTS, free
  // Falls back to gtts-cli if not available
  try {
    execSync(
      `edge-tts --voice en-US-GuyNeural --text "${scriptText.replace(/"/g, '\\"')}" --write-media "${mp3Path}"`,
      { stdio: "pipe" }
    );
  } catch {
    // Fallback: gTTS via Python one-liner
    execSync(
      `python3 -c "from gtts import gTTS; gTTS(text=open('/dev/stdin').read(), lang='${LANGUAGE}').save('${mp3Path}')" <<< "${scriptText.replace(/"/g, '\\"')}"`,
      { stdio: "pipe" }
    );
  }

  // Speed up slightly (1.15x) for more energetic delivery
  execSync(
    `ffmpeg -y -i "${mp3Path}" -filter:a "atempo=1.15" "${fastPath}"`,
    { stdio: "pipe" }
  );

  console.log(`[Stage 2] Voiceover saved: ${fastPath}`);
  return fastPath;
}

function getAudioDuration(audioPath) {
  const result = execSync(
    `ffprobe -v quiet -print_format json -show_streams "${audioPath}"`,
    { encoding: "utf8" }
  );
  const info = JSON.parse(result);
  return parseFloat(info.streams[0].duration);
}

// ═══════════════════════════════════════════════════════
// STAGE 3 — VISUALS (Pexels API - free tier)
// ═══════════════════════════════════════════════════════

async function fetchBrollClips(query, outputDir, count = 6) {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=portrait`;
  const resp = await fetch(url, {
    headers: { Authorization: PEXELS_API_KEY },
  });
  if (!resp.ok) throw new Error(`Pexels API error: ${resp.statusText}`);
  const data = await resp.json();
  const videos = data.videos || [];

  const paths = [];
  for (let i = 0; i < Math.min(videos.length, count); i++) {
    const vid = videos[i];
    // Pick SD file (smaller, faster)
    const files = vid.video_files.sort((a, b) => (a.width || 0) - (b.width || 0));
    const videoFile = files.find((f) => (f.width || 0) <= 1080) || files[0];
    const clipPath = path.join(outputDir, `clip_${String(i).padStart(2, "0")}.mp4`);

    const dl = await fetch(videoFile.link);
    const buffer = await dl.arrayBuffer();
    await fsp.writeFile(clipPath, Buffer.from(buffer));

    paths.push(clipPath);
    console.log(`[Stage 3] Downloaded clip ${i + 1}/${count}: ${path.basename(clipPath)}`);
    await sleep(300); // Respect rate limit
  }
  return paths;
}

// ═══════════════════════════════════════════════════════
// STAGE 4 — VIDEO EDITING (FFmpeg + Whisper)
// ═══════════════════════════════════════════════════════

async function generateSubtitles(audioPath, outputDir) {
  const srtPath = path.join(outputDir, "subtitles.srt");

  // Use Whisper via Python (whisper is Python-native; call via subprocess)
  const whisperScript = `
import whisper, json, sys
from datetime import timedelta

def fmt(s):
    td = timedelta(seconds=s)
    total = int(td.total_seconds())
    h, rem = divmod(total, 3600)
    m, sec = divmod(rem, 60)
    ms = int((td.total_seconds() - total) * 1000)
    return f"{h:02d}:{m:02d}:{sec:02d},{ms:03d}"

model = whisper.load_model("base")
result = model.transcribe(sys.argv[1])
lines = []
for i, seg in enumerate(result["segments"], 1):
    lines.append(f"{i}\\n{fmt(seg['start'])} --> {fmt(seg['end'])}\\n{seg['text'].strip()}\\n")
print("\\n".join(lines))
`;

  const tmpScript = path.join(outputDir, "_whisper.py");
  await fsp.writeFile(tmpScript, whisperScript);

  const srtContent = execSync(`python3 "${tmpScript}" "${audioPath}"`, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  await fsp.writeFile(srtPath, srtContent);
  await fsp.unlink(tmpScript);

  console.log(`[Stage 4a] Subtitles generated: ${srtPath}`);
  return srtPath;
}

async function assembleVideo(clips, audioPath, srtPath, outputDir, duration) {
  const concatFile = path.join(outputDir, "concat.txt");
  const finalPath = path.join(outputDir, "final.mp4");

  // Build concat list (repeat clips to fill audio duration)
  let lines = [];
  let total = 0;
  while (total < duration + 2) {
    for (const c of clips) {
      lines.push(`file '${c.replace(/'/g, "'\\''")}'`);
      total += 5;
      if (total > duration + 5) break;
    }
    if (total > duration + 5) break;
  }
  await fsp.writeFile(concatFile, lines.join("\n"));

  const srtEscaped = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
  const filterComplex =
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,` +
    `crop=1080:1920,setsar=1,trim=duration=${duration},setpts=PTS-STARTPTS[vid];` +
    `[vid]subtitles='${srtEscaped}':` +
    `force_style='Fontname=DejaVu Sans Bold,FontSize=18,` +
    `PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,` +
    `BorderStyle=3,Outline=2,Shadow=1,Alignment=2,MarginV=60'[vout]`;

  const cmd = [
    "ffmpeg", "-y",
    "-f", "concat", "-safe", "0", "-i", concatFile,
    "-i", audioPath,
    "-filter_complex", filterComplex,
    "-map", "[vout]",
    "-map", "1:a",
    "-c:v", "libx264", "-preset", "fast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-shortest",
    "-movflags", "+faststart",
    finalPath,
  ];

  execSync(cmd.join(" "), { stdio: "pipe" });
  console.log(`[Stage 4] Video assembled: ${finalPath}`);
  return finalPath;
}

// ═══════════════════════════════════════════════════════
// STAGE 5 — THUMBNAIL (canvas + sharp - free)
// ═══════════════════════════════════════════════════════

async function createThumbnail(title, clipPath, outputDir) {
  const framePath = path.join(outputDir, "thumb_frame.jpg");
  const thumbPath = path.join(outputDir, "thumbnail.jpg");

  // Extract frame at 3 seconds
  execSync(
    `ffmpeg -y -i "${clipPath}" -ss 3 -vframes 1 -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720" "${framePath}"`,
    { stdio: "pipe" }
  );

  const W = 1280, H = 720;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Draw background frame
  const frameImg = await loadImage(framePath);
  ctx.drawImage(frameImg, 0, 0, W, H);

  // Dark overlay
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, 0, W, H);

  // Register bold font if available
  try {
    registerFont(FONT_PATH, { family: "DejaVuBold" });
  } catch {
    // Font not found — canvas falls back to system default
  }

  // Title text
  ctx.fillStyle = "#FFDC32";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 4;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const words = title.toUpperCase().split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    ctx.font = "bold 72px DejaVuBold, sans-serif";
    if (ctx.measureText(test).width > W * 0.85 && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const lineH = 88;
  let y = H / 2 - (lines.length * lineH) / 2 + lineH / 2;
  for (const l of lines) {
    ctx.font = "bold 72px DejaVuBold, sans-serif";
    ctx.strokeText(l, W / 2, y);
    ctx.fillText(l, W / 2, y);
    y += lineH;
  }

  // Add logo if available
  const logoPath = path.join(ASSETS_DIR, "logo.png");
  if (fs.existsSync(logoPath)) {
    const logo = await loadImage(logoPath);
    const lw = 120, lh = (120 * logo.height) / logo.width;
    ctx.drawImage(logo, W - 140, 20, lw, lh);
  }

  // Save via sharp for proper JPEG quality
  const buffer = canvas.toBuffer("image/jpeg", { quality: 0.92 });
  await fsp.writeFile(thumbPath, buffer);

  console.log(`[Stage 5] Thumbnail created: ${thumbPath}`);
  return thumbPath;
}

// ═══════════════════════════════════════════════════════
// STAGE 6 — UPLOAD TO YOUTUBE (googleapis - free)
// ═══════════════════════════════════════════════════════

async function uploadToYoutube(
  videoPath,
  thumbnailPath,
  title,
  description,
  tags,
  publishAt = null
) {
  const SCOPES = ["https://www.googleapis.com/auth/youtube.upload"];
  const tokenFile = "token.json";

  let secrets;
  if (typeof YOUTUBE_CLIENT_SECRETS === "string" && fs.existsSync(YOUTUBE_CLIENT_SECRETS)) {
    secrets = JSON.parse(fs.readFileSync(YOUTUBE_CLIENT_SECRETS, "utf8"));
  } else {
    secrets = JSON.parse(YOUTUBE_CLIENT_SECRETS);
  }

  const { client_secret, client_id, redirect_uris } = secrets.installed || secrets.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Load or request token
  if (fs.existsSync(tokenFile)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(tokenFile, "utf8")));
  } else {
    const authUrl = oAuth2Client.generateAuthUrl({ access_type: "offline", scope: SCOPES });
    console.log("\nAuthorise this app by visiting:\n", authUrl);
    const code = await question("Enter the code from that page here: ");
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    fs.writeFileSync(tokenFile, JSON.stringify(tokens));
    console.log("token.json saved.");
  }

  const youtube = google.youtube({ version: "v3", auth: oAuth2Client });

  if (!publishAt) {
    publishAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
  }
  const publishStr = publishAt.toISOString();

  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: title.slice(0, 100),
        description: `${description}\n\n#Shorts #AI #Tech`,
        tags,
        categoryId: "28",
        defaultLanguage: LANGUAGE,
      },
      status: {
        privacyStatus: "private", // Change to "public" when ready
        publishAt: publishStr,
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: fs.createReadStream(videoPath),
    },
  });

  const videoId = res.data.id;
  console.log(`[Stage 6] Uploaded: https://youtu.be/${videoId}`);

  // Set thumbnail
  await youtube.thumbnails.set({
    videoId,
    media: { body: fs.createReadStream(thumbnailPath) },
  });
  console.log("[Stage 6] Thumbnail set.");

  return videoId;
}

// ═══════════════════════════════════════════════════════
// MAIN ORCHESTRATOR
// ═══════════════════════════════════════════════════════

async function runPipeline(topic = null) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const runDir = path.join(OUTPUT_DIR, timestamp);
  fs.mkdirSync(runDir, { recursive: true });

  console.log(`\n${"=".repeat(55)}`);
  console.log(`  YouTube Automation Pipeline  |  ${timestamp}`);
  console.log(`${"=".repeat(55)}\n`);

  // Stage 1: Script
  const scriptData = await generateScript(topic);
  await fsp.writeFile(
    path.join(runDir, "script.json"),
    JSON.stringify(scriptData, null, 2)
  );

  // Stage 2: Voiceover
  const audioPath = await generateVoiceover(scriptData.script, runDir);
  const duration = getAudioDuration(audioPath);

  // Stage 3: B-roll clips
  const clips = await fetchBrollClips(scriptData.search_query, runDir, 6);

  // Stage 4a: Subtitles
  const srtPath = await generateSubtitles(audioPath, runDir);

  // Stage 4b: Assemble video
  const videoPath = await assembleVideo(clips, audioPath, srtPath, runDir, duration);

  // Stage 5: Thumbnail
  const thumbPath = await createThumbnail(scriptData.title, clips[0], runDir);

  // Stage 6: Upload
  let publishAt = new Date();
  publishAt.setUTCHours(PUBLISH_HOUR, 0, 0, 0);
  if (publishAt < new Date()) {
    publishAt.setDate(publishAt.getDate() + 1);
  }

  const videoId = await uploadToYoutube(
    videoPath,
    thumbPath,
    scriptData.title,
    scriptData.description,
    scriptData.tags,
    publishAt
  );

  console.log(`\n✅ Done! Video ID: ${videoId}`);
  console.log(`   Scheduled for: ${publishAt.toUTCString()}`);
  return videoId;
}

// ─── Helpers ───────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function question(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, (ans) => { rl.close(); resolve(ans); }));
}

// ─── Entry point ───────────────────────────────────────
const topic = process.argv.slice(2).join(" ") || null;
runPipeline(topic).catch((err) => {
  console.error("[Fatal]", err.message);
  process.exit(1);
});
