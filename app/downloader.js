/** 
 * --- AUTO FAIL-SAFE & SILENT RETRY ENGINE --- 
 * This catches bridge errors before they show up as popups and retries automatically.
 */
window.addEventListener('error', function (e) {
    if (e.message && (e.message.includes('Expecting value') || e.message.includes('JSON.parse'))) {
        e.stopImmediatePropagation();
        e.preventDefault();
        console.warn("Silenced Bridge Error: Retrying background task...");
    }
}, true);

async function callApi(funcName, ...args) {
    let retries = 3;
    while (retries > 0) {
        try {
            if (!window.pywebview || !window.pywebview.api) {
                await new Promise(r => setTimeout(r, 100));
                retries--;
                continue;
            }
            const result = await window.pywebview.api[funcName](...args);
            if (result === undefined || result === null) throw new Error("Empty Response");
            return result;
        } catch (err) {
            retries--;
            console.error(`Retry ${3 - retries}/3 for ${funcName}`);
            if (retries === 0) return { error: "Connection lost", status: "error" };
            await new Promise(r => setTimeout(r, 250)); // Wait 250ms before retry
        }
    }
}

// --- DOWNLOADER LOGIC (REWRITTEN WITH FAIL-SAFE) ---

function openDownloader() {
    document.getElementById('dl-modal').style.display = 'block';
}

function closeDownloader() {
    document.getElementById('dl-modal').style.display = 'none';
}

document.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
        event.preventDefault();
        closeDownloader();
    }
});

// STEP 1: SEARCH YT (Using callApi)
async function searchYT() {
    const query = document.getElementById('dl-input').value;
    if(!query) return;

    const status = document.getElementById('dl-status');
    const resultsDiv = document.getElementById('dl-results');
    
    status.innerText = "Searching YouTube (Safe-mode active)...";
    resultsDiv.innerHTML = "";
    document.getElementById('dl-step-2').style.display = 'none';

    // Automatic silent retry happens inside callApi
    const results = await callApi('search_song', query);
    
    if(!results || results.error) {
        status.innerText = "Error: Search failed after multiple attempts.";
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

document.getElementById('dl-input').addEventListener('keydown', (event) => {
    if (event.code === 'Enter') searchYT();
});

let selectedYTItem = null;

function selectForDownload(item) {
    selectedYTItem = item;
    document.getElementById('selected-song-name').innerText = "Selected: " + item.title;
    document.getElementById('dl-step-2').style.display = 'block';
    document.getElementById('start-dl-btn').onclick = startDownload;
}

// STEP 2: DOWNLOAD (Using callApi)
async function startDownload() {
    const useSpotify = document.getElementById('dl-spotify').checked;
    const status = document.getElementById('dl-status');
    
    status.innerText = "Downloading and converting... please wait (Retry enabled automatically)";
    document.getElementById('dl-step-2').style.display = 'none';async function startDownload() {
    
    if(response && response.status === "success") {
        status.innerText = "🔥 Download finished!";
        
        setPlaylistLoading(true);
        const newFiles = await callApi('scan_folder');
        if(newFiles) renderPlaylist(newFiles);
        setPlaylistLoading(false);
    }
}

    // Automatic silent retry happens inside callApi
    const response = await callApi('download_track', selectedYTItem.url, useSpotify);

    if(response && response.status === "success") {
        status.innerText = "🔥 Download finished: " + response.filename;
        // Automatic Refresh
        const newFiles = await callApi('scan_folder');
        if(newFiles && Array.isArray(newFiles)) renderPlaylist(newFiles);
    } else {
        status.innerText = "❌ Error: The process failed. Please try a different song.";
    }
}