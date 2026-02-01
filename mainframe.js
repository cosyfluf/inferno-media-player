const audio = document.getElementById('audio');
const video = document.getElementById('video');
const cover = document.getElementById('cover');
const playIcon = document.getElementById('play-icon');
const progressBar = document.getElementById('progress-bar'); // progress bar container
const progressFill = document.getElementById('progress-fill'); // progress fill element

let current = audio;
let playlist = [];
let index = -1;
let isShuffle = false;
let isLoop = false;
let isDragging = false; // needed for progress bar dragging

let audioCtx, analyser, sourceAudio, sourceVideo;

let isVisualizerEnabled = true; // on by default

// --- INIT PLAYLIST ON LOAD ---

window.addEventListener('pywebviewready', async () => {
    const files = await window.pywebview.api.scan_folder();
    if(files) renderPlaylist(files);

    // --- INIT VOLUME SLIDER ---
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

    // ---INITI SEARCH---
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

function handleScrub(e) {
    // prevent default behavior
    e.preventDefault(); 

    // test for valid media
    if (!current || current.readyState < 1) {
        console.log("Error: Media not ready.");
        return;
    }

    const dur = current.duration;

    // test for valid duration

    if (!dur || isNaN(dur) || !isFinite(dur)) {
        console.log("Error: Invalid duration (not yet loaded).");
        return;
    }

    const rect = progressBar.getBoundingClientRect();
    
    // calculate click position
    let clickX = e.clientX - rect.left;

    // clamp limits
    if (clickX < 0) clickX = 0;
    if (clickX > rect.width) clickX = rect.width;

    // calculate percentage and target time
    const percentage = clickX / rect.width;
    const targetTime = percentage * dur;

    // safety log open by F12
    console.log(`Scrubbing: ${Math.round(percentage*100)}% -> Time: ${targetTime.toFixed(2)}s`);

    // time set and UI update
    if (Number.isFinite(targetTime)) {
        current.currentTime = targetTime;
        
        // optic update of progress bar and time text
        progressFill.style.width = (percentage * 100) + "%";
        document.getElementById('t-cur').innerText = fmt(targetTime);
    }
}
// end of PROGRESS BAR LOGIC

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
                <div class="pl-artist">${f.artist || 'Unknown Artist'}</div>
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

    // Set UI Text
    document.getElementById('title').innerText = meta.title || "Unknown Title";
    document.getElementById('details').innerText = `${meta.artist || 'Inferno Artist'} | ${meta.album || 'No Album'}`;
    
    // set duration text
    if (meta.duration) {
        document.getElementById('t-dur').innerText = fmt(meta.duration);
    } else {
        document.getElementById('t-dur').innerText = "0:00";
    }

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

/**
 * Calculates the new time based on mouse position and updates the UI/Media
 * @param {MouseEvent} e 
 */
function handleScrub(e) {
    if (!current || !isFinite(current.duration)) return;

    const rect = progressBar.getBoundingClientRect();
    
    // Calculate horizontal offset relative to the progress bar container
    let offsetX = e.clientX - rect.left;

    // Clamp the value between 0 and the bar's full width
    offsetX = Math.max(0, Math.min(offsetX, rect.width));

    // Calculate percentage and target time
    const percentage = offsetX / rect.width;
    const targetTime = percentage * current.duration;

    // Update the media playback position
    current.currentTime = targetTime;

    // Immediate UI feedback for the fill bar and the timestamp
    progressFill.style.width = (percentage * 100) + "%";
    document.getElementById('t-cur').innerText = fmt(targetTime);
}


// --- MEDIA EVENTS ---
[audio, video].forEach(m => {
    m.onended = () => { if(!isLoop) playNext(); else m.play(); };
    
    m.ontimeupdate = () => {
        // Only update the progress bar automatically if the user is NOT dragging it
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

// --- TOGGLE VISUAL ---
function toggleVisualizer(isEnabled) {
    isVisualizerEnabled = isEnabled;
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');

    if (!isEnabled) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
        draw();
    }
}
// --- VISUAL ---
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

    if (!isVisualizerEnabled) return;

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
        ctx.fillStyle = `rgb(${dataArray[i] + 52}, 255, 11)`;  //Greenish color based on frequency
        ctx.fillRect(i * barWidth, height - barHeight, barWidth - 2, barHeight);
        ctx.fillStyle = `rgb(52, 255, 11)`; // Bright green for the cap
        ctx.fillRect(i * barWidth, height - barHeight, barWidth - 2, 2);
    }
}

// --- RANDOM SONG FUNCTION ---
function randomSong() {
    // 1. Check if there are any songs in the playlist
    if (playlist && playlist.length > 0) {
        
        // 2. Generate a random index between 0 and playlist length
        const randomIndex = Math.floor(Math.random() * playlist.length);
        
        // 3. Optional: If you want to avoid playing the SAME song again 
        // (only if the playlist has more than 1 song)
        if (playlist.length > 1 && randomIndex === index) {
            return randomSong(); // Try again
        }

        // 4. Use your existing selectTrack function to fetch metadata and play
        selectTrack(randomIndex);
    } else {
        console.log("Playlist is empty, cannot play random song.");
    }
}

// --- DOWNLOADER LOGIC ---

function openDownloader() {
    document.getElementById('dl-modal').style.display = 'block';
}

function closeDownloader() {
    document.getElementById('dl-modal').style.display = 'none';
}

async function searchYT() {
    const query = document.getElementById('dl-input').value;
    if(!query) return;

    const status = document.getElementById('dl-status');
    const resultsDiv = document.getElementById('dl-results');
    
    status.innerText = "Searching YouTube...";
    resultsDiv.innerHTML = "";
    document.getElementById('dl-step-2').style.display = 'none';

    const results = await window.pywebview.api.search_song(query);
    
    if(results.error) {
        status.innerText = "Error: " + results.error;
        return;
    }

    status.innerText = "Select a version:";
    results.forEach(item => {
        const div = document.createElement('div');
        div.className = 'dl-result-item';
        div.innerHTML = `
            <img src="${item.thumbnail}">
            <div>
                <div style="font-weight:bold">${item.title}</div>
                <div style="font-size:0.8em; color:#888">${Math.floor(item.duration/60)}:${(item.duration%60).toString().padStart(2,'0')}</div>
            </div>
        `;
        div.onclick = () => selectForDownload(item);
        resultsDiv.appendChild(div);
    });
}

let selectedYTItem = null;

function selectForDownload(item) {
    selectedYTItem = item;
    document.getElementById('selected-song-name').innerText = "Selected: " + item.title;
    document.getElementById('dl-step-2').style.display = 'block';
    
    document.getElementById('start-dl-btn').onclick = startDownload;
}

async function startDownload() {
    const useSpotify = document.getElementById('dl-spotify').checked;
    const status = document.getElementById('dl-status');
    
    status.innerText = "Downloading and converting... please wait (Retry enabled automatically)";
    document.getElementById('dl-step-2').style.display = 'none';

    const response = await window.pywebview.api.download_track(selectedYTItem.url, useSpotify);

    if(response.status === "success") {
        status.innerText = "🔥 Download finished: " + response.filename;
        // Automatic Refresh
        const newFiles = await window.pywebview.api.scan_folder();
        if(newFiles) renderPlaylist(newFiles);
    } else {
        status.innerText = "❌ Error: " + response.message;
    }
}