browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'saveBlacklist') {
        return browser.storage.local.set({ 'blacklist': message.content });
    } else if (message.action === 'saveWhitelist') {
        return browser.storage.local.set({ 'whitelist': message.content });
    } else if (message.action === 'saveCustomList') {
        return browser.storage.local.set({ 'customlist': message.content });
    } else if (message.action === 'fetchBlacklist') {
        updateBlacklistIfNeeded();
    }
});

browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        // Pull the list on the first run
        const blacklist = await fetchBlacklist();
        // Set a lastUpdated value so we can fetch updates silently
        browser.storage.local.set({ 'blacklist': blacklist });
        browser.storage.local.set({ 'lastUpdated': Date.now() });
        // Open the options page in a new tab
        browser.tabs.create({
            url: browser.runtime.getURL('options/index.html')
        });
    }
});
