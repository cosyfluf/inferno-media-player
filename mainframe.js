const audio = document.getElementById('audio');
const video = document.getElementById('video');
const cover = document.getElementById('cover');
const playIcon = document.getElementById('play-icon');
const progressBar = document.getElementById('progress-bar'); // Neu definiert
const progressFill = document.getElementById('progress-fill'); // Neu definiert

let current = audio;
let playlist = [];
let index = -1;
let isShuffle = false;
let isLoop = false;
let isDragging = false; // Wichtig für das Vorspulen

let audioCtx, analyser, sourceAudio, sourceVideo;

window.addEventListener('pywebviewready', async () => {
    const files = await window.pywebview.api.scan_folder();
    if(files) renderPlaylist(files);

    // --- LAUTSTÄRKE INITIALISIEREN ---
    const volumeSlider = document.getElementById('volume-slider');
    if (volumeSlider) {
        audio.volume = volumeSlider.value;
        video.volume = volumeSlider.value;
        volumeSlider.addEventListener('input', (e) => {
            const vol = e.target.value;
            audio.volume = vol;
            video.volume = vol;
        });
    }

    // --- SUCHE INITIALISIEREN ---
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            document.querySelectorAll('.playlist-item').forEach(item => {
                const title = item.querySelector('.pl-title').innerText.toLowerCase();
                const artist = item.querySelector('.pl-artist').innerText.toLowerCase();
                item.style.display = (title.includes(searchTerm) || artist.includes(searchTerm)) ? "flex" : "none";
            });
        });
    }
});

/* --- START: NEUE PROGRESS BAR LOGIK (DRAG & DROP) --- */
if (progressBar) {
    progressBar.addEventListener('mousedown', (e) => {
        isDragging = true;
        handleScrub(e);
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) handleScrub(e);
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
}

function handleScrub(e) {
    // Verhindert, dass Text markiert wird beim Ziehen
    e.preventDefault(); 

    // 1. Prüfen: Gibt es ein Medium und ist es bereit?
    // readyState < 1 bedeutet: Keine Metadaten (Dauer) vorhanden
    if (!current || current.readyState < 1) {
        console.log("Fehler: Medium nicht bereit.");
        return;
    }

    const dur = current.duration;

    // 2. Prüfen: Ist die Dauer eine gültige Zahl?
    if (!dur || isNaN(dur) || !isFinite(dur)) {
        console.log("Fehler: Dauer ungültig (noch nicht geladen).");
        return;
    }

    const rect = progressBar.getBoundingClientRect();
    
    // Position der Maus berechnen
    let clickX = e.clientX - rect.left;

    // Begrenzen (Clamping), damit Werte nicht negativ werden
    if (clickX < 0) clickX = 0;
    if (clickX > rect.width) clickX = rect.width;

    // Prozent berechnen
    const percentage = clickX / rect.width;
    const targetTime = percentage * dur;

    // 3. Sicherheits-Log in der Konsole (F12 drücken zum Sehen)
    console.log(`Scrubbing: ${Math.round(percentage*100)}% -> Zeit: ${targetTime.toFixed(2)}s`);

    // Zeit setzen - Nur wenn die Zielzeit eine echte, endliche Zahl ist
    if (Number.isFinite(targetTime)) {
        current.currentTime = targetTime;
        
        // Optik sofort updaten
        progressFill.style.width = (percentage * 100) + "%";
        document.getElementById('t-cur').innerText = fmt(targetTime);
    }
}
/* --- ENDE PROGRESS BAR LOGIK --- */

async function changeFolder() {
    const files = await window.pywebview.api.select_folder();
    if(files) renderPlaylist(files);
}

async function manualFile() {
    const meta = await window.pywebview.api.select_file();
    if(meta) {
        document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('active'));
        playMedia(meta);
    }
}

function renderPlaylist(files) {
    playlist = files;
    const container = document.getElementById('playlist');
    
    container.innerHTML = playlist.map((f, i) => {
        const coverSrc = f.cover && f.cover !== "" ? f.cover : 'alt.png';
        return `
        <div class="playlist-item" id="item-${i}" onclick="selectTrack(${i})">
            <img class="pl-cover-mini" src="${coverSrc}" onerror="this.src='alt.png'">
            <div class="pl-text-container">
                <div class="pl-title">${f.name || f.filename}</div>
                <div class="pl-artist">${f.artist || 'Unbekannter Interpret'}</div>
            </div>
        </div>
        `;
    }).join('');
}

