// --- Discord Voice Channel & Rich Presence Bridge ---
// Dieses Plugin fängt den Audio-Ausgang ab und sendet ihn live an den Discord-Bot!

console.log("Discord VC Bridge Plugin geladen!");

const BOT_API_URL = 'http://127.0.0.1:8081/update';
const BOT_WS_URL = 'ws://127.0.0.1:8081/ws';

let ws = null;
let processor = null;
let botVolume = 1.0;
let injectedUI = [];

function cleanupUI() {
    injectedUI.forEach(el => el.remove());
    injectedUI = [];
}

function injectCSS(css) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    injectedUI.push(style);
    window.InfernoPluginAPI.registerCleanup(() => style.remove());
}

function injectElement(parentSelector, html) {
    const parent = document.querySelector(parentSelector);
    if (!parent) return;
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const el = temp.firstElementChild;
    parent.appendChild(el);
    injectedUI.push(el);
    window.InfernoPluginAPI.registerCleanup(() => el.remove());
    return el;
}

setTimeout(() => {
    injectCSS(`
        .bot-vol-box {
            display: flex; justify-content: center; align-items: center; gap: 10px;
            margin-top: 15px; padding-top: 15px; border-top: 1px dashed #400;
            color: var(--red); font-size: 13px; font-weight: bold;
        }
        #bot-vol-slider {
            width: 150px; -webkit-appearance: none; background: transparent; cursor: pointer;
        }
        #bot-vol-slider::-webkit-slider-runnable-track {
            width: 100%; height: 6px; background: #200; border-radius: 3px; border: 1px solid #400;
        }
        #bot-vol-slider::-webkit-slider-thumb {
            -webkit-appearance: none; height: 16px; width: 16px; border-radius: 50%;
            background: var(--red); margin-top: -6px; box-shadow: 0 0 10px var(--red); transition: 0.2s;
        }
        #bot-vol-slider::-webkit-slider-thumb:hover {
            transform: scale(1.2); background: #fff;
        }
    `);

    const container = injectElement('.controls', `
        <div class="bot-vol-box">
            <span>🤖 Discord VC Vol:</span>
            <input type="range" id="bot-vol-slider" min="0" max="2" step="0.05" value="1.0">
            <span id="bot-vol-label" style="width: 40px; text-align: right;">100%</span>
        </div>
    `);

    if (container) {
        document.getElementById('bot-vol-slider').addEventListener('input', (e) => {
            botVolume = parseFloat(e.target.value);
            document.getElementById('bot-vol-label').innerText = Math.round(botVolume * 100) + '%';
        });
    }
}, 1000);

function connectWebSocket() {
    ws = new WebSocket(BOT_WS_URL);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => console.log("Verbunden mit Discord Bot Audio-Stream!");
    ws.onclose = () => {
        console.log("Verbindung zum Bot verloren. Versuche Reconnect in 5s...");
        setTimeout(connectWebSocket, 5000);
    };
    ws.onerror = (err) => console.error("WS Error", err);
}

connectWebSocket();

window.InfernoPluginAPI.registerCleanup(() => {
    cleanupUI();
    if (ws) { ws.close(); ws = null; }
    if (processor) { processor.disconnect(); processor = null; }
});

function sendToDiscordBot(action, meta) {
    if (!meta) return;
    fetch(BOT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action, meta: meta })
    }).catch(() => {});
}

window.InfernoPluginAPI.on('onPlay', (meta) => {
    sendToDiscordBot('play', meta);
    startAudioCapture();
});

window.InfernoPluginAPI.on('onTrackChange', (meta) => {
    sendToDiscordBot('play', meta);
    startAudioCapture();
});

window.InfernoPluginAPI.on('onPause', () => {
    sendToDiscordBot('pause', window.InfernoPluginAPI.getCurrentMetadata());
});

function startAudioCapture() {
    if (processor) return;
    const audioCtx = window.InfernoPluginAPI.getAudioContext();
    const analyser = window.InfernoPluginAPI.getAnalyser();
    if (!audioCtx || !analyser) return;

    processor = audioCtx.createScriptProcessor(16384, 2, 2);
    analyser.connect(processor);
    processor.connect(audioCtx.destination);

    window.InfernoPluginAPI.registerCleanup(() => {
        if (processor) {
            try { processor.disconnect(); } catch(e) {}
            processor = null;
        }
    });

    processor.onaudioprocess = (e) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const left = e.inputBuffer.getChannelData(0);
        const right = e.inputBuffer.getChannelData(1);
        const pcm = new Int16Array(left.length * 2);
        for (let i = 0; i < left.length; i++) {
            let l = left[i] * 1.2 * botVolume;
            let r = right[i] * 1.2 * botVolume;
            l = Math.max(-1, Math.min(1, l));
            r = Math.max(-1, Math.min(1, r));
            pcm[i * 2] = l < 0 ? l * 0x8000 : l * 0x7FFF;
            pcm[i * 2 + 1] = r < 0 ? r * 0x8000 : r * 0x7FFF;
        }
        ws.send(pcm.buffer);
    };
}
