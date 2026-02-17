#!/bin/bash
# ── EMO AI Companion - Raspberry Pi Setup Script ──────────────────────
# Run this script on your Raspberry Pi to set up everything.

set -e

echo "EMO AI Companion - Raspberry Pi Setup"
echo "=========================================="

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "App directory: $APP_DIR"

# ── Step 1: Install Node.js if not present ────────────────────────────
if ! command -v node &> /dev/null; then
    echo "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "Node.js $(node -v)"

# ── Step 2: Install unclutter for hiding cursor ──────────────────────
if ! command -v unclutter &> /dev/null; then
    echo "Installing unclutter (to hide mouse cursor)..."
    sudo apt-get install -y unclutter 2>/dev/null || true
fi

# ── Step 3: Install dependencies ─────────────────────────────────────
echo "Installing npm dependencies..."
cd "$APP_DIR"
npm install

# ── Step 4: Build the frontend ───────────────────────────────────────
echo "Building frontend..."
npm run build

# ── Step 5: Make launch script and AppImage executable ───────────────
chmod +x "${APP_DIR}/launch.sh"
echo "launch.sh made executable"

APPIMAGE="${APP_DIR}/release/EMO AI Companion-1.0.0-arm64.AppImage"
if [ -f "$APPIMAGE" ]; then
    chmod +x "$APPIMAGE"
    echo "AppImage made executable"
fi

# ── Step 6: Set up systemd user service (most reliable autostart) ────
SYSTEMD_DIR="$HOME/.config/systemd/user"
mkdir -p "$SYSTEMD_DIR"

# Escape spaces in path for systemd (uses \x20)
ESCAPED_LAUNCH=$(echo "${APP_DIR}/launch.sh" | sed 's/ /\\x20/g')

cat > "$SYSTEMD_DIR/emo-ai-companion.service" << EOF
[Unit]
Description=EMO AI Companion Robot Face
After=graphical-session.target
Wants=graphical-session.target

[Service]
Type=simple
ExecStart=${ESCAPED_LAUNCH}
Environment=XDG_RUNTIME_DIR=/run/user/$(id -u)
Restart=on-failure
RestartSec=10
StartLimitIntervalSec=120
StartLimitBurst=5

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable emo-ai-companion.service
echo "Systemd user service enabled (auto-starts on boot)"

# Enable lingering so user services start without manual login
loginctl enable-linger "$(whoami)" 2>/dev/null || true
echo "Linger enabled — service starts even before desktop login"

# ── Step 7: Remove old duplicate autostart entries ───────────────────
# Only systemd should auto-launch the app (prevents multiple instances)
rm -f "$HOME/.config/autostart/emo-ai-companion.desktop" 2>/dev/null
# Clean LXDE autostart
if [ -f "$HOME/.config/lxsession/LXDE-pi/autostart" ]; then
    sed -i '/launch\.sh/d' "$HOME/.config/lxsession/LXDE-pi/autostart" 2>/dev/null
fi
echo "Cleaned duplicate autostart entries (systemd is the single launcher)"

# ── Step 8: Create Desktop shortcut (manual launch only, no autostart) ─
DESKTOP_DIR="$HOME/Desktop"
if [ -d "$DESKTOP_DIR" ]; then
    cat > "$DESKTOP_DIR/EMO-AI-Companion.desktop" << EOF
[Desktop Entry]
Type=Application
Name=EMO AI Companion
Comment=AI Robot Face Companion
Exec=${APP_DIR}/launch.sh
Icon=${APP_DIR}/public/icon.png
Terminal=false
Categories=Utility;
EOF
    chmod +x "$DESKTOP_DIR/EMO-AI-Companion.desktop"
    gio set "$DESKTOP_DIR/EMO-AI-Companion.desktop" metadata::trusted true 2>/dev/null || true
    echo "Desktop shortcut created"
fi

echo ""
echo "=========================================="
echo "Setup complete!"
echo ""
echo "To run NOW:      ${APP_DIR}/launch.sh"
echo "On next reboot:  App will auto-start automatically!"
echo ""
echo "Make sure your .env.local has:"
echo "    GEMINI_API_KEY=your_api_key_here"
echo "=========================================="
