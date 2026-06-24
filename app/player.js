const audio = document.getElementById('audio');
const video = document.getElementById('video');
const cover = document.getElementById('cover');
const playIcon = document.getElementById('play-icon');
const progressBar = document.getElementById('progress-bar');
const progressFill = document.getElementById('progress-fill');

cover.onload = async () => {
    if (typeof isDynamicColorEnabled !== 'undefined' && isDynamicColorEnabled ||
        typeof isAmbientGlowEnabled !== 'undefined' && isAmbientGlowEnabled) {
        await getAverageColor(cover);
    }
};

let current = audio;
let playlist = [];
let index = -1;
let isShuffle = false;
let isLoop = false;
let isDragging = false; // needed for progress bar dragging

let audioCtx, analyser, sourceAudio, sourceVideo;
let currentMetadata = null; // Speichert die aktuellen Metadaten

// --- PLUGIN API ---
window.InfernoPluginAPI = {
    getAudioContext: () => audioCtx,
    getAnalyser: () => analyser,
    getCurrentMedia: () => current,
    getCurrentMetadata: () => currentMetadata,
    setCurrentMetadata: (meta) => { currentMetadata = meta; },
    
    // Helper to get raw frequency data (0-255) for EQ/Visualizers
    getFrequencyData: () => {
        if (!analyser) return null;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        return dataArray;
    },
    
    // Helper to get raw waveform data
    getTimeDomainData: () => {
        if (!analyser) return null;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(dataArray);
        return dataArray;
    },
    
    registerCleanup: function(fn) {
        if (typeof fn === 'function') _pluginCleanups.push(fn);
    },

    // Plugin Event System
    events: {
        onPlay: [],
        onPause: [],
        onTrackChange: []
    },
    
    on: function(eventName, callback) {
        if (this.events[eventName]) {
            this.events[eventName].push(callback);
        }
    },
    
    trigger: function(eventName, data) {
        if (this.events[eventName]) {
            this.events[eventName].forEach(cb => {
                try { cb(data); } catch(e) { console.error("Plugin Error:", e); }
            });
        }
    }
};

function handleScrub(e) {
    if (!current || !isFinite(current.duration)) return;
    const rect = progressBar.getBoundingClientRect();
    let offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = offsetX / rect.width;
    current.currentTime = pct * current.duration;
    progressFill.style.width = (pct * 100) + "%";
    document.getElementById('t-cur').innerText = fmt(pct * current.duration);
}

/*-- PROGRESS BAR LOGIC --*/
if (progressBar) {
    // Start dragging when clicking down on the bar
    progressBar.addEventListener('mousedown', (e) => {
        if (!current || isNaN(current.duration)) return;
        isDragging = true;
        handleScrub(e);
    });

    // Handle the movement globally so the user can drag outside the bar
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            handleScrub(e);
        }
    });

    // Stop dragging when mouse is released anywhere
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
        }
    });
}

async function changeFolder() {
    const files = await callApi('select_folder');
    if (files) renderPlaylist(files);
}

async function manualFile() {
    const meta = await callApi('select_file');
    if (meta) {
        document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('active'));
        playMedia(meta);
    }
}

async function showInFolder(path) {
    await callApi('show_in_folder', path);
}

function playMedia(meta) {
    currentMetadata = meta; // Speichere die Metadaten für Plugins
    
    if (typeof isRadioMode !== 'undefined') isRadioMode = false;
    if (typeof radioMetadataInterval !== 'undefined' && radioMetadataInterval) {
        clearInterval(radioMetadataInterval);
        radioMetadataInterval = null;
    }

    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();

    audio.pause(); 
    video.pause();
    cover.style.display = "none";
    video.style.display = "none";

    // Set UI Text
    document.getElementById('title').innerText = meta.title || "Unknown Title";
    document.getElementById('details').innerText = `${meta.artist || 'Inferno Artist'} | ${meta.album || 'No Album'}`;
    
    // Set duration text
    document.getElementById('t-dur').innerText = meta.duration ? fmt(meta.duration) : "0:00";

    if(meta.type === 'audio') {
        audio.src = meta.path;
        current = audio;
        cover.src = meta.cover ? meta.cover : 'alt.png';
        cover.style.display = "block";

    } else {
        video.src = meta.path;
        current = video;
        video.style.display = "block";

        // Reset theme to default Red for videos
        currentThemeColor = { r: 255, g: 0, b: 0 };
        document.documentElement.style.setProperty('--red', '#ff0000');
    }
    
    current.load();
    current.play().then(() => {
        playIcon.setAttribute('d', "M6 19h4V5H6v14zm8-14v14h4V5h-4z");
        setupVisualizer(current);
        window.InfernoPluginAPI.trigger('onTrackChange', meta);
        window.InfernoPluginAPI.trigger('onPlay', meta);
    }).catch(e => console.error("Playback failed:", e));
}

