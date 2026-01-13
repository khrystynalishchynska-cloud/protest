// Global variable to hold ALL protest objects, accessible by all functions
let ALL_PROTEST_DATA = [];

// Utility: parse CSS time (e.g. "700ms" or "0.7s") into milliseconds (number)
function parseTimeToMs(t) {
    if (!t) return 0;
    const s = String(t).trim();
    if (s.endsWith('ms')) return parseFloat(s);
    if (s.endsWith('s')) return parseFloat(s) * 1000;
    return parseFloat(s) || 0;
}

function getCssVarMs(name, fallbackMs) {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        const parsed = parseTimeToMs(v);
        return parsed > 0 ? parsed : (fallbackMs || 0);
    } catch (e) { return fallbackMs || 0; }
}

function getCssVarPx(name, fallbackPx) {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return parseFloat(v) || fallbackPx || 0;
    } catch (e) { return fallbackPx || 0; }
}

// Ensure no leftover hero-related classes are present by default; keep the standard
// three-column layout (metadata, content, context) active.
try {
    if (typeof document !== 'undefined' && document.getElementById && document.getElementById('object-image')) {
        document.body.classList.remove('hero-mode', 'compact-hero', 'hero-animating');
    }
} catch (e) { /* silent fallback */ }

/* HERO: use the real page elements (no clones). Apply transforms to the
   real #object-image-wrapper and #object-title so they visually appear
   centered and large on load, and then remove those transforms when the
   user scrolls past the #hero-sentinel so the elements move smoothly into
   their metadata-column positions. */
