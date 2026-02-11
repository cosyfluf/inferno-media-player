import webview
import os
import base64
import json
import tkinter as tk
from tkinter import filedialog
from mutagen.id3 import ID3, APIC, TIT2, TPE1, TALB
from mutagen import File as MutagenFile
from mutagen.mp3 import MP3
from mutagen.mp4 import MP4
from pathlib import Path
import urllib.parse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import threading
import time
import requests
import platform
import subprocess
from pypresence import Presence

# --- DOWNLOADER LIBRARIES ---
import yt_dlp
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials

# --- CONFIGURATION ---
CONFIG_FILE = Path(__file__).parent / "config.json"
window = None 

# --- DISCORD MANAGER ---
class DiscordManager:
    """Manages Discord Rich Presence communication in a non-blocking way."""
    def __init__(self, client_id):
        self.client_id = client_id
        self.rpc = None
        self.enabled = False
        if client_id and client_id != "YOUR_DISCORD_ID":
            self.enabled = True

    def connect(self):
        """Attempts to connect to the Discord client."""
        try:
            if not self.rpc:
                self.rpc = Presence(self.client_id)
                self.rpc.connect()
        except:
            self.rpc = None

    def update(self, title, artist, cover_url=None):
        """Updates the Discord status with optional album cover URL."""
        if not self.enabled: return
        def _th():
            try:
                self.connect()
                if self.rpc:
                    # Discord needs a direct URL for large_image to display external covers
                    img = cover_url if cover_url else "app_logo"
                    self.rpc.update(
                        details=f"🎵 {title}",
                        state=f"by {artist}",
                        large_image=img,
                        large_text="Inferno Media Player",
                        start=time.time()
                    )
            except: pass
        threading.Thread(target=_th, daemon=True).start()

# --- MEDIA SERVER ---
class MediaHandler(SimpleHTTPRequestHandler):
    """Handles local file streaming with support for Range requests."""
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
    """Starts the threaded HTTP server."""
    server = ThreadingHTTPServer(('127.0.0.1', 8080), MediaHandler)
    server.serve_forever()

