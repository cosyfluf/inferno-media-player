

//--- PLAYLIST LOADER LOGIC ---
function setPlaylistLoading(isLoading) {
    const loader = document.getElementById('playlist-loader');
    const sidebar = document.getElementById('sidebar');
    
    if (isLoading) {
        loader.style.display = 'block';
        sidebar.classList.add('loading-active');
    } else {
        loader.style.display = 'none';
        sidebar.classList.remove('loading-active');
    }
}
window.addEventListener('pywebviewready', async () => {
    setPlaylistLoading(true); 
    
    const files = await callApi('scan_folder');
    if(files) renderPlaylist(files);
    
    setPlaylistLoading(false); 
});
//--- PLAYLIST RENDERING LOGIC ---
function renderPlaylist(files) {
    playlist = files;
    const container = document.getElementById('playlist');
    
    container.innerHTML = playlist.map((f, i) => {
        const coverSrc = f.cover && f.cover !== "" ? f.cover : 'alt.png';
        const escapedPath = f.path.replace(/\\/g, '\\\\');
        
        return `
        <div class="playlist-item" id="item-${i}" onclick="selectTrack(${i})">
            <img class="pl-cover-mini" src="${coverSrc}" onerror="this.src='alt.png'">
            <div class="pl-text-container">
                <div class="pl-title">${f.name || f.filename}</div>
                <div class="pl-artist">${f.artist || 'Unknown Artist'}</div>
            </div>
            <!-- Add to Favourite Button -->
            <svg class="add-to-fav-btn" viewBox="0 0 24 24" onclick="showFavSelector(event, '${escapedPath}')">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
            <svg class="show-folder-btn" viewBox="0 0 24 24" title="Show in folder" 
                onclick="showInFolder('${escapedPath}'); event.stopPropagation();">
                <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/>
            </svg>
        </div>
        `;
    }).join('');
}

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
