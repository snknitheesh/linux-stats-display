#!/usr/bin/env python3
"""
HoloStats - Holographic 3D System Stats Display
GTK3 + WebKit2GTK launcher with transparent window
"""

import gi
gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
gi.require_version('WebKit2', '4.1')

from gi.repository import Gtk, Gdk, WebKit2, GLib
import json
import os
import signal
import subprocess
import re

# ─── Configuration ───
TARGET_MONITOR = 2      # 0-indexed, matches xinerama_head = 2
UPDATE_INTERVAL = 1000  # milliseconds
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


# ─── Stats Collector ───
class StatsCollector:
    def __init__(self):
        self.prev_cpu_idle = 0
        self.prev_cpu_total = 0
        self.prev_net_rx = 0
        self.prev_net_tx = 0
        self.prev_disk_read = 0
        self.prev_disk_write = 0
        self.prev_net_timestamp = 0
        self.prev_disk_timestamp = 0
        self.prev_rapl_energy = 0
        self.prev_rapl_time = 0
        self.cpu_power = 0
        self._ensure_rapl_readable()

    def _ensure_rapl_readable(self):
        """Make RAPL energy file readable if possible."""
        rapl_path = '/sys/class/powercap/intel-rapl:0/energy_uj'
        try:
            with open(rapl_path, 'r') as f:
                f.read()
        except PermissionError:
            try:
                subprocess.run(
                    ['pkexec', 'chmod', 'a+r', rapl_path],
                    timeout=10, capture_output=True
                )
            except Exception:
                pass

    def _get_cpu_power(self):
        """Read CPU package power from RAPL energy counter delta."""
        import time
        rapl_path = '/sys/class/powercap/intel-rapl:0/energy_uj'
        try:
            with open(rapl_path, 'r') as f:
                energy = int(f.read().strip())
            now = time.time()
            if self.prev_rapl_energy > 0 and self.prev_rapl_time > 0:
                dt = now - self.prev_rapl_time
                if dt > 0:
                    self.cpu_power = round((energy - self.prev_rapl_energy) / 1_000_000 / dt, 1)
            self.prev_rapl_energy = energy
            self.prev_rapl_time = now
            return max(0, self.cpu_power)
        except Exception:
            return 0

    def _exec(self, cmd, timeout=3):
        try:
            result = subprocess.run(
                cmd, shell=True, capture_output=True, text=True, timeout=timeout
            )
            return result.stdout.strip()
        except Exception:
            return ''

    def _read_file(self, path):
        try:
            with open(path, 'r') as f:
                return f.read()
        except Exception:
            return ''

    def _get_cpu_usage(self):
        try:
            stat = self._read_file('/proc/stat')
            line = stat.split('\n')[0]
            parts = list(map(int, line.split()[1:]))
            idle = parts[3] + (parts[4] if len(parts) > 4 else 0)
            total = sum(parts)

            diff_idle = idle - self.prev_cpu_idle
            diff_total = total - self.prev_cpu_total
            self.prev_cpu_idle = idle
            self.prev_cpu_total = total

            if diff_total == 0:
                return 0
            return round((1 - diff_idle / diff_total) * 100)
        except Exception:
            return 0

    def _get_net_interface(self):
        for iface, itype in [('wlp14s0', 'WiFi'), ('enp6s0', 'Ethernet')]:
            try:
                state = self._read_file(f'/sys/class/net/{iface}/operstate').strip()
                if state == 'up':
                    return iface, itype
            except Exception:
                pass
        return None, 'Disconnected'

    def _get_net_speeds(self, iface):
        if not iface:
            return 0, 0
        try:
            import time
            rx = int(self._read_file(f'/sys/class/net/{iface}/statistics/rx_bytes'))
            tx = int(self._read_file(f'/sys/class/net/{iface}/statistics/tx_bytes'))
            now = time.time()
            dt = now - self.prev_net_timestamp if self.prev_net_timestamp > 0 else 1

            down = (rx - self.prev_net_rx) / dt / 1024 if self.prev_net_rx > 0 else 0
            up = (tx - self.prev_net_tx) / dt / 1024 if self.prev_net_tx > 0 else 0

            self.prev_net_rx = rx
            self.prev_net_tx = tx
            self.prev_net_timestamp = now

            return max(0, round(down, 1)), max(0, round(up, 1))
        except Exception:
            return 0, 0

    def _get_disk_io(self):
        try:
            import time
            diskstats = self._read_file('/proc/diskstats')
            total_read = 0
            total_write = 0
            for line in diskstats.split('\n'):
                parts = line.split()
                if len(parts) >= 14:
                    name = parts[2]
                    if re.match(r'^(sd[a-z]|nvme\d+n\d+)$', name):
                        total_read += int(parts[5]) * 512
                        total_write += int(parts[9]) * 512

            now = time.time()
            dt = now - self.prev_disk_timestamp if self.prev_disk_timestamp > 0 else 1
            read_speed = (total_read - self.prev_disk_read) / dt / 1024 if self.prev_disk_read > 0 else 0
            write_speed = (total_write - self.prev_disk_write) / dt / 1024 if self.prev_disk_write > 0 else 0
            self.prev_disk_read = total_read
            self.prev_disk_write = total_write
            self.prev_disk_timestamp = now
            return max(0, round(read_speed, 1)), max(0, round(write_speed, 1))
        except Exception:
            return 0, 0

    def _parse_df(self, path):
        try:
            line = self._exec(f'df -B1 {path} | tail -1')
            parts = line.split()
            total = int(parts[1])
            used = int(parts[2])
            return {'used': used, 'total': total, 'percent': round(used / total * 100) if total > 0 else 0}
        except Exception:
            return {'used': 0, 'total': 1, 'percent': 0}

    def collect(self):
        import time
        cpu_usage = self._get_cpu_usage()
        cpu_power = self._get_cpu_power()
        net_iface, net_type = self._get_net_interface()
        net_down, net_up = self._get_net_speeds(net_iface)
        disk_read, disk_write = self._get_disk_io()

        # Memory
        try:
            meminfo = self._read_file('/proc/meminfo')
            mem = {}
            for line in meminfo.split('\n'):
                if ':' in line:
                    key, val = line.split(':')
                    mem[key.strip()] = int(val.strip().split()[0]) * 1024  # Convert kB to bytes
            mem_total = mem.get('MemTotal', 1)
            mem_available = mem.get('MemAvailable', 0)
            mem_used = mem_total - mem_available
            swap_total = mem.get('SwapTotal', 1) or 1
            swap_free = mem.get('SwapFree', 0)
            swap_used = swap_total - swap_free
        except Exception:
            mem_total, mem_used, mem_available = 1, 0, 0
            swap_total, swap_used = 1, 0

        # GPU (batch nvidia-smi call)
        gpu_data = {}
        gpu_raw = self._exec(
            'nvidia-smi --query-gpu=name,driver_version,utilization.gpu,temperature.gpu,'
            'memory.used,memory.total,clocks.mem,fan.speed,power.draw,power.limit '
            '--format=csv,noheader,nounits'
        )
        if gpu_raw:
            parts = [p.strip() for p in gpu_raw.split(',')]
            if len(parts) >= 10:
                gpu_data = {
                    'name': parts[0], 'driver': parts[1],
                    'usage': int(parts[2] or 0), 'temp': int(parts[3] or 0),
                    'vramUsed': int(parts[4] or 0), 'vramTotal': int(parts[5] or 1),
                    'memClk': parts[6], 'fan': parts[7],
                    'power': float(parts[8] or 0),
                    'powerLimit': float(parts[9] or 600),
                }

        if not gpu_data:
            gpu_data = {'name': 'N/A', 'driver': 'N/A', 'usage': 0, 'temp': 0,
                        'vramUsed': 0, 'vramTotal': 1, 'memClk': '0', 'fan': '0',
                        'power': 0, 'powerLimit': 600}

        # CPU info
        cpu_model = self._exec("grep 'model name' /proc/cpuinfo | uniq | cut -d: -f2").strip()
        cpu_temp = self._exec("sensors | grep 'Tctl:' | awk '{print $2}'").replace('+', '')
        cpu_freq = self._exec("grep 'cpu MHz' /proc/cpuinfo | head -1 | awk '{printf \"%.2f\", $4/1000}'")
        cpu_cores = self._exec("nproc")

        # Top processes (exclude self and related processes)
        top_raw = self._exec("ps -eo comm,%cpu --sort=-%cpu --no-headers | awk '!/conky|python3|launcher|WebKitWebProces/{if(++n<=6)print $1,$2}'")
        top_procs = []
        for line in top_raw.split('\n'):
            parts = line.strip().split()
            if len(parts) >= 2:
                top_procs.append({'name': parts[0], 'cpu': parts[1]})

        # Network IP
        net_ip = 'N/A'
        if net_iface:
            net_ip = self._exec(f"ip -4 addr show {net_iface} | grep inet | awk '{{print $2}}' | cut -d/ -f1")

        # Docker
        docker_count = self._exec("docker ps -q 2>/dev/null | wc -l")
        docker_names = self._exec("docker ps --format '{{.Names}}' 2>/dev/null | head -2")

        # Processes
        total_procs = self._exec("ls /proc | grep -c '^[0-9]'")
        running_procs = self._exec("grep procs_running /proc/stat | awk '{print $2}'")
        threads = self._exec("ps -eo nlwp --no-headers | awk '{s+=$1}END{print s}'")
        loadavg = self._exec("awk '{print $1,$2,$3}' /proc/loadavg")
        uptime = self._exec("uptime -p").replace('up ', '')

        return {
            'cpu': {
                'usage': cpu_usage,
                'model': cpu_model or 'N/A',
                'temp': cpu_temp or 'N/A',
                'freq': cpu_freq or '0',
                'cores': cpu_cores or '0',
                'top': top_procs,
                'power': cpu_power,
                'powerLimit': 170,
            },
            'memory': {
                'used': mem_used,
                'total': mem_total,
                'percent': round(mem_used / mem_total * 100) if mem_total > 0 else 0,
                'free': mem_available,
                'swapUsed': swap_used,
                'swapTotal': swap_total,
                'swapPercent': round(swap_used / swap_total * 100) if swap_total > 0 else 0,
            },
            'gpu': gpu_data,
            'storage': {
                'root': self._parse_df('/'),
                'home': self._parse_df('/home'),
                'cave': self._parse_df('/mnt/cave'),
                'lake': self._parse_df('/lake'),
            },
            'network': {
                'ip': net_ip or 'N/A',
                'type': net_type,
                'down': net_down,
                'up': net_up,
            },
            'diskIO': {
                'read': disk_read,
                'write': disk_write,
            },
            'docker': {
                'count': int(docker_count) if docker_count.isdigit() else 0,
                'names': [n for n in docker_names.split('\n') if n],
            },
            'system': {
                'uptime': uptime or 'N/A',
                'loadavg': loadavg or '0 0 0',
                'totalProcs': int(total_procs) if total_procs.isdigit() else 0,
                'runningProcs': int(running_procs) if running_procs.isdigit() else 0,
                'threads': int(threads) if threads.isdigit() else 0,
            },
        }


