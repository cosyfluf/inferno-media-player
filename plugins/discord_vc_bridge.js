// --- Discord Voice Channel & Rich Presence Bridge ---
// Dieses Plugin fängt den Audio-Ausgang ab und sendet ihn live an den Discord-Bot!

console.log("Discord VC Bridge Plugin geladen!");

const BOT_API_URL = 'http://127.0.0.1:8081/update';
const BOT_WS_URL = 'ws://127.0.0.1:8081/ws';

let ws = null;
let processor = null;
let botVolume = 1.0;

// --- UI INJECTION: Lautstärkeregler für Discord Bot ---
setTimeout(() => {
    const controlsDiv = document.querySelector('.controls');
    if (!controlsDiv) return;

    // Eigene CSS für den Slider einfügen
    const style = document.createElement('style');
    style.innerHTML = `
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
    `;
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.className = 'bot-vol-box';
    container.innerHTML = `
        <span>🤖 Discord VC Vol:</span>
        <input type="range" id="bot-vol-slider" min="0" max="2" step="0.05" value="1.0">
        <span id="bot-vol-label" style="width: 40px; text-align: right;">100%</span>
    `;
    controlsDiv.appendChild(container);

    document.getElementById('bot-vol-slider').addEventListener('input', (e) => {
        botVolume = parseFloat(e.target.value);
        document.getElementById('bot-vol-label').innerText = Math.round(botVolume * 100) + '%';
    });
}, 1000); // Kurz warten bis die UI geladen ist

// Baue die Live-Audio-Verbindung zum Bot auf
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

// Sende Meta-Updates
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

// Fange das Live-Audio aus dem Player ab
function startAudioCapture() {
    if (processor) return; // Läuft schon
    
    const audioCtx = window.InfernoPluginAPI.getAudioContext();
    const analyser = window.InfernoPluginAPI.getAnalyser();
    
    if (!audioCtx || !analyser) return;

    // Erstelle einen Prozessor mit einem sehr großen Buffer (16384 oder 8192) für flüssigeres Auslesen
    processor = audioCtx.createScriptProcessor(16384, 2, 2);
    
    analyser.connect(processor);
    processor.connect(audioCtx.destination);
    
    processor.onaudioprocess = (e) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        
        const left = e.inputBuffer.getChannelData(0);
        const right = e.inputBuffer.getChannelData(1);
        
        // Discord braucht Int16 PCM Audio. Wir konvertieren das Signal (Interleaved Stereo)
        const pcm = new Int16Array(left.length * 2);
        for (let i = 0; i < left.length; i++) {
            // Gain-Boost + Eigene Bot-Lautstärke anwenden
            let l = left[i] * 1.2 * botVolume; 
            let r = right[i] * 1.2 * botVolume;
            
            // Hard Clipping verhindern
            l = Math.max(-1, Math.min(1, l));
            r = Math.max(-1, Math.min(1, r));
            
            pcm[i * 2] = l < 0 ? l * 0x8000 : l * 0x7FFF;
            pcm[i * 2 + 1] = r < 0 ? r * 0x8000 : r * 0x7FFF;
        }
        
        // Schicke die rohen Audio-Daten als großen Block zum Python Bot
        ws.send(pcm.buffer);
    };
}
