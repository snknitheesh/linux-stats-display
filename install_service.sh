#!/bin/bash

# Installation script for Linux Stats Display systemd service
# This installs a user-level systemd service for conky stats display

set -e

SERVICE_NAME="stats-display.service"
SERVICE_FILE="$(dirname "$0")/${SERVICE_NAME}"
SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"

echo "=== Linux Stats Display Service Installer ==="
echo

# Check if service file exists
if [ ! -f "${SERVICE_FILE}" ]; then
    echo "Error: Service file '${SERVICE_FILE}' not found!"
    exit 1
fi

# Check if conky is installed
if ! command -v conky &> /dev/null; then
    echo "Warning: conky is not installed. Please install it first:"
    echo "  sudo apt install conky-all  # For Debian/Ubuntu"
    echo "  sudo dnf install conky      # For Fedora"
    echo "  sudo pacman -S conky        # For Arch"
    echo
    read -p "Do you want to continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Create systemd user directory if it doesn't exist
if [ ! -d "${SYSTEMD_USER_DIR}" ]; then
    echo "Creating systemd user directory: ${SYSTEMD_USER_DIR}"
    mkdir -p "${SYSTEMD_USER_DIR}"
fi

# Copy service file
echo "Installing service file to ${SYSTEMD_USER_DIR}/${SERVICE_NAME}"
cp "${SERVICE_FILE}" "${SYSTEMD_USER_DIR}/${SERVICE_NAME}"

# Reload systemd daemon
echo "Reloading systemd user daemon..."
systemctl --user daemon-reload

# Enable service
echo "Enabling service to start on boot..."
systemctl --user enable "${SERVICE_NAME}"

# Check if service is already running
if systemctl --user is-active --quiet "${SERVICE_NAME}"; then
    echo "Service is already running. Restarting..."
    systemctl --user restart "${SERVICE_NAME}"
else
    echo "Starting service..."
    systemctl --user start "${SERVICE_NAME}"
fi

# Enable lingering to allow user services to run at boot
echo "Enabling user lingering (allows services to run at boot)..."
sudo loginctl enable-linger "${USER}"

# Check if conky is actually rendering
sleep 2
if systemctl --user is-active --quiet "${SERVICE_NAME}"; then
    if journalctl --user -u "${SERVICE_NAME}" -n 20 | grep -q "drawing to created window"; then
        echo "✓ Conky is running and rendering to display"
    elif journalctl --user -u "${SERVICE_NAME}" -n 20 | grep -q "can't open display"; then
        echo ""
        echo "⚠ Warning: Display connection issue detected"
        echo "Current DISPLAY in service: $(grep DISPLAY ~/.config/systemd/user/${SERVICE_NAME} | head -n1)"
        echo "Your DISPLAY variable: ${DISPLAY}"
        echo ""
        echo "If conky is not visible, you may need to edit the DISPLAY variable in:"
        echo "  ~/.config/systemd/user/${SERVICE_NAME}"
        echo "Change 'Environment=\"DISPLAY=:1\"' to match your actual DISPLAY (${DISPLAY})"
        echo "Then run: systemctl --user daemon-reload && systemctl --user restart ${SERVICE_NAME}"
    fi
fi

echo
echo "=== Installation Complete! ==="
echo
echo "Service Status:"
systemctl --user status "${SERVICE_NAME}" --no-pager
echo
echo "Useful commands:"
echo "  systemctl --user status ${SERVICE_NAME}     # Check service status"
echo "  systemctl --user stop ${SERVICE_NAME}       # Stop the service"
echo "  systemctl --user start ${SERVICE_NAME}      # Start the service"
echo "  systemctl --user restart ${SERVICE_NAME}    # Restart the service"
echo "  systemctl --user disable ${SERVICE_NAME}    # Disable auto-start"
echo "  journalctl --user -u ${SERVICE_NAME} -f     # View logs (follow)"
echo
