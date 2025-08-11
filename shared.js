const BLOCKLIST_URL = "https://raw.githubusercontent.com/bergerr/youtube-extremism-filter-blacklist/refs/heads/main/blacklist.txt";
const UPDATE_INTERVAL = 14 * 24 * 60 * 60 * 1000; // 14 days in ms

// Get a value from local storage, or a default if it doesn't exist
function getFromStorage(key, defaultValue) {
    return new Promise((resolve) => {
        browser.storage.local.get(key, (result) => {
            if (result.hasOwnProperty(key)) {
                resolve(result[key]);
            } else {
                resolve(defaultValue);
            }
        });
    });
}

// Load the full blocklist from storage into a single array
async function loadBlacklistFromStorage(includeWhitelist=false) {
    const blacklist = await getFromStorage('blacklist', []);
    const customList = await getFromStorage('customlist', []);

    // Optionally append the whitelist
    if (includeWhitelist) {
        const whiteList = await getFromStorage('whitelist', []);
        return [...blacklist, ...customList, ...whiteList];
    }
    else {
        return [...blacklist, ...customList];
    }
}

// Download the blacklist from github
async function fetchBlacklist() {
    const response = await fetch(BLOCKLIST_URL);
    if (!response.ok) {
        // Do nothing if the file is unavailable
        console.debug('blacklist fetch failed');
        return
    }

    const text = await response.text();
    const parsed_text = text.trim().split('\n').filter(Boolean);
    return parsed_text;
}

// Pull the blacklist from github if it's been 14 days
async function updateBlacklistIfNeeded(force=false) {
    const now = Date.now();

    // Get saved blocklist and timestamp
    const lastUpdated = await getFromStorage("lastUpdated");

    // Check if update needed
    if (force || !lastUpdated || (now - lastUpdated) > UPDATE_INTERVAL) {
        try {
            const lines = await fetchBlacklist();

            const storedBlacklist = await getFromStorage('blacklist', []);
            const fullList = await loadBlacklistFromStorage(true);

            // Get any new items from the fetched blacklist
            const missingEntries = lines.filter(entry => !fullList.includes(entry));

            // Add the new entries to the blacklist if any were found, and save to localstorage
            if (missingEntries) {
                browser.storage.local.set({ 'blacklist': storedBlacklist.concat(missingEntries).sort() });
            }
            browser.storage.local.set({ 'lastUpdated': now });

            console.debug(`Blocklist updated with ${missingEntries.length} entries`);

            // return the update blacklist
            return await getFromStorage('blacklist');
        } catch (err) {
            console.error("Failed to fetch blocklist:", err);
        }
    } else {
        console.debug("Blocklist is up to date.");
    }
}