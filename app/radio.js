// --- RADIO SYSTEM STATE ---
let radioList = [];
let radioMetadataInterval = null;
let isRadioMode = false;
let isRadioExpanded = true; // Default state

window.addEventListener('pywebviewready', async () => {
    // Load default radios from Python
    radioList = await window.pywebview.api.get_default_radios();
    renderRadioList();
    
    // Initial height setting
    const container = document.getElementById('radio-container');
    container.style.maxHeight = container.scrollHeight + "px";
});

// --- TOGGLE LOGIC ---
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

// --- RENDER RADIOS ---
function renderRadioList() {
    const container = document.getElementById('radio-list');
    container.innerHTML = radioList.map((r, i) => `
        <div class="fav-item" onclick="playRadio('${r.url}', '${r.name}')">
            <div class="pl-cover-mini" style="display:flex; align-items:center; justify-content:center; background:#1a0000; color:var(--red); font-size:10px; border: 1px solid #400;">📻</div>
            <div class="pl-text-container">
                <div class="pl-title" style="font-size: 13px;">${r.name}</div>
                <div class="pl-artist" style="font-size: 11px;">${r.genre || 'Internet Radio'}</div>
            </div>
        </div>
    `).join('');
    
    // Update height after rendering items
    if(isRadioExpanded) {
        document.getElementById('radio-container').style.maxHeight = document.getElementById('radio-container').scrollHeight + "px";
    }
}

// --- PLAYBACK LOGIC ---
async function playRadio(url, stationName) {
    isRadioMode = true;
    if(radioMetadataInterval) clearInterval(radioMetadataInterval);

    // Visual feedback for connecting
    document.getElementById('title').innerText = "Connecting...";
    document.getElementById('details').innerText = stationName;
    document.getElementById('t-dur').innerText = "LIVE";
    document.getElementById('progress-fill').style.width = "100%";
    
    audio.pause();
    video.pause();
    
    audio.src = url;
    current = audio;
    
    const coverImg = document.getElementById('cover');
    coverImg.src = 'alt.png'; 
    coverImg.style.display = 'block';
    document.getElementById('video').style.display = 'none';

    try {
        await audio.play();
        setupVisualizer(audio);
        
        // Start polling for metadata (Current Song & Station Name)
        fetchMetadata(url, stationName);
        radioMetadataInterval = setInterval(() => fetchMetadata(url, stationName), 15000);
    } catch (e) {
        document.getElementById('title').innerText = "Stream Offline";
        console.error("Radio play error:", e);
    }
}

async function fetchMetadata(url, stationName) {
    if (!isRadioMode) return;
    const data = await window.pywebview.api.get_radio_metadata(url);
    if (data) {
        document.getElementById('title').innerText = data.title;
        document.getElementById('details').innerText = data.station || stationName;
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