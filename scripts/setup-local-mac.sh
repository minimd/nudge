#!/usr/bin/env bash
# One-shot setup for the local-first Nudge fork on an Apple Silicon Mac.
#   ./scripts/setup-local-mac.sh            # 8B model (16GB+ RAM)
#   MODEL=qwen3-vl:4b-instruct ./scripts/setup-local-mac.sh   # lighter
set -euo pipefail

MODEL="${MODEL:-qwen3-vl:8b-instruct}"
cd "$(dirname "$0")/.."

say() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }

command -v brew >/dev/null || { echo "Install Homebrew first: https://brew.sh"; exit 1; }

say "Ollama"
if ! command -v ollama >/dev/null; then
  brew install ollama
fi
if ! curl -sf http://127.0.0.1:11434/api/version >/dev/null; then
  brew services start ollama
  for _ in $(seq 1 20); do
    curl -sf http://127.0.0.1:11434/api/version >/dev/null && break
    sleep 1
  done
fi
curl -sf http://127.0.0.1:11434/api/version >/dev/null || { echo "Ollama didn't start"; exit 1; }

say "Pulling $MODEL (one-time download)"
ollama pull "$MODEL"

say "Node deps"
command -v node >/dev/null || brew install node
npx -y pnpm@8.15.4 install --frozen-lockfile

say "Sanity eval against the bundled screenshots"
NUDGE_LOCAL_MODEL="$MODEL" npx -y tsx src/ai/local/eval.ts || \
  echo "(some eval cases failed; the app still works, see output above)"

say "Building Nudge.app"
npx -y pnpm@8.15.4 run package -- --arch=arm64

APP="$(ls -d out/Nudge-darwin-arm64/Nudge.app 2>/dev/null || true)"
if [ -n "$APP" ]; then
  rm -rf /Applications/Nudge.app
  cp -R "$APP" /Applications/
  xattr -dr com.apple.quarantine /Applications/Nudge.app || true
  say "Installed /Applications/Nudge.app"
  echo "First launch: grant Screen Recording + Notifications when asked."
  echo "If you changed MODEL, set it in Settings → Model → Ollama model."
  open /Applications/Nudge.app
else
  echo "Build output not found in out/. Run: npx pnpm run start   (dev mode)"
fi
