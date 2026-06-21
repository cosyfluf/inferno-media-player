// --- Discord Voice Channel & Rich Presence Bridge ---
// Dieses Plugin sendet die Audio-Daten und Metadaten an den externen Discord Bot

console.log("Discord VC Bridge Plugin geladen!");

const BOT_API_URL = 'http://127.0.0.1:8081/update';

function sendToDiscordBot(action, meta) {
    if (!meta) return;
    
    fetch(BOT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action, meta: meta })
    }).catch(err => {
        // Ignoriere Fehler leise, falls der Bot gerade nicht läuft
    });
}

// Event Hooks
window.InfernoPluginAPI.on('onPlay', (meta) => {
    sendToDiscordBot('play', meta);
});

window.InfernoPluginAPI.on('onTrackChange', (meta) => {
    sendToDiscordBot('play', meta); // Behandle Track-Change wie ein neues Play
});

window.InfernoPluginAPI.on('onPause', (meta) => {
    // Da wir pause momentan in der API nur mit {path} feuern, 
    // holen wir uns die vollen Metadaten dazu.
    const fullMeta = window.InfernoPluginAPI.getCurrentMetadata();
    sendToDiscordBot('pause', fullMeta);
});