# ─── GTK Application ───
class HoloStatsWindow:
    def __init__(self):
        self.collector = StatsCollector()

        # Create window
        self.window = Gtk.Window()
        self.window.set_title('HoloStats')
        self.window.set_decorated(False)
        self.window.set_skip_taskbar_hint(True)
        self.window.set_skip_pager_hint(True)
        self.window.set_keep_below(True)
        self.window.set_type_hint(Gdk.WindowTypeHint.DESKTOP)
        self.window.set_app_paintable(True)

        # Enable RGBA visual for transparency
        screen = self.window.get_screen()
        visual = screen.get_rgba_visual()
        if visual:
            self.window.set_visual(visual)

        # Transparent background via CSS
        css = Gtk.CssProvider()
        css.load_from_data(b'window { background-color: transparent; }')
        Gtk.StyleContext.add_provider_for_screen(
            screen, css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )

        # Draw transparent background
        self.window.connect('draw', self._on_draw)

        # Position on target monitor
        display = Gdk.Display.get_default()
        n_monitors = display.get_n_monitors()
        monitor_idx = min(TARGET_MONITOR, n_monitors - 1)
        monitor = display.get_monitor(monitor_idx)
        geometry = monitor.get_geometry()

        self.window.move(geometry.x, geometry.y)
        self.window.set_default_size(geometry.width, geometry.height)
        self.window.resize(geometry.width, geometry.height)

        # WebKit WebView
        self.webview = WebKit2.WebView()

        # Set WebView transparent background
        bg_color = Gdk.RGBA()
        bg_color.parse('rgba(0,0,0,0)')
        self.webview.set_background_color(bg_color)

        # WebView settings
        settings = self.webview.get_settings()
        settings.set_enable_webgl(True)
        settings.set_hardware_acceleration_policy(WebKit2.HardwareAccelerationPolicy.ALWAYS)
        settings.set_enable_javascript(True)
        settings.set_enable_write_console_messages_to_stdout(True)
        settings.set_allow_file_access_from_file_urls(True)
        settings.set_allow_universal_access_from_file_urls(True)

        self.window.add(self.webview)

        # Load the built HTML
        html_path = os.path.join(SCRIPT_DIR, 'dist', 'index.html')
        self.webview.load_uri(f'file://{html_path}')

        # Start stats polling after page loads
        self.webview.connect('load-changed', self._on_load_changed)

        # Make window click-through after realization
        self.window.connect('realize', self._on_realize)
        self.window.connect('destroy', Gtk.main_quit)
        self.window.show_all()

    def _on_draw(self, widget, cr):
        import cairo
        cr.set_source_rgba(0, 0, 0, 0)
        cr.set_operator(cairo.OPERATOR_SOURCE)
        cr.paint()
        return False

    def _on_realize(self, widget):
        # Make window click-through (pass input to windows below)
        import cairo
        gdk_window = widget.get_window()
        if gdk_window:
            region = cairo.Region(cairo.RectangleInt(0, 0, 0, 0))
            gdk_window.input_shape_combine_region(region, 0, 0)

    def _on_load_changed(self, webview, event):
        if event == WebKit2.LoadEvent.FINISHED:
            # Delay to let Three.js initialize before injecting stats
            GLib.timeout_add(2000, self._start_polling)

    def _start_polling(self):
        self._send_stats()
        GLib.timeout_add(UPDATE_INTERVAL, self._send_stats)
        return False  # Don't repeat this starter

    def _send_stats(self):
        try:
            stats = self.collector.collect()
            json_str = json.dumps(stats)
            # Escape for JS string embedding
            json_str = json_str.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n')
            js_code = f"if(window.updateStats){{window.updateStats('{json_str}')}}"
            self.webview.evaluate_javascript(js_code, -1, None, None, None, None, None)
        except Exception as e:
            print(f'Stats error: {e}')
        return True  # Continue polling


def main():
    # Handle SIGTERM/SIGINT gracefully
    signal.signal(signal.SIGTERM, lambda *_: Gtk.main_quit())
    signal.signal(signal.SIGINT, lambda *_: Gtk.main_quit())

    app = HoloStatsWindow()
    Gtk.main()


if __name__ == '__main__':
    main()
