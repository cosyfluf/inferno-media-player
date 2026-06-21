// Plugin Loader System
window.addEventListener('pywebviewready', async () => {
    try {
        const plugins = await window.pywebview.api.get_plugins();
        if (plugins && plugins.length > 0) {
            console.log(`Loading ${plugins.length} plugins...`);
            plugins.forEach(plugin => {
                try {
                    // Create a script element to execute the plugin code in the global scope
                    const script = document.createElement('script');
                    script.textContent = `
                        (function() {
                            try {
                                ${plugin.code}
                                console.log("Successfully loaded plugin: ${plugin.name}");
                            } catch (e) {
                                console.error("Error executing plugin ${plugin.name}:", e);
                            }
                        })();
                    `;
                    document.body.appendChild(script);
                } catch (e) {
                    console.error(`Failed to inject plugin: ${plugin.name}`, e);
                }
            });
        }
    } catch (e) {
        console.error("Could not load plugins via API", e);
    }
});
