// debugging
const DEBUG = false;

const buttonTag = 'button';
const signInTag = 'ytd-masthead button#avatar-btn';
const menuRole = '[role="menuitem"]';

let blacklist = [];
let fullList = [];

let recommendationsObserver = null;
const observeOptions = { childList: true, attributes: false, subtree: true };

// Function to check if the user is signed in
function isUserSignedIn(tag, maxRetries=10, delay=300) {
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
            const items = Array.from(document.querySelectorAll(menuRole));
            const match = items.find(item => item.innerText.trim().toLowerCase() === labelText.toLowerCase());
            if (match) {
                return resolve(match);
            }
            attempts++;
            if (attempts < maxRetries) {
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
async function blockChannel(node) {
    if (node.nodeType === 1 && node.tagName.toLowerCase() === buttonTag) {
        if (DEBUG) {
            node.style.outline = '2px solid red';
        }
        node.click();

        waitForMenuItem("Don't recommend channel")
            .then(item => {
                item.click();
            })
            .catch(err => {
                console.warn(err);
            });
        return node;
    }
    for (const child of node.childNodes) {
        const found = await blockChannel(child);
        if (found) return found;
    }

    return null;
}

// Normalize a channel name by removing whitespace and lowercasing it
function normalizeText(text) {
    return text.trim().toLowerCase().replace(/\s+/g, '');
}

// Check if channel is in blacklist
function checkChannelName(channelName) {
    if (channelName == null) {
        return false;
    }
    const normalizedChannel = normalizeText(channelName);
    const normalizedList = fullList.map(normalizeText);
    return normalizedList.includes(normalizedChannel);
}

// Get the channel name without using tags
function getChannelNameText(element) {
    // Loop over all text underneath the recommendation
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                // Reject any text node that has an <a> ancestor
                let curr = node.parentElement;
                while (curr) {
                    if (curr.tagName === "A") return NodeFilter.FILTER_REJECT;
                    curr = curr.parentElement;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        },
        false
    );

    while (walker.nextNode()) {
        const text = walker.currentNode.textContent.trim();
        if (text.length > 0) {
            return text; // Return the first non-empty, non-<a> text
        }
    }

    return null; // No channel name found
}

// Common logic for both recommendation functions
async function doRecommendationLogic(node) {
    if (DEBUG) {
        node.style.outline = '2px solid limegreen';
    }
    const channelName = getChannelNameText(node)
    if (checkChannelName(channelName)) {
        console.debug('Blocking channel:', channelName);
        blockChannel(node);
        // Hide the blocked channel
        node.style.display = 'none';
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
async function processExistingRecommendations(recommendations) {
    for (const recommendation of recommendations) {
        await doRecommendationLogic(recommendation); // Wait for each to finish
    }
}

// Watch for recommendations parent
function handleMutations(mutationsList, observer) {
    let recommendations = findRecommendationLinks();

    // check if the recommendations were found yet
    if (Object.keys(recommendations).length !== 0) {
        // Disconnect the main observer to avoid duplicate processing
        observer.disconnect();

        // observe the recommendations parent to watch for new videos
        // make an observer for each recommendations group in case multiple were found
        for (let key in recommendations) {
            // find the common ancestor among this recommendations group
            const recommendationsParent = getCommonAncestor(recommendations[key]);
            recommendationsObserver = new MutationObserver(handleRecommendationMutations);
            recommendationsObserver.observe(recommendationsParent, observeOptions);

            // Process already-visible recommendations
            processExistingRecommendations(recommendationsParent.children);
        }
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

// Get the depth of an element
function getElementDepth(el) {
    let depth = 0;
    while (el.parentElement) {
        el = el.parentElement;
        depth++;
    }
    return depth;
}

// Build a unique key from a tag, class, and depth
function getGroupKey(el) {
    const classes = [...el.classList].sort().join(' ');
    const tag = el.tagName;
    const depth = getElementDepth(el);
    return `${tag}__${classes}__depth${depth}`;
}

// Find a list of video links from the recommendation section
// Recommendations is an array with an anchor and an image, so we use that to filter
function findRecommendationLinks() {
    // Step 1: collect all candidate containers (like video tiles)
    const allContainers = Array.from(document.querySelectorAll('*'))
        .filter(el => el.children.length > 0 && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE');

    // Step 2: group them by tag + class
    const groups = {};
    allContainers.forEach(el => {
        const key = getGroupKey(el);
        if (!groups[key]) groups[key] = [];
        groups[key].push(el);
    });

    // A set to hold unique tags/classes/depth combinations that matches our search criteria
    const matchedElements = new Set([]);

    // Step 3: filter all <a> elements
    const videoLinks = Array.from(document.querySelectorAll('a'))
        .filter(a => {
            if (!a.href.includes('watch') || !a.querySelector('img')) return false;

            // Step 4: find the closest ancestor (up to 3 levels) that's in a large enough group
            let current = a;
            for (let i = 0; i < 3; i++) {
                current = current.parentElement;
                // exit if there's no parent found
                if (!current) break;

                // The group needs at least 5 identical members
                const key = getGroupKey(current);
                if (groups[key] && groups[key].length >= 5) {
                    matchedElements.add(key);
                    return true;
                }
            }
            return false;
        });

    // Step 5: split videoLinks into sublists grouped by their matched container key
    // this handles the case where multiple different arrays matched the filter, but are in different parts of the DOM
    const groupedLinks = {};
    videoLinks.forEach(a => {
        let current = a;
        for (let i = 0; i < 3; i++) {
            current = current.parentElement;
            if (!current) break;

            const key = getGroupKey(current);
            if (matchedElements.has(key)) {
                if (!groupedLinks[key]) groupedLinks[key] = [];
                groupedLinks[key].push(a);
                break;
            }
        }
    });

    return groupedLinks; // returns { key1: [a1, a2], key2: [a3, a4], ... }
}

// Find the common ancestor of all the recommendation links
function getCommonAncestor(nodes) {
    if (!nodes.length) return null;

    function getAncestors(node) {
        const ancestors = [];
        while (node) {
            ancestors.unshift(node);
            node = node.parentElement;
        }
        return ancestors;
    }

    let commonAncestors = getAncestors(nodes[0]);

    for (let i = 1; i < nodes.length; i++) {
        const ancestors = getAncestors(nodes[i]);
        let j = 0;
        while (j < commonAncestors.length && j < ancestors.length && commonAncestors[j] === ancestors[j]) {
            j++;
        }
        commonAncestors = commonAncestors.slice(0, j);
    }

    return commonAncestors.pop(); // last shared ancestor
}

// Load the blacklist and start observing
async function initiate() {
    fullList = await getFromStorage('blacklist', []);

    // Check if the user is signed in
    (async () => {
        try {
            const signedIn = await isUserSignedIn(signInTag);
            if (signedIn) {
                startMainObserver();
            }
        } catch (e) {
            console.debug('User is not signed in. Observer not started.');
        }
    })();
}

// Check if it's been long enough to fetch a list update
function sendFetchBlacklist() {
    browser.runtime.sendMessage({
        action: 'fetchBlacklist'
    });
}


// ----------------------------------------------------------------
// Main block
// ----------------------------------------------------------------
console.debug('YouTube Blocker content script loaded.');
sendFetchBlacklist();
initiate();