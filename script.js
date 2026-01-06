// Global variable to hold ALL protest objects, accessible by all functions
let ALL_PROTEST_DATA = [];

// --- 1. CORE DATA FETCH AND INITIALIZATION ---
(async () => {
    const descriptionText = document.getElementById('description-text');
    const closePanelBtn = document.getElementById('close-panel-btn');
    const backBtn = document.getElementById('back-button');

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
            // Setup global back button: prefer history.back(), fallback to gallery
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    // If there's a referrer in the session, go back; otherwise go to welcome.html
                    try {
                        if (document.referrer && document.referrer !== '') {
                            history.back();
                        } else {
                            window.location.href = 'welcome.html';
                        }
                    } catch (e) {
                        window.location.href = 'welcome.html';
                    }
                });
            }
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
    // Render optional extra sections: eyewitness stories and sources
    renderExtraSections(data);
    // Initialize collapsible subsections after rendering content
    setupCollapsibles();
    // Align description column with object title when columns are side-by-side
    // and ensure sticky calculations run after layout.
    requestAnimationFrame(() => {
        alignDescriptionWithTitle();
        adjustSubsectionStickiness();
    });
    
    document.getElementById('type-tag').textContent = (data.categories_object_type && data.categories_object_type.join(', ')) || '';
    document.getElementById('timeframe-tag').textContent = (data.categories_timeframe && data.categories_timeframe.join(', ')) || '';
}

// Align the top of the description block with the object title when the
// layout shows columns side-by-side. This measures the title's position
// relative to the content column and applies a matching margin-top to the
// description block. It only runs on wide viewports to avoid interfering
// with the single-column mobile layout.
function alignDescriptionWithTitle(){
    const title = document.getElementById('object-title');
    const desc = document.getElementById('description-block');
    const content = document.querySelector('.content-column');
    const meta = document.querySelector('.metadata-column');
    if(!title || !desc || !content) return;

    // Only align when metadata column is visible alongside content.
    const isSideBySide = window.innerWidth >= 900 && meta && getComputedStyle(meta).display !== 'none';
    if(!isSideBySide){
        desc.style.marginTop = '';
        return;
    }

    // Preferred calculation: use viewport coordinates so fixed/sticky positions
    // are handled consistently. This is more robust across browsers/layout modes.
    const titleRect = title.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    let desired = Math.round(titleRect.top - contentRect.top);
    if(desired < 0) desired = 0;

    // Apply as margin-top so it doesn't affect layout flow of other elements
    desc.style.marginTop = desired + 'px';

    // Re-run after images may have loaded or layout settled (helps on slower devices)
    setTimeout(() => {
        const titleRect2 = title.getBoundingClientRect();
        const contentRect2 = content.getBoundingClientRect();
        const desired2 = Math.max(0, Math.round(titleRect2.top - contentRect2.top));
        if (Math.abs(desired2 - desired) > 2) {
            desc.style.marginTop = desired2 + 'px';
            if(window.__debugAlign) console.log('alignDescriptionWithTitle: adjusted after timeout', {desired, desired2});
        }
    }, 260);

    if(window.__debugAlign){
        console.log('alignDescriptionWithTitle:', { windowWidth: window.innerWidth, titleRectTop: titleRect.top, contentRectTop: contentRect.top, desired });
    }
}

// Re-run alignment on resize/orientation changes with debounce
window.addEventListener('resize', debounce(() => { alignDescriptionWithTitle(); adjustSubsectionStickiness(); }, 120));
window.addEventListener('orientationchange', () => setTimeout(() => { alignDescriptionWithTitle(); adjustSubsectionStickiness(); }, 200));

// --- 4. COLLAPSIBLE SUBSECTIONS ---
function setupCollapsibles() {
    const toggles = document.querySelectorAll('.subsection-toggle');
    toggles.forEach(btn => {
        const subsection = btn.closest('.subsection');
        const body = subsection.querySelector('.subsection-body');
        // ensure initial state is expanded
        subsection.classList.remove('collapsed');
        btn.setAttribute('aria-expanded', 'true');

        const collapse = () => {
            // set explicit height for transition
            const fullH = body.scrollHeight;
            body.style.maxHeight = fullH + 'px';
            // allow paint
            requestAnimationFrame(() => {
                subsection.classList.add('collapsed');
                btn.setAttribute('aria-expanded', 'false');
                body.style.maxHeight = '0px';
            });
        };

        const expand = () => {
            subsection.classList.remove('collapsed');
            btn.setAttribute('aria-expanded', 'true');
            // set to measured height then remove inline style when done to allow natural growth
            const fullH = body.scrollHeight;
            body.style.maxHeight = fullH + 'px';
            // after transition, clear maxHeight so content can size naturally
            const cleanup = () => {
                body.style.maxHeight = '';
                body.removeEventListener('transitionend', cleanup);
            };
            body.addEventListener('transitionend', cleanup);
        };

        const toggle = () => {
            if (subsection.classList.contains('collapsed')) {
                expand();
            } else {
                collapse();
            }
        };

        btn.addEventListener('click', toggle);
        // allow Enter/Space when focused
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
            }
        });
    });
}

// Measure subsections and disable sticky positioning for any section whose
// body is taller than the available viewport area. This ensures the full
// contents can be scrolled into view instead of being clipped by sticky.
function adjustSubsectionStickiness(){
    const subs = document.querySelectorAll('.description-block .subsection');
    if(!subs || subs.length === 0) return;

    // compute a safe top offset matching the CSS top used for sticky
    const topOffset = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--global-back-offset')) || 56;
    const safeViewport = window.innerHeight - topOffset - 20; // 20px breathing room

    subs.forEach(s => {
        s.classList.remove('non-sticky');
        // collapsed sections are static and take no space
        if (s.classList.contains('collapsed')) return;
        const body = s.querySelector('.subsection-body');
        if(!body) return;
        const bodyHeight = body.scrollHeight;
        if(bodyHeight > safeViewport){
            s.classList.add('non-sticky');
        }
    });
}

