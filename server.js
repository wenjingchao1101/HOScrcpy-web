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

function hdcCommand(args) {
    return new Promise((resolve, reject) => {
        const proc = spawn(HDC_PATH, args, { shell: true });
        let stdout = '', stderr = '';
        proc.stdout.on('data', d => stdout += d);
        proc.stderr.on('data', d => stderr += d);
        const timer = setTimeout(() => { proc.kill(); reject('timeout'); }, 5000);
        proc.on('close', code => {
            clearTimeout(timer);
            code === 0 ? resolve(stdout.trim()) : reject(stderr || `exit ${code}`);
        });
        proc.on('error', e => { clearTimeout(timer); reject(e); });
    });
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

    hdcCommand(['-t', sn, 'shell', 'ifconfig'])
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
