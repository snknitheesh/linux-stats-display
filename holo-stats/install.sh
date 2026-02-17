#!/bin/bash
# HoloStats - Install systemd user service

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="holo-stats.service"
SERVICE_SRC="$SCRIPT_DIR/$SERVICE_NAME"
SERVICE_DST="$HOME/.config/systemd/user/$SERVICE_NAME"

# Ensure run.sh is executable
chmod +x "$SCRIPT_DIR/run.sh"

# Create systemd user directory if needed
mkdir -p "$HOME/.config/systemd/user"

# Copy service file
cp "$SERVICE_SRC" "$SERVICE_DST"
echo "Installed $SERVICE_DST"

# Reload systemd and enable/start the service
systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME"
systemctl --user restart "$SERVICE_NAME"

echo "Service enabled and started."
echo "  Status:  systemctl --user status $SERVICE_NAME"
echo "  Logs:    journalctl --user -u $SERVICE_NAME -f"
echo "  Stop:    systemctl --user stop $SERVICE_NAME"
