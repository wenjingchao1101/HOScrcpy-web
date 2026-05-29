# HOScrcpy-Web

Browser-based remote screen mirror for HarmonyOS devices.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 14
- [Java JDK](https://adoptium.net/) >= 8
- HDC (HarmonyOS Device Connector) in PATH

## Setup

### 1. Clone

```bash
git clone https://github.com/wenjingchao1101/HOScrcpy-web.git
cd HOScrcpy-web
```

### 2. Install npm dependencies

```bash
npm install
```

### 3. Compile Java

Compile `StreamBridge.java` against the jar in `lib/`:

```bash
# Windows
javac -cp lib\hosScrcpy-1.0.15-beta.jar -d out src\StreamBridge.java

# Linux/macOS
javac -cp lib/hosScrcpy-1.0.15-beta.jar -d out src/StreamBridge.java
```

### 4. Set HDC path

If `hdc` is not in your system PATH, set the environment variable:

```bash
# Windows
set HDC_PATH=C:\path\to\hdc.exe

# Linux/macOS
export HDC_PATH=/path/to/hdc
```

### 5. Start

```bash
npm start
```

## Usage

- Device list: `http://127.0.0.1:8002`
- Direct connect: `http://127.0.0.1:8002/sn=<device_sn>`

## Features

- Image stream (JPEG) for low latency
- Touch control (mouse click/drag)
- Device buttons: Back, Home, Volume+/-, Power, Reboot
- Direct URL connect with SN
- Browser back/forward navigation
