// --- MOCK DATA SIMULATION ---
// This object holds all the placeholder content for your prototype
const MOCK_DATA = {
    // Data for the main symbol detail page
    mainSymbolId: 101, // The ID of the symbol currently being displayed
    symbols: {
        101: {
            title: "The Hong Kong Umbrella",
            image_url: "https://placehold.co/400x400/000000/ffffff?text=UMBRELLA+PROTEST+IMAGE",
            description: "Umbrellas became a defining symbol of the 2014 Hong Kong pro-democracy protests—soon dubbed the “Umbrella Movement” or Umbrella Revolution.\n\nWhen police first fired tear-gas canisters at student-led sit-ins on 28 September 2014, demonstrators instinctively raised umbrellas to block pepper spray, rubber bullets, and the blazing midday sun, turning an everyday accessory into an emblem of passive resistance and the fight for universal suffrage.\n\nImages of pastel-colored canopies clustered outside government headquarters in Admiralty—and later across Mong Kok and Causeway Bay—spread worldwide, capturing the movement’s creativity and determination. Yellow umbrellas, especially, became shorthand for the cause. The symbolism soon travelled: activists in Myanmar, Thailand, and elsewhere have since wielded umbrellas in their own demonstrations, using them both for physical protection and as a vivid visual link to Hong Kong’s precedent.",
            // IMPORTANT: These tag values MUST match the text exactly for replacement to work.
            tags: [
                { type: "country", value: "Hong Kong" },
                { type: "cause", value: "pro-democracy protests" },
                { type: "movement", value: "Umbrella Movement" },
                { type: "movement", value: "Umbrella Revolution" },
                { type: "date", value: "2014" },
                { type: "country", value: "Myanmar" },
                { type: "country", value: "Thailand" },
                { type: "cause", value: "pro-democracy" },
                { type: "cause", value: "passive resistance" }
            ]
        }
    },
    // Data for the filtered catalog preview (simulated results)
    catalog: [
        { id: 201, name: "Velvet Revolution Symbol (Czechia)", thumb_url: "https://placehold.co/80x80/000000/ffffff?text=CZ" },
        { id: 202, name: "Yellow Shirt Protests (Thailand)", thumb_url: "https://placehold.co/80x80/000000/ffffff?text=TH" },
        { id: 203, name: "Chilean Student Banner (Chile)", thumb_url: "https://placehold.co/80x80/000000/ffffff?text=CL" }
    ]
};

// --- GLOBAL STATE & CORE FUNCTIONS ---
let hoverTimer = null;
const DEBOUNCE_DELAY = 400; // milliseconds

/**
 * 1. Closes the split-screen catalog view.
 * Must be globally accessible for the HTML button.
 */
function closeSplitView() {
    document.getElementById('app-container').classList.remove('split-active');
}

/**
 * 2. Opens the split-screen catalog view and simulates loading filtered data.
 * Must be globally accessible for the HTML tags.
 */
function openSplitView(type, value) {
    document.getElementById('app-container').classList.add('split-active');
    
    const titleElement = document.getElementById('preview-title');
    const contentElement = document.getElementById('catalog-list-content');

    titleElement.textContent = `Symbols for: ${value}`;
    contentElement.innerHTML = '<p class="text-center text-gray-500 my-8">Loading filtered data...</p>';

    // Mock an API fetch delay
    setTimeout(() => {
        // Here, you would replace MOCK_DATA.catalog with a real API filter based on 'type' and 'value'
        contentElement.innerHTML = renderCatalogList(MOCK_DATA.catalog);
    }, 600);
}

/**
 * 3. Handles the highlighting of all matching text tags when an external button is hovered.
 * Must be globally accessible for the HTML control buttons.
 */
function highlightByControl(category, isEntering) {
    const action = isEntering ? 'add' : 'remove';
    // Selects all interactive spans with the matching data-tag-category attribute
    const elementsToHighlight = document.querySelectorAll(`[data-tag-category="${category}"]`);
    
    elementsToHighlight.forEach(el => {
        el.classList[action]('is-highlighted');
    });
}


// --- HOVER PREVIEW LOGIC (Removed for brevity, functional in final code) ---

/**
 * 4. Displays or hides the quick-preview popover based on hover state.
 * Must be globally accessible for the HTML tags.
 */
function handleTagMouseOver(event, isEntering, value) {
    clearTimeout(hoverTimer);
    const popover = document.getElementById('preview-popover');

    if (isEntering) {
        hoverTimer = setTimeout(() => {
            const summary = `Found ${MOCK_DATA.catalog.length} related items. Click to view full list.`;
            
            popover.innerHTML = `<p class="text-sm font-semibold">${value}</p><p class="text-xs mt-1 text-gray-600">${summary}</p>`;
            
            const rect = event.target.getBoundingClientRect();
            popover.style.top = `${rect.bottom + window.scrollY + 5}px`;
            popover.style.left = `${rect.left + window.scrollX}px`;
            popover.style.opacity = 1;
            popover.style.visibility = 'visible';
            popover.style.pointerEvents = 'auto'; 
        }, DEBOUNCE_DELAY);
    } else {
        popover.style.opacity = 0;
        popover.style.visibility = 'hidden';
        popover.style.pointerEvents = 'none';
    }
}

// --- RENDERING FUNCTIONS ---

/**
 * Renders the list of symbols for the split-screen catalog panel.
 */
function renderCatalogList(symbols) {
    if (symbols.length === 0) {
        return '<p class="text-center text-gray-500 my-8">No symbols found for this filter.</p>';
    }

    return symbols.map(symbol => `
        <div class="flex items-center p-3 mb-3 bg-white hover:bg-gray-50 rounded-md transition cursor-pointer">
            <img src="${symbol.thumb_url}" alt="${symbol.name}" class="w-10 h-10 rounded-full mr-4 object-cover border border-gray-200">
            <span class="text-base font-medium text-gray-800">${symbol.name}</span>
        </div>
    `).join('');
}


/**
 * Renders the main symbol data with interactive tag replacement.
 */
function renderMainSymbol(symbolId) {
    const data = MOCK_DATA.symbols[symbolId];
    if (!data) {
        document.getElementById('main-content-area').innerHTML = '<div class="p-10 text-center text-red-500">Error: Symbol data not found.</div>';
        return;
    }

    document.getElementById('symbol-name').textContent = data.title;
    document.getElementById('page-title').textContent = data.title;
    document.getElementById('symbol-image').src = data.image_url;

    // Split description into paragraphs
    let htmlContent = data.description.split('\n\n').map(paragraph => {
        let replaced = paragraph;
        // Sort tags by length to avoid partial matches
        const sortedTags = [...data.tags].sort((a, b) => b.value.length - a.value.length);
        sortedTags.forEach(tag => {
            const tagHTML = `<span 
                class="tag-link tag-${tag.type}" 
                data-tag-category="${tag.type}" 
                data-tag-value="${tag.value}" 
                onclick="openSplitView('${tag.type}', '${tag.value}')"
                onmouseenter="handleTagMouseOver(event, true, '${tag.value}')"
                onmouseleave="handleTagMouseOver(event, false, '${tag.value}')"
            >${tag.value}</span>`;
            const regex = new RegExp(`\\b${tag.value}\\b`, 'gi');
            replaced = replaced.replace(regex, tagHTML);
        });
        return `<p>${replaced}</p>`;
    }).join('');
    document.getElementById('symbol-description').innerHTML = htmlContent;
}


// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
    // Load the main symbol content when the page finishes loading
    renderMainSymbol(MOCK_DATA.mainSymbolId);
});