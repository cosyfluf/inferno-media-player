// --- RADIO SYSTEM STATE ---
let radioList = [];
let radioMetadataInterval = null;
let isRadioMode = false;
let isRadioExpanded = true;

window.addEventListener('pywebviewready', async () => {
    radioList = await window.pywebview.api.get_default_radios();
    renderRadioList();
    
    const container = document.getElementById('radio-container');
    container.style.maxHeight = container.scrollHeight + "px";
});

function toggleRadioList() {
    const container = document.getElementById('radio-container');
    const icon = document.getElementById('radio-toggle-icon');
    isRadioExpanded = !isRadioExpanded;
    
    if (isRadioExpanded) {
        container.style.maxHeight = container.scrollHeight + "px";
        icon.style.transform = "rotate(0deg)";
    } else {
        container.style.maxHeight = "0px";
        icon.style.transform = "rotate(-90deg)";
    }
}

function renderRadioList() {
    const container = document.getElementById('radio-list');
    container.innerHTML = radioList.map((r, i) => `
        <div class="playlist-item" onclick="playRadio('${r.url}', '${r.name}')">
            <div class="pl-cover-mini" style="display:flex; align-items:center; justify-content:center; background:#1a0000; color:var(--red); font-size:10px; border: 1px solid #400;">📻</div>
            <div class="pl-text-container">
                <div class="pl-title" style="font-size: 13px;">${r.name}</div>
                <div class="pl-artist" style="font-size: 11px;">${r.genre || 'Internet Radio'}</div>
            </div>
        </div>
    `).join('');
    
    if(isRadioExpanded) {
        document.getElementById('radio-container').style.maxHeight = document.getElementById('radio-container').scrollHeight + "px";
    }
}

async function playRadio(url, stationName) {
    isRadioMode = true;
    if(radioMetadataInterval) clearInterval(radioMetadataInterval);

    // Initial UI State
    document.getElementById('title').innerText = "Connecting...";
    document.getElementById('details').innerText = stationName;
    document.getElementById('t-dur').innerText = "LIVE";
    document.getElementById('progress-fill').style.width = "100%";
    
    audio.pause();
    video.pause();
    audio.src = url;
    current = audio;
    
    document.getElementById('cover').src = 'alt.png'; 
    document.getElementById('cover').style.display = 'block';
    document.getElementById('video').style.display = 'none';

    try {
        await audio.play();
        setupVisualizer(audio);
        
        // --- WICHTIG: Sofortiges Update beim Start ---
        updateRadioInfo(url, stationName);
        
        // Intervall für Updates (alle 15 Sek)
        radioMetadataInterval = setInterval(() => updateRadioInfo(url, stationName), 15000);
    } catch (e) {
        document.getElementById('title').innerText = "Stream Offline";
    }
}

// Diese Funktion erledigt jetzt alles: UI Update UND Discord Update
async function updateRadioInfo(url, stationName) {
    if (!isRadioMode) return;
    try {
        const data = await window.pywebview.api.get_radio_metadata(url);
        if (data) {
            const currentSong = data.title || "Live Stream";
            const currentStation = data.station || stationName;

            // 1. Update UI
            document.getElementById('title').innerText = currentSong;
            document.getElementById('details').innerText = currentStation;

            // 2. Update Discord via Python
            await window.pywebview.api.update_radio_discord(currentSong, currentStation);
        }
    } catch (e) {
        console.error("Radio Metadata/Discord update failed:", e);
    }
}

function addCustomRadio() {
    const name = prompt("Station Name:");
    const url = prompt("Stream URL:");
    if (name && url) {
        radioList.push({ name, url, genre: "Manual Entry" });
        renderRadioList();
    }
}