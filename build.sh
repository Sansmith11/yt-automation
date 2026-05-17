#!/usr/bin/env bash
# build.sh — Render build script
# Installs Node.js deps (npm) AND Python deps (pip) in one step.
# Render runs this as the buildCommand before each deploy/cron run.

set -euo pipefail

echo "──────────────────────────────────────"
echo " Installing Node.js dependencies..."
echo "──────────────────────────────────────"
npm install

echo ""
echo "──────────────────────────────────────"
echo " Installing Python dependencies..."
echo "──────────────────────────────────────"
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "──────────────────────────────────────"
echo " Installing system tools..."
echo "──────────────────────────────────────"
# FFmpeg is pre-installed on Render's Ubuntu base image.
# Verify it's available:
ffmpeg -version | head -1
ffprobe -version | head -1

# edge-tts for voiceover (free Microsoft Neural TTS)
pip install edge-tts

echo ""
echo "✅ Build complete."
