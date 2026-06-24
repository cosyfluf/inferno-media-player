let filteredPlaylist = [];
let currentFavTracks = [];

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

function getActivePlaylist() {
    if (typeof isViewingFavourite !== 'undefined' && isViewingFavourite) return currentFavTracks;
    if (filteredPlaylist.length > 0) return filteredPlaylist;
    return playlist;
}

function refreshPlaylist() {
    setPlaylistLoading(true);
    callApi('scan_folder').then(files => {
        if (files) {
            renderPlaylist(files);
            applySearchFilter(document.getElementById('search-input').value);
        }
        setPlaylistLoading(false);
    });
}

window.addEventListener('pywebviewready', async () => {
    setPlaylistLoading(true);
    const files = await callApi('scan_folder');
    if (files) renderPlaylist(files);
    setPlaylistLoading(false);
});

function renderPlaylist(files) {
    playlist = files;
    filteredPlaylist = [];
    const container = document.getElementById('playlist');
    const liked = typeof favourites !== 'undefined' ? favourites.find(f => f.name === 'Liked Songs') : null;
    container.innerHTML = playlist.map((f, i) => {
        const coverSrc = f.cover && f.cover !== "" ? f.cover : 'alt.png';
        const escapedPath = f.path.replace(/\\/g, '\\\\');
        const isLiked = liked ? liked.tracks.includes(f.path) : false;
        return `
        <div class="playlist-item" id="item-${i}" onclick="selectTrack(${i})">
            <img class="pl-cover-mini" src="${coverSrc}" onerror="this.src='alt.png'">
            <div class="pl-text-container">
                <div class="pl-title">${f.name || f.filename}</div>
                <div class="pl-artist">${f.artist || 'Unknown Artist'}</div>
            </div>
            <svg class="heart-btn ${isLiked ? 'liked' : ''}" data-path="${f.path}" viewBox="0 0 24 24" onclick="toggleLikeTrack(this.dataset.path, event)">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
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

function applySearchFilter(term) {
    const t = term.toLowerCase().trim();
    filteredPlaylist = [];
    if (!t) {
        document.querySelectorAll('.playlist-item').forEach(item => item.style.display = "flex");
        return;
    }
    document.querySelectorAll('.playlist-item').forEach((item, i) => {
        const title = item.querySelector('.pl-title').innerText.toLowerCase();
        const artist = item.querySelector('.pl-artist').innerText.toLowerCase();
        const match = title.includes(t) || artist.includes(t);
        item.style.display = match ? "flex" : "none";
        if (match) filteredPlaylist.push(playlist[i]);
    });
}

window.addEventListener('pywebviewready', () => {
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

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            applySearchFilter(e.target.value);
        });
    }
});
