const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const path = require('path');

const HTTP_PORT = process.env.PORT || 8002;
const HDC_PATH = process.env.HDC_PATH || 'hdc';
const HOSCRCPY_JAR = process.env.HOSCRCPY_JAR || path.join(__dirname, 'lib', 'hosScrcpy-1.0.15-beta.jar');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use('/lib', express.static(path.join(__dirname, 'lib')));
app.use(express.static(path.join(__dirname, 'public')));

// ========== Routes ==========

// Root: device list page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Direct connect: /sn=XXX
app.get('/sn=:sn', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: list devices
app.get('/api/devices', async (req, res) => {
    try {
        const output = await hdcCommand(['list', 'targets']);
        if (!output) return res.json([]);
        const devices = output.split('\n').filter(Boolean).map(sn => ({ sn: sn.trim() }));
        res.json(devices);
    } catch (e) {
        res.json([]);
    }
});

// ========== HDC ==========

function hdcCommand(args, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const proc = spawn(HDC_PATH, args, { shell: true });
        let stdout = '', stderr = '';
        proc.stdout.on('data', d => stdout += d);
        proc.stderr.on('data', d => stderr += d);
        const timer = setTimeout(() => { proc.kill(); reject('timeout'); }, timeout);
        proc.on('close', code => {
            clearTimeout(timer);
            code === 0 ? resolve(stdout.trim()) : reject(stderr || `exit ${code}`);
        });
        proc.on('error', e => { clearTimeout(timer); reject(e); });
    });
}

// Check screen state and wake up if screen is off
async function ensureScreenOn(sn) {
    try {
        // Query power state via hidumper
        const output = await hdcCommand(['-t', sn, 'shell', 'hidumper', '-s', 'PowerManagerService', '-a', '-s']);
        // If screen state shows OFF or SLEEP, wake it up
        if (output && (output.includes('State: OFF') || output.includes('State: SLEEP') || output.includes('Screen state: OFF'))) {
            console.log(`[wake] Screen is off for ${sn}, waking up...`);
            // Try power-shell wakeup first (HarmonyOS 4+)
            try {
                await hdcCommand(['-t', sn, 'shell', 'power-shell', 'wakeup'], 3000);
                console.log(`[wake] Sent wakeup command to ${sn}`);
            } catch (e) {
                // Fallback: send power key event via uinput
                await hdcCommand(['-t', sn, 'shell', 'uinput', '-K', '-d', '18', '-u', '18'], 3000);
                console.log(`[wake] Sent power key to ${sn}`);
            }
            // Small delay to let screen fully wake up
            await new Promise(r => setTimeout(r, 500));
        } else {
            console.log(`[wake] Screen is already on for ${sn}`);
        }
    } catch (e) {
        // If we can't determine state, try wakeup anyway as a safety measure
        console.log(`[wake] Could not check screen state for ${sn}, attempting wakeup...`);
        try {
            await hdcCommand(['-t', sn, 'shell', 'uinput', '-K', '-d', '18', '-u', '18'], 3000);
            await new Promise(r => setTimeout(r, 500));
        } catch (e2) {
            console.log(`[wake] Wakeup attempt failed for ${sn}: ${e2}`);
        }
    }
}

// ========== WebSocket ==========

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sn = url.searchParams.get('sn');
    if (!sn) {
        ws.close(1008, 'missing sn');
        return;
    }

    console.log(`[ws] connect: ${sn}`);

    // First ensure screen is on, then get IP and start bridge
    ensureScreenOn(sn)
        .then(() => hdcCommand(['-t', sn, 'shell', 'ifconfig']))
        .then(output => {
            const match = output.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
            startBridge(ws, match ? match[1] : '127.0.0.1', sn);
        })
        .catch(() => startBridge(ws, '127.0.0.1', sn));
});

function startBridge(ws, ip, sn) {
    const classpath = `${HOSCRCPY_JAR};${path.join(__dirname, 'out')}`;
    const bridge = spawn('java', ['-cp', classpath, 'StreamBridge', ip, sn], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
    });

    let buf = Buffer.alloc(0);
    const HDR = 4;

    bridge.stdout.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= HDR) {
            const len = buf.readInt32BE(0);
            if (buf.length < HDR + len) break;
            if (ws.readyState === ws.OPEN) ws.send(buf.slice(HDR, HDR + len));
            buf = buf.slice(HDR + len);
        }
    });

    bridge.stderr.on('data', d => console.log(`[bridge:${sn}] ${d.toString().trim()}`));
    bridge.on('close', code => {
        console.log(`[bridge:${sn}] exit ${code}`);
        if (ws.readyState === ws.OPEN) ws.close();
    });

    ws.on('message', msg => {
        try {
            const d = JSON.parse(msg);
            if (d.type === 'touch') {
                bridge.stdin.write(JSON.stringify({ type: 'touch', e: d.event, x: d.x, y: d.y }) + '\n');
            } else if (d.type === 'key') {
                bridge.stdin.write(JSON.stringify({ type: 'key', key: d.key }) + '\n');
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        console.log(`[ws] disconnect: ${sn}`);
        bridge.kill();
    });
}

server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`\n  HOScrcpy-Web`);
    console.log(`  http://127.0.0.1:${HTTP_PORT}`);
    console.log(`  http://127.0.0.1:${HTTP_PORT}/sn=<device_sn>\n`);
});
