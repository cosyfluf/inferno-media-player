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
    container.innerHTML = playlist.map((f, i) => {
        const coverSrc = f.cover && f.cover !== "" ? f.cover : 'alt.png';
        const escapedPath = f.path.replace(/\\/g, '\\\\');
        return `
        <div class="playlist-item" id="item-${i}" onclick="selectTrack(${i})" oncontextmenu="showPlaylistContextMenu(event, ${i})">
            <img class="pl-cover-mini" src="${coverSrc}" onerror="this.src='alt.png'">
            <div class="pl-text-container">
                <div class="pl-title">${f.name || f.filename}</div>
                <div class="pl-artist">${f.artist || 'Unknown Artist'}</div>
            </div>
            <svg class="add-to-fav-btn" viewBox="0 0 24 24" onclick="showFavSelector(event, '${escapedPath}')">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
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

function showPlaylistContextMenu(event, index) {
    event.preventDefault();
    event.stopPropagation();
    const old = document.querySelector('.fav-selector');
    if (old) old.remove();

    const item = playlist[index];
    if (!item) return;

    const menu = document.createElement('div');
    menu.className = 'fav-selector';
    menu.style.left = event.clientX + "px";
    menu.style.top = event.clientY + "px";

    const folderItem = document.createElement('div');
    folderItem.className = 'menu-item';
    folderItem.innerText = "Show in folder";
    folderItem.onclick = (e) => {
        e.stopPropagation();
        showInFolder(item.path);
        menu.remove();
    };

    menu.appendChild(folderItem);
    document.body.appendChild(menu);

    setTimeout(() => {
        window.onclick = (e) => {
            if (e && e.target && menu.contains(e.target)) return;
            menu.remove();
            window.onclick = null;
        };
    }, 100);
}
