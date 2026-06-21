import discord
from discord.ext import commands
import aiohttp
from aiohttp import web
import asyncio
import urllib.parse

# ==========================================
# EINSTELLUNGEN - BITTE ANPASSEN
# ==========================================
BOT_TOKEN = "DEIN_DISCORD_BOT_TOKEN_HIER_EINTRAGEN"
WEB_PORT = 8081

# Falls ffmpeg nicht in den System-Umgebungsvariablen (PATH) ist,
# trage hier den direkten Pfad ein, z.B.: "C:/ffmpeg/bin/ffmpeg.exe"
FFMPEG_EXECUTABLE = "ffmpeg" 
# ==========================================

intents = discord.Intents.default()
intents.message_content = True # WICHTIG: Im Discord Developer Portal aktivieren!
bot = commands.Bot(command_prefix="!", intents=intents)

current_vc = None

async def handle_update(request):
    """Empfängt POST-Requests vom Inferno Media Player JS-Plugin"""
    try:
        data = await request.json()
        action = data.get("action")
        meta = data.get("meta", {})
        
        title = meta.get("title", "Unknown")
        artist = meta.get("artist", "Unknown")
        path = meta.get("path")
        
        # 1. Rich Presence Updaten
        if action in ["play", "track_change"]:
            activity = discord.Activity(
                type=discord.ActivityType.listening, 
                name=f"{title} - {artist}"
            )
            await bot.change_presence(activity=activity)
        elif action == "pause":
            await bot.change_presence(activity=discord.Activity(
                type=discord.ActivityType.listening, 
                name="Pausiert..."
            ))

        # 2. Voice Channel Audio Steuern
        global current_vc
        if current_vc and current_vc.is_connected():
            if action in ["play", "track_change"]:
                if current_vc.is_playing() or current_vc.is_paused():
                    current_vc.stop()
                
                if path:
                    # FFmpeg Optionen für besseres Streaming
                    ffmpeg_options = {
                        'before_options': '-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5',
                        'options': '-vn'
                    }
                    
                    try:
                        audio_source = discord.FFmpegPCMAudio(
                            path, 
                            executable=FFMPEG_EXECUTABLE, 
                            **ffmpeg_options
                        )
                        current_vc.play(audio_source)
                        print(f"Spiele jetzt im VC: {title}")
                    except Exception as e:
                        print(f"Fehler beim Abspielen von Audio: {e}")
                        
            elif action == "pause":
                if current_vc.is_playing():
                    current_vc.pause()
                    print("VC Audio pausiert.")
            elif action == "resume":
                if current_vc.is_paused():
                    current_vc.resume()

        return web.json_response({"status": "ok"})
    except Exception as e:
        print(f"API Error: {e}")
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@bot.command()
async def join(ctx):
    """Lässt den Bot dem aktuellen Voice Channel beitreten"""
    global current_vc
    if ctx.author.voice:
        channel = ctx.author.voice.channel
        if current_vc and current_vc.is_connected():
            await current_vc.move_to(channel)
        else:
            current_vc = await channel.connect()
        await ctx.send(f"Bin dem Channel **{channel.name}** beigetreten! Starte nun einen Song im Inferno Media Player.")
    else:
        await ctx.send("Du musst zuerst in einem Voice Channel sein!")

@bot.command()
async def leave(ctx):
    """Lässt den Bot den Voice Channel verlassen"""
    global current_vc
    if current_vc and current_vc.is_connected():
        await current_vc.disconnect()
        current_vc = None
        await bot.change_presence(activity=None)
        await ctx.send("Habe den Voice Channel verlassen.")

async def web_server():
    """Startet den lokalen Webserver für das JS-Plugin"""
    app = web.Application()
    app.router.add_post('/update', handle_update)
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
    if BOT_TOKEN == "DEIN_DISCORD_BOT_TOKEN_HIER_EINTRAGEN":
        print("FEHLER: Bitte trage deinen Bot Token in die Datei discord_vc_bot.py ein!")
    else:
        bot.run(BOT_TOKEN)
