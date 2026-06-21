// Example Plugin: Log audio peaks to console
// This file is automatically loaded by the Inferno Plugin System

console.log("Example Plugin Initialized!");

// We can hook into the onPlay event
window.InfernoPluginAPI.on('onPlay', (meta) => {
    console.log("Plugin detected playback started for:", meta.title || meta.path);
    console.log("Full Metadata:", window.InfernoPluginAPI.getCurrentMetadata());
});

// We can hook into track changes (especially useful for web radio)
window.InfernoPluginAPI.on('onTrackChange', (meta) => {
    console.log("Track changed to:", meta.title, "by", meta.artist);
});

// We can access the frequency data every frame if we want to create a custom effect
function customVisualizerEffect() {
    requestAnimationFrame(customVisualizerEffect);
    
    // Get the raw frequency array (0-255 values)
    const freqData = window.InfernoPluginAPI.getFrequencyData();
    
    if (freqData) {
        // Example: Get the average bass frequency (first 10 bins)
        let bassSum = 0;
        for (let i = 0; i < 10; i++) {
            bassSum += freqData[i];
        }
        const bassAvg = bassSum / 10;
        
        // You could use this 'bassAvg' to pulse the background, shake the window, etc.
        if (bassAvg > 240) {
            // console.log("BASS DROP DETECTED!");
        }
    }
}

// Start the custom loop
customVisualizerEffect();
