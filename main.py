import webview
import os
import base64
import json
import tkinter as tk
from tkinter import filedialog
from mutagen.id3 import ID3, APIC, TIT2, TPE1, TALB, TCON
from mutagen import File as MutagenFile
from mutagen.mp3 import MP3
from mutagen.mp4 import MP4
from pathlib import Path
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
import threading
import time

# --- NEW LIBRARIES FOR DOWNLOADER ---
import yt_dlp
import requests
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials

# --- CONFIGURATION ---
CONFIG_FILE = Path(__file__).parent / "config.json"

class MediaHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        if parsed_url.path == '/media':
            params = urllib.parse.parse_qs(parsed_url.query)
            file_path = params.get('path', [None])[0]
            if file_path and os.path.exists(file_path):
                file_size = os.path.getsize(file_path)
                range_header = self.headers.get('Range', None)
                byte_start = 0
                byte_end = file_size - 1
                if range_header:
                    range_match = range_header.strip().split('=')[-1]
                    parts = range_match.split('-')
                    if parts[0]: byte_start = int(parts[0])
                    if parts[1]: byte_end = int(parts[1])
                    self.send_response(206)
                    self.send_header('Content-Range', f'bytes {byte_start}-{byte_end}/{file_size}')
                else:
                    self.send_response(200)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'audio/mpeg' if file_path.endswith('.mp3') else 'video/mp4')
                self.send_header('Content-Length', str(byte_end - byte_start + 1))
                self.send_header('Accept-Ranges', 'bytes')
                self.end_headers()
                with open(file_path, 'rb') as f:
                    f.seek(byte_start)
                    self.wfile.write(f.read(byte_end - byte_start + 1))
                return
        self.send_error(404)
    def log_message(self, format, *args): pass

def start_server():
    server = HTTPServer(('127.0.0.1', 8080), MediaHandler)
    server.serve_forever()

