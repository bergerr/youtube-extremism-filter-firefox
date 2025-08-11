// Get references to DOM elements
const blacklistBox = document.getElementById('blacklistSelect');
const whitelistBox = document.getElementById('whitelistSelect');
const customListBox = document.getElementById('customListBox');


// Loads the blacklist from storage (or a file if it doesn't exist).
async function loadBlacklist() {
    let blacklist = await getFromStorage('blacklist');
    let whitelist = await getFromStorage('whitelist');
    let customlist = await getFromStorage('customlist');

    // If no blacklist in storage, pull it from github and save it to localstorage
    if (!blacklist) {
        blacklist = await updateBlacklistIfNeeded(true);
    }

    blacklistBox.innerHTML = ''; // Clear current options

    // Add each line as an option in the select box
    for (const line of blacklist) {
        const option = document.createElement('option');
        option.value = line;
        option.textContent = line;
        blacklistBox.appendChild(option);
    }

    if (whitelist) {
        whitelistBox.innerHTML = ''; // Clear current options

        // Add each line as an option in the select box
        for (const line of whitelist) {
            const option = document.createElement('option');
            option.value = line;
            option.textContent = line;
            whitelistBox.appendChild(option);
        }
    }
    if (customlist) {
        customListBox.innerHTML = customlist; // Clear current options
    }
}

// Removes selected items from the blacklist and saves the updated list.
function moveBetweenLists(sourceBox, targetBox) {
    // Get selected options to remove
    const selected = Array.from(sourceBox.selectedOptions).map(opt => opt.value);
    // Get remaining options (not selected)
    const remaining = Array.from(sourceBox.options)
        .map(opt => opt.value)
        .filter(value => !selected.includes(value));

    // get the current values in the target box
    let currentList = Array.from(targetBox.options).map(opt => opt.value)

    // decide which action to take based on the source box
    let actionSource, actionTarget;
    if (sourceBox.id === 'blacklistSelect') {
        actionSource = 'saveBlacklist';
        actionTarget = 'saveWhitelist';
    } else {
        actionSource = 'saveWhitelist';
        actionTarget = 'saveBlacklist';
    }

    // Send the updated source list to the background script to save
    browser.runtime.sendMessage({
        action: actionSource,
        content: remaining
    }).then(() => {
        // Send the target list to the background service to save
        currentList = currentList.concat(selected).sort(); // Combine lists and sort
        browser.runtime.sendMessage({
            action: actionTarget,
            content: currentList
        })
    }).then(() => {
        // repopulate the select box with the updated source list
        sourceBox.innerHTML = ''; // Clear current options
        remaining.forEach(item => {
            const sourceOption = document.createElement('option');
            sourceOption.value = item;
            sourceOption.textContent = item;
            sourceBox.appendChild(sourceOption);
        });
        // add the removed items to the target list
        targetBox.innerHTML = ''; // Clear current options

        currentList.forEach(item => {
            const targetOption = document.createElement('option');
            targetOption.value = item;
            targetOption.textContent = item;
            targetBox.appendChild(targetOption);
        });
    }).catch(err => {
        // Handle save errors
        console.error('Error saving source list:', err);
    });
}

// Converts the custom text to a secondary blacklist.
function saveCustomList(customText) {
    // Get the custom text value
    const customValue = customText.value.trim();

    // Split the custom text into lines, removing empty lines
    const lines = customValue.split('\n').filter(Boolean);

    // Send the custom list to the background script to save
    browser.runtime.sendMessage({
        action: 'saveCustomList',
        content: lines.join('\n')
    });
}

// Attach event listeners to all the buttons
document.getElementById('removeButton').addEventListener('click', () => {
  moveBetweenLists(blacklistBox, whitelistBox);
});
document.getElementById('addButton').addEventListener('click', () => {
    moveBetweenLists(whitelistBox, blacklistBox)
});
document.getElementById('saveCustomButton').addEventListener('click', () => {
    // moveBetweenLists(whitelistBox, blacklistBox)
    saveCustomList(customListBox);
});

// Initial load of the blacklist when the page loads
loadBlacklist();