function togglePlay() {
    if (current.paused) {
        current.play();
        playIcon.setAttribute('d', "M6 19h4V5H6v14zm8-14v14h4V5h-4z");
        window.InfernoPluginAPI.trigger('onPlay', currentMetadata || { path: current.src });
    } else {
        current.pause();
        playIcon.setAttribute('d', "M8 5v14l11-7z");
        window.InfernoPluginAPI.trigger('onPause', currentMetadata || { path: current.src });
    }
}
document.addEventListener('keydown', (event) => {
        if (event.code === 'Space' && event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
            event.preventDefault();
            togglePlay();
        }
    });


function _findActiveIndex(list) {
    const curPath = currentMetadata ? currentMetadata.path : null;
    if (curPath) {
        const idx = list.findIndex(t => t.path === curPath);
        if (idx >= 0) return idx;
    }
    return list.indexOf(playlist[index]);
}

function playNext() {
    const list = getActivePlaylist();
    if (list.length === 0) return;
    if (isShuffle) {
        const randIdx = Math.floor(Math.random() * list.length);
        selectTrackByList(list, randIdx);
    } else {
        const cur = _findActiveIndex(list);
        const next = (cur + 1) % list.length;
        selectTrackByList(list, next);
    }
}

function playPrev() {
    const list = getActivePlaylist();
    if (list.length === 0) return;
    const cur = _findActiveIndex(list);
    const prev = (cur - 1 + list.length) % list.length;
    selectTrackByList(list, prev);
}

function selectTrackByList(list, idx) {
    if (idx < 0 || idx >= list.length) return;
    const track = list[idx];
    if (typeof isViewingFavourite !== 'undefined' && isViewingFavourite) {
        selectFavTrack(idx);
    } else {
        const globalIdx = playlist.findIndex(t => t.path === track.path);
        if (globalIdx >= 0) selectTrack(globalIdx);
        else playTrackByPath(track.path);
    }
}

function playTrackByPath(path) {
    callApi('get_metadata', path).then(meta => {
        if (meta) playMedia(meta);
    });
}

// --- MEDIA EVENTS ---
// --- MEDIA EVENTS ---
[audio, video].forEach(m => {
    // Handle end of track
    m.onended = () => { 
        // If we are in radio mode, just try to resume the stream if it stops
        if (typeof isRadioMode !== 'undefined' && isRadioMode) {
            m.play();
            return;
        }
        
        // Normal playback logic
        if(!isLoop) playNext(); else m.play(); 
    };
    
    m.ontimeupdate = () => {
        // 1. Check if Web Radio is active
        if (typeof isRadioMode !== 'undefined' && isRadioMode) {
            document.getElementById('t-cur').innerText = fmt(m.currentTime);
            document.getElementById('t-dur').innerText = "LIVE";
            progressFill.style.width = "100%";
            return; // Skip normal file progress logic
        }

        // 2. Normal Local File logic (only if not dragging)
        if (!isDragging) {
            const dur = m.duration && isFinite(m.duration) && m.duration > 0 ? m.duration : 0;
            const cur = m.currentTime || 0;
            
            document.getElementById('t-cur').innerText = fmt(cur);

            if (dur > 0) {
                const p = (cur / dur) * 100;
                progressFill.style.width = p + "%";
                document.getElementById('t-dur').innerText = fmt(dur);
            }
        }
    };
});

// --- TIME FORMAT ---
function fmt(s) {
    if (isNaN(s) || !isFinite(s) || s <= 0) return "0:00";
    let m = Math.floor(s / 60);
    let r = Math.floor(s % 60);
    return `${m}:${r < 10 ? '0' + r : r}`;
}

// --- RANDOM SONG FUNCTION ---
function randomSong() {
    const list = getActivePlaylist();
    if (list.length === 0) return;
    const randIdx = Math.floor(Math.random() * list.length);
    const track = list[randIdx];
    const currentPath = currentMetadata ? currentMetadata.path : null;
    if (list.length > 1 && track.path === currentPath) return randomSong();
    selectTrackByList(list, randIdx);
}
async function selectTrack(i) {
    if (i < 0 || i >= playlist.length) return;
    index = i;
    
    document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.getElementById(`item-${i}`);
    if (activeEl) {
        activeEl.classList.add('active');
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    const meta = await callApi('get_metadata', playlist[index].path);
    playMedia(meta);
}

async function selectFavTrack(favIdx) {
    if (favIdx < 0 || favIdx >= currentFavTracks.length) return;
    const track = currentFavTracks[favIdx];
    const globalIdx = playlist.findIndex(t => t.path === track.path);
    if (globalIdx >= 0) index = globalIdx;

    document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.getElementById(`favitem-${favIdx}`);
    if (activeEl) {
        activeEl.classList.add('active');
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    const meta = await callApi('get_metadata', track.path);
    playMedia(meta);
}