const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');

let prevCpuIdle = 0;
let prevCpuTotal = 0;
let prevNetRx = 0;
let prevNetTx = 0;
let prevDiskRead = 0;
let prevDiskWrite = 0;
let prevTimestamp = Date.now();

function execAsync(cmd, timeout = 3000) {
  return new Promise((resolve) => {
    exec(cmd, { timeout }, (err, stdout) => {
      resolve(err ? '' : stdout.trim());
    });
  });
}

function getCpuUsage() {
  try {
    const stat = fs.readFileSync('/proc/stat', 'utf8');
    const line = stat.split('\n')[0];
    const parts = line.split(/\s+/).slice(1).map(Number);
    const idle = parts[3] + (parts[4] || 0);
    const total = parts.reduce((a, b) => a + b, 0);

    const diffIdle = idle - prevCpuIdle;
    const diffTotal = total - prevCpuTotal;
    prevCpuIdle = idle;
    prevCpuTotal = total;

    if (diffTotal === 0) return 0;
    return Math.round((1 - diffIdle / diffTotal) * 100);
  } catch {
    return 0;
  }
}

function getNetInterface() {
  try {
    if (fs.existsSync('/sys/class/net/wlp14s0/operstate')) {
      const state = fs.readFileSync('/sys/class/net/wlp14s0/operstate', 'utf8').trim();
      if (state === 'up') return { name: 'wlp14s0', type: 'WiFi' };
    }
    if (fs.existsSync('/sys/class/net/enp6s0/operstate')) {
      const state = fs.readFileSync('/sys/class/net/enp6s0/operstate', 'utf8').trim();
      if (state === 'up') return { name: 'enp6s0', type: 'Ethernet' };
    }
  } catch {}
  return { name: null, type: 'Disconnected' };
}

function getNetSpeeds(iface) {
  if (!iface) return { down: 0, up: 0 };
  try {
    const rx = parseInt(fs.readFileSync(`/sys/class/net/${iface}/statistics/rx_bytes`, 'utf8'));
    const tx = parseInt(fs.readFileSync(`/sys/class/net/${iface}/statistics/tx_bytes`, 'utf8'));
    const now = Date.now();
    const dt = (now - prevTimestamp) / 1000;

    const down = prevNetRx > 0 ? (rx - prevNetRx) / dt / 1024 : 0;
    const up = prevNetTx > 0 ? (tx - prevNetTx) / dt / 1024 : 0;

    prevNetRx = rx;
    prevNetTx = tx;
    prevTimestamp = now;

    return { down: Math.max(0, down).toFixed(1), up: Math.max(0, up).toFixed(1) };
  } catch {
    return { down: 0, up: 0 };
  }
}

function getDiskIO() {
  try {
    const diskstats = fs.readFileSync('/proc/diskstats', 'utf8');
    let totalRead = 0, totalWrite = 0;
    for (const line of diskstats.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 14) {
        const name = parts[2];
        if (/^(sd[a-z]|nvme\d+n\d+)$/.test(name)) {
          totalRead += parseInt(parts[5]) * 512;
          totalWrite += parseInt(parts[9]) * 512;
        }
      }
    }
    const now = Date.now();
    const dt = (now - prevTimestamp) / 1000 || 1;
    const readSpeed = prevDiskRead > 0 ? (totalRead - prevDiskRead) / dt / 1024 : 0;
    const writeSpeed = prevDiskWrite > 0 ? (totalWrite - prevDiskWrite) / dt / 1024 : 0;
    prevDiskRead = totalRead;
    prevDiskWrite = totalWrite;
    return {
      read: Math.max(0, readSpeed).toFixed(1),
      write: Math.max(0, writeSpeed).toFixed(1),
    };
  } catch {
    return { read: 0, write: 0 };
  }
}

