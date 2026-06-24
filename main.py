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
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

# --- DOWNLOADER LIBRARIES ---
import yt_dlp

# --- ENV LOADER ---
def load_env():
    """Liest die .env Datei manuell aus und lädt die Werte in os.environ."""
    env_path = Path(__file__).parent / ".env"
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, value = line.split("=", 1)
                    val = value.strip().strip("'\"")
                    os.environ[key.strip()] = val

load_env()

# Globale Variablen aus der Umgebung auslesen
MEDIA_PORT = int(os.environ.get("MEDIA_PORT", 8080))
FFMPEG_PATH = os.environ.get("FFMPEG_PATH", "ffmpeg")

# Discord Client-ID aus der .env auslesen
DISCORD_BOT_TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "")
DISCORD_CLIENT_ID = os.environ.get("DISCORD_CLIENT_ID", "")

# Falls DISCORD_CLIENT_ID leer ist, versuchen wir sie aus dem DISCORD_BOT_TOKEN zu extrahieren
if not DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN:
    try:
        first_part = DISCORD_BOT_TOKEN.split(".")[0]
        missing_padding = len(first_part) % 4
        if missing_padding:
            first_part += '=' * (4 - missing_padding)
        DISCORD_CLIENT_ID = base64.b64decode(first_part).decode('utf-8')
    except Exception:
        pass

# --- CONFIGURATION ---
CONFIG_FILE = Path(__file__).parent / "config.json"
STATIONS_FILE = Path(__file__).parent / "stations_config.json"
window = None 

#---FAVOURITES STORAGE---
FAV_FILE = Path(__file__).parent / "favourites.json"