document.addEventListener('object-data-ready', (event) => { (async function(){
    // If navigation was initiated via startViewTransition on the gallery,
    // the gallery sets a sessionStorage flag so we can delay heavy hero
    // initialization until after the browser has painted the target element
    // and potentially matched it for a View Transition. This avoids racing
    // with the View Transitions paint/pass where the browser needs the
    // target element to be in-flow and visible.
    try{
        // If the gallery used native View Transitions, we only need a short
        // double-RAF so the browser can paint the target element for matching.
        if (sessionStorage.getItem('vt_navigation')){
            try{ sessionStorage.removeItem('vt_navigation'); }catch(e){}
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => setTimeout(r, 16));
        }

        // FLIP fallback: when the gallery couldn't use View Transitions we saved
        // a small snapshot in sessionStorage. Perform a FLIP animation from the
        // stored source rect -> the detail image's rect so users still see a
        // cross-page shared-element effect.
        const fallbackRaw = sessionStorage.getItem('vt_fallback');
        if (fallbackRaw) {
            try{
                sessionStorage.removeItem('vt_fallback');
                const fb = JSON.parse(fallbackRaw);
                // Ensure the target image is present and decoded (renderObjectPage
                // dispatches object-data-ready after decode, so main image should be ready)
                const targetImg = document.getElementById('object-image');
                if (targetImg && fb && fb.rect && fb.src) {
                    // compute target rect in viewport coords
                    const targetRect = targetImg.getBoundingClientRect();
                    const srcRect = fb.rect;

                    // create a floating clone positioned at the source rect
                    const clone = document.createElement('img');
                    clone.src = fb.src;
                    clone.alt = targetImg.alt || '';
                    clone.style.position = 'fixed';
                    clone.style.left = srcRect.left + 'px';
                    clone.style.top = srcRect.top + 'px';
                    clone.style.width = srcRect.width + 'px';
                    clone.style.height = srcRect.height + 'px';
                    clone.style.objectFit = 'cover';
                    clone.style.zIndex = 120000;
                    clone.style.borderRadius = '6px';
                    clone.style.transition = 'none';
                    clone.style.transformOrigin = '0 0';
                    document.body.appendChild(clone);

                    // compute transform params: translate and scale from source -> target
                    const dx = Math.round(targetRect.left - srcRect.left);
                    const dy = Math.round(targetRect.top - srcRect.top);
                    const scaleX = targetRect.width / srcRect.width;
                    const scaleY = targetRect.height / srcRect.height;

                    // animate using Web Animations API for a smooth FLIP
                    const anim = clone.animate([
                        { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1 },
                        { transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`, opacity: 1 }
                    ], { duration: 5000, easing: 'cubic-bezier(.2,.9,.2,1)', fill: 'forwards' });

                    try { await anim.finished; } catch(e) { /* ignore */ }
                    // ensure target image visible (some layouts hide it briefly)
                    try { targetImg.style.visibility = ''; targetImg.style.opacity = '1'; } catch(e){}
                    // small delay so layout can settle before removing clone
                    await new Promise(r => setTimeout(r, 18));
                    clone.remove();
                }
            }catch(e){ console.warn('vt_fallback handling failed', e); }
        }
    }catch(e){}
    try {
        const body = document.body;
        const imgWrap = document.getElementById('object-image-wrapper');
        const img = document.getElementById('object-image');
        const title = document.getElementById('object-title');
        const sentinel = document.getElementById('hero-sentinel');

        if (!imgWrap || !img || !title || !sentinel) return;
        if (window.innerWidth < 700) return; // keep mobile unchanged

        // switch hero-init -> hero-active so CSS hides content immediately
        if (body.classList.contains('hero-init')) body.classList.remove('hero-init');
        body.classList.add('hero-active');

        // ensure visible (clear any accidental hiding)
        try { img.style.visibility = ''; img.style.opacity = '1'; title.style.visibility = ''; title.style.opacity = '1'; } catch (e) {}

        // measure final positions (where elements should end up) BEFORE moving them
        const finalImgRect = imgWrap.getBoundingClientRect();
        const finalTitleRect = title.getBoundingClientRect();

        const vw = window.innerWidth, vh = window.innerHeight;
        const heroImgW = Math.min(420, Math.round(Math.min(0.36 * vw, 520)));
        const heroImgH = Math.round(heroImgW * (finalImgRect.height / (finalImgRect.width || heroImgW) || 0.9));
        const heroImgLeft = Math.round((vw - heroImgW) / 2);
        const heroImgTop = Math.round(vh * 0.22);

        const heroTitleLeft = heroImgLeft + heroImgW + 40;
        const heroTitleW = Math.round(Math.min(560, vw * 0.38));

        // prepare a top-level portal to avoid any ancestor stacking contexts
        let portal = document.getElementById('hero-portal');
        if (!portal) {
            portal = document.createElement('div');
            portal.id = 'hero-portal';
            // pointer-events none so it doesn't block page interaction; z-index very high
            portal.style.position = 'fixed'; portal.style.left = '0'; portal.style.top = '0'; portal.style.width = '100%'; portal.style.height = '100%'; portal.style.pointerEvents = 'none'; portal.style.zIndex = '99999';
            document.body.appendChild(portal);
        }

        // store original place so we can restore nodes later
        function savePlace(el) {
            if (!el) return null;
            return { parent: el.parentNode, next: el.nextSibling };
        }

    const imgPlace = savePlace(imgWrap);
    const titlePlace = savePlace(title);
    const tagEl = document.getElementById('static-tags');
    const tagPlace = savePlace(tagEl);

        // helper: set element to fixed positioned hero rect and remember original inline styles
        function setFixedRect(el, rect) {
            if (!el) return;
            el.__hero_orig = el.__hero_orig || {
                position: el.style.position || '', left: el.style.left || '', top: el.style.top || '', width: el.style.width || '', height: el.style.height || '', zIndex: el.style.zIndex || '', transition: el.style.transition || '', margin: el.style.margin || ''
            };
            el.style.position = 'fixed';
            el.style.left = rect.left + 'px';
            el.style.top = rect.top + 'px';
            el.style.width = rect.width + 'px';
            el.style.height = rect.height + 'px';
            el.style.zIndex = '99999';
            el.style.margin = '0';
            el.style.pointerEvents = 'auto';
            el.style.transition = 'left 1000ms cubic-bezier(.2,.9,.2,1), top 1000ms cubic-bezier(.2,.9,.2,1), width 1000ms cubic-bezier(.2,.9,.2,1), height 1000ms cubic-bezier(.2,.9,.2,1)';
        }

        function restoreOriginal(el, place) {
            if (!el || !el.__hero_orig) return;
            // move back into the original container at the saved insertion point
            if (place && place.parent) {
                if (place.next && place.next.parentNode === place.parent) place.parent.insertBefore(el, place.next);
                else place.parent.appendChild(el);
            }
            el.style.position = el.__hero_orig.position || '';
            el.style.left = el.__hero_orig.left || '';
            el.style.top = el.__hero_orig.top || '';
            el.style.width = el.__hero_orig.width || '';
            el.style.height = el.__hero_orig.height || '';
            el.style.zIndex = el.__hero_orig.zIndex || '';
            el.style.transition = el.__hero_orig.transition || '';
            el.style.margin = el.__hero_orig.margin || '';
            delete el.__hero_orig;
        }

    // measure tag final rect (if available)
    const finalTagRect = tagEl ? tagEl.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };

    // Create hero rects (relative to viewport)
    const heroImgRect = { left: heroImgLeft, top: heroImgTop, width: heroImgW, height: heroImgH };
    const heroTitleRect = { left: heroTitleLeft, top: Math.round(vh * 0.28), width: heroTitleW, height: finalTitleRect.height };
    // place tags under the title in hero view (small gap)
    const tagGap = 8;
    const heroTagRect = tagEl ? { left: heroTitleLeft, top: heroTitleRect.top + heroTitleRect.height + tagGap, width: Math.min(heroTitleW, Math.max(160, finalTagRect.width || 160)), height: finalTagRect.height || 28 } : null;

        // Move the real elements into the portal so they escape stacking-contexts
        try {
            // append as children of portal (pointer-events none on portal ensures clicks pass through except elements we set pointer-events for)
            portal.appendChild(imgWrap);
            portal.appendChild(title);
            if (tagEl) portal.appendChild(tagEl);
        } catch (e) { /* if move fails, continue with original approach */ }

        // Place elements into the fixed hero positions instantly (disable transitions first)
        imgWrap.style.transition = 'none';
        title.style.transition = 'none';
        setFixedRect(imgWrap, heroImgRect);
        setFixedRect(title, heroTitleRect);
        if (tagEl && heroTagRect) {
            tagEl.style.transition = 'none';
            setFixedRect(tagEl, heroTagRect);
        }
        // force layout
        imgWrap.getBoundingClientRect();
        title.getBoundingClientRect();
        

        // Re-enable transitions (so next change will animate)
        setTimeout(() => {
            imgWrap.style.transition = 'left 1000ms cubic-bezier(.2,.9,.2,1), top 1000ms cubic-bezier(.2,.9,.2,1), width 1000ms cubic-bezier(.2,.9,.2,1), height 1000ms cubic-bezier(.2,.9,.2,1)';
            title.style.transition = 'left 1000ms cubic-bezier(.2,.9,.2,1), top 1000ms cubic-bezier(.2,.9,.2,1), width 1000ms cubic-bezier(.2,.9,.2,1), height 1000ms cubic-bezier(.2,.9,.2,1)';
        }, 30);

        // Reveal: animate fixed elements to their final on-page rects, then restore them into flow
        const reveal = () => {
            // recompute final rects in case layout changed (measure where the elements should be inside the document flow)
            const targetImgRect = finalImgRect; // measured earlier while elements were in-flow
            const targetTitleRect = finalTitleRect;

            // animate to final positions (viewport coords)
            setFixedRect(imgWrap, { left: targetImgRect.left, top: targetImgRect.top, width: targetImgRect.width, height: targetImgRect.height });
            setFixedRect(title, { left: targetTitleRect.left, top: targetTitleRect.top, width: targetTitleRect.width, height: targetTitleRect.height });
            if (tagEl) {
                const targetTagRect = finalTagRect;
                setFixedRect(tagEl, { left: targetTagRect.left, top: targetTagRect.top, width: targetTagRect.width, height: targetTagRect.height });
            }

            // when animation ends on image, restore to original flow
            const cleanup = () => {
                try {
                    // First, mark the page as revealed so CSS rules (body.hero-revealed)
                    // that disable metadata transitions take effect. Do this before we
                    // re-insert the nodes so the CSS rule can apply immediately.
                    body.classList.add('hero-revealed');

                    // Strong safeguard: ensure any stored original transition won't be
                    // reapplied and cause a brief animation. Overwrite the saved
                    // transition to 'none' so restoreOriginal writes a non-animating state.
                    try {
                        if (imgWrap && imgWrap.__hero_orig) imgWrap.__hero_orig.transition = 'none';
                        if (title && title.__hero_orig) title.__hero_orig.transition = 'none';
                        if (tagEl && tagEl.__hero_orig) tagEl.__hero_orig.transition = 'none';
                    } catch (e) { /* ignore */ }

                    // Also set inline transition:none right before restoring as an extra
                    // precaution (some browsers apply styles faster from inline than from
                    // stylesheet rules).
                    try { if (imgWrap) imgWrap.style.transition = 'none'; } catch (e) {}
                    try { if (title) title.style.transition = 'none'; } catch (e) {}
                    try { if (tagEl) tagEl.style.transition = 'none'; } catch (e) {}

                    // Instead of moving the real nodes back (which can cause stacking
                    // and transition issues), paint the left metadata column by
                    // creating fresh elements (clones) that take the original IDs.
                    // Keep the original hero nodes in the portal (but remove their
                    // IDs so they don't conflict) and hide the portal visually.
                    try {
                        const metaContainer = document.getElementById('metadata-controls') || (imgPlace && imgPlace.parent) || document.querySelector('.metadata-column');
                        if (metaContainer) {
                            // remove any existing children to repaint cleanly
                            metaContainer.innerHTML = '';

                            // build cloned image wrapper + img
                            const heroImgNode = imgWrap.querySelector('img') || imgWrap;
                            const newImgWrap = document.createElement('div');
                            newImgWrap.id = 'object-image-wrapper';
                            newImgWrap.style.margin = '0 0 20px 0';
                            const newImg = document.createElement('img');
                            // copy minimal attributes
                            try { newImg.src = heroImgNode.src || ''; } catch(e) { newImg.src = ''; }
                            newImg.alt = heroImgNode.alt || 'Photo of the protest symbol';
                            newImg.id = 'object-image';
                            newImg.loading = heroImgNode.loading || 'eager';
                            newImg.style.width = '100%';
                            newImg.style.height = 'auto';
                            newImg.style.display = 'block';
                            newImgWrap.appendChild(newImg);

                            // build cloned title
                            const newTitle = document.createElement('h1');
                            newTitle.id = 'object-title';
                            newTitle.textContent = (title && title.textContent) || '';

                            // build cloned tags
                            let newTags = null;
                            if (tagEl) {
                                newTags = document.createElement('div');
                                newTags.id = 'static-tags';
                                newTags.innerHTML = tagEl.innerHTML || '';
                            }

                            // ensure clones don't animate
                            try { newImgWrap.style.transition = 'none'; } catch (e) {}
                            try { newImg.style.transition = 'none'; } catch (e) {}
                            try { newTitle.style.transition = 'none'; } catch (e) {}
                            if (newTags) try { newTags.style.transition = 'none'; } catch (e) {}

                            // append into metadata container
                            metaContainer.appendChild(newImgWrap);
                            metaContainer.appendChild(newTitle);
                            if (newTags) metaContainer.appendChild(newTags);
                        }

                        // neutralize IDs on portal nodes so we don't have duplicates
                        try { imgWrap.removeAttribute('id'); } catch (e) {}
                        try { const portalImg = imgWrap.querySelector('img'); if (portalImg) portalImg.removeAttribute('id'); } catch (e) {}
                        try { title.removeAttribute('id'); } catch (e) {}
                        try { if (tagEl) tagEl.removeAttribute('id'); } catch (e) {}

                        // hide the portal visually (keep nodes in DOM in case other code references them)
                        try { if (portal) portal.style.display = 'none'; } catch (e) {}
                    } catch (e) {
                        // fallback: if cloning fails, restore originals
                        try { restoreOriginal(imgWrap, imgPlace); restoreOriginal(title, titlePlace); if (tagEl) restoreOriginal(tagEl, tagPlace); } catch (err) {}
                    }
                } catch (e) { console.warn('hero restore failed', e); }

                // remove portal if empty
                try { if (portal && portal.childElementCount === 0) portal.parentNode && portal.parentNode.removeChild(portal); } catch (e) {}

                // finally clear the active flag (we keep revealed so layout rules apply)
                body.classList.remove('hero-active');

                // After restoring, re-run alignment so the description's margin doesn't
                // inadvertently shift the metadata. Run on next frame to allow styles to settle.
                requestAnimationFrame(() => {
                    try { if (typeof alignDescriptionWithImage === 'function') alignDescriptionWithImage(); } catch (e) {}
                    try { if (typeof adjustSubsectionStickiness === 'function') adjustSubsectionStickiness(); } catch (e) {}
                });

                imgWrap.removeEventListener('transitionend', cleanup);
            };
            imgWrap.addEventListener('transitionend', cleanup);
        };

        // Prevent accidental exit from hero-active: observe body class changes and re-add if removed
        let heroObserver = null;
        let heroLocked = true; // keep hero active until we run reveal()
        try {
            heroObserver = new MutationObserver((mutations) => {
                mutations.forEach(m => {
                    if (m.attributeName === 'class') {
                        if (heroLocked && !document.body.classList.contains('hero-active')) {
                            document.body.classList.add('hero-active');
                        }
                    }
                });
            });
            heroObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        } catch (e) { heroObserver = null; }

        // Wire reveal to sentinel leaving viewport
        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) { reveal(); io.disconnect(); }
                });
            }, { root: null, threshold: 0 });
            io.observe(sentinel);
        } else {
            const onScroll = () => { reveal(); window.removeEventListener('scroll', onScroll); };
            window.addEventListener('scroll', onScroll);
        }

        // Ensure reveal() unlocks and disconnects the observer
        const originalReveal = reveal;
        reveal = function() {
            // unlock and disconnect observer so class changes are allowed
            heroLocked = false;
            try { if (heroObserver) heroObserver.disconnect(); } catch (e) {}
            originalReveal();
        };

    } catch (err) { console.warn('hero init failed', err); }
})();
});

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
    console.debug('[renderObjectPage] id=', data && data.id, 'image=', data && data.image_filename);
    document.getElementById('object-title').textContent = data.name;
    document.getElementById('object-image').src = data.image_filename || 'placeholder.jpg';
    
    document.getElementById('description-text').innerHTML = data.description_html; 

    renderFilterButtons(data);
    // Render the photo gallery (uses data.images if present, otherwise falls back to image_filename)
    renderGallery(data);
    // No JS masonry: let CSS Grid handle rows. Images preserve aspect ratio and won't span rows.
    // Render optional extra sections: eyewitness stories and sources
    renderExtraSections(data);
    // Initialize collapsible subsections after rendering content
    setupCollapsibles();
    // Align description column with the object image when columns are side-by-side
    // and ensure sticky calculations run after layout.
    requestAnimationFrame(() => {
        alignDescriptionWithImage();
        adjustSubsectionStickiness();
    });
    
    // Ensure any hero-related state is cleared and normal layout is shown.
    try {
        document.body.classList.remove('hero-mode', 'compact-hero', 'hero-animating');
        const contentCol = document.querySelector('.content-column');
        if (contentCol) contentCol.classList.remove('hidden-by-hero');
        const oc = document.getElementById('object-container'); if (oc) oc.classList.remove('split');
        const panel = document.getElementById('context-panel');
        if (panel) {
            panel.classList.remove('active','compact','expanded');
            panel.style.display = 'none';
            panel.setAttribute('aria-hidden','true');
            const panelContent = document.getElementById('context-panel-content'); if (panelContent) panelContent.innerHTML = '';
        }
    } catch (e) { console.warn('layout init failed', e); }

    document.getElementById('type-tag').textContent = (data.categories_object_type && data.categories_object_type.join(', ')) || '';
    document.getElementById('timeframe-tag').textContent = (data.categories_timeframe && data.categories_timeframe.join(', ')) || '';

    // Signal that the object data (and main image) are ready. This allows the
    // hero overlay to be created only after the image src has been set and the
    // browser has had a chance to load/decode it to avoid an empty clone.
    try {
        const mainImg = document.getElementById('object-image');
        const dispatchReady = () => {
            document.dispatchEvent(new CustomEvent('object-data-ready', { detail: { object: data } }));
        };
        if (mainImg) {
            if (!mainImg.complete) {
                const onLoad = function () {
                    mainImg.removeEventListener('load', onLoad);
                    if (typeof mainImg.decode === 'function') {
                        mainImg.decode().then(dispatchReady).catch(dispatchReady);
                    } else {
                        dispatchReady();
                    }
                };
                mainImg.addEventListener('load', onLoad);
            } else {
                if (typeof mainImg.decode === 'function') {
                    mainImg.decode().then(dispatchReady).catch(dispatchReady);
                } else {
                    dispatchReady();
                }
            }
        } else {
            dispatchReady();
        }
    } catch (e) {
        // If anything goes wrong, still dispatch so the hero code doesn't hang.
        try { document.dispatchEvent(new CustomEvent('object-data-ready', { detail: { object: data } })); } catch (err) {}
    }
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

// Hero-mode helpers removed — starting fresh. Any hero-related state should be
// handled by new code when you decide on the approach. For now, keep layout
// behavior simple and stable.

// Align the top of the description block with the top of the object image
// when the layout shows the metadata and content columns side-by-side.
// This is similar to alignDescriptionWithTitle but uses the object's image
// as the reference baseline (the user asked the Description button to line
// up with the image top).
function alignDescriptionWithImage(){
    const img = document.getElementById('object-image');
    const desc = document.getElementById('description-block');
    const content = document.querySelector('.content-column');
    const meta = document.querySelector('.metadata-column');
    if(!img || !desc || !content || !meta) return;

    // Only align when metadata column is visible alongside content.
    const isSideBySide = window.innerWidth >= 900 && getComputedStyle(meta).display !== 'none';
    if(!isSideBySide){
        desc.style.marginTop = '';
        return;
    }

    // Use viewport coordinates so fixed/sticky positions are handled consistently.
    const imgRect = img.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    let desired = Math.round(imgRect.top - contentRect.top);
    if(desired < 0) desired = 0;

    desc.style.marginTop = desired + 'px';

    // Re-check after layout settles (images/ fonts/ webfonts may shift things)
    setTimeout(() => {
        const imgRect2 = img.getBoundingClientRect();
        const contentRect2 = content.getBoundingClientRect();
        const desired2 = Math.max(0, Math.round(imgRect2.top - contentRect2.top));
        if (Math.abs(desired2 - desired) > 2) {
            desc.style.marginTop = desired2 + 'px';
            if(window.__debugAlign) console.log('alignDescriptionWithImage: adjusted after timeout', {desired, desired2});
        }
    }, 260);

    if(window.__debugAlign){
        console.log('alignDescriptionWithImage:', { windowWidth: window.innerWidth, imgRectTop: imgRect.top, contentRectTop: contentRect.top, desired });
    }
}

// --- Hero prototype: continuous interpolation — measure hero and compact target then drive CSS variables ---
// NOTE: Scroll-driven hero animation/controller removed.
// The previous setupHeroContinuous() implementation has been deleted
// to disable scrollytelling transforms and continuous per-frame updates.

// Re-run alignment on resize/orientation changes with debounce
window.addEventListener('resize', debounce(() => { alignDescriptionWithImage(); adjustSubsectionStickiness(); }, 120));
window.addEventListener('orientationchange', () => setTimeout(() => { alignDescriptionWithImage(); adjustSubsectionStickiness(); }, 200));

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
    // Eyewitness stories (render as clickable cards; open modal for full text)
    const eyewitnessContainer = document.getElementById('eyewitness-contents');
    if (!eyewitnessContainer) return;
    eyewitnessContainer.innerHTML = '';

    // small helper to escape text safely for injection into card previews
    function escapeHtml(s){ return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    if (Array.isArray(data.eyewitness) && data.eyewitness.length > 0) {
        data.eyewitness.forEach((item, idx) => {
            // normalize item to object { name, role, text }
            let ew = { name: '', role: '', text: '' };
            if (typeof item === 'string') {
                ew.text = item;
            } else if (item && typeof item === 'object') {
                ew.name = item.name || item.author || '';
                ew.role = item.role || item.affiliation || '';
                ew.text = item.text || item.body || item.quote || '';
            }

            const card = document.createElement('article');
            card.className = 'eyewitness-card';
            card.tabIndex = 0;
            card.dataset.ewIndex = idx;

            const nameHtml = `<strong class="ew-name">${escapeHtml(ew.name || 'Eyewitness')}</strong>`;
            const roleHtml = `<div class="ew-role">${escapeHtml(ew.role || 'Anonymous')}</div>`;
            const previewText = (ew.text || '').slice(0, 300);
            const previewHtml = `<div class="ew-preview">${escapeHtml(previewText)}${(ew.text && ew.text.length > 300 ? '…' : '')}</div>`;

            card.innerHTML = `<div class="ew-head">${nameHtml}${roleHtml}</div>${previewHtml}<button class="ew-open" aria-hidden="true" tabindex="-1">↗</button>`;

            const openModal = () => {
                const modal = document.getElementById('eyewitness-modal');
                if (!modal) return;
                document.getElementById('ew-modal-name').textContent = ew.name || '';
                document.getElementById('ew-modal-role').textContent = ew.role || '';
                document.getElementById('ew-modal-body').textContent = ew.text || '';
                modal.setAttribute('aria-hidden', 'false');
                document.body.style.overflow = 'hidden';
                const closeBtn = document.getElementById('eyewitness-modal-close');
                if (closeBtn) closeBtn.focus();
            };

            card.addEventListener('click', openModal);
            card.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openModal(); }
            });

            eyewitnessContainer.appendChild(card);
        });
    } else {
        eyewitnessContainer.innerHTML = '<p>No eyewitness accounts available.</p>';
    }

    // Modal close handlers (idempotent)
    (function(){
        const modal = document.getElementById('eyewitness-modal');
        if (!modal) return;
        const backdrop = document.getElementById('eyewitness-modal-backdrop');
        const closeBtn = document.getElementById('eyewitness-modal-close');

        function closeModal() {
            modal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        }

        if (backdrop) backdrop.addEventListener('click', closeModal);
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') closeModal();
        });
    })();

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

            // Special-case protest info: show embedded resources or fetch details
            if (categoryKey === 'categories_protest') {
                // Open the panel first so the layout is correct
                togglePanel(true);
                const panelContent = document.getElementById('context-panel-content');
                if (value === 'Umbrella Revolution') {
                    panelContent.innerHTML = `
                        <iframe src="umbrella-movement.html" style="width:100%;height:600px;border:none;"></iframe>
                    `;
                } else {
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
                // For normal tags, let the central togglePanel/populateContextPanel handle filtering
                togglePanel(true, { key: categoryKey, term: value });
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

    // Ensure panel is shown/hidden explicitly to avoid visual race conditions
    panel.classList.toggle('active', open);
    // Also toggle the 'hidden-panel' helper class which may be present in markup
    // (keeps the panel visually hidden before JS runs). When opening, remove
    // the class so the panel's CSS transitions can take effect; when closing,
    // re-add it so the panel is fully hidden for accessibility/fallback.
    panel.classList.toggle('hidden-panel', !open);
    container.classList.toggle('split', open);
    // control content-display split state (right column) separately
    const contentDisplay = document.getElementById('content-display');
    if (contentDisplay) contentDisplay.classList.toggle('split', open);
    // explicit inline display and aria-hidden for robustness
    if (open) {
        panel.style.display = '';
        panel.removeAttribute('aria-hidden');
    } else {
        panel.style.display = 'none';
        panel.setAttribute('aria-hidden', 'true');
    }

    if (open && filterData) {
        populateContextPanel(filterData); 
    } else if (!open) {
        document.getElementById('context-panel-content').innerHTML = '';
        document.getElementById('context-panel').classList.remove('active');
        document.getElementById('object-container').classList.remove('split');
        if (contentDisplay) contentDisplay.classList.remove('split');
    }

    // No masonry relayout needed when panel toggles; CSS Grid will reflow automatically
}


function populateContextPanel(filterData) {
    const panelContent = document.getElementById('context-panel-content');
    if (window.__debug) console.log('populateContextPanel called with', filterData);
    
    // Filter the global data array based on the clicked term (if a specific term was clicked)
    // If a button was clicked, we show ALL terms linked to that category.
    const termToFilterBy = filterData.term; // This will only be defined if a span was clicked
    let filteredResults = [];

    if (termToFilterBy) {
        // If a specific term (e.g., 'Hong Kong') was clicked, filter to show only those objects
        filteredResults = ALL_PROTEST_DATA.filter(obj => 
            obj[filterData.key] && obj[filterData.key].includes(termToFilterBy)
        );
        // Render a single-column list of the filtered results (no inline detail pane)
        panelContent.innerHTML = '';
        const panel = document.getElementById('context-panel');
        if (panel) { panel.classList.remove('expanded'); panel.classList.add('compact'); }

        const list = document.createElement('div');
        list.className = 'context-panel-list single-column';
        list.id = 'context-list-term';

        if (filteredResults.length === 0) {
            list.innerHTML = '<p>No objects found for this term.</p>';
        } else {
            filteredResults.forEach(obj => {
                const item = document.createElement('div');
                item.className = 'context-item';
                item.tabIndex = 0;
                item.dataset.objId = obj.id;

                item.innerHTML = `
                    <div class="context-item-main" style="flex:1;min-width:0;cursor:pointer">
                        <a class="context-item-link" href="object-detail.html?id=${encodeURIComponent(obj.id)}"><strong class="context-item-title">${obj.name}</strong></a>
                        <div style="font-size:0.85em;color:#666;margin-top:4px">${(obj.categories_country || []).join(', ')}</div>
                    </div>
                `;

                const main = item.querySelector('.context-item-main');
                main.addEventListener('click', () => {
                    if (window.__debug) console.log('term-result clicked (list-only):', obj.id, obj.name);
                    document.querySelectorAll('.context-panel-list .context-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    try { item.focus(); } catch (e) {}
                });

                item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); main.click(); } });

                list.appendChild(item);
            });
        }

        panelContent.appendChild(list);
        return;
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

    // Render a single-column list only (no inline detail pane)
    const list = document.createElement('div');
    list.className = 'context-panel-list single-column';
    list.id = 'context-list';

    // Build list of objects that have this category key
        const objectsWithCategory = ALL_PROTEST_DATA.filter(obj => Array.isArray(obj[filterData.key]) && obj[filterData.key].length > 0);

    if (window.__debug) console.log('objectsWithCategory count:', objectsWithCategory.length);

        if (objectsWithCategory.length === 0) {
            list.innerHTML = '<p>No objects available for this category.</p>';
        } else {
            objectsWithCategory.forEach(obj => {
                const item = document.createElement('div');
                item.className = 'context-item';
                item.tabIndex = 0;
                item.dataset.objId = obj.id;

                // Make the item show a selectable preview. The object name itself is
                // an explicit link to the full detail page while clicking the surrounding
                // main area still populates the inline detail pane.
                item.innerHTML = `
                    <div class="context-item-main" style="flex:1;min-width:0;cursor:pointer">
                        <a class="context-item-link" href="object-detail.html?id=${encodeURIComponent(obj.id)}"><strong class="context-item-title">${obj.name}</strong></a>
                        <div style="font-size:0.85em;color:#666;margin-top:4px">${(obj.categories_country || []).join(', ')}</div>
                    </div>
                `;

                // Click handler: highlight the selected item. We don't show an inline
                // detail pane — the object name is the link to the full page.
                item.querySelector('.context-item-main').addEventListener('click', () => {
                    if (window.__debug) console.log('context item clicked (list-only):', obj.id, obj.name);
                    // mark active
                    document.querySelectorAll('.context-panel-list .context-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    // keep focus for accessibility
                    try { item.focus(); } catch (e) {}
                });

                // The object name is a normal link (keyboard-accessible) so no extra
                // handler is required. Ensure clicks on the link navigate normally
                // by not preventing default on the main click handler.

                // keyboard accessibility for selecting (Enter/Space activates selection)
                item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.querySelector('.context-item-main').click(); } });

                list.appendChild(item);
            });
        }

        panelContent.appendChild(list);
        return;
    }

    
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

/* Masonry helper removed: gallery uses standard CSS Grid flow and images do not set explicit grid-row spans. */