async function collectStats() {
  const cpuUsage = getCpuUsage();
  const net = getNetInterface();
  const netSpeeds = getNetSpeeds(net.name);
  const diskIO = getDiskIO();
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const memUsed = memTotal - memFree;

  const [
    cpuModel, cpuTemp, cpuFreq, cpuCores,
    gpuName, gpuDriver, gpuUsage, gpuTemp, gpuVramUsed, gpuVramTotal, gpuMemClk, gpuFan, gpuPower,
    swapInfo, dfRoot, dfHome, dfCave, dfLake,
    topProcs, dockerCount, dockerNames,
    loadavg, uptime, processes
  ] = await Promise.all([
    execAsync("cat /proc/cpuinfo | grep 'model name' | uniq | cut -d: -f2"),
    execAsync("sensors | grep 'Tctl:' | awk '{print $2}'").then(s => s.replace('+', '')),
    execAsync("cat /proc/cpuinfo | grep 'cpu MHz' | head -1 | awk '{printf \"%.2f\", $4/1000}'"),
    execAsync("nproc"),
    execAsync("nvidia-smi --query-gpu=name --format=csv,noheader"),
    execAsync("nvidia-smi --query-gpu=driver_version --format=csv,noheader"),
    execAsync("nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits"),
    execAsync("nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits"),
    execAsync("nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits"),
    execAsync("nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits"),
    execAsync("nvidia-smi --query-gpu=clocks.mem --format=csv,noheader,nounits"),
    execAsync("nvidia-smi --query-gpu=fan.speed --format=csv,noheader,nounits"),
    execAsync("nvidia-smi --query-gpu=power.draw --format=csv,noheader,nounits"),
    execAsync("free -b | grep Swap"),
    execAsync("df -B1 / | tail -1"),
    execAsync("df -B1 /home | tail -1"),
    execAsync("df -B1 /mnt/cave | tail -1"),
    execAsync("df -B1 /lake | tail -1"),
    execAsync("ps -eo comm,%cpu --sort=-%cpu --no-headers | awk '!/conky|electron|holo/{if(++n<=3)print $1,$2}'"),
    execAsync("docker ps -q 2>/dev/null | wc -l"),
    execAsync("docker ps --format '{{.Names}}' 2>/dev/null | head -2"),
    execAsync("cat /proc/loadavg | awk '{print $1,$2,$3}'"),
    execAsync("uptime -p"),
    execAsync("cat /proc/stat | head -1 && echo PROCS $(ls /proc | grep -c '^[0-9]') && echo THREADS $(ps -eo nlwp --no-headers | awk '{s+=$1}END{print s}') && echo RUNNING $(cat /proc/stat | grep procs_running | awk '{print $2}')"),
  ]);

  const swapParts = swapInfo.split(/\s+/);
  const swapTotal = parseInt(swapParts[1]) || 1;
  const swapUsed = parseInt(swapParts[2]) || 0;

  function parseDf(line) {
    if (!line) return { used: 0, total: 0, percent: 0 };
    const p = line.split(/\s+/);
    const total = parseInt(p[1]) || 1;
    const used = parseInt(p[2]) || 0;
    return { used, total, percent: Math.round(used / total * 100) };
  }

  const procLines = processes.split('\n');
  let totalProcs = 0, runningProcs = 0, threads = 0;
  for (const l of procLines) {
    if (l.startsWith('PROCS')) totalProcs = parseInt(l.split(' ')[1]) || 0;
    if (l.startsWith('RUNNING')) runningProcs = parseInt(l.split(' ')[1]) || 0;
    if (l.startsWith('THREADS')) threads = parseInt(l.split(' ')[1]) || 0;
  }

  const top = topProcs.split('\n').map(l => {
    const p = l.trim().split(/\s+/);
    return { name: p[0] || '', cpu: p[1] || '0' };
  });

  const ip = net.name ? await execAsync(`ip -4 addr show ${net.name} | grep inet | awk '{print $2}' | cut -d/ -f1`) : 'N/A';

  return {
    cpu: {
      usage: cpuUsage,
      model: cpuModel.trim(),
      temp: cpuTemp || 'N/A',
      freq: cpuFreq || '0',
      cores: cpuCores || '0',
      top,
    },
    memory: {
      used: memUsed,
      total: memTotal,
      percent: Math.round(memUsed / memTotal * 100),
      free: memFree,
      swapUsed,
      swapTotal,
      swapPercent: Math.round(swapUsed / swapTotal * 100),
    },
    gpu: {
      name: gpuName || 'N/A',
      driver: gpuDriver || 'N/A',
      usage: parseInt(gpuUsage) || 0,
      temp: parseInt(gpuTemp) || 0,
      vramUsed: parseInt(gpuVramUsed) || 0,
      vramTotal: parseInt(gpuVramTotal) || 1,
      memClk: gpuMemClk || '0',
      fan: gpuFan || '0',
      power: parseFloat(gpuPower) || 0,
    },
    storage: {
      root: parseDf(dfRoot),
      home: parseDf(dfHome),
      cave: parseDf(dfCave),
      lake: parseDf(dfLake),
    },
    network: {
      ip,
      type: net.type,
      down: netSpeeds.down,
      up: netSpeeds.up,
    },
    diskIO,
    docker: {
      count: parseInt(dockerCount) || 0,
      names: dockerNames ? dockerNames.split('\n').filter(Boolean) : [],
    },
    system: {
      uptime: uptime.replace('up ', '') || 'N/A',
      loadavg: loadavg || '0 0 0',
      totalProcs,
      runningProcs,
      threads,
    },
  };
}

module.exports = { collectStats };