# --- HELPERS FOR COVERS (NO SPOTIFY) ---
def load_stations():
    """Lädt die Radiosender aus der stations_config.json oder erstellt Standardeinträge."""
    default_stations = [
        {"name": "Lofi Girl", "url": "https://lofi.stream.laut.fm/lofi", "genre": "Lofi", "image": "https://i.imgur.com/E8S9p8u.png"},
        {"name": "Nightride FM", "url": "https://stream.nightride.fm/nightride.mp3", "genre": "Synthwave", "image": "https://i.imgur.com/B9M9M6Z.png"},
        {"name": "BBC Radio 1", "url": "http://stream.live.vc.bbc.co.uk/bbc_radio_one", "genre": "Pop", "image": "https://i.imgur.com/Wl1qPqS.png"},
        {"name": "RADIO 21", "url": "https://radio21.streamabc.net/radio21-hannover-mp3-192-3735655?sABC=690695p5%230%23q6ss393s0rn89n5s70n8q4721287ssr5%23jro&aw_0_1st.playerid=web&amsparams=playerid:web;skey:1762039237", "genre": "Rock n' Pop", "image": "https://i.imgur.com/8Nf9u8P.png"}
    ]
    if not STATIONS_FILE.exists():
        try:
            with open(STATIONS_FILE, 'w', encoding='utf-8') as f:
                json.dump(default_stations, f, indent=4)
        except: pass
        return default_stations
    try:
        with open(STATIONS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return default_stations

def upload_cover_to_tmpfiles(mime, cover_data):
    """Lädt lokale Cover-Bytes anonym auf tmpfiles.org hoch, um eine öffentliche URL für Discord zu erhalten."""
    try:
        ext = "jpg" if "jpeg" in mime.lower() else "png"
        files = {
            'file': (f'cover.{ext}', cover_data, mime)
        }
        response = requests.post("https://tmpfiles.org/api/v1/upload", files=files, timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get("status") == "success":
                return data["data"]["url"].replace("https://tmpfiles.org/", "https://tmpfiles.org/dl/")
    except:
        pass
    return None

def get_itunes_cover_url(title, artist):
    """Sucht kostenfrei über die iTunes API nach dem Cover."""
    clean_title = re.sub(r'[\(\[][^\)\]]*[\)\]]', '', title).strip()
    clean_artist = re.sub(r'[\(\[][^\)\]]*[\)\]]', '', artist).strip()
    try:
        query = f"{clean_title} {clean_artist}"
        url = f"https://itunes.apple.com/search?term={urllib.parse.quote(query)}&entity=musicTrack&limit=1"
        response = requests.get(url, timeout=3)
        if response.status_code == 200:
            data = response.json()
            if data.get("resultCount", 0) > 0:
                artwork_url = data["results"][0].get("artworkUrl100", "")
                if artwork_url:
                    return artwork_url.replace("100x100bb.jpg", "600x600bb.jpg")
    except:
        pass
    return None

# --- DISCORD MANAGER ---
class DiscordManager:
    """Manages Discord Rich Presence communication in a non-blocking way."""
    def __init__(self, client_id):
        self.client_id = client_id
        self.rpc = None
        self.enabled = False
        if client_id and client_id not in ("YOUR_DISCORD_ID", ""):
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
    server = ThreadingHTTPServer(('127.0.0.1', MEDIA_PORT), MediaHandler)
    server.serve_forever()

# --- API FOR FRONTEND ---
class Api:
    def __init__(self):
        self.port = MEDIA_PORT
        self._config = self.load_config()
        self.current_path = self._config.get("default_path", str(Path.home() / "Music"))
        
        discord_id = DISCORD_CLIENT_ID or self._config.get("discord_client_id", "YOUR_DISCORD_ID")
        self._discord = DiscordManager(discord_id)

    def load_config(self):
        if not CONFIG_FILE.exists():
            default = {
                "default_path": str(Path.home() / "Music"),
                "discord_client_id": "1471223610315247616",
                "devtools": True
            }
            self.save_config_dict(default)
            return default
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
                if "devtools" not in cfg:
                    cfg["devtools"] = True
                    self.save_config_dict(cfg)
                return cfg
        except:
            return {"default_path": str(Path.home() / "Music"), "devtools": True}

    def save_config_dict(self, config_dict):
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config_dict, f, indent=4)

    def save_config(self, path):
        self._config["default_path"] = path
        self.save_config_dict(self._config)

    def get_config(self):
        return self._config

    def set_devtools(self, enabled):
        self._config["devtools"] = enabled
        self.save_config_dict(self._config)
        return enabled

    def _progress_hook(self, d):
        if d['status'] == 'downloading':
            p = d.get('_percent_str', '0%').replace('%', '').strip()
            try:
                if window: window.evaluate_js(f"updateDownloadProgress({p})")
            except: pass

    def search_song(self, query):
        ydl_opts = {'format': 'bestaudio', 'noplaylist': True, 'quiet': True, 'ffmpeg_location': FFMPEG_PATH}
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"ytsearch5:{query}", download=False)
                return [{'title': e.get('title'), 'url': e.get('webpage_url'), 'duration': e.get('duration'), 'thumbnail': e.get('thumbnail')} for e in info['entries']]
        except Exception as e: return {"error": str(e)}

    def download_track(self, yt_url, use_spotify=False):
        try:
            with yt_dlp.YoutubeDL({'quiet': True, 'ffmpeg_location': FFMPEG_PATH}) as ydl:
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
                'quiet': True,
                'ffmpeg_location': FFMPEG_PATH
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([yt_url])
            self._apply_tags(final_path, title)
            return {"status": "success", "filename": clean_name}
        except Exception as e: return {"status": "error", "message": str(e)}

    def _apply_tags(self, file_path, yt_title):
        title, artist, album = yt_title, "Unknown Artist", "Inferno Downloads"
        try:
            audio = MP3(file_path, ID3=ID3)
            audio.tags.add(TIT2(encoding=3, text=title)); audio.tags.add(TPE1(encoding=3, text=artist)); audio.tags.add(TALB(encoding=3, text=album))
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
            all_files = []
            for file in search_path.rglob('*'):
                if file.suffix.lower() in exts:
                    all_files.append(str(file.absolute()))
            with ThreadPoolExecutor(max_workers=8) as executor:
                fut_map = {executor.submit(self._scan_single, fp): fp for fp in all_files}
                for fut in as_completed(fut_map):
                    try:
                        result = fut.result()
                        if result:
                            files_list.append(result)
                    except:
                        pass
        except: pass
        return sorted(files_list, key=lambda x: x['name'])

    def _scan_single(self, file_path):
        try:
            meta = self.get_metadata(file_path, update_discord=False)
            return {
                "name": meta["title"],
                "artist": meta["artist"],
                "path": file_path,
                "cover": meta["cover"],
                "duration": meta["duration"],
                "filename": str(Path(file_path).name)
            }
        except:
            return None

    def get_metadata(self, file_path, update_discord=True):
        path_str = file_path
        metadata = {
            "path": self.get_local_url(path_str), 
            "title": os.path.basename(path_str), 
            "artist": "Unknown Artist", 
            "album": "Unknown Album", 
            "cover": "", 
            "duration": 0, 
            "type": "audio",
            "sp_cover": ""
        }
        raw_cover_data = None
        cover_mime = None
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
                    if 'TALB' in audio.tags: metadata["album"] = str(audio.tags['TALB'].text[0])
                    for tag in audio.tags.values():
                        if isinstance(tag, APIC):
                            b64 = base64.b64encode(tag.data).decode('utf-8')
                            metadata["cover"] = f"data:{tag.mime};base64,{b64}"
                            
                            # Wir sichern die Bytes, um sie erst beim Abspielen hochzuladen
                            raw_cover_data = tag.data
                            cover_mime = tag.mime
                            break
            
            # Wichtig: Die zeitaufwendige Websuche und der Upload passieren erst BEIM ABSPIELEN
            if update_discord:
                # 1. Lokales Cover hochladen (falls vorhanden)
                if raw_cover_data and cover_mime:
                    uploaded_url = upload_cover_to_tmpfiles(cover_mime, raw_cover_data)
                    if uploaded_url:
                        metadata["sp_cover"] = uploaded_url
                
                # 2. Falls kein lokales Cover vorhanden war/Upload fehlschlug -> iTunes nutzen
                sp_cover = metadata["sp_cover"]
                if not sp_cover:
                    sp_cover = get_itunes_cover_url(metadata["title"], metadata["artist"])
                    metadata["sp_cover"] = sp_cover if sp_cover else ""
                    
                self._discord.update(metadata["title"], metadata["artist"], sp_cover)

        except: pass
        return metadata

    def show_in_folder(self, path):
        if platform.system() == "Windows": subprocess.run(['explorer', '/select,', os.path.normpath(path)])
        elif platform.system() == "Darwin": subprocess.run(['open', '-R', path])
        else: subprocess.run(['xdg-open', os.path.dirname(path)])
        
    def get_radio_metadata(self, url):
        """Extracts ICY metadata from a live stream."""
        try:
            headers = {'Icy-MetaData': '1'}
            response = requests.get(url, headers=headers, stream=True, timeout=3)
            metaint = int(response.headers.get('icy-metaint', 0))
            station_name = response.headers.get('icy-name', 'Web Radio')
            
            # Liest das konfigurierte Sender-Logo aus stations_config.json aus
            stations = self.get_default_radios()
            station_image = "app_logo"
            for s in stations:
                if s.get("url") == url:
                    station_image = s.get("image", "app_logo")
                    station_name = s.get("name", station_name)
                    break
            
            title = "Live Stream"
            if metaint > 0:
                stream = response.raw
                stream.read(metaint)
                metadata_len = ord(stream.read(1)) * 16
                if metadata_len > 0:
                    raw_metadata = stream.read(metadata_len).decode('utf-8', errors='ignore')
                    match = re.search(r"StreamTitle='([^']*)';", raw_metadata)
                    if match:
                        title = match.group(1)
                        
            return {"title": title, "station": station_name, "cover": station_image, "sp_cover": station_image}
        except:
            stations = self.get_default_radios()
            station_image = "app_logo"
            station_name = "Inferno Stream"
            for s in stations:
                if s.get("url") == url:
                    station_image = s.get("image", "app_logo")
                    station_name = s.get("name", "Web Radio")
                    break
            return {"title": "Live Radio", "station": station_name, "cover": station_image, "sp_cover": station_image}

    def get_default_radios(self):
        """Returns a list of default radio stations loaded from json."""
        return load_stations()
    
    def update_radio_discord(self, title, station):
        """Updates Discord Rich Presence specifically for Radio streams."""
        stations = self.get_default_radios()
        station_image = "app_logo"
        for s in stations:
            if s.get("name") == station or s.get("url") == station:
                station_image = s.get("image", "app_logo")
                break
        if self._discord:
            self._discord.update(title, f"Listening to {station}", station_image)

    def start_folder_watch(self):
        """Start a background thread that polls the media folder for changes."""
        def _watcher():
            last_scan = set()
            while True:
                time.sleep(5)
                try:
                    exts = ('.mp3', '.ogg', '.wav', '.mp4', '.webm')
                    current = set()
                    for f in Path(self.current_path).rglob('*'):
                        if f.suffix.lower() in exts:
                            current.add(str(f.absolute()))
                    if current != last_scan:
                        if last_scan:  # Skip first scan (already loaded)
                            if window:
                                try:
                                    window.evaluate_js('refreshPlaylist()')
                                except:
                                    pass
                        last_scan = current
                except:
                    pass

        t = threading.Thread(target=_watcher, daemon=True)
        t.start()

    def start_plugin_watch(self):
        """Watch the plugins directory for changes and auto-reload."""
        plugins_dir = Path(__file__).parent / "plugins"
        if not plugins_dir.exists():
            plugins_dir.mkdir()

        def _watcher():
            last_mtimes = {}
            while True:
                time.sleep(3)
                try:
                    current = {}
                    for f in plugins_dir.glob("*.js"):
                        current[f.name] = f.stat().st_mtime
                    if current != last_mtimes:
                        if last_mtimes:  # Skip first check
                            if window:
                                try:
                                    window.evaluate_js('reloadPlugins()')
                                except:
                                    pass
                        last_mtimes = current
                except:
                    pass

        t = threading.Thread(target=_watcher, daemon=True)
        t.start()

    def get_plugins(self):
        """Scans the plugins directory for custom JS plugins."""
        plugins_dir = Path(__file__).parent / "plugins"
        if not plugins_dir.exists():
            plugins_dir.mkdir()
            
        plugins = []
        for file in plugins_dir.glob("*.js"):
            try:
                with open(file, "r", encoding="utf-8") as f:
                    plugins.append({"name": file.name, "code": f.read()})
            except: pass
        return plugins

