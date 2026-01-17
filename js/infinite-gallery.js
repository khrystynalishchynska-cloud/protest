(function(){
  // Scatter canvas gallery — jittered-grid implementation
  const DATA_URL = 'protest_data.json';
  const INFO_URL = 'protest_info.json';

  // unique counter used to make placeholder data-URLs distinct so dedupe by
  // src doesn't collapse multiple placeholder-only objects into a single tile
  let __placeholderCounter = 0;

  const gallery = document.getElementById('infinite-gallery');
  if (!gallery) { console.warn('infinite-gallery: missing #infinite-gallery element'); return; }

  async function fetchJson(url){
    try { const r = await fetch(url); if (!r.ok) return null; return await r.json(); }
    catch(e){ console.warn('fetch error', url, e); return null; }
  }

  // Generate a tiny inline SVG placeholder (data URL) with the object title.
  // uid is optional; when provided we insert a small XML comment into the SVG so
  // the encoded data-URL is unique while the visual appearance is unchanged.
  function makePlaceholderDataURL(title, w=640, h=360, uid){
    const safe = String(title || 'No image').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const bg = '#efefef'; const fg = '#666';
    const uidComment = uid ? `<!--uid:${uid}-->` : '';
    const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><rect width='100%' height='100%' fill='${bg}'/>${uidComment}<g transform='translate(${Math.round(w/2)},${Math.round(h/2)})'><text x='0' y='0' font-family='Helvetica, Arial, sans-serif' font-size='18' fill='${fg}' text-anchor='middle' dominant-baseline='middle'>${safe}</text></g></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function normalizeFromData(d){
    const out = [];
    if (!d) return out;
    const list = Array.isArray(d) ? d : (d.objects || d.items || []);
    if (!Array.isArray(list)) return out;
    list.forEach(obj => {
      const base = { id: obj.id || obj._id || obj.slug || null, title: obj.title || obj.name || '' };
  let found = false;
      // Prefer the explicit `image_filename` (object-specific image) if present.
      // Many entries include a shared `images` array filled with generic photos
      // (eg. umbrella shots). Using `image_filename` first ensures each object
      // is represented by its intended image, but we also want to include the
      // full `images[]` gallery as additional items so those photos appear too.
      // Only include a single representative photo per object in the gallery.
      // Prefer an explicit `image_filename`, otherwise fall back to `photo` or
      // `image` if present. Do NOT include arrays like `images[]` or `photos[]`
      // here — those are often galleries or description-embedded photos and
      // should not appear as separate tiles in the main gallery.
      if (obj.image_filename){
        out.push(Object.assign({}, base, { src: obj.image_filename, source: 'data' }));
        found = true;
      } else if (obj.photo){
        out.push(Object.assign({}, base, { src: obj.photo, source: 'data' }));
        found = true;
      } else if (obj.image){
        out.push(Object.assign({}, base, { src: obj.image, source: 'data' }));
        found = true;
      }
      if (!found){ // create placeholder so the object is still shown and links to its detail page
        const ph = makePlaceholderDataURL(base.title || ('Object ' + (base.id || '')), 640, 360, ++__placeholderCounter);
        out.push(Object.assign({}, base, { src: ph, source: 'data', placeholder: true }));
      }
    });
    return out;
  }

  function normalizeFromInfo(i){
    const out = [];
    if (!i) return out;
    const list = Array.isArray(i) ? i : (i.items || []);
    if (!Array.isArray(list)) return out;
    list.forEach(it => {
      var src = (Array.isArray(it.photos) && it.photos[0]) || it.photo || it.image || it.image_filename;
      if (!src && Array.isArray(it.images) && it.images.length){ src = (it.images[0] && (it.images[0].src || it.images[0].image)) || it.images[0]; }
      const base = { id: it.id || it.slug || null, title: it.title || it.name || '' };
  if (src) out.push(Object.assign({}, base, { src, source: 'info' }));
  else { const ph = makePlaceholderDataURL(base.title || ('Object ' + (base.id || '')), 640, 360, ++__placeholderCounter); out.push(Object.assign({}, base, { src: ph, source: 'info', placeholder: true })); }
    });
    return out;
  }

  function makeLinkForItem(item){
    if (!item) return 'object-detail.html';
    // items from `protest_info.json` should go to the protest page
    if (item.source === 'info'){
      if (item.id) return 'protest.html?id=' + encodeURIComponent(item.id);
      return 'protest.html?img=' + encodeURIComponent(item.src);
    }
    // default: object-detail
    if (item.id) return 'object-detail.html?id=' + encodeURIComponent(item.id);
    return 'object-detail.html?img=' + encodeURIComponent(item.src);
  }

  function createCard(item){
    const a = document.createElement('a');
    a.className = 'card-link';
    a.href = makeLinkForItem(item);
    // store helpful data attrs for debugging and delegated handlers
    try{ a.dataset.src = item.src || ''; if (item.id) a.dataset.id = item.id; }catch(e){}
    // explicit same-tab behavior
    a.target = '_self';
    const card = document.createElement('div');
    card.className = 'card';
    const img = document.createElement('img');
    img.className = 'lazy-img';
  // Use native lazy loading where supported to avoid loading every image at once
  try{ img.loading = 'lazy'; }catch(e){}
    img.setAttribute('data-src', item.src);
    img.alt = item.title || '';
    card.appendChild(img);
    a.appendChild(card);
    return a;
  }

  function preload(src, timeout=10000){
    // Check a small localStorage cache first to avoid re-downloading images just to
    // measure them. Cache key maps src -> {w,h}.
    try{
      const raw = localStorage.getItem('gallery_img_sizes');
      if (raw){ const map = JSON.parse(raw); if (map && map[src]) return { src, w: map[src].w, h: map[src].h }; }
    }catch(e){}
    return new Promise((resolve)=>{
      const img = new Image();
      let done = false;
      const t = setTimeout(()=>{ if (done) return; done = true; resolve(null); }, timeout);
      img.onload = ()=>{ if (done) return; done = true; clearTimeout(t); try{ // store size in cache
            const raw = localStorage.getItem('gallery_img_sizes'); const map = raw ? JSON.parse(raw) : {}; map[src] = { w: img.naturalWidth, h: img.naturalHeight }; try{ localStorage.setItem('gallery_img_sizes', JSON.stringify(map)); }catch(e){} }catch(e){}; resolve({src, w: img.naturalWidth, h: img.naturalHeight}); };
      img.onerror = ()=>{ if (done) return; done = true; clearTimeout(t); resolve(null); };
      img.crossOrigin = 'anonymous';
      img.src = src;
    });
  }

  (async function init(){
    const [data, info] = await Promise.all([fetchJson(DATA_URL), fetchJson(INFO_URL)]);
    let items = (normalizeFromData(data)).concat(normalizeFromInfo(info));

    // dedupe: prefer uniqueness by object id when available so that the same
    // image file used by multiple objects is still shown once per object.
    const seen = new Set();
    items = items.filter(it => {
      if (!it || !it.src) return false;
      // key uses id when present to allow identical src across different objects
      const key = it.id ? ('id:' + String(it.id) + '|' + it.src) : ('src:' + it.src);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Group items by image src for visual deduplication: we'll place one card
    // per unique src and show a small badge when multiple objects reference it.
    const groupsBySrc = new Map();
    items.forEach(it => {
      const s = it.src;
      if (!groupsBySrc.has(s)) groupsBySrc.set(s, []);
      groupsBySrc.get(s).push(it);
    });
    // groups is an array of objects: { src, items: [...], title, count, isGallery }
    // isGallery is true when all items for this src are from an object's
    // `images[]` gallery (we'll render those slightly smaller).
    const groups = Array.from(groupsBySrc.values()).map(arr => ({ src: arr[0].src, items: arr, title: arr[0].title || '', count: arr.length, isGallery: arr.every(it => it.gallery === true) }));

    // DEBUG: log groups summary and check for umbrella src presence to help
    // diagnose missing-umbrella issues. Remove or disable these logs after
    // verification.
    try{
  const umbrellaKey = 'images/umbrella.jpg';
      console.info('[gallery] groups:', groups.length, 'unique srcs');
      const found = groups.findIndex(g => g.src === umbrellaKey);
      if (found >= 0){
        console.info('[gallery] umbrella src found in groups at index', found, groups[found]);
        try{ const ov = getOverrideForGroup(groups[found]); console.info('[gallery] override for umbrella group:', ov); }catch(e){}
      }
      else console.info('[gallery] umbrella src NOT found in groups (checked', umbrellaKey, ')');
    }catch(e){}

    if (!items.length){
      gallery.innerHTML = '<div style="padding:24px;max-width:780px;margin:60px auto;background:#fff7;border:1px solid #ddd;border-radius:8px;"><strong>No images found.</strong><p>If you opened this page via file:// your browser blocks fetch() — serve the folder over HTTP (eg. <code>python3 -m http.server 8000</code>) and open <code>http://localhost:8000/welcome.html</code>.</p></div>';
      return;
    }

    // --- manual overrides support ---
    // load manual_positions.json (repo) and merge localStorage 'gallery_overrides' (dev)
    let overrides = { byId: {}, bySrc: {}, meta: {} };
    async function loadOverrides(){
      try{
        const r = await fetch('manual_positions.json');
        if (r.ok){ const j = await r.json(); overrides = Object.assign({}, overrides, j); }
      }catch(e){}
      try{
        const raw = localStorage.getItem('gallery_overrides');
        if (raw){ const j = JSON.parse(raw); overrides = Object.assign({}, overrides, j); }
      }catch(e){}
    }
    function getOverrideForItem(item){
      if (!item) return null;
      if (item.id && overrides.byId && overrides.byId[item.id]) return overrides.byId[item.id];
      if (overrides.bySrc && overrides.bySrc[item.src]) return overrides.bySrc[item.src];
      return null;
    }
    function getOverrideForGroup(group){
      if (!group) return null;
      // prefer any id-specific override first
      for (let it of group.items){ if (it.id && overrides.byId && overrides.byId[it.id]) return overrides.byId[it.id]; }
      if (overrides.bySrc && overrides.bySrc[group.src]) return overrides.bySrc[group.src];
      return null;
    }
    function downloadJSON(obj, filename='manual_positions.json'){
      try{
        const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      }catch(e){ console.warn('download failed', e); }
    }
    // Export button removed: previously added a floating "Export positions" control here.
    // If you need to re-enable export functionality later, recreate a UI control and
    // call downloadJSON(overrides) on click.

    await loadOverrides();

    // Delegated click handler on the gallery to reliably navigate on plain clicks.
    // This handles plain left-clicks, respects modifier keys, and lets drag-to-pan suppression (which
    // may call preventDefault on the click) take precedence.
    if (!gallery._clickHandlerAdded){
      gallery.addEventListener('click', function(e){
        try{
          const a = e.target.closest && e.target.closest('a.card-link');
          if (!a) return;
          if (e.defaultPrevented) return;
          if (typeof e.button === 'number' && e.button !== 0) return;
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          // Prefer the View Transition API for a smooth shared-element navigation
          try {
            // Navigate to the detail page. Use startViewTransition if available
            // to allow the browser to create a nicer navigation animation; do not
            // set sessionStorage or otherwise signal a hero landing here — starting
            // from scratch.
            e.preventDefault();
            if (document.startViewTransition) {
              document.startViewTransition(() => { window.location.href = a.href; });
            } else {
              window.location.href = a.href;
            }
            return;
          } catch(err) { /* fallback to direct navigation */ try { window.location.href = a.href; } catch(e){} }
          e.preventDefault();
        }catch(err){}
      }, false);
      gallery._clickHandlerAdded = true;
    }


    // responsive layout helper — compute layout params based on viewport width
    function computeLayout(){
      const vw = Math.max(320, window.innerWidth || 1024);
      // breakpoint mapping: returns sensible CELL_SIZE and canvasCols
      if (vw >= 1400) return { CANVAS_W: 5400, CANVAS_H: 5400, CELL_SIZE: 350, CANVAS_COLS: 36, MAX_DIM: 340, MIN_DIM: 56, GAP: 56, JITTER:150, SPAWN_CHANCE:0.95 };
      if (vw >= 1000) return { CANVAS_W: 4800, CANVAS_H: 4800, CELL_SIZE: 320, CANVAS_COLS: 30, MAX_DIM: 300, MIN_DIM: 48, GAP:48, JITTER:140, SPAWN_CHANCE:0.92 };
      if (vw >= 700)  return { CANVAS_W: 3600, CANVAS_H: 3600, CELL_SIZE: 260, CANVAS_COLS: 24, MAX_DIM: 260, MIN_DIM: 40, GAP:40, JITTER:120, SPAWN_CHANCE:0.9 };
      return               { CANVAS_W: 2400, CANVAS_H: 2400, CELL_SIZE: 180, CANVAS_COLS: 12, MAX_DIM: 180, MIN_DIM: 36, GAP:28, JITTER:80, SPAWN_CHANCE:0.85 };
    }

    function computeSize(nw, nh, MAX_DIM, MIN_DIM){
      if (!nw || !nh) return {w: MIN_DIM, h: MIN_DIM};
      const scale = Math.min(1, MAX_DIM / Math.max(nw, nh));
      const w = Math.max(MIN_DIM, Math.round(nw * scale));
      const h = Math.max(MIN_DIM, Math.round(nh * scale));
      return {w,h};
    }

    function collides(x,y,w,h, placed, GAP){
      for (let r of placed){
        if (x + w + GAP < r.x) continue;
        if (r.x + r.w + GAP < x) continue;
        if (y + h + GAP < r.y) continue;
        if (r.y + r.h + GAP < y) continue;
        return true;
      }
      return false;
    }

    // Animation observer and helpers (scroll/drag-triggered)
    let animObserver = null;
    const prefersReduced = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    function chooseDirection(src){
      if (!src) return 'from-left';
      let sum = 0; for (let i=0;i<src.length;i++) sum += src.charCodeAt(i);
      return (sum % 2 === 0) ? 'from-left' : 'from-right';
    }

    function ensureAnimStyles(){
      if (document.getElementById('gallery-anim-styles')) return;
      const s = document.createElement('style'); s.id = 'gallery-anim-styles';
      s.textContent = `
        .gallery-loading{ opacity: 0; transition: opacity 420ms ease; }
        .card{ transition: transform 320ms cubic-bezier(.2,.9,.3,1), opacity 260ms ease; will-change: transform, opacity; opacity: 0; transform: translateY(8px) scale(0.98); }
        .card.img-loading{ opacity: 0; }
        .card.out-view{ opacity: 0.6; }
        .card.in-view{ opacity: 1; }
        .card.revealed{ opacity: 1; transform: translateX(0) translateY(0) scale(1); }
        .card.from-left{ transform-origin: left center; }
        .card.from-right{ transform-origin: right center; }
        @media (prefers-reduced-motion: reduce){ .gallery-loading, .card{ transition: none !important; transform: none !important; opacity: 1 !important; } }
      `;
      document.head.appendChild(s);
    }

    // Show overlay listing all objects that share an image (group)
    function showGroupOverlay(group){
      try{
        if (!group || !group.items || !group.items.length) return;
        // remove existing overlay
        const existing = document.getElementById('group-overlay'); if (existing) existing.remove();
        const wrap = document.createElement('div'); wrap.id = 'group-overlay';
        wrap.style.position = 'fixed'; wrap.style.left = '0'; wrap.style.top = '0'; wrap.style.right = '0'; wrap.style.bottom = '0'; wrap.style.zIndex = 3000; wrap.style.background = 'rgba(0,0,0,0.5)'; wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.justifyContent = 'center';
        const box = document.createElement('div'); box.style.background = '#fff'; box.style.borderRadius='10px'; box.style.maxWidth='720px'; box.style.width='90%'; box.style.maxHeight='80%'; box.style.overflow='auto'; box.style.padding='16px';
        const title = document.createElement('h3'); title.textContent = `Objects using this image (${group.count})`; title.style.marginTop='0'; box.appendChild(title);
        const list = document.createElement('ul'); list.style.listStyle='none'; list.style.padding='0'; list.style.margin='0';
        group.items.forEach(it=>{
          const li = document.createElement('li'); li.style.padding='8px 6px'; li.style.borderBottom='1px solid #eee';
          const a = document.createElement('a'); a.href = makeLinkForItem(it); a.textContent = it.title || it.name || (it.id?('id:'+it.id):'Object'); a.style.color = '#007'; a.style.textDecoration='none'; a.style.fontWeight='600';
          li.appendChild(a);
          const meta = document.createElement('div'); meta.style.fontSize='12px'; meta.style.color='#444'; meta.textContent = it.id ? ('id: ' + it.id) : '';
          li.appendChild(meta);
          list.appendChild(li);
        });
        box.appendChild(list);
        const close = document.createElement('button'); close.type='button'; close.textContent='Close'; close.style.marginTop='12px'; close.style.padding='8px 10px'; close.style.borderRadius='6px'; close.addEventListener('click', ()=> wrap.remove());
        box.appendChild(close);
        wrap.appendChild(box);
        wrap.addEventListener('click', (e)=>{ if (e.target === wrap) wrap.remove(); });
        document.body.appendChild(wrap);
      }catch(e){ console.warn('showGroupOverlay failed', e); }
    }

    // Reveal initial visible cards with a gentle stagger to avoid a sudden pop on load
    function revealInitial(){
      try{
        if (prefersReduced){
          const all = Array.from(gallery.querySelectorAll('.card'));
          all.forEach(c=> c.classList.add('revealed'));
          gallery.classList.remove('gallery-loading');
          return;
        }
        const cards = Array.from(gallery.querySelectorAll('.card'));
        const visible = cards.filter(c=>{ const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth; });
        const toReveal = visible.length ? visible : cards.slice(0, Math.min(30, cards.length));
        toReveal.forEach((c,i)=> setTimeout(()=>{ c.classList.add('revealed'); }, i * 40));
        // remove gallery-loading after the stagger completes (or sooner)
        const totalDelay = Math.min(800, (toReveal.length * 40) + 160);
        setTimeout(()=> gallery.classList.remove('gallery-loading'), totalDelay);
      }catch(e){ try{ gallery.classList.remove('gallery-loading'); }catch{} }
    }

    function setupAnimations(){
      // Disconnect previous observer if any
      if (animObserver){ try{ animObserver.disconnect(); }catch(e){} animObserver = null; }
      ensureAnimStyles();
      if (prefersReduced) {
        // reduce motion: just ensure visible items are fully opaque
        const cards = Array.from(gallery.querySelectorAll('.card'));
        cards.forEach(c=>{ c.classList.remove('out-view'); c.classList.add('in-view'); });
        return;
      }

  // use three-stage thresholds for a gradual transition: out -> mid -> in
  const thresholds = [0, 0.2, 0.6, 1.0];
      animObserver = new IntersectionObserver((entries)=>{
        for (let entry of entries){
          const el = entry.target;
          const img = el.querySelector('img');
          const src = (img && (img.currentSrc || img.src || img.getAttribute('data-src'))) || '';
          const dirClass = chooseDirection(src);
          if (!el.classList.contains(dirClass)){
            el.classList.remove('from-left','from-right');
            el.classList.add(dirClass);
          }
          const r = entry.intersectionRatio || 0;
          const IN_SCALE = 1.00; const MID_SCALE = 0.50; const OUT_SCALE = 0.20; const TX = 18; // px
          // three-stage interpolation
          const t1 = 0.2, t2 = 0.6;
          let scale = IN_SCALE;
          if (r <= t1) {
            scale = OUT_SCALE;
          } else if (r <= t2) {
            const p = (r - t1) / (t2 - t1);
            scale = OUT_SCALE + p * (MID_SCALE - OUT_SCALE);
          } else {
            const p = (r - t2) / (1 - t2);
            scale = MID_SCALE + p * (IN_SCALE - MID_SCALE);
          }
          // translate: full TX when out, shrink toward 0 when fully in
          const sign = el.classList.contains('from-left') ? -1 : 1;
          let tx = 0;
          if (r <= t1) tx = TX * sign;
          else if (r <= t2) {
            const p = (r - t1) / (t2 - t1);
            tx = Math.round((1 - p) * TX * sign * 0.9);
          } else {
            const p = (r - t2) / (1 - t2);
            tx = Math.round((1 - p) * TX * sign * 0.4);
          }
          // opacity: out -> mid -> in
          let opacity = 1;
          if (r <= t1) opacity = 0.45;
          else if (r <= t2) { const p = (r - t1) / (t2 - t1); opacity = 0.45 + p * (0.85 - 0.45); }
          else { const p = (r - t2) / (1 - t2); opacity = 0.85 + p * (1 - 0.85); }

          el.style.transform = `translateX(${tx}px) scale(${scale})`;
          el.style.opacity = String(opacity);
          if (r > 0.2) { el.classList.remove('out-view'); el.classList.add('in-view'); }
          else { el.classList.remove('in-view'); el.classList.add('out-view'); }
        }
      }, { root: null, rootMargin: '0px', threshold: thresholds });

      const cards = Array.from(gallery.querySelectorAll('.card'));
      cards.forEach((c)=>{
        // set initial small-scale state
        c.classList.remove('in-view'); c.classList.add('out-view');
        const img = c.querySelector('img');
        const src = (img && (img.currentSrc || img.src || img.getAttribute('data-src'))) || '';
        const dir = chooseDirection(src);
        c.classList.add(dir);
        animObserver.observe(c);
      });
    }

  // Place all items into the gallery. This function is re-runnable on resize.
  let lastLayoutKey = null;
  // latestPlacedSet is exported from placeAll so fallback logic (outside the
  // function) can inspect which srcs/ids were actually placed. Declared here
  // to avoid ReferenceError when the fallback runs after placeAll completes.
  let latestPlacedSet = new Set();
  async function placeAll(){
      const layout = computeLayout();
      const CANVAS_W = layout.CANVAS_W;
      const CANVAS_H = layout.CANVAS_H;
      const CELL_SIZE = layout.CELL_SIZE;
      const MAX_DIM = layout.MAX_DIM;
      const MIN_DIM = layout.MIN_DIM;
      const GAP = layout.GAP;
      const JITTER = layout.JITTER;
      const SPAWN_CHANCE = layout.SPAWN_CHANCE;

      const layoutKey = [layout.CANVAS_W, layout.CELL_SIZE].join('-');
      // avoid rerunning if nothing significant changed
      if (lastLayoutKey === layoutKey) return;
      lastLayoutKey = layoutKey;

      gallery.innerHTML = '';
      gallery.style.display = 'block';
      gallery.style.width = CANVAS_W + 'px';
      gallery.style.height = CANVAS_H + 'px';
      gallery.style.position = 'relative';
      gallery.style.margin = '0 auto';

      const cols = Math.max(1, Math.floor(CANVAS_W / CELL_SIZE));
      const rows = Math.max(1, Math.floor(CANVAS_H / CELL_SIZE));
  const placed = [];
      // helper to produce a stable key for a group (by src)
      function groupKey(g){ if (!g) return null; return 'src:' + g.src; }
      let groupIdx = 0;

      // Pre-place overrides (grid or absolute)
      const placedSet = new Set();
      // Pre-place overrides (grid or absolute) for groups
      for (let gi = 0; gi < groups.length; gi++){
        const group = groups[gi];
        const ov = getOverrideForGroup(group);
        if (!ov) continue;
        try{
          const infoImg = await preload(group.src);
          const naturalW = infoImg ? infoImg.w : 200;
          const naturalH = infoImg ? infoImg.h : 200;

          let w, h, x, y;
          if (typeof ov.col === 'number'){
            const colSpan = (typeof ov.colSpan === 'number') ? ov.colSpan : 1;
            w = Math.max(MIN_DIM, Math.round(colSpan * CELL_SIZE));
            h = Math.max(MIN_DIM, Math.round(naturalH * (w / naturalW)));
            // scale down gallery-only groups
            if (group.isGallery){ const S = 0.7; w = Math.max(MIN_DIM, Math.round(w * S)); h = Math.max(MIN_DIM, Math.round(h * S)); }
            x = Math.max(0, Math.min(CANVAS_W - w, ov.col * CELL_SIZE + (ov.offsetX || 0)));
            if (typeof ov.row === 'number') y = Math.max(0, Math.min(CANVAS_H - h, ov.row * CELL_SIZE + (ov.offsetY || 0)));
            else y = Math.max(0, Math.min(CANVAS_H - h, (ov.offsetY || 0)));
          } else if (typeof ov.x === 'number' && typeof ov.y === 'number'){
            const size = computeSize(naturalW, naturalH, MAX_DIM, MIN_DIM);
            w = size.w; h = size.h;
            if (group.isGallery){ const S = 0.7; w = Math.max(MIN_DIM, Math.round(w * S)); h = Math.max(MIN_DIM, Math.round(h * S)); }
            x = Math.max(0, Math.min(CANVAS_W - w, ov.x));
            y = Math.max(0, Math.min(CANVAS_H - h, ov.y));
          } else {
            continue;
          }

          const rep = group.items[0];
          const a = createCard(rep);
          const card = a.querySelector('.card');
          // Position the anchor itself so the clickable element occupies the visible area.
          // This avoids situations where the child .card is absolutely positioned and the
          // parent <a> has zero size (which can make clicks unreliable).
          a.style.position = 'absolute';
          a.style.left = x + 'px';
          a.style.top = y + 'px';
          a.style.width = w + 'px';
          a.style.height = h + 'px';
          a.style.display = 'block';
          a.style.overflow = 'visible';
          a.style.background = 'transparent';
          if (card){
            // make the visual card fill the anchor
            card.style.position = 'static';
            card.style.left = '';
            card.style.top = '';
            card.style.width = '100%';
            card.style.height = '100%';
            card.style.display = 'flex';
            card.style.alignItems = 'center';
            card.style.justifyContent = 'center';
            card.style.overflow = 'hidden';
          }
          // annotate group info on the anchor for overlay/badge behavior
          try{ a.dataset.groupSrc = group.src; a.dataset.groupCount = String(group.count); const gids = group.items.map(it=>it.id).filter(Boolean); if (gids.length) a.dataset.groupIds = gids.join(','); }catch(e){}
          if (group.count > 1){
            // clicking opens overlay listing the objects that share this image
            a.addEventListener('click', function(ev){ try{ ev.preventDefault(); ev.stopPropagation(); showGroupOverlay(group); }catch(e){} });
          } else {
            // single item — default navigation behavior
            a.addEventListener('click', function(ev){ try{ if (ev.defaultPrevented) return; if (typeof ev.button === 'number' && ev.button !== 0) return; if (ev.ctrlKey||ev.metaKey||ev.shiftKey||ev.altKey) return; window.location.href = a.href; ev.preventDefault(); }catch(e){} });
          }
          const img = a.querySelector('img');
          if (img){ img.style.maxWidth='100%'; img.style.maxHeight='100%'; img.style.width='auto'; img.style.height='auto'; img.style.objectFit='contain'; img.src = group.src; img.classList.add('img-loaded'); }
          gallery.appendChild(a);
          placed.push({x,y,w,h, src: group.src});
          placedSet.add(groupKey(group));
        }catch(e){ /* ignore preload errors for overrides */ }
      }

      // Progressive/batched jittered placement: prioritize center cells, then fill out in batches
      const cells = [];
      for (let r = 0; r < rows; r++){ for (let c = 0; c < cols; c++){ cells.push({r,c}); } }
      const centerC = Math.floor(cols/2), centerR = Math.floor(rows/2);
      cells.sort((a,b)=> (Math.abs(a.r-centerR)+Math.abs(a.c-centerC)) - (Math.abs(b.r-centerR)+Math.abs(b.c-centerC)) );

  // helper to place one cell (places groups by src)
      async function placeCell(cell){
        const {r,c} = cell;
        if (Math.random() > SPAWN_CHANCE) return;
  // pick next group that hasn't been pre-placed via overrides
    let tries = 0;
    let group = groups[groupIdx % groups.length];
    while (placedSet.has(groupKey(group)) && tries < groups.length){ groupIdx++; tries++; group = groups[groupIdx % groups.length]; }
    if (placedSet.has(groupKey(group))) { groupIdx++; return; }
    groupIdx++;
    const infoImg = await preload(group.src);
    const naturalW = infoImg ? infoImg.w : 200;
    const naturalH = infoImg ? infoImg.h : 200;
  let {w,h} = computeSize(naturalW, naturalH, MAX_DIM, MIN_DIM);
  if (group.isGallery){ const S = 0.7; w = Math.max(MIN_DIM, Math.round(w * S)); h = Math.max(MIN_DIM, Math.round(h * S)); }

        const cellX = c * CELL_SIZE;
        const cellY = r * CELL_SIZE;
        const centerX = cellX + Math.floor(CELL_SIZE/2) - Math.floor(w/2);
        const centerY = cellY + Math.floor(CELL_SIZE/2) - Math.floor(h/2);

        const candidates = [];
        candidates.push({ x: centerX, y: centerY });
        const SAMPLES = 12;
        for (let s = 0; s < SAMPLES; s++){
          const factor = 1 - (s / SAMPLES) * 0.6;
          const rx = Math.floor((Math.random()*2 - 1) * JITTER * factor);
          const ry = Math.floor((Math.random()*2 - 1) * JITTER * factor);
          candidates.push({ x: centerX + rx, y: centerY + ry });
        }

        let placedPos = null;
        for (let cand of candidates){
          let cx = Math.max(0, Math.min(cand.x, CANVAS_W - w));
          let cy = Math.max(0, Math.min(cand.y, CANVAS_H - h));
          if (!collides(cx, cy, w, h, placed, GAP)) { placedPos = { x: cx, y: cy }; break; }
        }
        if (!placedPos) return;
        const x = placedPos.x;
        const y = placedPos.y;

  const rep = group.items[0];
  const a = createCard(rep);
  const card = a.querySelector('.card');
        // Position the anchor to be the interactive box for better hit-testing
        a.style.position = 'absolute';
        a.style.left = x + 'px';
        a.style.top = y + 'px';
        a.style.width = w + 'px';
        a.style.height = h + 'px';
        a.style.display = 'block';
        a.style.overflow = 'visible';
        a.style.background = 'transparent';
        if (card){
          card.style.position = 'static';
          card.style.left = '';
          card.style.top = '';
          card.style.width = '100%';
          card.style.height = '100%';
          card.style.display = 'flex';
          card.style.alignItems = 'center';
          card.style.justifyContent = 'center';
          card.style.overflow = 'hidden';
        }
        // annotate group info
  try{ a.dataset.groupSrc = group.src; a.dataset.groupCount = String(group.count); const gids = group.items.map(it=>it.id).filter(Boolean); if (gids.length) a.dataset.groupIds = gids.join(','); }catch(e){}
  if (group.count > 1){ a.addEventListener('click', function(ev){ try{ ev.preventDefault(); ev.stopPropagation(); showGroupOverlay(group); }catch(e){} }); }
  else { a.addEventListener('click', function(ev){ try{ if (ev.defaultPrevented) return; if (typeof ev.button === 'number' && ev.button !== 0) return; if (ev.ctrlKey||ev.metaKey||ev.shiftKey||ev.altKey) return; window.location.href = a.href; ev.preventDefault(); }catch(e){} }); }
        const img = a.querySelector('img'); if (img){ img.style.maxWidth='100%'; img.style.maxHeight='100%'; img.style.width='auto'; img.style.height='auto'; img.style.objectFit='contain'; img.src = group.src; img.classList.add('img-loaded'); }
        gallery.appendChild(a);
        placed.push({x,y,w,h});
        placedSet.add(groupKey(group));
      }

      // pick initial cells within a small radius so center appears immediately
      const INITIAL_RADIUS = Math.max(2, Math.floor(Math.min(cols, rows) / 10));
      const initialCells = cells.filter(cell => (Math.abs(cell.r-centerR) + Math.abs(cell.c-centerC)) <= INITIAL_RADIUS);
      const remainingCells = cells.filter(cell => (Math.abs(cell.r-centerR) + Math.abs(cell.c-centerC)) > INITIAL_RADIUS);

      // place initial cells synchronously (fast)
      for (let cell of initialCells){
        // eslint-disable-next-line no-await-in-loop
        await placeCell(cell);
      }

      // ensure styles exist and reveal initial visible items
      try{ ensureAnimStyles(); }catch(e){}
      try{ revealInitial(); }catch(e){}

      // process remaining cells in small batches to keep UI responsive
      const BATCH_SIZE = 12;
      const BATCH_DELAY = 40;
      for (let i = 0; i < remainingCells.length; i += BATCH_SIZE){
        const batch = remainingCells.slice(i, i + BATCH_SIZE);
        for (let cell of batch){
          // eslint-disable-next-line no-await-in-loop
          await placeCell(cell);
        }
        // yield to the event loop briefly
        // eslint-disable-next-line no-await-in-loop
        await new Promise(res => setTimeout(res, BATCH_DELAY));
      }

      // Post-pass: attempt to place any groups that were not placed by the
      // jittered placement above. Operating at the group level keeps behavior
      // consistent with the grouping-by-src strategy used earlier.
      try{
        const unplacedGroups = groups.filter(g => !placedSet.has(groupKey(g)));
        if (unplacedGroups.length){
          const MAX_ATTEMPTS = 200;
          for (let group of unplacedGroups){
            let placedOk = false;
            const infoImg = await preload(group.src);
            const naturalW = infoImg ? infoImg.w : 200;
            const naturalH = infoImg ? infoImg.h : 200;
            let {w,h} = computeSize(naturalW, naturalH, MAX_DIM, MIN_DIM);
            if (group.isGallery){ const S = 0.7; w = Math.max(MIN_DIM, Math.round(w * S)); h = Math.max(MIN_DIM, Math.round(h * S)); }
            for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++){
              const x = Math.floor(Math.random() * Math.max(1, CANVAS_W - w));
              const y = Math.floor(Math.random() * Math.max(1, CANVAS_H - h));
              if (!collides(x, y, w, h, placed, GAP)){
                // use the first item as the representative for the anchor/card
                const rep = group.items[0];
                const a = createCard(rep);
                const card = a.querySelector('.card');
                a.style.position = 'absolute'; a.style.left = x + 'px'; a.style.top = y + 'px'; a.style.width = w + 'px'; a.style.height = h + 'px'; a.style.display = 'block'; a.style.overflow = 'visible'; a.style.background = 'transparent';
                if (card){ card.style.position = 'static'; card.style.width='100%'; card.style.height='100%'; card.style.display='flex'; card.style.alignItems='center'; card.style.justifyContent='center'; card.style.overflow='hidden'; }
                // annotate group info and behavior (badge/overlay for multi-object groups)
                try{ a.dataset.groupSrc = group.src; a.dataset.groupCount = String(group.count); const gids = group.items.map(it=>it.id).filter(Boolean); if (gids.length) a.dataset.groupIds = gids.join(','); }catch(e){}
                if (group.count > 1){ a.addEventListener('click', function(ev){ try{ ev.preventDefault(); ev.stopPropagation(); showGroupOverlay(group); }catch(e){} }); }
                else { a.addEventListener('click', function(ev){ try{ if (ev.defaultPrevented) return; if (typeof ev.button === 'number' && ev.button !== 0) return; if (ev.ctrlKey||ev.metaKey||ev.shiftKey||ev.altKey) return; window.location.href = a.href; ev.preventDefault(); }catch(e){} }); }
                const img = a.querySelector('img'); if (img){ img.style.maxWidth='100%'; img.style.maxHeight='100%'; img.style.width='auto'; img.style.height='auto'; img.style.objectFit='contain'; img.src = group.src; img.classList.add('img-loaded'); }
                gallery.appendChild(a);
                placed.push({x,y,w,h, src: group.src});
                placedSet.add(groupKey(group));
                placedOk = true; break;
              }
            }
            // if not placed after many attempts, skip — this is unlikely but safe
          }
        }
      }catch(e){ console.warn('post-pass placement failed', e); }

      // center viewport
      setTimeout(()=>{
        try{
          const centerX = (gallery.scrollWidth - window.innerWidth) / 2;
          const centerY = (gallery.scrollHeight - window.innerHeight) / 2;
          window.scrollTo(Math.max(0, Math.floor(centerX)), Math.max(0, Math.floor(centerY)));
        } catch(e){}
      }, 80);
      // after placement, (re)attach animations
      try{
        // DEBUG: report whether umbrella src was actually placed
        try{
          const umbrellaSrc = 'images/umbrella.jpg';
          const umbrellaKey = 'src:' + umbrellaSrc;
          const placedSrcs = Array.from(placedSet || []);
          if (placedSrcs.indexOf(umbrellaKey) >= 0) console.info('[gallery] umbrella placed (key)', umbrellaKey);
          else console.info('[gallery] umbrella NOT placed — placed keys:', placedSrcs.slice(0,30));
        }catch(e){}
        setupAnimations();
      }catch(e){ console.warn('setupAnimations failed', e); }
      // expose the set of placed keys for the fallback checker
      try{ latestPlacedSet = placedSet; }catch(e){}
    }

  // initial placement (show loading state while we compute layout)
  try{ gallery.classList.add('gallery-loading'); }catch(e){}
  await placeAll();
  try{ revealInitial(); }catch(e){}

  // If stochastic placement failed to place every object, fall back to a simple
  // flat grid that guarantees one thumbnail per object (links to detail pages).
  try{
    // Build a map of unique objects (prefer id; otherwise use src)
    const objectsMap = {};
    items.forEach(it => {
      if (!it || !it.src) return;
      const k = it.id ? ('id:' + String(it.id)) : ('src:' + it.src);
      if (!objectsMap[k]) objectsMap[k] = it;
    });
    const totalObjects = Object.keys(objectsMap).length;
    // compute placed objects from placedSet. A placed src should count as
    // placing all objects that reference that src.
    const placedObjects = new Set();
    const placedSrcs = new Set();
    placedSet && Array.from(placedSet).forEach(pk => {
      if (!pk) return;
      if (pk.indexOf('id:') === 0){
        const rest = pk.slice(3);
        const parts = rest.split('|');
        if (parts && parts[0]) placedObjects.add('id:' + parts[0]);
        if (parts && parts[1]) placedSrcs.add(parts.slice(1).join('|'));
      } else if (pk.indexOf('src:') === 0){
        const src = pk.slice(4);
        placedSrcs.add(src);
      }
    });
    // mark any objects whose src is in placedSrcs as placed (by id or src key)
    Object.keys(objectsMap).forEach(k => {
      const it = objectsMap[k];
      if (!it) return;
      if (it.src && placedSrcs.has(it.src)){
        if (it.id) placedObjects.add('id:' + String(it.id));
        else placedObjects.add('src:' + it.src);
      } else {
        // if objectsMap key itself is present in placedObjects, keep it
        if (placedObjects.has(k)) return;
      }
    });
    const placedCount = placedObjects.size;
    // If not all objects are represented, render the flat grid as a reliable fallback
    if (placedCount < totalObjects){
      // clear the gallery and render a simple CSS grid with one card per object
      gallery.innerHTML = '';
      gallery.style.display = '';
      gallery.style.width = '';
      gallery.style.height = '';
      gallery.style.position = '';
      // ensure basic grid styles exist
      let fg = document.getElementById('flat-grid-styles');
      if (!fg){
        fg = document.createElement('style'); fg.id = 'flat-grid-styles';
        fg.textContent = '\n#infinite-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;align-items:start;max-width:1400px;margin:0 auto;padding:10px;}\n#infinite-gallery .flat-card{background:#fff;border-radius:8px;overflow:hidden;display:block;text-decoration:none;color:inherit;padding:0;border:1px solid rgba(0,0,0,0.04)}\n#infinite-gallery .flat-card img{width:100%;height:140px;object-fit:cover;display:block;background:#f4f4f4}\n#infinite-gallery .flat-card .meta{padding:8px 10px;font-size:13px;color:#111}\n@media (max-width:520px){#infinite-gallery .flat-card img{height:110px}}\n';
        document.head.appendChild(fg);
      }
      const frag = document.createDocumentFragment();
      Object.keys(objectsMap).forEach(k => {
        const it = objectsMap[k];
        const a = document.createElement('a'); a.className = 'flat-card card-link';
        a.href = makeLinkForItem(it);
        a.target = '_self';
        const img = document.createElement('img'); img.loading = 'lazy'; img.alt = it.title || it.name || ''; img.src = it.src || it.image_filename || '';
        const m = document.createElement('div'); m.className = 'meta'; m.textContent = it.title || it.name || (it.id?('id:'+it.id):'Untitled');
        a.appendChild(img); a.appendChild(m); frag.appendChild(a);
      });
      gallery.appendChild(frag);
      // ensure click delegation still works
      return;
    }
  }catch(e){ console.warn('Flat-grid fallback failed', e); }

    // --- Gallery editor UI and behavior (Edit / Save / Export / Reset) ---
    // Minimal toolbar injected into the page. Uses existing `overrides` and
    // `downloadJSON()` helper. Dragging will save overrides.bySrc using grid
    // units (col/row) when snapToGrid is enabled; otherwise absolute x/y.
    (function attachEditor(){
      const existing = document.getElementById('gallery-editor-toolbar');
      if (existing) return;
      const toolbar = document.createElement('div');
      toolbar.id = 'gallery-editor-toolbar';
      toolbar.style.position = 'fixed';
      toolbar.style.right = '14px';
      toolbar.style.top = '14px';
      toolbar.style.zIndex = '1600';
      toolbar.style.display = 'flex';
      toolbar.style.gap = '8px';
      toolbar.style.alignItems = 'center';
      toolbar.style.background = 'rgba(255,255,255,0.98)';
      toolbar.style.padding = '8px';
      toolbar.style.borderRadius = '8px';
      toolbar.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';

      function btn(text){ const b = document.createElement('button'); b.type='button'; b.textContent = text; b.style.padding='6px 8px'; b.style.border='1px solid rgba(0,0,0,0.08)'; b.style.background='#fff'; b.style.cursor='pointer'; b.style.borderRadius='6px'; return b; }
      const editBtn = btn('Edit layout');
      const saveBtn = btn('Save'); saveBtn.style.display='none';
      const exportBtn = btn('Export'); exportBtn.style.display='none';
      const resetBtn = btn('Reset'); resetBtn.style.display='none';
      const snapBtn = btn('Snap'); snapBtn.style.background = '#000'; snapBtn.style.color='#fff';

      toolbar.appendChild(editBtn); toolbar.appendChild(saveBtn); toolbar.appendChild(exportBtn); toolbar.appendChild(resetBtn); toolbar.appendChild(snapBtn);
      document.body.appendChild(toolbar);

      let editing = false;
      let snapToGrid = true;
      let dragState = null; // { anchor, startX, startY, origLeft, origTop }

      function getAnchorFromEventTarget(t){ return t && t.closest ? t.closest('a.card-link') : null; }

      function enterEdit(){
        editing = true; editBtn.textContent = 'Exit edit'; saveBtn.style.display='inline-block'; exportBtn.style.display='inline-block'; resetBtn.style.display='inline-block'; snapBtn.style.display='inline-block';
        // add visual affordance
        gallery.classList.add('gallery-editing');
        // attach pointer handlers by delegation
        gallery.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        // mark each anchor as movable
        Array.from(gallery.querySelectorAll('a.card-link')).forEach(a=>{ a.style.touchAction='none'; a.style.cursor='grab'; });
      }

      function exitEdit(){
        editing = false; editBtn.textContent = 'Edit layout'; saveBtn.style.display='none'; exportBtn.style.display='none'; resetBtn.style.display='none'; snapBtn.style.display='none';
        gallery.classList.remove('gallery-editing');
        gallery.removeEventListener('pointerdown', onPointerDown);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        Array.from(gallery.querySelectorAll('a.card-link')).forEach(a=>{ a.style.touchAction=''; a.style.cursor=''; });
        dragState = null;
      }

      function onPointerDown(e){
        if (!editing) return;
        if (e.button !== 0) return;
        const a = getAnchorFromEventTarget(e.target);
        if (!a) return;
        // prevent navigation while dragging
        e.preventDefault(); e.stopPropagation();
        const rect = a.getBoundingClientRect();
        const startX = e.clientX; const startY = e.clientY;
        const origLeft = parseInt(a.style.left || (rect.left + window.scrollX), 10) || 0;
        const origTop = parseInt(a.style.top || (rect.top + window.scrollY), 10) || 0;
        // ensure anchor is absolutely positioned (it should be from placement)
        a.style.position = 'absolute';
        dragState = { anchor: a, startX, startY, origLeft, origTop };
        a.style.cursor = 'grabbing';
      }

      function onPointerMove(e){
        if (!editing || !dragState) return;
        e.preventDefault();
        const ds = dragState;
        const dx = e.clientX - ds.startX; const dy = e.clientY - ds.startY;
        const newLeft = Math.max(0, Math.round(ds.origLeft + dx));
        const newTop = Math.max(0, Math.round(ds.origTop + dy));
        ds.anchor.style.left = newLeft + 'px';
        ds.anchor.style.top = newTop + 'px';
      }

      function onPointerUp(e){
        if (!editing || !dragState) return;
        const ds = dragState; dragState = null;
        ds.anchor.style.cursor = '';
        // compute override and store it
        const layout = computeLayout();
        const CELL_SIZE = layout.CELL_SIZE;
        const left = parseInt(ds.anchor.style.left || 0, 10);
        const top = parseInt(ds.anchor.style.top || 0, 10);
        const w = parseInt(ds.anchor.style.width || Math.round(ds.anchor.getBoundingClientRect().width) || 0, 10);
        const col = Math.max(0, Math.round(left / CELL_SIZE));
        const row = Math.max(0, Math.round(top / CELL_SIZE));
        const colSpan = Math.max(1, Math.round(w / CELL_SIZE));
        // Prefer per-object overrides. If this anchor represents a grouped src and has
        // data-group-ids, persist an override per item id so moving a gallery image
        // doesn't accidentally move unrelated object thumbnails that happen to share
        // the same image file.
        const src = ds.anchor.dataset && ds.anchor.dataset.src;
        const id = ds.anchor.dataset && ds.anchor.dataset.id;
        const groupIdsRaw = ds.anchor.dataset && ds.anchor.dataset.groupIds;
        const ov = snapToGrid ? { col, row, colSpan } : { x: left, y: top };
        if (groupIdsRaw){
          try{
            const ids = groupIdsRaw.split(',').map(s=>s.trim()).filter(Boolean);
            if (ids.length){ overrides.byId = overrides.byId || {}; ids.forEach(i=>{ overrides.byId[i] = ov; }); }
            else if (id){ overrides.byId = overrides.byId || {}; overrides.byId[id] = ov; }
            else if (src){ overrides.bySrc = overrides.bySrc || {}; overrides.bySrc[src] = ov; }
          }catch(e){ console.warn('failed saving group ids override', e); }
        } else {
          // fallback: prefer id; otherwise fall back to src
          if (id){ overrides.byId = overrides.byId || {}; overrides.byId[id] = ov; }
          else if (src){ overrides.bySrc = overrides.bySrc || {}; overrides.bySrc[src] = ov; }
          else { return; }
        }
        // mark visually
        ds.anchor.dataset._saved = '1';
        // Auto-persist the override to localStorage so changes survive reloads.
        try{
          localStorage.setItem('gallery_overrides', JSON.stringify(overrides));
          try{ if (saveBtn){ saveBtn.textContent = 'Saved'; setTimeout(()=> saveBtn.textContent = 'Save', 900); } }catch(e){}
        }catch(e){ console.warn('auto-save overrides failed', e); }
      }

      editBtn.addEventListener('click', ()=>{ if (!editing) enterEdit(); else exitEdit(); });
      snapBtn.addEventListener('click', ()=>{ snapToGrid = !snapToGrid; if (snapToGrid){ snapBtn.style.background='#000'; snapBtn.style.color='#fff'; snapBtn.textContent='Snap'; } else { snapBtn.style.background=''; snapBtn.style.color=''; snapBtn.textContent='Free'; } });
      saveBtn.addEventListener('click', ()=>{
        try{ localStorage.setItem('gallery_overrides', JSON.stringify(overrides));
        saveBtn.textContent = 'Saved'; setTimeout(()=> saveBtn.textContent = 'Save', 900);
        // re-place to ensure overrides are honored
        placeAll().catch(e=>console.warn('placeAll after save failed', e));
        }catch(e){ console.warn('save overrides failed', e); }
      });
      exportBtn.addEventListener('click', ()=>{ try{ downloadJSON(overrides, 'manual_positions.json'); }catch(e){ console.warn('export failed', e); } });
      resetBtn.addEventListener('click', ()=>{
        try{ overrides = { byId: {}, bySrc: {}, meta: {} }; localStorage.removeItem('gallery_overrides'); placeAll().catch(e=>console.warn('placeAll after reset failed', e)); }
        catch(e){ console.warn('reset failed', e); }
      });
    })();

    // debounced resize handler: recompute layout and re-place
    let resizeTimer = null;
    window.addEventListener('resize', ()=>{
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(()=>{ placeAll().catch(e=>console.warn('placeAll failed', e)); }, 180);
    });

    // drag-to-pan
    (function attachDragToPan(){
      let isDown = false; let startX = 0, startY = 0; let startScrollX = 0, startScrollY = 0; let dragged = false; const THRESH = 6;
  // Start pointer tracking. Do NOT call setPointerCapture here — capturing the pointer
  // on the gallery element causes the gallery to become the event.target for clicks,
  // which prevents anchors from receiving click events. We'll avoid pointer capture
  // and instead rely on move detection to perform the pan.
  gallery.addEventListener('pointerdown', (e)=>{ if (e.button!==0) return; isDown=true; dragged=false; startX=e.clientX; startY=e.clientY; startScrollX=window.scrollX||window.pageXOffset; startScrollY=window.scrollY||window.pageYOffset; document.body.style.userSelect='none'; gallery.style.cursor='grabbing'; });
      gallery.addEventListener('pointermove', (e)=>{ if (!isDown) return; const dx=e.clientX-startX, dy=e.clientY-startY; if (!dragged && Math.hypot(dx,dy)>THRESH) dragged=true; if (dragged){ window.scrollTo(startScrollX-dx, startScrollY-dy); e.preventDefault(); } }, { passive:false });
      function endDrag(e){
  if (!isDown) return;
  isDown = false;
  // We intentionally do not call releasePointerCapture because we never set it.
        document.body.style.userSelect = '';
        gallery.style.cursor = '';
        if (dragged){
          const onClick = (ev) => { ev.stopPropagation(); ev.preventDefault(); gallery.removeEventListener('click', onClick, true); };
          gallery.addEventListener('click', onClick, true);
          setTimeout(()=> gallery.removeEventListener('click', onClick, true), 0);
        } else {
          // Not a drag — treat as an intentional click/tap. If the click event didn't fire for some reason,
          // navigate on pointerup to ensure anchors work.
          try{
            const a = e.target && e.target.closest && e.target.closest('a.card-link');
            if (a){
              if (!e.defaultPrevented && (typeof e.button !== 'number' || e.button === 0) && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey){
                window.location.href = a.href;
                e.preventDefault();
              }
            }
          }catch(err){/* ignore */}
        }
      }
      ['pointerup','pointercancel','pointerleave'].forEach(ev=>gallery.addEventListener(ev, endDrag));
    })();

  })();

})();