class Api:
    def __init__(self):
        self.port = 8080
        self.config = self.load_config()
        self.current_path = self.config.get("default_path", str(Path.home() / "Music"))
        self.sp = None
        self.init_spotify()

    def load_config(self):
        """Load configuration from JSON file."""
        if not CONFIG_FILE.exists():
            default = {
                "default_path": str(Path.home() / "Music"),
                "spotify_client_id": "",
                "spotify_client_secret": ""
            }
            self.save_config_dict(default)
            return default
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)

    def save_config_dict(self, config_dict):
        """Save whole dictionary to config file."""
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config_dict, f, indent=4)

    def save_config(self, path):
        """Update only the path in config."""
        self.config["default_path"] = path
        self.save_config_dict(self.config)

    def init_spotify(self):
        """Initialize Spotify API if credentials exist."""
        cid = self.config.get("spotify_client_id")
        secret = self.config.get("spotify_client_secret")
        if cid and secret:
            try:
                auth_manager = SpotifyClientCredentials(client_id=cid, client_secret=secret)
                self.sp = spotipy.Spotify(auth_manager=auth_manager)
            except Exception as e:
                print(f"Spotify Init Error: {e}")

    # --- DOWNLOADER METHODS ---

    def search_song(self, query):
        """Search YouTube for songs based on query."""
        ydl_opts = {'format': 'bestaudio', 'noplaylist': True, 'quiet': True}
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # Search for top 5 results
                info = ydl.extract_info(f"ytsearch5:{query}", download=False)
                results = []
                for entry in info['entries']:
                    results.append({
                        'title': entry.get('title'),
                        'url': entry.get('webpage_url'),
                        'duration': entry.get('duration'),
                        'thumbnail': entry.get('thumbnail'),
                        'id': entry.get('id')
                    })
                return results
        except Exception as e:
            return {"error": str(e)}

    def get_spotify_data(self, song_name):
        """Fetch rich metadata from Spotify."""
        if not self.sp:
            return None
        try:
            results = self.sp.search(q=song_name, limit=1, type='track')
            tracks = results['tracks']['items']
            if tracks:
                t = tracks[0]
                return {
                    "title": t['name'],
                    "artist": t['artists'][0]['name'],
                    "album": t['album']['name'],
                    "cover_url": t['album']['images'][0]['url'] if t['album']['images'] else None
                }
        except Exception as e:
            print(f"Spotify Search Error: {e}")
        return None

    def download_track(self, yt_url, use_spotify=False):
        """Download song with automatic retries and metadata tagging."""
        max_retries = 3
        attempt = 0
        
        while attempt < max_retries:
            try:
                # 1. Extract info to get title for file naming
                with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
                    info = ydl.extract_info(yt_url, download=False)
                    raw_title = info.get('title', 'Unknown_Song')
                
                clean_name = "".join([c for c in raw_title if c.isalnum() or c in (' ', '.', '_')]).rstrip()
                file_path = os.path.join(self.current_path, f"{clean_name}.mp3")

                # 2. Download and Convert to MP3
                ydl_opts = {
                    'format': 'bestaudio/best',
                    'outtmpl': os.path.join(self.current_path, clean_name),
                    'postprocessors': [{
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                        'preferredquality': '192',
                    }],
                    'quiet': True
                }
                
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([yt_url])
                
                # 3. Handle Metadata
                self._apply_metadata(file_path, raw_title, use_spotify)
                
                return {"status": "success", "file": clean_name}

            except Exception as e:
                attempt += 1
                print(f"Download attempt {attempt} failed: {e}")
                time.sleep(2)
        
        return {"status": "error", "message": "Failed after multiple attempts"}

    def _apply_metadata(self, file_path, yt_title, use_spotify):
        """Inner helper to tag the file."""
        title = yt_title
        artist = "Unknown Artist"
        album = "Inferno Downloads"
        cover_data = None

        if use_spotify:
            meta = self.get_spotify_data(yt_title)
            if meta:
                title = meta['title']
                artist = meta['artist']
                album = meta['album']
                if meta['cover_url']:
                    try:
                        cover_data = requests.get(meta['cover_url']).content
                    except: pass

        try:
            audio = MP3(file_path, ID3=ID3)
            # Add basic tags
            audio.tags.add(TIT2(encoding=3, text=title))
            audio.tags.add(TPE1(encoding=3, text=artist))
            audio.tags.add(TALB(encoding=3, text=album))
            
            # Add cover if exists
            if cover_data:
                audio.tags.add(APIC(encoding=3, mime='image/jpeg', type=3, desc=u'Cover', data=cover_data))
            
            audio.save()
        except Exception as e:
            print(f"Tagging Error: {e}")

    # --- EXISTING METHODS ---

    def get_local_url(self, file_path):
        return f"http://127.0.0.1:{self.port}/media?path={urllib.parse.quote(str(file_path))}"

    def select_folder(self):
        root = tk.Tk()
        root.withdraw()
        path = filedialog.askdirectory()
        root.destroy()
        if path:
            self.current_path = path
            self.save_config(path)
            return self.scan_folder(path)
        return None

    def scan_folder(self, folder_path_str=None):
        search_path = Path(folder_path_str if folder_path_str else self.current_path)
        files_list = []
        extensions = ('.mp3', '.ogg', '.wav', '.mp4', '.webm')
        try:
            for file in search_path.rglob('*'):
                if file.suffix.lower() in extensions:
                    meta = self.get_metadata(str(file.absolute()))
                    files_list.append({
                        "name": meta["title"],
                        "artist": meta["artist"],
                        "path": str(file.absolute()),
                        "cover": meta["cover"],
                        "duration": meta["duration"],
                        "filename": str(file.name)
                    })
        except Exception as e:
            print(f"Scan Error: {e}")
        return sorted(files_list, key=lambda x: x['name'])

    def get_metadata(self, file_path):
        path_str = file_path
        metadata = {"path": self.get_local_url(path_str), "title": os.path.basename(path_str), "artist": "Unknown Artist", "album": "Unknown Album", "genre": "Inferno Media", "cover": "", "duration": 0, "type": "audio"}
        ext = path_str.lower()
        try:
            if ext.endswith(('.mp4', '.webm')):
                metadata["type"] = "video"
                m_file = MutagenFile(path_str)
                if m_file: metadata["duration"] = m_file.info.length
            elif ext.endswith('.mp3'):
                audio = MP3(path_str, ID3=ID3)
                metadata["duration"] = audio.info.length
                if audio.tags:
                    if 'TIT2' in audio.tags: metadata["title"] = str(audio.tags['TIT2'].text[0])
                    if 'TPE1' in audio.tags: metadata["artist"] = str(audio.tags['TPE1'].text[0])
                    if 'TALB' in audio.tags: metadata["album"] = str(audio.tags['TALB'].text[0])
                    for tag in audio.tags.values():
                        if isinstance(tag, APIC):
                            b64_data = base64.b64encode(tag.data).decode('utf-8')
                            metadata["cover"] = f"data:{tag.mime};base64,{b64_data}"
                            break
            else:
                m_file = MutagenFile(path_str)
                if m_file: metadata["duration"] = m_file.info.length
        except: pass
        return metadata

def run():
    threading.Thread(target=start_server, daemon=True).start()
    api = Api()
    webview.create_window('Inferno Media Player', 'index.html', js_api=api, width=1200, height=850, background_color='#050000')
    webview.start()

if __name__ == '__main__':
    run()