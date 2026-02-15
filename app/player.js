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

async function showInFolder(path) {
    if (window.pywebview && window.pywebview.api) {
        await window.pywebview.api.show_in_folder(path);
    }
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
document.addEventListener('keydown', (event) => {
        if (event.code === 'Space' && event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
            event.preventDefault();
            togglePlay();
        }
    });


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

// --- RANDOM SONG FUNCTION ---
function randomSong() {
    // 1. Check if there are any songs in the playlist
    if (playlist && playlist.length > 0) {
        
        // 2. Generate a random index between 0 and playlist length
        const randomIndex = Math.floor(Math.random() * playlist.length);
        
        // 3. Avoid repeating the same song if possible
        if (playlist.length > 1 && randomIndex === index) {
            return randomSong(); // Try again
        }

        // 4. Use your existing selectTrack function to fetch metadata and play
        selectTrack(randomIndex);
    } else {
        console.log("Playlist is empty, cannot play random song.");
    }
}
// --- FAVOURITES / PLAYLISTS autoscroll ---
async function selectTrack(i) {
    index = i;
    
    // UI: Update active state classes
    document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.getElementById(`item-${i}`);
    
    if (activeEl) {
        activeEl.classList.add('active');
        
        // AUTO-SCROLL: Scroll the active item to the center of the playlist container
        activeEl.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }
    
    // Metadata and playback logic
    const meta = await window.pywebview.api.get_metadata(playlist[index].path);
    playMedia(meta);
}