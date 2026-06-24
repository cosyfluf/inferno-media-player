let _pluginCleanups = [];
let _lastPluginSnapshot = null;

function _snapshotVanillaDOM() {
    _lastPluginSnapshot = {
        controls: document.querySelector('.controls').innerHTML,
        headStyles: Array.from(document.querySelectorAll('style')).map(s => s.outerHTML),
    };
}

function _restoreVanillaDOM() {
    const controls = document.querySelector('.controls');
    if (controls && _lastPluginSnapshot) {
        controls.innerHTML = _lastPluginSnapshot.controls;
    }
    if (_lastPluginSnapshot) {
        const currentStyles = document.querySelectorAll('style');
        const currentStyleSet = new Set(Array.from(currentStyles).map(s => s.outerHTML));
        for (const oldStyle of _lastPluginSnapshot.headStyles) {
            if (!currentStyleSet.has(oldStyle)) {
                const existing = Array.from(currentStyles).find(s => s.outerHTML === oldStyle);
                if (!existing) {
                    const el = document.createElement('style');
                    el.textContent = oldStyle.replace('<style>', '').replace('</style>', '');
                    document.head.appendChild(el);
                }
            }
        }
    }
}

function runPluginCleanup() {
    _pluginCleanups.forEach(fn => {
        try { fn(); } catch(e) { console.error("Plugin cleanup error:", e); }
    });
    _pluginCleanups = [];
}

window.addEventListener('pywebviewready', async () => {
    _snapshotVanillaDOM();
    await _loadPlugins();
});

async function _loadPlugins() {
    try {
        const plugins = await window.pywebview.api.get_plugins();
        if (!plugins || plugins.length === 0) {
            _restoreVanillaDOM();
            return;
        }
        plugins.forEach(plugin => {
            try {
                const wrapper = document.createElement('script');
                wrapper.textContent = `
                    (function() {
                        try {
                            const _pluginExit = (function() {
                                ${plugin.code}
                                return function() {};
                            })();
                            if (typeof window.__pluginCleanups === 'undefined') window.__pluginCleanups = [];
                            window.__pluginCleanups.push(_pluginExit);
                            console.log("Loaded plugin: ${plugin.name}");
                        } catch(e) {
                            console.error("Error in plugin ${plugin.name}:", e);
                        }
                    })();
                `;
                document.body.appendChild(wrapper);
            } catch(e) {
                console.error("Failed to inject plugin: ${plugin.name}", e);
            }
        });
    } catch(e) {
        console.error("Could not load plugins", e);
    }
}

function reloadPlugins() {
    runPluginCleanup();
    _restoreVanillaDOM();
    document.querySelectorAll('script[data-plugin]').forEach(s => s.remove());
    _loadPlugins();
}
