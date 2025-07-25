browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'saveBlacklist') {
        return browser.storage.local.set({ 'blacklist': message.content });
    } else if (message.action === 'saveWhitelist') {
        return browser.storage.local.set({ 'whitelist': message.content });
    } else if (message.action === 'saveCustomList') {
        return browser.storage.local.set({ 'customList': message.content });
    }
});


browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        browser.tabs.create({
            url: browser.runtime.getURL('options/index.html')
        });
    }
});