# --- API FOR FRONTEND ---
class Api:
    def __init__(self):
        self.port = 8080
        self._config = self.load_config()
        self.current_path = self._config.get("default_path", str(Path.home() / "Music"))
        self._sp = None 
        self._discord = DiscordManager(self._config.get("discord_client_id", "YOUR_DISCORD_ID"))
        self.init_spotify()

    def load_config(self):
        if not CONFIG_FILE.exists():
            default = {
                "default_path": str(Path.home() / "Music"),
                "spotify_client_id": "YOUR_ID",
                "spotify_client_secret": "YOUR_SECRET",
                "discord_client_id": "YOUR_DISCORD_ID"
            }
            self.save_config_dict(default)
            return default
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return {"default_path": str(Path.home() / "Music")}

    def save_config_dict(self, config_dict):
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config_dict, f, indent=4)

    def save_config(self, path):
        self._config["default_path"] = path
        self.save_config_dict(self._config)

    def init_spotify(self):
        cid = self._config.get("spotify_client_id")
        secret = self._config.get("spotify_client_secret")
        if cid and secret and "YOUR_" not in cid:
            try:
                auth_manager = SpotifyClientCredentials(client_id=cid, client_secret=secret)
                self._sp = spotipy.Spotify(auth_manager=auth_manager)
            except: pass

    def get_spotify_cover_url(self, title, artist):
        """Fetches a public image URL from Spotify for Discord."""
        if not self._sp: return None
        try:
            query = f"track:{title} artist:{artist}"
            res = self._sp.search(q=query, limit=1, type='track')
            if res['tracks']['items']:
                return res['tracks']['items'][0]['album']['images'][0]['url']
        except: pass
        return None

    def _progress_hook(self, d):
        if d['status'] == 'downloading':
            p = d.get('_percent_str', '0%').replace('%', '').strip()
            try:
                if window: window.evaluate_js(f"updateDownloadProgress({p})")
            except: pass

    def search_song(self, query):
        ydl_opts = {'format': 'bestaudio', 'noplaylist': True, 'quiet': True}
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"ytsearch5:{query}", download=False)
                return [{'title': e.get('title'), 'url': e.get('webpage_url'), 'duration': e.get('duration'), 'thumbnail': e.get('thumbnail')} for e in info['entries']]
        except Exception as e: return {"error": str(e)}

    def download_track(self, yt_url, use_spotify=False):
        try:
            with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
                info = ydl.extract_info(yt_url, download=False)
                title = info.get('title', 'Unknown')
            clean_name = "".join([c for c in title if c.isalnum() or c in (' ', '.', '_')]).strip()
            temp_path = os.path.join(self.current_path, clean_name)
            final_path = temp_path + ".mp3"
            ydl_opts = {
                'format': 'bestaudio/best',
                'outtmpl': temp_path,
                'progress_hooks': [self._progress_hook],
                'postprocessors': [{'key': 'FFmpegExtractAudio','preferredcodec': 'mp3','preferredquality': '192'}],
                'quiet': True
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([yt_url])
            self._apply_tags(final_path, title, use_spotify)
            return {"status": "success", "filename": clean_name}
        except Exception as e: return {"status": "error", "message": str(e)}

    def _apply_tags(self, file_path, yt_title, use_spotify):
        title, artist, album, cover_data = yt_title, "Unknown Artist", "Inferno Downloads", None
        if use_spotify and self._sp:
            try:
                q = yt_title.split('(')[0].split('[')[0].strip()
                res = self._sp.search(q=q, limit=1, type='track')
                if res['tracks']['items']:
                    t = res['tracks']['items'][0]
                    title, artist, album = t['name'], t['artists'][0]['name'], t['album']['name']
                    if t['album']['images']: cover_data = requests.get(t['album']['images'][0]['url']).content
            except: pass
        try:
            audio = MP3(file_path, ID3=ID3)
            audio.tags.add(TIT2(encoding=3, text=title)); audio.tags.add(TPE1(encoding=3, text=artist)); audio.tags.add(TALB(encoding=3, text=album))
            if cover_data: audio.tags.add(APIC(encoding=3, mime='image/jpeg', type=3, desc=u'Cover', data=cover_data))
            audio.save()
        except: pass

    def get_local_url(self, file_path):
        return f"http://127.0.0.1:{self.port}/media?path={urllib.parse.quote(str(file_path))}"

    def select_folder(self):
        root = tk.Tk(); root.withdraw()
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
        exts = ('.mp3', '.ogg', '.wav', '.mp4', '.webm')
        try:
            if not search_path.exists(): return []
            for file in search_path.rglob('*'):
                if file.suffix.lower() in exts:
                    meta = self.get_metadata(str(file.absolute()), update_discord=False)
                    files_list.append({
                        "name": meta["title"],
                        "artist": meta["artist"],
                        "path": str(file.absolute()),
                        "cover": meta["cover"],
                        "duration": meta["duration"],
                        "filename": str(file.name)
                    })
        except: pass
        return sorted(files_list, key=lambda x: x['name'])

    def get_metadata(self, file_path, update_discord=True):
        path_str = file_path
        metadata = {"path": self.get_local_url(path_str), "title": os.path.basename(path_str), "artist": "Unknown Artist", "album": "Unknown Album", "cover": "", "duration": 0, "type": "audio"}
        try:
            if path_str.lower().endswith(('.mp4', '.webm')):
                metadata["type"] = "video"
                m = MutagenFile(path_str)
                if m: metadata["duration"] = m.info.length
            elif path_str.lower().endswith('.mp3'):
                audio = MP3(path_str, ID3=ID3)
                metadata["duration"] = audio.info.length
                if audio.tags:
                    if 'TIT2' in audio.tags: metadata["title"] = str(audio.tags['TIT2'].text[0])
                    if 'TPE1' in audio.tags: metadata["artist"] = str(audio.tags['TPE1'].text[0])
                    for tag in audio.tags.values():
                        if isinstance(tag, APIC):
                            b64 = base64.b64encode(tag.data).decode('utf-8')
                            metadata["cover"] = f"data:{tag.mime};base64,{b64}"
                            break
            
            if update_discord:
                # Get the cover URL from Spotify for Discord display
                sp_cover = self.get_spotify_cover_url(metadata["title"], metadata["artist"])
                self._discord.update(metadata["title"], metadata["artist"], sp_cover)

        except: pass
        return metadata

    def show_in_folder(self, path):
        if platform.system() == "Windows": subprocess.run(['explorer', '/select,', os.path.normpath(path)])
        elif platform.system() == "Darwin": subprocess.run(['open', '-R', path])
        else: subprocess.run(['xdg-open', os.path.dirname(path)])

def run():
    global window
    threading.Thread(target=start_server, daemon=True).start()
    api = Api()
    window = webview.create_window(
        'Inferno Media Player', 
        'index.html', 
        js_api=api, 
        width=1200, 
        height=850, 
        background_color='#050000'
    )
    webview.start()

if __name__ == '__main__':
    run()