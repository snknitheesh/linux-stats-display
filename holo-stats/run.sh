#!/bin/bash
# HoloStats - Holographic 3D System Stats Display
# Run script that ensures clean environment (no snap interference)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

exec env -i \
    HOME="$HOME" \
    DISPLAY="${DISPLAY:-:1}" \
    GDK_BACKEND=x11 \
    XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}" \
    XDG_RUNTIME_DIR="/run/user/$(id -u)" \
    PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
    /usr/bin/python3 "$SCRIPT_DIR/launcher.py" "$@"
