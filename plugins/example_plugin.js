// Example Plugin: Log audio peaks to console
console.log("Example Plugin Initialized!");

window.InfernoPluginAPI.on('onPlay', (meta) => {
    console.log("Plugin detected playback started for:", meta.title || meta.path);
    console.log("Full Metadata:", window.InfernoPluginAPI.getCurrentMetadata());
});

window.InfernoPluginAPI.on('onTrackChange', (meta) => {
    console.log("Track changed to:", meta.title, "by", meta.artist);
});

function customVisualizerEffect() {
    requestAnimationFrame(customVisualizerEffect);
    const freqData = window.InfernoPluginAPI.getFrequencyData();
    if (freqData) {
        let bassSum = 0;
        for (let i = 0; i < 10; i++) bassSum += freqData[i];
        const bassAvg = bassSum / 10;
        if (bassAvg > 240) console.log("BASS DROP DETECTED!");
    }
}

customVisualizerEffect();
