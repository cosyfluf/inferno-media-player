import webview
import os
import base64
import json  # New: For saving settings
import tkinter as tk
from tkinter import filedialog
from mutagen.id3 import ID3, APIC
from mutagen import File as MutagenFile # Generic loader
from mutagen.mp3 import MP3
from mutagen.mp4 import MP4
from pathlib import Path
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
import threading

# --- CONFIGURATION ---
# Path to the configuration file
CONFIG_FILE = Path(__file__).parent / "config.json"

# --- MEDIA SERVER ---
class MediaHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        if parsed_url.path == '/media':
            params = urllib.parse.parse_qs(parsed_url.query)
            file_path = params.get('path', [None])[0]
            
            if file_path and os.path.exists(file_path):
                self.send_response(200)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'application/octet-stream')
                self.end_headers()
                with open(file_path, 'rb') as f:
                    self.wfile.write(f.read())
                return
        self.send_error(404)

    def log_message(self, format, *args): pass

def start_server():
    server = HTTPServer(('127.0.0.1', 8080), MediaHandler)
    server.serve_forever()

# --- API ---
class Api:
    def __init__(self):
        self.port = 8080
        # Load the saved path or use the default music folder
        self.current_path = self.load_config()

    def load_config(self):
        """Loads the path or creates the file if it is missing."""
        default_path = str(Path.home() / "Music")
        
        # If the file does not exist yet -> Create it now with the default path
        if not CONFIG_FILE.exists():
            self.save_config(default_path)
            return default_path
            
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
                saved_path = config.get("default_path")
                if saved_path and os.path.exists(saved_path):
                    return saved_path
        except Exception as e:
            print(f"Error during loading: {e}")
            
        return default_path

    def save_config(self, path):
        """Saves the chosen path in the config.json."""
        try:
            with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump({"default_path": path}, f, indent=4)
        except Exception as e:
            print(f"Error during saving config: {e}")

    def get_local_url(self, file_path):
        return f"http://127.0.0.1:{self.port}/media?path={urllib.parse.quote(str(file_path))}"

    def set_standard_folder(self):
        """Opens dialog to permanently set the standard folder."""
        root = tk.Tk()
        root.withdraw()
        path = filedialog.askdirectory(title="Select standard Music folder")
        root.destroy()
        
        if path:
            self.current_path = str(path)
            self.save_config(self.current_path) # Save for next time
            return {"path": self.current_path, "files": self.scan_folder(self.current_path)}
        return None

    def select_folder(self):
        """Temporary folder selection (without changing the default)."""
        root = tk.Tk()
        root.withdraw()
        path = filedialog.askdirectory()
        root.destroy()
        if path:
            return self.scan_folder(path)
        return None

    def scan_folder(self, folder_path_str=None):
        search_path = Path(folder_path_str if folder_path_str else self.current_path)
        files_list = []
        extensions = ('.mp3', '.ogg', '.wav', '.mp4', '.webm')
        
        try:
            for file in search_path.rglob('*'):
                if file.suffix.lower() in extensions:
                    # We fetch metadata directly here for the preview/list
                    meta = self.get_metadata(str(file.absolute()))
                    files_list.append({
                        "name": meta["title"],    # Prettier title from tags
                        "artist": meta["artist"], # Artist for the subline
                        "path": str(file.absolute()),
                        "cover": meta["cover"],   # Base64 cover
                        "duration": meta["duration"], # Estimated time / duration
                        "filename": str(file.name) # Fallback
                    })
        except Exception as e:
            print(f"Error during scanning: {e}")
            
        return sorted(files_list, key=lambda x: x['name'])

    def get_metadata(self, file_path):
        path_str = file_path
        metadata = {
            "path": self.get_local_url(path_str),
            "title": str(os.path.basename(path_str)),
            "artist": "Unknown Artist",
            "album": "Unknown Album",
            "genre": "Inferno Media",
            "cover": "",
            "duration": 0,
            "type": "audio"
        }

        ext = path_str.lower()
        
        # Determine media type and extract duration/tags
        try:
            if ext.endswith(('.mp4', '.webm')):
                metadata["type"] = "video"
                # Use MP4 specific loader to avoid MPEG sync errors
                if ext.endswith('.mp4'):
                    video = MP4(path_str)
                    metadata["duration"] = video.info.length
                else:
                    # Fallback for webm or others
                    m_file = MutagenFile(path_str)
                    if m_file: metadata["duration"] = m_file.info.length

            elif ext.endswith('.mp3'):
                audio = MP3(path_str, ID3=ID3)
                metadata["duration"] = audio.info.length
                # Load ID3 tags
                if audio.tags:
                    if 'TIT2' in audio.tags: metadata["title"] = str(audio.tags['TIT2'].text[0])
                    if 'TPE1' in audio.tags: metadata["artist"] = str(audio.tags['TPE1'].text[0])
                    if 'TALB' in audio.tags: metadata["album"] = str(audio.tags['TALB'].text[0])
                    if 'TCON' in audio.tags: metadata["genre"] = str(audio.tags['TCON'].text[0])
                    for tag in audio.tags.values():
                        if isinstance(tag, APIC):
                            b64_data = base64.b64encode(tag.data).decode('utf-8')
                            metadata["cover"] = f"data:{tag.mime};base64,{b64_data}"
                            break
            else:
                # Fallback for wav, ogg
                m_file = MutagenFile(path_str)
                if m_file: metadata["duration"] = m_file.info.length

        except Exception as e:
            # Silent fallback if metadata reading fails
            pass

        return metadata

def run():
    # Start the media server in a daemon thread
    threading.Thread(target=start_server, daemon=True).start()
    
    api = Api()
    webview.create_window(
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