// Run the adjustment after content renders and on viewport changes.
window.addEventListener('resize', debounce(adjustSubsectionStickiness, 120));
window.addEventListener('orientationchange', () => setTimeout(adjustSubsectionStickiness, 180));
window.addEventListener('load', adjustSubsectionStickiness);

// small debounce helper
function debounce(fn, wait){
    let t;
    return function(...args){ clearTimeout(t); t = setTimeout(()=> fn.apply(this,args), wait); };
}

// Re-run after collapsible transitions so measurements are accurate
document.addEventListener('transitionend', (e) => {
    if(e.target && e.target.classList && e.target.classList.contains('subsection-body')){
        adjustSubsectionStickiness();
    }
});

function renderExtraSections(data) {
    // Eyewitness stories
    const eyewitnessContainer = document.getElementById('eyewitness-contents');
    if (!eyewitnessContainer) return;
    eyewitnessContainer.innerHTML = '';
    if (Array.isArray(data.eyewitness) && data.eyewitness.length > 0) {
        const list = document.createElement('ul');
        data.eyewitness.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = item; // assume HTML-safe or plain text
            list.appendChild(li);
        });
        eyewitnessContainer.appendChild(list);
    } else {
        eyewitnessContainer.innerHTML = '<p>No eyewitness accounts available.</p>';
    }

    // Sources & News
    const sourcesContainer = document.getElementById('sources-contents');
    sourcesContainer.innerHTML = '';
    if (Array.isArray(data.sources) && data.sources.length > 0) {
        const list = document.createElement('ul');
        data.sources.forEach(src => {
            const li = document.createElement('li');
            if (typeof src === 'string') {
                li.innerHTML = src;
            } else if (src.url) {
                li.innerHTML = `<a href="${src.url}" target="_blank" rel="noopener noreferrer">${src.title || src.url}</a>${src.note ? ' — ' + src.note : ''}`;
            } else {
                li.textContent = JSON.stringify(src);
            }
            list.appendChild(li);
        });
        sourcesContainer.appendChild(list);
    } else {
        sourcesContainer.innerHTML = '<p>No sources available.</p>';
    }
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
    console.log('populateContextPanel called with', filterData);
    
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
        // If a primary button (e.g., 'Country') was clicked, show a narrow list of objects on the left
        // and a larger detail area on the right. The detail area is collapsed until an item is selected.
        panelContent.innerHTML = '';
        const panel = document.getElementById('context-panel');
        // ensure panel is in compact mode for list-first view
        if (panel) {
            panel.classList.remove('expanded');
            panel.classList.add('compact');
        }

        const layout = document.createElement('div');
        layout.className = 'context-panel-layout no-detail';

        const list = document.createElement('div');
        list.className = 'context-panel-list';
        list.id = 'context-list';

        const detail = document.createElement('div');
        detail.className = 'context-panel-detail';
        detail.id = 'context-detail';
        detail.innerHTML = '<p>Select an item from the list to see more details.</p>';

    // Build list of objects that have this category key
        const objectsWithCategory = ALL_PROTEST_DATA.filter(obj => Array.isArray(obj[filterData.key]) && obj[filterData.key].length > 0);

    console.log('objectsWithCategory count:', objectsWithCategory.length);

        if (objectsWithCategory.length === 0) {
            list.innerHTML = '<p>No objects available for this category.</p>';
        } else {
            objectsWithCategory.forEach(obj => {
                const item = document.createElement('div');
                item.className = 'context-item';
                item.tabIndex = 0;
                item.dataset.objId = obj.id;
                item.innerHTML = `<strong>${obj.name}</strong><div style="font-size:0.85em;color:#666;margin-top:4px">${(obj.categories_country || []).join(', ')}</div>`;

                // Click handler: populate detail pane
                item.addEventListener('click', () => {
                    console.log('context item clicked:', obj.id, obj.name);
                    // mark active
                    document.querySelectorAll('.context-panel-list .context-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');

                    // remove no-detail so detail column becomes visible
                    layout.classList.remove('no-detail');

                    // expand the outer context panel so the detail area has more room
                    if (panel) {
                        panel.classList.remove('compact');
                        panel.classList.add('expanded');
                    }

                    // populate detail with larger text about the object
                    detail.innerHTML = `
                        <h3>${obj.name}</h3>
                        <div class="context-detail-body">${obj.description_html || '<p>No description available.</p>'}</div>
                    `;
                    // ensure images or other interactive elements (gallery links) still work — no extra wiring here.
                });

                // keyboard accessibility
                item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); } });

                list.appendChild(item);
            });
        }

        layout.appendChild(list);
        layout.appendChild(detail);
        panelContent.appendChild(layout);
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

    if (lbClose) lbClose.addEventListener('click', onClose);
    if (lbBackdrop) lbBackdrop.addEventListener('click', onClose);
    if (lbPrev) lbPrev.addEventListener('click', onPrev);
    if (lbNext) lbNext.addEventListener('click', onNext);
    document.addEventListener('keydown', onKey);

    // store cleanup references on the element so closeLightbox can remove listeners
    lb._cleanup = { onClose, onKey, onPrev, onNext };

    // Accessibility: focus on close button
    if (lbClose && typeof lbClose.focus === 'function') lbClose.focus();
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