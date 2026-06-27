let isVisualizerEnabled = true; // on by default

let isDynamicColorEnabled = true; // Global state for dynamic colors
let currentThemeColor = { r: 255, g: 0, b: 0 }; // Default Inferno Red

// --- TOGGLE VISUAL ---
function toggleVisualizer(isEnabled) {
    isVisualizerEnabled = isEnabled;
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');

    if (!isEnabled) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
        draw();
    }
}
// --- VISUAL ---
function setupVisualizer(elem) {
    if (!audioCtx) return;
    if (!analyser) {
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        draw();
    }
    try {
        if (elem === audio && !sourceAudio) {
            sourceAudio = audioCtx.createMediaElementSource(audio);
            sourceAudio.connect(analyser);
            analyser.connect(audioCtx.destination);
        } else if (elem === video && !sourceVideo) {
            sourceVideo = audioCtx.createMediaElementSource(video);
            sourceVideo.connect(analyser);
            analyser.connect(audioCtx.destination);
        }
    } catch(e) {}
}

// Persistent variables for animation
let capPositions = []; 
let flowOffset = 0;    
const gravity = 0.8;   

function draw() {
    if (!isVisualizerEnabled) return;
    requestAnimationFrame(draw);
    if (!analyser) return;

    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, width, height);
    
    // 1. Determine base theme color
    const theme = isDynamicColorEnabled ? currentColor : { r: 255, g: 0, b: 0 };
    
    // 2. Convert RGB to HSL to allow for easy animation of the "flow"
    const hsl = rgbToHsl(theme.r, theme.g, theme.b);

    // 3. Define bar properties
    const barWidth = 3; 
    const barCount = Math.floor(width / barWidth);
    
    // Increment the flow animation over time
    flowOffset += 0.75;

    for (let i = 0; i < barCount; i++) {
        // Map audio data to bars (using every nth sample to fill the width)
        const dataIndex = Math.floor((i / barCount) * bufferLength);
        let barHeight = (dataArray[dataIndex] / 255) * height;

        // 4. Gravity Caps Logic
        if (capPositions[i] === undefined || barHeight > capPositions[i]) {
            capPositions[i] = barHeight;
        } else {
            capPositions[i] -= gravity;
        }

        // 5. Create "Flow" effect based on the Theme Color
        const animatedHue = (hsl.h + (i * 1.5) + flowOffset) % 360;
        const brightness = 40 + Math.sin(flowOffset * 0.05 + i * 0.1) * 10;
        
        const mainColor = `hsl(${animatedHue}, ${hsl.s}%, ${hsl.l}%)`;
        const capColor = `hsl(${animatedHue}, ${hsl.s}%, 80%)`;

        // 6. Draw the 3px Bars
        ctx.fillStyle = mainColor;
        // barWidth - 1 creates a tiny gap between bars for better definition
        ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);

        // 7. Draw the Caps
        ctx.fillStyle = capColor;
        ctx.fillRect(i * barWidth, height - capPositions[i] - 2, barWidth - 1, 2);
    }
}
// HELPER: RGB TO HSL CONVERSION
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; 
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}

// --- AMBIENT GLOW ---
let isAmbientGlowEnabled = false;

function toggleAmbientGlowEffect(enabled) {
    isAmbientGlowEnabled = enabled;
    const glow = document.getElementById('ambient-glow');
    if (!glow) return;
    if (enabled) {
        glow.classList.add('active');
        if (cover.style.display !== 'none' && cover.complete && cover.naturalWidth > 0) {
            getAverageColor(cover);
        }
    } else {
        glow.classList.remove('active');
    }
}

function updateAmbientGlow(color) {
    const glow = document.getElementById('ambient-glow');
    if (!glow || !isAmbientGlowEnabled) return;
    const rgb = `${color.r}, ${color.g}, ${color.b}`;
    glow.style.background = `radial-gradient(circle, rgba(${rgb},0.5) 0%, rgba(${rgb},0.15) 40%, transparent 70%)`;
    glow.classList.add('active');
}

// GET COVER COLOR
// Global state to track the current color and animation frame
let currentColor = { r: 255, g: 0, b: 0 }; 
let colorAnimationId = null;

/**
 * Smoothly transitions the --red CSS variable to a new color using JS.
 * @param {Object} target - The destination RGB values {r, g, b}.
 * @param {number} duration - Transition duration in milliseconds.
 */
function animateColorTransition(target, duration = 800) {
    const start = { ...currentColor };
    const startTime = performance.now();

    // Cancel any existing animation to prevent flickering
    if (colorAnimationId) cancelAnimationFrame(colorAnimationId);

    function update(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Cubic ease-out function to make the transition feel natural
        const ease = 1 - Math.pow(1 - progress, 3);

        // Calculate intermediate RGB values
        const r = Math.round(start.r + (target.r - start.r) * ease);
        const g = Math.round(start.g + (target.g - start.g) * ease);
        const b = Math.round(start.b + (target.b - start.b) * ease);

        // Update current state
        currentColor = { r, g, b };

        // Convert to HEX and apply to CSS variables
        const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        document.documentElement.style.setProperty('--dynamic', hex);
        document.documentElement.style.setProperty('--dynamic-bright', hex);

        // Continue animation if not finished
        if (progress < 1) {
            colorAnimationId = requestAnimationFrame(update);
        }
    }

    colorAnimationId = requestAnimationFrame(update);
}

/**
 * Extracts the average color and triggers the smooth transition.
 */
function getAverageColor(imgElement) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 64; 
        canvas.height = 64;
        ctx.drawImage(imgElement, 0, 0, 64, 64);

        try {
            const imageData = ctx.getImageData(0, 0, 64, 64).data;
            let r = 0, g = 0, b = 0;

            for (let i = 0; i < imageData.length; i += 4) {
                r += imageData[i];
                g += imageData[i + 1];
                b += imageData[i + 2];
            }

            const count = imageData.length / 4;
            const result = {
                r: Math.floor(r / count),
                g: Math.floor(g / count),
                b: Math.floor(b / count)
            };
            
            if (typeof isDynamicColorEnabled !== 'undefined' && isDynamicColorEnabled) {
                animateColorTransition(result);
            }
            if (typeof isAmbientGlowEnabled !== 'undefined' && isAmbientGlowEnabled) {
                updateAmbientGlow(result);
            }
            
            resolve(result);
        } catch (e) {
            const fallback = { r: 255, g: 0, b: 0 };
            if (typeof isDynamicColorEnabled !== 'undefined' && isDynamicColorEnabled) {
                animateColorTransition(fallback);
            }
            if (typeof isAmbientGlowEnabled !== 'undefined' && isAmbientGlowEnabled) {
                updateAmbientGlow(fallback);
            }
            resolve(fallback);
        }
    });
}

function toggleDynamicColor(isEnabled) {
    isDynamicColorEnabled = isEnabled;
    
    if (!isEnabled) {
        // Smoothly transition back to Inferno Red
        animateColorTransition({ r: 255, g: 0, b: 0 });
    } else {
        if (cover.style.display !== "none") {
            cover.onload(); 
        }
    }
}


