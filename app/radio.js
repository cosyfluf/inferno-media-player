let radioList = [];
let radioMetadataInterval = null;
let isRadioMode = false;
let isRadioExpanded = false;

window.addEventListener('pywebviewready', async () => {
    radioList = await callApi('get_default_radios');
    renderRadioList();
    const icon = document.getElementById('radio-toggle-icon');
    if (icon) icon.style.transform = "rotate(-90deg)";
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
    container.innerHTML = radioList.map((r, i) => {
        const img = r.image && r.image.startsWith('http') ? r.image : 'alt.png';
        const b64img = r.image && r.image.startsWith('data:') ? r.image : null;
        const src = b64img || img;
        return `
        <div class="playlist-item" onclick="playRadio('${r.url}', '${r.name}')" oncontextmenu="showRadioContext(event, ${i})">
            <img class="pl-cover-mini" src="${src}" onerror="this.style.display='none';this.nextSibling.style.display='flex'">
            <div class="pl-cover-mini" style="display:none; align-items:center; justify-content:center; background:#1a0000; color:var(--red); font-size:10px; border: 1px solid #400;">📻</div>
            <div class="pl-text-container">
                <div class="pl-title" style="font-size: 13px;">${r.name}</div>
                <div class="pl-artist" style="font-size: 11px;">${r.genre || 'Internet Radio'}</div>
            </div>
        </div>`;
    }).join('');

    if (isRadioExpanded) {
        document.getElementById('radio-container').style.maxHeight = document.getElementById('radio-container').scrollHeight + "px";
    }
}

function showRadioContext(event, index) {
    event.preventDefault();
    event.stopPropagation();
    const old = document.querySelector('.fav-selector');
    if (old) old.remove();

    const station = radioList[index];
    const menu = document.createElement('div');
    menu.className = 'fav-selector';
    menu.style.left = event.clientX + "px";
    menu.style.top = event.clientY + "px";

    const items = [
        { label: "✏ Edit Name", fn: async () => {
            const n = prompt("Station name:", station.name);
            if (n && n.trim()) { station.name = n.trim(); await save(); renderRadioList(); }
        }},
        { label: "🔗 Edit URL", fn: async () => {
            const u = prompt("Stream URL:", station.url);
            if (u && u.trim()) { station.url = u.trim(); await save(); renderRadioList(); }
        }},
        { label: "🎵 Edit Genre", fn: async () => {
            const g = prompt("Genre:", station.genre || "");
            if (g !== null) { station.genre = g.trim() || "Internet Radio"; await save(); renderRadioList(); }
        }},
        { label: station.image ? "🖼 Change Image" : "🖼 Set Image", fn: () => showImageMenu(event, index) },
    ];

    if (station.image) {
        items.push({ label: "❌ Remove Image", fn: async () => {
            station.image = ""; await save(); renderRadioList();
        }});
    }

    items.push({ label: "🗑 Delete Station", style: "color:#ff4444", fn: async () => {
        if (confirm(`Delete "${station.name}"?`)) {
            radioList.splice(index, 1); await save(); renderRadioList();
        }
    }});

    items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'menu-item';
        el.style.fontSize = "12px";
        if (item.style) el.style.color = item.style;
        el.innerText = item.label;
        el.onclick = async () => { await item.fn(); menu.remove(); };
        menu.appendChild(el);
    });

    document.body.appendChild(menu);
    setTimeout(() => {
        window.onclick = () => { menu.remove(); window.onclick = null; };
    }, 100);
}

function showImageMenu(event, index) {
    const old = document.querySelector('.fav-selector');
    if (old) old.remove();

    const station = radioList[index];
    const menu = document.createElement('div');
    menu.className = 'fav-selector';
    menu.style.left = event.clientX + "px";
    menu.style.top = event.clientY + "px";

    const items = [
        { label: "🌐 From URL", fn: async () => {
            const url = prompt("Image URL:", station.image || "");
            if (url && url.trim()) { station.image = url.trim(); await save(); renderRadioList(); }
        }},
        { label: "📁 Local File", fn: async () => {
            const b64 = await callApi('select_image_file');
            if (b64) { station.image = b64; await save(); renderRadioList(); }
        }},
    ];

    items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'menu-item';
        el.style.fontSize = "12px";
        el.innerText = item.label;
        el.onclick = async () => { await item.fn(); menu.remove(); };
        menu.appendChild(el);
    });

    document.body.appendChild(menu);
    setTimeout(() => {
        window.onclick = () => { menu.remove(); window.onclick = null; };
    }, 100);
}

async function save() {
    radioList = await callApi('save_stations', radioList) ? radioList : radioList;
}

async function playRadio(url, stationName) {
    isRadioMode = true;
    if (radioMetadataInterval) clearInterval(radioMetadataInterval);

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

        const initialMeta = { title: "Connecting...", artist: stationName, isRadio: true, path: url };
        if (window.InfernoPluginAPI) {
            window.InfernoPluginAPI.setCurrentMetadata(initialMeta);
            window.InfernoPluginAPI.trigger('onPlay', initialMeta);
        }

        updateRadioInfo(url, stationName);
        radioMetadataInterval = setInterval(() => updateRadioInfo(url, stationName), 15000);
    } catch (e) {
        document.getElementById('title').innerText = "Stream Offline";
    }
}

async function updateRadioInfo(url, stationName) {
    if (!isRadioMode) return;
    try {
        const data = await callApi('get_radio_metadata', url);
        if (data) {
            const currentSong = data.title || "Live Stream";
            const currentStation = data.station || stationName;
            document.getElementById('title').innerText = currentSong;
            document.getElementById('details').innerText = currentStation;

            const updatedMeta = { title: currentSong, artist: currentStation, isRadio: true, path: url };
            if (window.InfernoPluginAPI) {
                window.InfernoPluginAPI.setCurrentMetadata(updatedMeta);
                window.InfernoPluginAPI.trigger('onTrackChange', updatedMeta);
            }
            await callApi('update_radio_discord', currentSong, currentStation);
        }
    } catch (e) {
        console.error("Radio update failed:", e);
    }
}

function addCustomRadio() {
    const name = prompt("Station Name:");
    const url = prompt("Stream URL:");
    if (name && url) {
        radioList.push({ name, url, genre: "Manual Entry", image: "" });
        save().then(() => renderRadioList());
    }
}
