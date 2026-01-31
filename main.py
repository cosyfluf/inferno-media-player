import webview
import os
import base64
import json  
import tkinter as tk
from tkinter import filedialog
from mutagen.id3 import ID3, APIC
from pathlib import Path
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
import threading

# --- CONFIGURATION ---
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
        # load or create config and get saved path
        self.current_path = self.load_config()

    def load_config(self):
        """creates or loads config file and returns saved path or default music folder."""
        default_path = str(Path.home() / "Music")
        
        # if config file does not exist, create it with default path
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
            print(f"Error while loading config: {e}")
            
        return default_path

    def save_config(self, path):
        """Saves the selected path to the config file."""
        try:
            with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump({"default_path": path}, f, indent=4)
        except Exception as e:
            print(f"Error while saving config: {e}")

    def get_local_url(self, file_path):
        return f"http://127.0.0.1:{self.port}/media?path={urllib.parse.quote(str(file_path))}"

    def set_standard_folder(self):
        """opens dialog to select default music folder and saves it."""
        root = tk.Tk()
        root.withdraw()
        path = filedialog.askdirectory(title="choose the default music folder")
        root.destroy()
        
        if path:
            self.current_path = str(path)
            self.save_config(self.current_path) # save the selected path
            return {"path": self.current_path, "files": self.scan_folder(self.current_path)}
        return None

    def select_folder(self):
        """Temporary folder selection without saving."""
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
                    # get metadata
                    meta = self.get_metadata(str(file.absolute()))
                    files_list.append({
                        "name": meta["title"],    # Title from tags
                        "artist": meta["artist"], # artiist from tags
                        "path": str(file.absolute()),
                        "cover": meta["cover"],   # BASE64 Cover
                        "filename": str(file.name) # Fallback
                    })
        except Exception as e:
            print(f"Fehler beim Scannen: {e}")
            
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
            "type": "audio"
        }

        if path_str.lower().endswith(('.mp4', '.webm')):
            metadata["type"] = "video"
        
        if path_str.lower().endswith('.mp3'):
            try:
                audio = ID3(path_str)
                if 'TIT2' in audio: metadata["title"] = str(audio['TIT2'].text[0])
                if 'TPE1' in audio: metadata["artist"] = str(audio['TPE1'].text[0])
                if 'TALB' in audio: metadata["album"] = str(audio['TALB'].text[0])
                if 'TCON' in audio: metadata["genre"] = str(audio['TCON'].text[0])
                for tag in audio.values():
                    if isinstance(tag, APIC):
                        b64_data = base64.b64encode(tag.data).decode('utf-8')
                        metadata["cover"] = f"data:{tag.mime};base64,{b64_data}"
                        break
            except: pass
        return metadata

def run():
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