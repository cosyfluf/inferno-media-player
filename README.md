
# 🔥 Inferno Media Player

![Python](https://img.shields.io/badge/Made%20with-Python-blue)
![License](https://img.shields.io/badge/License-MIT-green)

**Inferno Media Player** is a lightweight, modern, and high-performance desktop media player built with **Python** and **Web Technologies**. It combines a sleek "Inferno" dark aesthetic with powerful playback, library management, and downloading capabilities.

The player features a real-time audio visualizer, seamless video support, and an integrated YouTube-to-MP3 downloader enriched with Spotify metadata.

---

## 📸 Screenshots

| Main Player Interface | Custom Library (Favourites) | Song Downloader | 
| :---: | :---: | :---: |
| ![Main UI](screenshots/demo.png) | ![Library UI](screenshots/library.png) | ![Downloader](screenshots/downloader.png) |
| *Visualizer and Playlist* | *Custom Playlists with Artwork* | *Spotify metadata enrichment* |

---

## 🚀 Key Features

*   **Hybrid Architecture:** Powered by `pywebview`, bridging an HTML5/CSS3/JS frontend with a Python backend.
*   **Custom Library System (Favourites):** 
    *   **Create Playlists:** Create and name your own playlists.
    *   **Custom Artwork:** Upload your own cover images for every playlist.
    *   **Easy Management:** Add any local song to your favourites with a single click.
*   **Discord Rich Presence:** Automatically shows track titles, artists, and album covers on your Discord profile.
*   **Multi-Format Support:** Plays **Audio** (MP3, WAV, OGG) and **Video** (MP4, WEBM).
*   **Real-time Visualizer:** Integrated HTML5 Canvas spectrum visualizer reacting to live audio data.
*   **Smart Library Management:**
    *   **Folder Scanning:** Automatically extracts metadata and ID3 tags.
    *   **Instant Search:** Filter local files or playlists by title or artist.
*   **Integrated YouTube Downloader:**
    *   **Normal Mode:** Fast YouTube-to-MP3 conversion.
    *   **Detailed Mode:** Uses the **Spotify API** to fetch official album covers and tags.
*   **Persistent Storage:** Saves your music folder, API credentials, and custom playlists in `config.json` and `favourites.json`.

---

## 🛠️ Tech Stack

*   **Backend:** Python 3.10+
*   **Downloader Engine:** `yt-dlp` (YouTube) & `spotipy` (Spotify API).
*   **Presence:** `pypresence` for Discord Rich Presence integration.
*   **Metadata:** `mutagen` for ID3 tagging.
*   **Frontend:** HTML5, CSS3, Vanilla JavaScript.
*   **Database:** JSON-based persistent storage (`config.json`, `favourites.json`).
*   **Server:** Internal Python range-request server for high-performance media streaming.

---

## ⚙️ Configuration (Spotify & Discord)

To use the **"Detailed Version"** in the downloader and enable Discord Rich Presence with covers, provide your credentials in the `config.json`.

1.  **Spotify:** Visit the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) to get a **Client ID** and **Client Secret**.
2.  **Discord:** The application uses a default Client ID (`1471223610315247616`) for the Inferno presence.
3.  Create/Edit `config.json` in the root folder:

### `config.json` Example:
```json
{
    "default_path": "C:\\Users\\Name\\Music",
    "spotify_client_id": "your-spotify-client-id",
    "spotify_client_secret": "your-spotify-client-secret",
    "discord_client_id": "1471223610315247616"
}
```

---

## 📦 Installation & Usage

### 1. Prerequisites
Ensure you have **FFmpeg** installed on your system (required for MP3 conversion). Install the Python dependencies:

```bash
pip install pywebview yt-dlp spotipy mutagen requests pypresence
```

### 2. Run the Application
Launch the player by running:

```bash
python main.py
```

---

## 📜 License

This project is licensed under the MIT License.

---

**Created with 🔥 by cosyfluf**
