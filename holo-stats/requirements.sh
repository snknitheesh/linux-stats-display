#!/bin/bash
# HoloStats - Install all system requirements
# Run: sudo ./requirements.sh

set -e

echo "=== HoloStats Requirements Installer ==="

# Python3 + GTK3 + WebKit2GTK bindings
echo "[1/4] Installing Python3, GTK3, and WebKit2GTK..."
apt-get install -y \
    python3 \
    python3-gi \
    python3-gi-cairo \
    gir1.2-gtk-3.0 \
    gir1.2-webkit2-4.1 \
    libgtk-3-0t64

# Node.js + npm (for Vite build)
echo "[2/4] Installing Node.js and npm..."
apt-get install -y nodejs npm

# lm-sensors (for CPU temperature)
echo "[3/4] Installing lm-sensors..."
apt-get install -y lm-sensors

# Docker CLI (for container stats, optional)
echo "[4/4] Checking Docker..."
if command -v docker &>/dev/null; then
    echo "  Docker already installed."
else
    echo "  Docker not found. Install separately if needed:"
    echo "  https://docs.docker.com/engine/install/ubuntu/"
fi

# NVIDIA drivers / nvidia-smi (for GPU stats)
if command -v nvidia-smi &>/dev/null; then
    echo "  nvidia-smi found."
else
    echo "  WARNING: nvidia-smi not found. GPU stats will be unavailable."
    echo "  Install NVIDIA drivers for GPU monitoring."
fi

# Install npm dependencies
echo ""
echo "=== Installing npm dependencies ==="
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
npm install

# Build the frontend
echo ""
echo "=== Building frontend ==="
./node_modules/.bin/vite build

# Make run script executable
chmod +x run.sh install.sh

echo ""
echo "=== Done ==="
echo "Run ./install.sh to set up the systemd service."