async function selectTrack(i) {
    index = i;
    document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.getElementById(`item-${i}`);
    if(activeEl) activeEl.classList.add('active');
    
    const meta = await window.pywebview.api.get_metadata(playlist[index].path);
    playMedia(meta);
}

function playMedia(meta) {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();

    audio.pause(); 
    video.pause();
    cover.style.display = "none";
    video.style.display = "none";

    document.getElementById('title').innerText = meta.title || "Unbekannter Titel";
    document.getElementById('details').innerText = `${meta.artist || 'Inferno Artist'} | ${meta.album || 'No Album'}`;

    if(meta.type === 'audio') {
        audio.src = meta.path;
        current = audio;
        cover.src = meta.cover ? meta.cover : 'alt.png';
        cover.style.display = "block";
    } else {
        video.src = meta.path;
        current = video;
        video.style.display = "block";
    }
    
    current.load();
    current.play().then(() => {
        playIcon.setAttribute('d', "M6 19h4V5H6v14zm8-14v14h4V5h-4z");
        setupVisualizer(current);
    }).catch(e => console.error("Playback failed:", e));
}

function togglePlay() {
    if (current.paused) {
        current.play();
        playIcon.setAttribute('d', "M6 19h4V5H6v14zm8-14v14h4V5h-4z");
    } else {
        current.pause();
        playIcon.setAttribute('d', "M8 5v14l11-7z");
    }
}

function playNext() {
    if (playlist.length === 0) return;
    index = isShuffle ? Math.floor(Math.random() * playlist.length) : (index + 1) % playlist.length;
    selectTrack(index);
}

function playPrev() {
    if (playlist.length === 0) return;
    index = (index - 1 + playlist.length) % playlist.length;
    selectTrack(index);
}

// BEREINIGTE UPDATE LOGIK (Nur noch EIN Block für alles)
[audio, video].forEach(m => {
    m.onended = () => { if(!isLoop) playNext(); else m.play(); };
    
    m.ontimeupdate = () => {
        const dur = m.duration || 0;
        const cur = m.currentTime || 0;
        
        // Update Zeit-Text
        document.getElementById('t-cur').innerText = fmt(cur);
        document.getElementById('t-dur').innerText = fmt(dur);

        // Update Balken nur, wenn User NICHT gerade zieht
        if (!isDragging && dur > 0) {
            const p = (cur / dur) * 100;
            document.getElementById('progress-fill').style.width = p + "%";
        }
    };
});

// --- ZEIT FORMATIERUNG ---
function fmt(s) {
    if (isNaN(s) || !isFinite(s) || s < 0) return "0:00";
    let m = Math.floor(s / 60);
    let r = Math.floor(s % 60);
    return `${m}:${r < 10 ? '0' + r : r}`;
}

function setupVisualizer(elem) {
    if (!audioCtx) return;
    if (!analyser) {
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        draw();
    }
    try {
        if (elem === audio && !sourceAudio) {
            sourceAudio = audioCtx.createMediaElementSource(audio);
            sourceAudio.connect(analyser);
            analyser.connect(audioCtx.destination);
        } else if (elem === video && !sourceVideo) {
            sourceVideo = audioCtx.createMediaElementSource(video);
            sourceVideo.connect(analyser);
            analyser.connect(audioCtx.destination);
        }
    } catch(e) {}
}

function draw() {
    requestAnimationFrame(draw);
    if(!analyser) return;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    const barCount = 60;
    const barWidth = (width / barCount);
    for (let i = 0; i < barCount; i++) {
        const barHeight = (dataArray[i] / 255) * height;
        ctx.fillStyle = `rgb(${dataArray[i] + 100}, 0, 0)`;
        ctx.fillRect(i * barWidth, height - barHeight, barWidth - 2, barHeight);
        ctx.fillStyle = `rgba(255, 255, 255, 0.3)`;
        ctx.fillRect(i * barWidth, height - barHeight, barWidth - 2, 2);
    }
}