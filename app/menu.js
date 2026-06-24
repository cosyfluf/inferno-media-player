/**
 * SETTINGS MANAGER FOR INFERNO
 * Handles the Overlay UI and syncs settings with the player
 */

// 1. Toggle the Settings Overlay
function toggleSettings(show) {
    const overlay = document.getElementById('settings-overlay');
    if (show) {
        overlay.style.display = 'flex';
        const mainVolume = document.getElementById('volume-slider');
        const settingsVolume = document.getElementById('settings-volume');
        if (mainVolume && settingsVolume) {
            settingsVolume.value = mainVolume.value;
        }
        callApi('load_config').then(cfg => {
            const dt = document.getElementById('devtools-toggle');
            if (dt && cfg) dt.checked = cfg.devtools === true;
            const ag = document.getElementById('ambient-glow-toggle-settings');
            if (ag && cfg) ag.checked = cfg.ambient_glow === true;
        });
    } else {
        overlay.style.display = 'none';
    }
}

// 2. Tab Navigation Logic
function switchSettingsTab(event, tabId) {
    // Hide all tab panes
    document.querySelectorAll('.settings-tab-pane').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Deactivate all sidebar items
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Show the target tab and highlight the clicked sidebar item
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
}

// 3. Settings Functionality Sync
function syncVisualizer(enabled) {
    // Update the toggle in the main sidebar if it exists
    const mainToggle = document.getElementById('visualizer-toggle');
    if (mainToggle) mainToggle.checked = enabled;
    
    // Call your existing visualizer toggle function (from visualizer.js)
    if (typeof toggleVisualizer === 'function') {
        toggleVisualizer(enabled);
    }
}

function syncDynamicColor(enabled) {
    const mainToggle = document.getElementById('dynamic-color-toggle');
    if (mainToggle) mainToggle.checked = enabled;
    
    if (typeof toggleDynamicColor === 'function') {
        toggleDynamicColor(enabled);
    }
}

function syncAmbientGlow(enabled) {
    const mainToggle = document.getElementById('ambient-glow-toggle');
    if (mainToggle) mainToggle.checked = enabled;
}

function toggleDevTools(enabled) {
    callApi('set_devtools', enabled);
}

function toggleAmbientGlow(enabled) {
    syncAmbientGlow(enabled);
    if (typeof toggleAmbientGlowEffect === 'function') {
        toggleAmbientGlowEffect(enabled);
    }
    callApi('set_ambient_glow', enabled);
}

function updateSettingsVolume(val) {
    // Update the main player volume slider
    const mainSlider = document.getElementById('volume-slider');
    if (mainSlider) {
        mainSlider.value = val;
        // Trigger the input event to update the actual audio volume
        mainSlider.dispatchEvent(new Event('input'));
    }
}

// 4. Global Event Listeners
document.addEventListener('keydown', (e) => {
    // Close settings if ESC is pressed
    if (e.key === 'Escape') {
        toggleSettings(false);
    }
});

// Initialize Settings Button
document.addEventListener('DOMContentLoaded', () => {
    const burger = document.querySelector('.burger');
    if (burger) {
        burger.removeAttribute('onclick'); 
        burger.onclick = () => toggleSettings(true);
    }

    callApi('load_config').then(cfg => {
        if (cfg && typeof toggleAmbientGlowEffect === 'function') {
            const enabled = cfg.ambient_glow === true;
            toggleAmbientGlowEffect(enabled);
            const ag = document.getElementById('ambient-glow-toggle-settings');
            if (ag) ag.checked = enabled;
        }
    });
});