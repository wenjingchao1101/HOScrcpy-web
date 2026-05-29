# HOScrcpy-Web

Browser-based remote screen mirror for HarmonyOS devices.

## Prerequisites

- Node.js >= 14
- Java >= 8
- HDC in PATH (or set `HDC_PATH` env var)
- Device connected via HDC

## Quick Start

```bash
# Set HDC path if not in PATH (adjust to your local path)
# Windows
set HDC_PATH=C:\path\to\hdc
# Linux/macOS
export HDC_PATH=/path/to/hdc

# Start
npm start
```

## Usage

- Device list: `http://127.0.0.1:8002`
- Direct connect: `http://127.0.0.1:8002/sn=FMR0224122000466`

## Features

- Image stream (JPEG) for low latency
- Touch control (mouse click/drag)
- Device buttons: Back, Home, Volume+/-, Power, Reboot
- Direct URL connect with SN
- Browser back/forward navigation
