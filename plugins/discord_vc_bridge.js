// --- Discord Voice Channel & Rich Presence Bridge ---
// Dieses Plugin fängt den Audio-Ausgang ab und sendet ihn live an den Discord-Bot!

console.log("Discord VC Bridge Plugin geladen!");

const BOT_API_URL = 'http://127.0.0.1:8081/update';
const BOT_WS_URL = 'ws://127.0.0.1:8081/ws';

let ws = null;
let processor = null;

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
            // Leichter Gain-Boost, um Qualitätsverlust durch Float->Int Konvertierung auszugleichen
            let l = left[i] * 1.2; 
            let r = right[i] * 1.2;
            
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
