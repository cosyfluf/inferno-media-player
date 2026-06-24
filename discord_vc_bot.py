import discord
from discord.ext import commands
import aiohttp
from aiohttp import web
import asyncio
import os
from dotenv import load_dotenv
import queue
import urllib.parse
import requests
import re

# Lade Umgebungsvariablen aus der .env Datei
load_dotenv()

# ==========================================
# EINSTELLUNGEN - JETZT AUS .ENV DATEI
# ==========================================
BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN")
WEB_PORT = int(os.getenv("WEB_PORT", 8081))
# ==========================================

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

current_vc = None
audio_source = None

def get_itunes_cover_url(title, artist):
    """Sucht über die kostenlose iTunes API nach dem Cover (ohne Keys)."""
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
    except Exception:
        pass
    return None

class WSAudioSource(discord.AudioSource):
    """Liest Live PCM-Daten vom WebSocket und sendet sie an Discord mit Buffering."""
    def __init__(self):
        self.buffer = bytearray()
        self.queue = queue.Queue()
        self.active = True
        self.is_buffering = True # Startet im Buffering-Modus
        self.CHUNK_SIZE = 3840   # 20ms of 48kHz Stereo 16-bit PCM
        self.MIN_BUFFER_SIZE = self.CHUNK_SIZE * 50 # 1 Sekunde Buffer (50 * 20ms) bevor es losgeht

    def read(self):
        if not self.active:
            return b''
            
        # Übertrage Daten aus der Queue in den internen Buffer
        while not self.queue.empty():
            try:
                chunk = self.queue.get_nowait()
                if chunk is None:
                    self.active = False
                    return b''
                self.buffer.extend(chunk)
            except queue.Empty:
                break

        # Wenn wir noch buffern, prüfe ob wir genug Daten haben
        if self.is_buffering:
            if len(self.buffer) >= self.MIN_BUFFER_SIZE:
                self.is_buffering = False
                print("Audio-Buffer voll! Starte flüssige Wiedergabe.")
            else:
                # Sende Stille an Discord während wir buffern
                return b'\x00' * self.CHUNK_SIZE

        # Wenn wir nicht genug Daten haben, gehen wir wieder in den Buffering-Modus
        if len(self.buffer) < self.CHUNK_SIZE:
            self.is_buffering = True
            print("Audio stottert, buffere nach...")
            return b'\x00' * self.CHUNK_SIZE
                
        # Extrahiere exakt 3840 Bytes (20ms) für Discord
        res = bytes(self.buffer[:self.CHUNK_SIZE])
        del self.buffer[:self.CHUNK_SIZE]
        return res

    def stop(self):
        self.active = False
        self.queue.put(None)

async def websocket_handler(request):
    """Empfängt die rohen PCM Audiodaten vom JS Plugin"""
    global audio_source
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    print("Player verbunden! Empfange Live-Audiostream...")
    
    async for msg in ws:
        if msg.type == aiohttp.WSMsgType.BINARY:
            if audio_source and audio_source.active:
                audio_source.queue.put(msg.data)
        elif msg.type == aiohttp.WSMsgType.ERROR:
            print(f"Websocket Fehler: {ws.exception()}")
            
    print("Player getrennt.")
    return ws

async def handle_update(request):
    """Empfängt Metadaten-Updates (Play/Pause) vom JS Plugin"""
    try:
        data = await request.json()
        action = data.get("action")
        meta = data.get("meta", {})

        title = meta.get("title", "Unknown")
        artist = meta.get("artist", "Unknown")

        if action in ["play", "track_change"]:
            activity = discord.Activity(
                type=discord.ActivityType.listening,
                name=f"{title}",
                state=f"by {artist}",
                details="Inferno Media Player"
            )
            await bot.change_presence(activity=activity)

        elif action == "pause":
            activity = discord.Activity(
                type=discord.ActivityType.listening,
                name="Paused",
                state="Inferno Media Player"
            )
            await bot.change_presence(activity=activity)

        elif action == "stop":
            await bot.change_presence(activity=None)

        return web.json_response({"status": "ok"})
    except Exception as e:
        print(f"API Error: {e}")
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@bot.command()
async def join(ctx):
    """Lässt den Bot dem aktuellen Voice Channel beitreten und startet den Stream"""
    global current_vc, audio_source
    if ctx.author.voice:
        channel = ctx.author.voice.channel
        if current_vc and current_vc.is_connected():
            await current_vc.move_to(channel)
        else:
            current_vc = await channel.connect()
            
        if audio_source:
            audio_source.stop()
            
        # Starte den Stream, der auf Daten vom WebSocket wartet
        audio_source = WSAudioSource()
        current_vc.play(audio_source)
        
        await ctx.send(f"Bin dem Channel **{channel.name}** beigetreten! Streame das Audio vom Player live.")
    else:
        await ctx.send("Du musst zuerst in einem Voice Channel sein!")

@bot.command()
async def leave(ctx):
    """Lässt den Bot den Voice Channel verlassen"""
    global current_vc, audio_source
    if audio_source:
        audio_source.stop()
        audio_source = None
        
    if current_vc and current_vc.is_connected():
        await current_vc.disconnect()
        current_vc = None
        await bot.change_presence(activity=None)
        await ctx.send("Habe den Voice Channel verlassen.")

async def web_server():
    """Startet den lokalen Webserver für das JS-Plugin"""
    app = web.Application()
    app.router.add_post('/update', handle_update)
    app.router.add_get('/ws', websocket_handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '127.0.0.1', WEB_PORT)
    await site.start()
    print(f"Inferno Bridge API läuft auf Port {WEB_PORT}")

@bot.event
async def on_ready():
    print("="*40)
    print(f"Discord Bot eingeloggt als: {bot.user}")
    print("Nutze '!join' im Discord um den Bot in deinen VC zu holen.")
    print("="*40)
    bot.loop.create_task(web_server())

if __name__ == "__main__":
    if not BOT_TOKEN:
        print("FEHLER: Konnte DISCORD_BOT_TOKEN nicht in der .env Datei finden!")
        print("Bitte erstelle eine '.env' Datei und trage dort DISCORD_BOT_TOKEN=DeinToken ein.")
    else:
        bot.run(BOT_TOKEN)