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

let isDynamicColorEnabled = true; // Global state for dynamic colors
let currentThemeColor = { r: 255, g: 0, b: 0 }; // Default Inferno Red

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
    
    // Set duration text
    document.getElementById('t-dur').innerText = meta.duration ? fmt(meta.duration) : "0:00";

    if(meta.type === 'audio') {
        audio.src = meta.path;
        current = audio;
        cover.src = meta.cover ? meta.cover : 'alt.png';
        cover.style.display = "block";

        // --- NEW: DYNAMIC COLOR DETECTION ---
        cover.onload = async () => {
            if (isDynamicColorEnabled) {
                const colorData = await getAverageColor(cover);
                // Update global variable for visualizer
                currentThemeColor = { r: colorData.r, g: colorData.g, b: colorData.b };
                // Update CSS variables for UI glow/borders
                document.documentElement.style.setProperty('--red', colorData.hex);
            }
        };
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

// Draw function for visualizer
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
    
    // Determine which color to use: Current Album Color or Default Red
    const theme = isDynamicColorEnabled ? currentColor : { r: 255, g: 0, b: 0 };
    const { r, g, b } = theme;

    const barCount = 60;
    const barWidth = (width / barCount);

    for (let i = 0; i < barCount; i++) {
        const barHeight = (dataArray[i] / 255) * height;

        // Main Bar
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`; 
        ctx.fillRect(i * barWidth, height - barHeight, barWidth - 2, barHeight);

        // Cap (Top line) - slightly brighter
        ctx.fillStyle = `rgb(${Math.min(r + 50, 255)}, ${Math.min(g + 50, 255)}, ${Math.min(b + 50, 255)})`;
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

// STEP 2: SELECTED ITEM
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

// GET COVER COLOR
// Global state to track the current color and animation frame
let currentColor = { r: 255, g: 0, b: 0 }; 
let colorAnimationId = null;

/**
 * Smoothly transitions the --red CSS variable to a new color using JS.
 * @param {Object} target - The destination RGB values {r, g, b}.
 * @param {number} duration - Transition duration in milliseconds.
 */
function animateColorTransition(target, duration = 800) {
    const start = { ...currentColor };
    const startTime = performance.now();

    // Cancel any existing animation to prevent flickering
    if (colorAnimationId) cancelAnimationFrame(colorAnimationId);

    function update(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Cubic ease-out function to make the transition feel natural
        const ease = 1 - Math.pow(1 - progress, 3);

        // Calculate intermediate RGB values
        const r = Math.round(start.r + (target.r - start.r) * ease);
        const g = Math.round(start.g + (target.g - start.g) * ease);
        const b = Math.round(start.b + (target.b - start.b) * ease);

        // Update current state
        currentColor = { r, g, b };

        // Convert to HEX and apply to CSS variable
        const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        document.documentElement.style.setProperty('--dynamic', hex);

        // Continue animation if not finished
        if (progress < 1) {
            colorAnimationId = requestAnimationFrame(update);
        }
    }

    colorAnimationId = requestAnimationFrame(update);
}

/**
 * Extracts the average color and triggers the smooth transition.
 */
function getAverageColor(imgElement) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 64; 
        canvas.height = 64;
        ctx.drawImage(imgElement, 0, 0, 64, 64);

        try {
            const imageData = ctx.getImageData(0, 0, 64, 64).data;
            let r = 0, g = 0, b = 0;

            for (let i = 0; i < imageData.length; i += 4) {
                r += imageData[i];
                g += imageData[i + 1];
                b += imageData[i + 2];
            }

            const count = imageData.length / 4;
            const result = {
                r: Math.floor(r / count),
                g: Math.floor(g / count),
                b: Math.floor(b / count)
            };
            
            // Trigger the smooth transition instead of setting it instantly
            animateColorTransition(result);
            
            resolve(result);
        } catch (e) {
            const fallback = { r: 255, g: 0, b: 0 };
            animateColorTransition(fallback);
            resolve(fallback);
        }
    });
}

function toggleDynamicColor(isEnabled) {
    isDynamicColorEnabled = isEnabled;
    
    if (!isEnabled) {
        // Smoothly transition back to Inferno Red
        animateColorTransition({ r: 255, g: 0, b: 0 });
    } else {
        if (cover.style.display !== "none") {
            cover.onload(); 
        }
    }
}

/* --- DYNAMIC BRIGHTNESS ADJUSTMENT FOR UI --- */
let brightAnimId = null;
let currentBrightState = { r: 255, g: 0, b: 0 }; // Internal tracker for smooth transition

/**
 * @param {Object} inputRGB - The raw {r, g, b} color (e.g., from your average color extractor).
 */
function processDynamicBright(inputRGB) {
    // 1. Calculate perceived brightness (Luminance)
    const luminance = (0.299 * inputRGB.r + 0.587 * inputRGB.g + 0.114 * inputRGB.b);
    
    // Target brightness threshold (0-255). 180 ensures it's clearly visible and "popping".
    const minBrightness = 180;
    
    let target = { ...inputRGB };

    // 2. If the color is too dark, lift it towards white
    if (luminance < minBrightness) {
        // Calculate how much we need to boost (0.0 to 1.0)
        const boostFactor = (minBrightness - luminance) / 255;
        
        // Blend with white (255) to increase brightness while keeping the hue
        target.r = Math.round(target.r + (255 - target.r) * boostFactor);
        target.g = Math.round(target.g + (255 - target.g) * boostFactor);
        target.b = Math.round(target.b + (255 - target.b) * boostFactor);
    }

    // 3. Smooth Transition Logic
    const start = { ...currentBrightState };
    const startTime = performance.now();
    const duration = 1000; // 1 second for a premium smooth feel

    if (brightAnimId) cancelAnimationFrame(brightAnimId);

    function animate(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        
        // Cubic Out Easing: Smooth deceleration
        const ease = 1 - Math.pow(1 - progress, 3);

        // Interpolate RGB values
        currentBrightState.r = Math.round(start.r + (target.r - start.r) * ease);
        currentBrightState.g = Math.round(start.g + (target.g - start.g) * ease);
        currentBrightState.b = Math.round(start.b + (target.b - start.b) * ease);

        // Convert to HEX
        const hex = "#" + (
            (1 << 24) + 
            (currentBrightState.r << 16) + 
            (currentBrightState.g << 8) + 
            currentBrightState.b
        ).toString(16).slice(1);

        // 4. Output as --dynamic-bright
        document.documentElement.style.setProperty('--dynamic-bright', hex);

        if (progress < 1) {
            brightAnimId = requestAnimationFrame(animate);
        }
    }

    brightAnimId = requestAnimationFrame(animate);
}