# --- FAVOURITES API ---

    def load_favourites(self):
        """Loads all custom playlists from the JSON file."""
        if not FAV_FILE.exists():
            return []
        try:
            with open(FAV_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return []

    def save_favourites_list(self, fav_list):
        """Saves the entire list of favourites to the JSON file."""
        with open(FAV_FILE, 'w', encoding='utf-8') as f:
            json.dump(fav_list, f, indent=4)
        return True

    def select_fav_image(self):
        """Opens a file dialog to pick a cover image for a playlist."""
        root = tk.Tk(); root.withdraw()
        path = filedialog.askopenfilename(filetypes=[("Image files", "*.jpg *.jpeg *.png *.webp")])
        root.destroy()
        if path:
            with open(path, "rb") as img_file:
                return f"data:image/png;base64,{base64.b64encode(img_file.read()).decode('utf-8')}"
        return None

    def save_stations(self, stations):
        """Saves the radio stations list to stations_config.json."""
        try:
            with open(STATIONS_FILE, 'w', encoding='utf-8') as f:
                json.dump(stations, f, indent=4)
            return True
        except:
            return False

    def select_image_file(self):
        """Opens a file dialog and returns the selected image as base64 data URL."""
        root = tk.Tk(); root.withdraw()
        path = filedialog.askopenfilename(filetypes=[("Image files", "*.jpg *.jpeg *.png *.webp")])
        root.destroy()
        if path:
            with open(path, "rb") as img_file:
                return f"data:image/png;base64,{base64.b64encode(img_file.read()).decode('utf-8')}"
        return None
    
    
def run():
    global window
    threading.Thread(target=start_server, daemon=True).start()
    api = Api()
    api.start_folder_watch()
    api.start_plugin_watch()
    window = webview.create_window(
        'Inferno Media Player', 
        'index.html', 
        js_api=api, 
        width=1200, 
        height=850, 
        min_size=(1150, 687),
        background_color='#050000'
    )
    webview.start(debug=api._config.get("devtools", True))

if __name__ == '__main__':
    run()