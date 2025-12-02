// Global variable to hold ALL protest objects, accessible by all functions
let ALL_PROTEST_DATA = [];

// --- 1. CORE DATA FETCH AND INITIALIZATION ---
(async () => {
    const descriptionText = document.getElementById('description-text');
    const closePanelBtn = document.getElementById('close-panel-btn');

    const urlParams = new URLSearchParams(window.location.search);
    const objectId = parseInt(urlParams.get('id')) || 1; 

    try {
        const response = await fetch('protest_data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        
        // CRITICAL FIX: Store the full data array globally
        ALL_PROTEST_DATA = data;
        
        const objectData = data.find(obj => obj.id === objectId);

        if (objectData) {
            renderObjectPage(objectData);
            setupHighlighting(objectData);
            
            // Setup close button listener
            closePanelBtn.addEventListener('click', () => togglePanel(false)); 
        } else {
            descriptionText.textContent = `Error: Object not found for ID ${objectId}.`;
        }

    } catch (error) {
        console.error('Error loading data:', error);
        descriptionText.textContent = 'Error loading project data file.';
    }
})();


// --- 2. DATA RENDERING FUNCTIONS (No changes needed) ---

function renderObjectPage(data) {
    document.getElementById('object-title').textContent = data.name;
    document.getElementById('object-image').src = data.image_filename || 'placeholder.jpg';
    
    document.getElementById('description-text').innerHTML = data.description_html; 

    renderFilterButtons(data);
    // Render the photo gallery (uses data.images if present, otherwise falls back to image_filename)
    renderGallery(data);
    
    document.getElementById('type-tag').textContent = data.categories_object_type?.join(', ') || '';
    document.getElementById('timeframe-tag').textContent = data.categories_timeframe?.join(', ') || '';
}


function renderFilterButtons(data) {
    const buttonContainer = document.getElementById('filter-buttons-container');
    
    const highlightCategories = [
        { key: 'categories_country', label: 'Where?', classPrefix: 'highlight-country' },
        { key: 'categories_cause', label: 'Why?', classPrefix: 'highlight-cause' },
        { key: 'categories_protest', label: 'Protest/Movement', classPrefix: 'highlight-protest' },
        { key: 'categories_timeframe', label: 'When?', classPrefix: 'highlight-timeframe' }
    ];

    highlightCategories.forEach(cat => {
        if (data[cat.key] && data[cat.key].length > 0) {
            const button = document.createElement('button');
            button.className = 'filter-button';
            button.textContent = cat.label;
            button.dataset.target = cat.classPrefix; 
            
            buttonContainer.appendChild(button);
        }
    });
}


// --- 3. FEATURE LOGIC: HIGHLIGHTING & SPLIT-SCREEN ---

function setupHighlighting(objectData) {
    const buttons = document.querySelectorAll('.filter-button');

    buttons.forEach(button => {
        const targetClass = button.dataset.target;

        // Unified function to toggle the 'highlight-active' class
        const toggleHighlight = (isActive) => {
            document.querySelectorAll(`.${targetClass}`)
                .forEach(span => {
                    span.classList.toggle('highlight-active', isActive);
                });
        };

        // Mouseover/Mouseout Logic
        button.addEventListener('mouseover', () => toggleHighlight(true));
        button.addEventListener('mouseout', () => toggleHighlight(false));
        
        // Click Logic (Triggers the Split-Screen/Context Panel)
        button.addEventListener('click', (event) => {
            // PASS THE FULL GLOBAL DATA ARRAY HERE
            handleContextPanel(event);
        });
    });

    // Add click event to highlighted spans in description
    document.getElementById('description-text').addEventListener('click', async function(e) {
        if (e.target.matches('span[class^="highlight-"]')) {
            const typeClass = Array.from(e.target.classList).find(cls => cls.startsWith('highlight-'));
            const categoryKey = typeClass.replace('highlight-', 'categories_');
            const value = e.target.textContent.trim();


            const panelContent = document.getElementById('context-panel-content');
            document.getElementById('context-panel').classList.add('active');
            document.getElementById('object-container').classList.add('split');

            if (categoryKey === 'categories_protest') {
                if (value === 'Umbrella Revolution') {
                    // Show the photo essay page in an iframe
                    panelContent.innerHTML = `
                        <iframe src="umbrella-movement.html" style="width:100%;height:600px;border:none;"></iframe>
                    `;
                } else {
                    // Fetch protest info from protest_info.json
                    try {
                        const response = await fetch('protest_info.json');
                        if (!response.ok) throw new Error('Could not load protest info');
                        const protestInfo = await response.json();
                        const info = protestInfo[value];
                        if (info) {
                            panelContent.innerHTML = `
                                <h3>${value}</h3>
                                <p><strong>Year:</strong> ${info.year}</p>
                                <p>${info.summary}</p>
                                ${info.key_events ? `<ul>${info.key_events.map(event => `<li>${event}</li>`).join('')}</ul>` : ''}
                            `;
                        } else {
                            panelContent.innerHTML = `<p>No information available for ${value}.</p>`;
                        }
                    } catch (err) {
                        panelContent.innerHTML = `<p>Error loading protest info.</p>`;
                    }
                }
            } else {
                // Filter all objects by the clicked tag value
                const filteredResults = ALL_PROTEST_DATA.filter(obj =>
                    obj[categoryKey] && obj[categoryKey].map(v => v.trim()).includes(value)
                );
                panelContent.innerHTML = `
                    <h3>Protest objects in: ${value}</h3>
                    <ul>
                        ${filteredResults.map(obj => 
                            `<li>
                                <a href="object-detail.html?id=${obj.id}" class="context-object-link">
                                    <strong>${obj.name}</strong>
                                </a>
                            </li>`
                        ).join('')}
                    </ul>
                    <p>Showing all objects linked to <strong>${value}</strong>.</p>
                `;
            }
        }
    });
}


function handleContextPanel(event) {
    const clickedButton = event.currentTarget;
    // Converts 'highlight-country' to 'categories_country'
    const categoryKey = clickedButton.dataset.target.replace('highlight-', 'categories_'); 
    const categoryLabel = clickedButton.textContent; 

    // Find all unique terms associated with this category across ALL objects
    const allTerms = new Set();
    ALL_PROTEST_DATA.forEach(obj => {
        if (obj[categoryKey]) {
            obj[categoryKey].forEach(term => allTerms.add(term));
        }
    });
    
    // Convert set back to array for display
    const filterTerms = Array.from(allTerms);

    // Toggle the panel open and pass the necessary filter information
    document.getElementById('context-panel').classList.add('active');
    document.getElementById('object-container').classList.add('split');
    document.getElementById('content-display').classList.add('split');
    togglePanel(true, { 
        key: categoryKey, 
        label: categoryLabel,
        terms: filterTerms
    });
}

// ... togglePanel and populateContextPanel remain the same, but I've updated populateContextPanel to use the new ALL_PROTEST_DATA global variable.

function togglePanel(open, filterData = null) {
    const panel = document.getElementById('context-panel');
    const container = document.getElementById('object-container');

    panel.classList.toggle('active', open);
    container.classList.toggle('split', open);

    if (open && filterData) {
        populateContextPanel(filterData); 
    } else if (!open) {
        document.getElementById('context-panel-content').innerHTML = '';
    document.getElementById('context-panel').classList.remove('active');
    document.getElementById('object-container').classList.remove('split');
    document.getElementById('content-display').classList.remove('split');
    }
}


function populateContextPanel(filterData) {
    const panelContent = document.getElementById('context-panel-content');
    
    // Filter the global data array based on the clicked term (if a specific term was clicked)
    // If a button was clicked, we show ALL terms linked to that category.
    const termToFilterBy = filterData.term; // This will only be defined if a span was clicked
    let filteredResults = [];

    if (termToFilterBy) {
        // If a specific term (e.g., 'Hong Kong') was clicked, filter to show only those objects
        filteredResults = ALL_PROTEST_DATA.filter(obj => 
            obj[filterData.key] && obj[filterData.key].includes(termToFilterBy)
        );
    } else {
        // If a primary button (e.g., 'Country') was clicked, show a summary.
        // We will just show the mock-up summary for the primary button click for simplicity.
        
        const termsList = filterData.terms.map(term => `<li>**${term}**</li>`).join('');

        panelContent.innerHTML = `
            <h3>Context: All ${filterData.label} Terms</h3>
            <p>The **${filterData.label}** filter button was clicked. The full list of terms linked to this category across all objects are:</p>
            <ul>${termsList}</ul>
            <hr>
            <h4>Project Demonstration:</h4>
            <p>This dynamic panel confirms the data is correctly linked and the split-screen UI is functional.</p>
        `;
        return;
    }

    // This section runs ONLY if a specific term (like 'Hong Kong') was clicked.
    const resultsList = filteredResults.map(obj => 
        `<div class="context-result"><strong>${obj.name}</strong> (${obj.categories_country[0]})</div>`
    ).join('');


    panelContent.innerHTML = `
        <h3>Results for: ${termToFilterBy}</h3>
        <p>Found ${filteredResults.length} object(s) linked to **${termToFilterBy}**:</p>
        ${resultsList}
        <hr>
        <p>This demonstrates real-time filtering based on a term clicked in the description text.</p>
    `;
}

/* --- PHOTO GALLERY RENDERING --- */
function renderGallery(data) {
    const gallery = document.getElementById('photo-gallery');
    if (!gallery) return;

    // Determine list of images to show: prefer `images` array, else fallback to `image_filename`
    const rawImages = Array.isArray(data.images) && data.images.length > 0 ? data.images : [data.image_filename].filter(Boolean);

    // Normalize images to objects: { src, thumb, caption, type }
    const images = rawImages.map(item => {
        if (typeof item === 'string') {
            // infer type from extension
            const ext = (item.split('.').pop() || '').toLowerCase();
            const t = (ext === 'mp4' || ext === 'webm') ? 'video' : 'image';
            return { src: item, thumb: item, caption: '', type: t };
        }
        // item is expected to be an object; support `src`, `thumb`, `caption`, `type`
        const src = item.src || item;
        const thumb = item.thumb || src;
        const caption = (typeof item.caption === 'string') ? item.caption : '';
        const type = item.type || (/(youtube\.com|vimeo\.com|\.mp4|\.webm)/i.test(src) ? (src.includes('youtube.com') || src.includes('vimeo.com') ? 'embed' : (src.match(/\.mp4|\.webm/i) ? 'video' : 'image')) : 'image');
        return { src, thumb, caption, type };
    });

    gallery.innerHTML = '';

    images.forEach((item, idx) => {
        // Wrap thumbnails so we can add a play overlay for non-image items
        const wrapper = document.createElement('div');
        wrapper.className = 'thumb-wrapper';
        wrapper.tabIndex = -1;

        const img = document.createElement('img');
        img.src = item.thumb || item.src;
        img.alt = item.caption || `${data.name} — photo ${idx + 1}`;
        img.className = 'thumb';
        img.tabIndex = 0; // make focusable for accessibility
        img.dataset.index = idx;

        // If item is video or embed, add a play icon overlay
        if (item.type && item.type !== 'image') {
            const play = document.createElement('span');
            play.className = 'play-icon';
            play.innerHTML = '▶';
            wrapper.appendChild(img);
            wrapper.appendChild(play);
        } else {
            wrapper.appendChild(img);
        }

        // Mark the first thumb as selected visually (optional)
        if (idx === 0) img.classList.add('selected');

        const openHandler = () => {
            openLightbox(images, idx, data.name);
            gallery.querySelectorAll('.thumb').forEach(t => t.classList.remove('selected'));
            img.classList.add('selected');
        };

        wrapper.addEventListener('click', openHandler);
        img.addEventListener('keydown', (e) => { if (e.key === 'Enter') openHandler(); });

        gallery.appendChild(wrapper);
    });

    // If there's only one image, reduce visual emphasis
    if (images.length === 1) {
        gallery.style.opacity = '0.9';
    }
}

/* --- LIGHTBOX / MODAL --- */
// Open the lightbox with an array of images and a starting index
function openLightbox(images, startIndex = 0, baseCaption = '') {
    const lb = document.getElementById('lightbox');
    const lbMedia = document.getElementById('lightbox-media');
    const lbCaption = document.getElementById('lightbox-caption');
    const lbClose = document.getElementById('lightbox-close');
    const lbBackdrop = document.getElementById('lightbox-backdrop');
    const lbPrev = document.getElementById('lightbox-prev');
    const lbNext = document.getElementById('lightbox-next');

    if (!lb || !lbMedia) return;

    // Normalize images array to objects { src, thumb, caption, type } and preserve type when present
    const imgs = (Array.isArray(images) ? images : [images]).map(item => {
        if (typeof item === 'string') {
            const ext = (item.split('.').pop() || '').toLowerCase();
            const t = (ext === 'mp4' || ext === 'webm') ? 'video' : 'image';
            return { src: item, thumb: item, caption: '', type: t };
        }
        const src = item.src || item;
        const thumb = item.thumb || src;
        const caption = (typeof item.caption === 'string') ? item.caption : '';
        const type = item.type || (/(youtube\.com|vimeo\.com)/i.test(src) ? 'embed' : (src.match(/\.mp4|\.webm/i) ? 'video' : 'image'));
        return { src, thumb, caption, type };
    });

    // Save state on the lightbox element
    lb._state = {
        images: imgs,
        index: Math.max(0, Math.min(startIndex, imgs.length - 1)),
        baseCaption: baseCaption || ''
    };

    // Helper to show a given index and render appropriate media
    function showIndex(i) {
        const idx = (i + lb._state.images.length) % lb._state.images.length; // wrap
        lb._state.index = idx;
        const imageObj = lb._state.images[idx];

        // clear previous media
        lbMedia.innerHTML = '';

        const captionText = imageObj.caption ? imageObj.caption : `${lb._state.baseCaption} — photo ${idx + 1}`;

        if (!imageObj.type || imageObj.type === 'image') {
            const img = document.createElement('img');
            img.src = imageObj.src;
            img.alt = captionText;
            lbMedia.appendChild(img);
        } else if (imageObj.type === 'video') {
            const video = document.createElement('video');
            video.controls = true;
            video.src = imageObj.src;
            if (imageObj.thumb) video.poster = imageObj.thumb;
            lbMedia.appendChild(video);
        } else if (imageObj.type === 'embed') {
            const iframe = document.createElement('iframe');
            // if src already contains query params, do not append autoplay; leave control to user
            iframe.src = imageObj.src;
            iframe.setAttribute('frameborder', '0');
            iframe.setAttribute('allow', 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture');
            iframe.setAttribute('allowfullscreen', '');
            lbMedia.appendChild(iframe);
        }

        lbCaption.textContent = captionText;
    }

    // initial show
    showIndex(lb._state.index);

    lb.classList.add('active');
    lb.setAttribute('aria-hidden', 'false');

    // Event handlers
    const onClose = () => closeLightbox();
    const onKey = (e) => {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') showIndex(lb._state.index - 1);
        if (e.key === 'ArrowRight') showIndex(lb._state.index + 1);
    };
    const onPrev = () => showIndex(lb._state.index - 1);
    const onNext = () => showIndex(lb._state.index + 1);

    lbClose?.addEventListener('click', onClose);
    lbBackdrop?.addEventListener('click', onClose);
    lbPrev?.addEventListener('click', onPrev);
    lbNext?.addEventListener('click', onNext);
    document.addEventListener('keydown', onKey);

    // store cleanup references on the element so closeLightbox can remove listeners
    lb._cleanup = { onClose, onKey, onPrev, onNext };

    // Accessibility: focus on close button
    lbClose?.focus();
}

function closeLightbox() {
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lightbox-image');
    const lbClose = document.getElementById('lightbox-close');
    const lbBackdrop = document.getElementById('lightbox-backdrop');
    const lbPrev = document.getElementById('lightbox-prev');
    const lbNext = document.getElementById('lightbox-next');

    if (!lb) return;

    lb.classList.remove('active');
    lb.setAttribute('aria-hidden', 'true');

    // clear media to stop playback / free memory
    if (lbMedia) lbMedia.innerHTML = '';

    // remove listeners if present
    if (lb._cleanup) {
        if (lbClose && typeof lb._cleanup.onClose === 'function') lbClose.removeEventListener('click', lb._cleanup.onClose);
        if (lbBackdrop && typeof lb._cleanup.onClose === 'function') lbBackdrop.removeEventListener('click', lb._cleanup.onClose);
        if (lbPrev && typeof lb._cleanup.onPrev === 'function') lbPrev.removeEventListener('click', lb._cleanup.onPrev);
        if (lbNext && typeof lb._cleanup.onNext === 'function') lbNext.removeEventListener('click', lb._cleanup.onNext);
        if (typeof lb._cleanup.onKey === 'function') document.removeEventListener('keydown', lb._cleanup.onKey);
        delete lb._cleanup;
    }

    // clear state
    if (lb._state) delete lb._state;

    // return focus to the gallery (nice to have): focus first thumbnail if present
    const firstThumb = document.querySelector('#photo-gallery .thumb');
    if (firstThumb) firstThumb.focus();
}