let favourites = [];
let currentFavImage = null;
let isViewingFavourite = false;

window.addEventListener('pywebviewready', async () => {
    favourites = await window.pywebview.api.load_favourites();
    renderFavouritesSidebar();
});

function openFavModal() { document.getElementById('fav-modal').style.display = 'block'; }
function closeFavModal() { document.getElementById('fav-modal').style.display = 'none'; }

async function selectFavImage() {
    const b64 = await window.pywebview.api.select_fav_image();
    if (b64) {
        currentFavImage = b64;
        document.getElementById('fav-image-preview').style.backgroundImage = `url(${b64})`;
        document.getElementById('fav-image-preview').innerText = "";
    }
}

async function createNewFavourite() {
    const name = document.getElementById('fav-name-input').value;
    if (!name) return alert("Please enter a name");

    const newFav = {
        id: Date.now(),
        name: name,
        image: currentFavImage || 'alt.png',
        tracks: []
    };

    favourites.push(newFav);
    await window.pywebview.api.save_favourites_list(favourites);

    renderFavouritesSidebar();
    closeFavModal();
    document.getElementById('fav-name-input').value = "";
    currentFavImage = null;
    document.getElementById('fav-image-preview').style.backgroundImage = "none";
    document.getElementById('fav-image-preview').innerText = "Click to add Cover";
}

function renderFavouritesSidebar() {
    const container = document.getElementById('favourites-list');
    container.innerHTML = favourites.map(fav => `
        <div class="fav-item" onclick="viewFavourite(${fav.id})" oncontextmenu="showFavContextMenu(event, ${fav.id})">
            <img src="${fav.image}">
            <span>${fav.name}</span>
            <span style="margin-left:auto;font-size:11px;color:#555;">${fav.tracks.length}</span>
        </div>
    `).join('');
}

function showFavContextMenu(event, favId) {
    event.preventDefault();
    const old = document.querySelector('.fav-selector');
    if (old) old.remove();

    const menu = document.createElement('div');
    menu.className = 'fav-selector';
    menu.style.left = event.clientX + "px";
    menu.style.top = event.clientY + "px";

    const renameItem = document.createElement('div');
    renameItem.className = 'menu-item';
    renameItem.style.fontSize = "12px";
    renameItem.innerText = "✏ Rename";
    renameItem.onclick = async () => {
        const fav = favourites.find(f => f.id === favId);
        if (!fav) return;
        const newName = prompt("New name:", fav.name);
        if (newName && newName.trim()) {
            fav.name = newName.trim();
            await window.pywebview.api.save_favourites_list(favourites);
            renderFavouritesSidebar();
        }
        menu.remove();
    };

    const deleteItem = document.createElement('div');
    deleteItem.className = 'menu-item';
    deleteItem.style.fontSize = "12px";
    deleteItem.style.color = "#ff4444";
    deleteItem.innerText = "🗑 Delete";
    deleteItem.onclick = async () => {
        if (confirm("Delete this playlist?")) {
            favourites = favourites.filter(f => f.id !== favId);
            await window.pywebview.api.save_favourites_list(favourites);
            renderFavouritesSidebar();
            if (isViewingFavourite) backToLocalFiles();
        }
        menu.remove();
    };

    menu.appendChild(renameItem);
    menu.appendChild(deleteItem);
    document.body.appendChild(menu);

    setTimeout(() => {
        window.onclick = () => { menu.remove(); window.onclick = null; };
    }, 100);
}

function showFavSelector(event, trackPath) {
    event.stopPropagation();
    const old = document.querySelector('.fav-selector');
    if (old) old.remove();

    const selector = document.createElement('div');
    selector.className = 'fav-selector';
    selector.style.left = event.clientX + "px";
    selector.style.top = event.clientY + "px";

    if (favourites.length === 0) {
        selector.innerHTML = `<div class="menu-item">No Playlists</div>`;
    }

    favourites.forEach(fav => {
        const item = document.createElement('div');
        item.className = 'menu-item';
        item.style.fontSize = "12px";
        item.innerText = "Add to: " + fav.name;
        item.onclick = async () => {
            if (!fav.tracks.includes(trackPath)) {
                fav.tracks.push(trackPath);
                await window.pywebview.api.save_favourites_list(favourites);
                renderFavouritesSidebar();
            }
            selector.remove();
        };
        selector.appendChild(item);
    });

    document.body.appendChild(selector);

    setTimeout(() => {
        window.onclick = () => { selector.remove(); window.onclick = null; };
    }, 100);
}

async function viewFavourite(id) {
    const fav = favourites.find(f => f.id === id);
    if (!fav) return;

    isViewingFavourite = true;
    document.getElementById('back-to-local').style.display = 'inline';

    const tracks = [];
    for (let path of fav.tracks) {
        const meta = await window.pywebview.api.get_metadata(path, false);
        tracks.push({
            name: meta.title,
            artist: meta.artist,
            path: path,
            cover: meta.cover,
            duration: meta.duration,
            _favId: fav.id
        });
    }

    document.getElementById('title').innerText = fav.name;
    document.getElementById('details').innerText = "Favourite Playlist";

    if (fav.image) {
        const coverImg = document.getElementById('cover');
        coverImg.src = fav.image;
        coverImg.style.display = "block";
    }

    currentFavTracks = tracks;
    renderFavouriteTracks(tracks, fav.id);
}

function renderFavouriteTracks(tracks, favId) {
    const container = document.getElementById('playlist');
    container.innerHTML = tracks.map((f, i) => {
        const coverSrc = f.cover && f.cover !== "" ? f.cover : 'alt.png';
        const escapedPath = f.path.replace(/\\/g, '\\\\');
        return `
        <div class="playlist-item" id="favitem-${i}" onclick="selectFavTrack(${i})">
            <img class="pl-cover-mini" src="${coverSrc}" onerror="this.src='alt.png'">
            <div class="pl-text-container">
                <div class="pl-title">${f.name || f.filename}</div>
                <div class="pl-artist">${f.artist || 'Unknown Artist'}</div>
            </div>
            <svg class="show-folder-btn" viewBox="0 0 24 24" title="Remove from playlist" 
                onclick="removeTrackFromFav(${favId}, '${escapedPath}', ${i}); event.stopPropagation();"
                style="fill:#ff4444;opacity:1;">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
        </div>
        `;
    }).join('');
}

async function removeTrackFromFav(favId, trackPath, localIndex) {
    const fav = favourites.find(f => f.id === favId);
    if (!fav) return;
    fav.tracks = fav.tracks.filter(p => p !== trackPath);
    await window.pywebview.api.save_favourites_list(favourites);
    renderFavouritesSidebar();
    viewFavourite(favId);
}

async function backToLocalFiles() {
    isViewingFavourite = false;
    currentFavTracks = [];
    document.getElementById('back-to-local').style.display = 'none';
    document.getElementById('title').innerText = "Ready for INFERNO?";
    document.getElementById('details').innerText = "Select a track from your playlist";

    setPlaylistLoading(true);
    const files = await window.pywebview.api.scan_folder();
    if (files) renderPlaylist(files);
    setPlaylistLoading(false);
}
