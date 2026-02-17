#!/bin/bash
# ── EMO AI Companion - Launch Script for Raspberry Pi ─────────────────
# Called by systemd service on boot. Single instance only.

APP_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Single instance lock — prevent multiple copies running ────────────
LOCKFILE="/tmp/emo-ai-companion.lock"
exec 200>"$LOCKFILE"
if ! flock -n 200; then
    echo "[EMO] Another instance is already running. Exiting."
    exit 0
fi
echo $$ > "$LOCKFILE"

# ── Wait for the graphical session to be fully ready ──────────────────
sleep 6

# ── Set up display environment ────────────────────────────────────────
# XDG_RUNTIME_DIR is required for Wayland sockets
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

# Try to detect the display server automatically
if [ -S "$XDG_RUNTIME_DIR/wayland-0" ]; then
    export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
    export XDG_SESSION_TYPE=wayland
elif [ -S "$XDG_RUNTIME_DIR/wayland-1" ]; then
    export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-1}"
    export XDG_SESSION_TYPE=wayland
fi

# X11 fallback
export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"

# ── Disable screen blanking / screensaver ─────────────────────────────
xset s off 2>/dev/null
xset -dpms 2>/dev/null
xset s noblank 2>/dev/null

# ── Hide the system mouse cursor ─────────────────────────────────────
if command -v unclutter &>/dev/null; then
    killall unclutter 2>/dev/null
    unclutter -idle 0 -root &
elif command -v xdotool &>/dev/null; then
    xdotool mousemove 9999 9999 2>/dev/null
fi

# ── Set audio output volume to max ───────────────────────────────────
amixer set Master 100% 2>/dev/null
amixer set PCM 100% 2>/dev/null

# ── Launch the Electron app ──────────────────────────────────────────
APPIMAGE="${APP_DIR}/release/EMO AI Companion-1.0.0-arm64.AppImage"

if [ -f "$APPIMAGE" ]; then
    echo "[EMO] Launching AppImage: $APPIMAGE"
    exec "$APPIMAGE" --no-sandbox --ozone-platform-hint=auto
else
    echo "[EMO] ERROR: AppImage not found at: $APPIMAGE"
    echo "[EMO] Trying npm electron:start fallback..."
    cd "$APP_DIR"
    exec npx electron . --no-sandbox --ozone-platform-hint=auto
fi
