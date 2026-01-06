(function(){
  // Scatter canvas gallery — jittered-grid implementation
  const DATA_URL = 'protest_data.json';
  const INFO_URL = 'protest_info.json';

  const gallery = document.getElementById('infinite-gallery');
  if (!gallery) { console.warn('infinite-gallery: missing #infinite-gallery element'); return; }

  async function fetchJson(url){
    try { const r = await fetch(url); if (!r.ok) return null; return await r.json(); }
    catch(e){ console.warn('fetch error', url, e); return null; }
  }

  function normalizeFromData(d){
    const out = [];
    if (!d) return out;
    const list = Array.isArray(d) ? d : (d.objects || d.items || []);
    if (!Array.isArray(list)) return out;
    list.forEach(obj => {
      const base = { id: obj.id || obj._id || obj.slug || null, title: obj.title || obj.name || '' };
      if (Array.isArray(obj.photos) && obj.photos.length){ obj.photos.forEach(p => out.push(Object.assign({}, base, { src: p, source: 'data' }))); }
      else if (Array.isArray(obj.images) && obj.images.length){ obj.images.forEach(i => { var src = (i && (i.src || i.image || i.file)) || i; if (src) out.push(Object.assign({}, base, { src, source: 'data' })); }); }
      else if (obj.image_filename) out.push(Object.assign({}, base, { src: obj.image_filename, source: 'data' }));
      else if (obj.photo) out.push(Object.assign({}, base, { src: obj.photo, source: 'data' }));
      else if (obj.image) out.push(Object.assign({}, base, { src: obj.image, source: 'data' }));
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
      if (src) out.push({ id: it.id || it.slug || null, title: it.title || it.name || '', src, source: 'info' });
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

    // dedupe
    const seen = new Set();
    items = items.filter(it => { if (!it || !it.src) return false; if (seen.has(it.src)) return false; seen.add(it.src); return true; });

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
    function downloadJSON(obj, filename='manual_positions.json'){
      try{
        const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      }catch(e){ console.warn('download failed', e); }
    }
    (function addExportButton(){
      const btn = document.createElement('button');
      btn.textContent = 'Export positions';
      Object.assign(btn.style,{position:'fixed',right:'12px',bottom:'12px',zIndex:9999,padding:'8px 10px',background:'#222',color:'#fff',border:'none',borderRadius:'6px',opacity:0.9});
      btn.addEventListener('click', ()=> downloadJSON(overrides));
      document.body.appendChild(btn);
    })();

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
          window.location.href = a.href;
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
      let itemIdx = 0;

      // Pre-place overrides (grid or absolute)
      const placedSet = new Set();
      for (let i = 0; i < items.length; i++){
        const it = items[i];
        const ov = getOverrideForItem(it);
        if (!ov) continue;
        try{
          const infoImg = await preload(it.src);
          const naturalW = infoImg ? infoImg.w : 200;
          const naturalH = infoImg ? infoImg.h : 200;

          let w, h, x, y;
          if (typeof ov.col === 'number'){
            const colSpan = (typeof ov.colSpan === 'number') ? ov.colSpan : 1;
            w = Math.max(MIN_DIM, Math.round(colSpan * CELL_SIZE));
            h = Math.max(MIN_DIM, Math.round(naturalH * (w / naturalW)));
            x = Math.max(0, Math.min(CANVAS_W - w, ov.col * CELL_SIZE + (ov.offsetX || 0)));
            if (typeof ov.row === 'number') y = Math.max(0, Math.min(CANVAS_H - h, ov.row * CELL_SIZE + (ov.offsetY || 0)));
            else y = Math.max(0, Math.min(CANVAS_H - h, (ov.offsetY || 0)));
          } else if (typeof ov.x === 'number' && typeof ov.y === 'number'){
            const size = computeSize(naturalW, naturalH, MAX_DIM, MIN_DIM);
            w = size.w; h = size.h;
            x = Math.max(0, Math.min(CANVAS_W - w, ov.x));
            y = Math.max(0, Math.min(CANVAS_H - h, ov.y));
          } else {
            continue;
          }

          const a = createCard(it);
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
          // Robust per-anchor click fallback (respects modifiers and prevented events)
          a.addEventListener('click', function(ev){ try{ if (ev.defaultPrevented) return; if (typeof ev.button === 'number' && ev.button !== 0) return; if (ev.ctrlKey||ev.metaKey||ev.shiftKey||ev.altKey) return; window.location.href = a.href; ev.preventDefault(); }catch(e){} });
          const img = a.querySelector('img');
          if (img){ img.style.maxWidth='100%'; img.style.maxHeight='100%'; img.style.width='auto'; img.style.height='auto'; img.style.objectFit='contain'; img.src = it.src; img.classList.add('img-loaded'); }
          gallery.appendChild(a);
          placed.push({x,y,w,h, src: it.src});
          placedSet.add(it.src);
        }catch(e){ /* ignore preload errors for overrides */ }
      }

      // Progressive/batched jittered placement: prioritize center cells, then fill out in batches
      const cells = [];
      for (let r = 0; r < rows; r++){ for (let c = 0; c < cols; c++){ cells.push({r,c}); } }
      const centerC = Math.floor(cols/2), centerR = Math.floor(rows/2);
      cells.sort((a,b)=> (Math.abs(a.r-centerR)+Math.abs(a.c-centerC)) - (Math.abs(b.r-centerR)+Math.abs(b.c-centerC)) );

      // helper to place one cell
      async function placeCell(cell){
        const {r,c} = cell;
        if (Math.random() > SPAWN_CHANCE) return;
        // pick next item that hasn't been pre-placed via overrides
        let tries = 0;
        let it = items[itemIdx % items.length];
        while (placedSet.has(it.src) && tries < items.length){ itemIdx++; tries++; it = items[itemIdx % items.length]; }
        if (placedSet.has(it.src)) { itemIdx++; return; }
        itemIdx++;
        const infoImg = await preload(it.src);
        const naturalW = infoImg ? infoImg.w : 200;
        const naturalH = infoImg ? infoImg.h : 200;
        const {w,h} = computeSize(naturalW, naturalH, MAX_DIM, MIN_DIM);

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

        const a = createCard(it);
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
        a.addEventListener('click', function(ev){ try{ if (ev.defaultPrevented) return; if (typeof ev.button === 'number' && ev.button !== 0) return; if (ev.ctrlKey||ev.metaKey||ev.shiftKey||ev.altKey) return; window.location.href = a.href; ev.preventDefault(); }catch(e){} });
        const img = a.querySelector('img');
        if (img){ img.style.maxWidth='100%'; img.style.maxHeight='100%'; img.style.width='auto'; img.style.height='auto'; img.style.objectFit='contain'; img.src = it.src; img.classList.add('img-loaded'); }
        gallery.appendChild(a);
        placed.push({x,y,w,h});
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

      // center viewport
      setTimeout(()=>{
        try{
          const centerX = (gallery.scrollWidth - window.innerWidth) / 2;
          const centerY = (gallery.scrollHeight - window.innerHeight) / 2;
          window.scrollTo(Math.max(0, Math.floor(centerX)), Math.max(0, Math.floor(centerY)));
        } catch(e){}
      }, 80);
      // after placement, (re)attach animations
      try{ setupAnimations(); }catch(e){ console.warn('setupAnimations failed', e); }
    }

  // initial placement (show loading state while we compute layout)
  try{ gallery.classList.add('gallery-loading'); }catch(e){}
  await placeAll();
  try{ revealInitial(); }catch(e){}

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
