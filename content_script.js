let recommendationsObserver = null;

const recommendationTag = 'ytd-compact-video-renderer';
const channelTag = 'ytd-channel-name';
const interactionTag = 'button';
const menuBoxTag = 'ytd-menu-service-item-renderer';
const signInTag = 'ytd-masthead button#avatar-btn';

let blacklist = [];
let fullList = [];
let hideBlocked = false;

const observeOptions = { childList: true, attributes: false, subtree: true };

// Function to check if the user is signed in
function isUserSignedIn(tag, maxRetries=10, delay=300) {
    console.debug('Checking if user is signed in...');
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const check = () => {
            const avatarBtn = document.querySelector(tag);
            if (avatarBtn) {
                return resolve(true);
            }
            attempts++;
            if (attempts < maxRetries) {
                setTimeout(check, delay);
            }
            else {
                console.debug('User not signed in after maximum attempts.');
                reject(false);
            }
        };
        check();
    });
}

// Wait for menu item
function waitForMenuItem(labelText, maxRetries=10, delay=300) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const check = () => {
            const items = Array.from(document.getElementsByTagName(menuBoxTag));
            const match = items.find(item => item.innerText.trim().toLowerCase() === labelText.toLowerCase());
            if (match) {
                return resolve(match);
            }
            attempts++;
            if (attempts < maxRetries){
                setTimeout(check, delay);
            }
            else {
                reject('Menu item not found: ' + labelText);
            }
        };
        check();
    });
}

// Click menu and block
function blockChannel(node) {
    if (node.nodeType === 1 && node.tagName.toLowerCase() === interactionTag) {
        return node;
    }
    for (const child of node.childNodes) {
        const found = blockChannel(child);
        if (found) {
            child.click();

            waitForMenuItem("Don't recommend channel")
                .then(item => {
                    item.click();
                })
                .catch(err => {
                    console.warn(err);
                });

            return node;
        }
    }
    return null;
}

// Check if channel is in blacklist
function checkChannelName(channelName) {
    const cleaned = channelName.trim().toLowerCase().replace(/\s+/g, '');
    return fullList.includes(cleaned);
}

// Common logic for both recommendation functions
function doRecommendationLogic(node) {
    const found = node.getElementsByTagName(channelTag);
    for (const el of found) {
        if (checkChannelName(el.innerText)) {
            console.debug('Blocking channel:', el.innerText);
            blockChannel(node);
            // Hide the blocked channel
            if (hideBlocked) {
                node.style.display = 'none';
            }
        }
    }
}

// MutationObserver for new items
function handleRecommendationMutations(mutationsList) {
    for (const mutation of mutationsList) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
                doRecommendationLogic(node);
            }
        }
    }
}

// Scan visible recommendations immediately
function processExistingRecommendations() {
    const nodes = document.getElementsByTagName(recommendationTag);
    for (const node of nodes) {
        doRecommendationLogic(node);
    }
}

// Watch for recommendations parent
function handleMutations(mutationsList, observer) {
    let recommendations = document.getElementsByTagName(recommendationTag);
    if (recommendations.length > 0) {
        // Disconnect the main observer to avoid duplicate processing
        observer.disconnect();

        const recommendationsParent = recommendations.item(0).parentNode;
        recommendationsObserver = new MutationObserver(handleRecommendationMutations);
        recommendationsObserver.observe(recommendationsParent, observeOptions);

        // Process already-visible recommendations
        processExistingRecommendations();
    }
}

// Start top-level observer
function startMainObserver() {
    // Observe the document because the recommendations load after the observer starts
    // This way we can wait for the recommendations to appear and then start observing only that
    const targetNode = document.documentElement;
    const observer = new MutationObserver(handleMutations);
    observer.observe(targetNode, observeOptions);
}

// Load the hidden state from storage
async function loadHiddenState() {
    // load checkbox state
    const storedHideBlocked = await browser.storage.local.get('hideBlocked');
    if (!storedHideBlocked || typeof storedHideBlocked.hideBlocked !== 'boolean') {
        // Default to false if not set
        hideBlocked = false;
    } else {
        // Ensure the value is a boolean
        hideBlocked = Boolean(storedHideBlocked.hideBlocked);
    }
}

// Load the blacklist and start observing
async function loadBlacklistFromStorage() {
    const storedBlacklist = await browser.storage.local.get('blacklist');
    const storedCustomList = await browser.storage.local.get('customList');
    blacklist = storedBlacklist.blacklist ? storedBlacklist.blacklist
        .split('\n')
        .map(line => line.trim().toLowerCase().replace(/\s+/g, ''))
        .filter(Boolean)
        : [];
    customList = storedCustomList.customList ? storedCustomList.customList
        .split('\n')
        .map(line => line.trim().toLowerCase().replace(/\s+/g, ''))
        .filter(Boolean)
        : [];
    fullList = [...blacklist, ...customList];

    // Load the state of the hidden checkbox
    loadHiddenState();

    // Check if the user is signed in
    (async () => {
        try {
            const signedIn = await isUserSignedIn(signInTag);
            if (signedIn) {
                startMainObserver();
            }
        } catch (e) {
            console.debug("User is not signed in. Observer not started.");
        }
    })();
}


// ----------------------------------------------------------------
// Main block
// ----------------------------------------------------------------
console.debug('YouTube Blocker content script loaded.');
loadBlacklistFromStorage();
