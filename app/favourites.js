let favourites = [];
let currentFavImage = null;
let isViewingFavourite = false; // To track if we are looking at local files or a playlist


// --- FAVOURITES LOGIC ---

// Load favourites when app starts
window.addEventListener('pywebviewready', async () => {
    favourites = await window.pywebview.api.load_favourites();
    renderFavouritesSidebar();
});

function openFavModal() { document.getElementById('fav-modal').style.display = 'block'; }
function closeFavModal() { document.getElementById('fav-modal').style.display = 'none'; }

async function selectFavImage() {
    const b64 = await window.pywebview.api.select_fav_image();
    if(b64) {
        currentFavImage = b64;
        document.getElementById('fav-image-preview').style.backgroundImage = `url(${b64})`;
        document.getElementById('fav-image-preview').innerText = "";
    }
}

async function createNewFavourite() {
    const name = document.getElementById('fav-name-input').value;
    if(!name) return alert("Please enter a name");

    const newFav = {
        id: Date.now(),
        name: name,
        image: currentFavImage || 'alt.png',
        tracks: [] // Paths stored here
    };

    favourites.push(newFav);
    await window.pywebview.api.save_favourites_list(favourites);
    
    renderFavouritesSidebar();
    closeFavModal();
    // Reset inputs
    document.getElementById('fav-name-input').value = "";
    currentFavImage = null;
    document.getElementById('fav-image-preview').style.backgroundImage = "none";
    document.getElementById('fav-image-preview').innerText = "Click to add Cover";
}

function renderFavouritesSidebar() {
    const container = document.getElementById('favourites-list');
    container.innerHTML = favourites.map(fav => `
        <div class="fav-item" onclick="viewFavourite(${fav.id})">
            <img src="${fav.image}">
            <span>${fav.name}</span>
        </div>
    `).join('');
}

// Shows a small menu to pick which playlist to add a song to
function showFavSelector(event, trackPath) {
    event.stopPropagation();
    
    // Remove old selector if exists
    const old = document.querySelector('.fav-selector');
    if(old) old.remove();

    const selector = document.createElement('div');
    selector.className = 'fav-selector';
    selector.style.left = event.clientX + "px";
    selector.style.top = event.clientY + "px";

    if(favourites.length === 0) {
        selector.innerHTML = `<div class="menu-item">No Playlists</div>`;
    }

    favourites.forEach(fav => {
        const item = document.createElement('div');
        item.className = 'menu-item';
        item.style.fontSize = "12px";
        item.innerText = "Add to: " + fav.name;
        item.onclick = async () => {
            if(!fav.tracks.includes(trackPath)) {
                fav.tracks.push(trackPath);
                await window.pywebview.api.save_favourites_list(favourites);
            }
            selector.remove();
        };
        selector.appendChild(item);
    });

    document.body.appendChild(selector);
    
    // Close when clicking elsewhere
    setTimeout(() => {
        window.onclick = () => { selector.remove(); window.onclick = null; };
    }, 100);
}

async function viewFavourite(id) {
    const fav = favourites.find(f => f.id === id);
    if(!fav) return;

    isViewingFavourite = true;
    
    // Show the back button in the sidebar
    document.getElementById('back-to-local').style.display = 'inline';
    
    // Convert stored paths back to full metadata objects
    const tracks = [];
    for(let path of fav.tracks) {
        const meta = await window.pywebview.api.get_metadata(path, false);
        tracks.push({
            name: meta.title,
            artist: meta.artist,
            path: path,
            cover: meta.cover,
            duration: meta.duration
        });
    }

    // Update main UI Header
    document.getElementById('title').innerText = fav.name;
    document.getElementById('details').innerText = "Favourite Playlist";
    
    // Update cover image if available
    if(fav.image) {
        const coverImg = document.getElementById('cover');
        coverImg.src = fav.image;
        coverImg.style.display = "block";
    }

    renderPlaylist(tracks);
}

// Function to return to the main local library
async function backToLocalFiles() {
    isViewingFavourite = false;
    
    // Hide back button and reset info text
    document.getElementById('back-to-local').style.display = 'none';
    document.getElementById('title').innerText = "Ready for INFERNO?";
    document.getElementById('details').innerText = "Select a track from your playlist";
    
    // Trigger loader
    setPlaylistLoading(true);
    
    // Rescan the local folder and re-render the playlist
    const files = await window.pywebview.api.scan_folder();
    if(files) renderPlaylist(files);
    
    setPlaylistLoading(false);
}