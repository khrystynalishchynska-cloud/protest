// Welcome page JS: toggle views, load data, basic search and filters
(function(){
  const state = {
    data: [],
    filtered: [],
    view: 'gallery', // default
    searchTerm: '',
    filters: { type: '', country: '', cause: '' },
    // listMode: 'index' shows aggregated tags; 'items' shows objects matching filters
    listMode: 'index',
    debounceTimer: null
  };

  // Which tag kinds should be shown in the aggregated index and their search text
  state.tagKindsEnabled = { name: true, country: true, type: true, cause: true };
  state.tagSearch = '';

  function shuffleArray(arr){
    for(let i = arr.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function renderTagIndex(){
    const container = $('#list-grid');
    if(!container) return;
    container.innerHTML = '';
    // Build unique lists (respect enabled kinds)
    const names = new Set();
    const countries = new Set();
    const types = new Set();
    const causes = new Set();
    state.data.forEach(item=>{
      if(state.tagKindsEnabled.name && item.name) names.add(item.name);
      if(state.tagKindsEnabled.country) (item.categories_country||[]).forEach(c=>countries.add(c));
      if(state.tagKindsEnabled.type) (item.categories_object_type||[]).forEach(t=>types.add(t));
      if(state.tagKindsEnabled.cause) (item.categories_cause||[]).forEach(ca=>causes.add(ca));
    });
    // Combine according to enabled kinds
    const combined = [];
    names.forEach(v=> combined.push({kind: 'name', value: v}));
    countries.forEach(v=> combined.push({kind: 'country', value: v}));
    types.forEach(v=> combined.push({kind: 'type', value: v}));
    causes.forEach(v=> combined.push({kind: 'cause', value: v}));
    // Convert to array and optionally filter by the small tag-search box
    let arr = shuffleArray(combined);
    if(state.tagSearch && state.tagSearch.trim()){ const q = state.tagSearch.trim().toLowerCase(); arr = arr.filter(i => (i.value||'').toLowerCase().includes(q)); }
    const wrap = document.createElement('div'); wrap.className = 'tags';
    arr.forEach(item=>{
      const t = document.createElement('span');
      t.className = `tag ${item.kind} clickable-tag`;
      t.textContent = item.value;
      t.dataset.kind = item.kind;
      t.dataset.value = item.value;
      wrap.appendChild(t);
    });
    container.appendChild(wrap);
  }

  function initListControls(){
    const search = document.getElementById('list-search');
    const toggles = Array.from(document.querySelectorAll('#list-controls .tag-toggle'));
    if(search){
      search.value = state.tagSearch || '';
      let tId = null;
      search.addEventListener('input', function(e){
        clearTimeout(tId);
        tId = setTimeout(()=>{
          state.tagSearch = e.target.value || '';
          if(state.listMode === 'index') renderTagIndex();
        }, 180);
      });
    }
    // For each toggle label, look for an embedded checkbox input and bind it.
    toggles.forEach(lbl => {
      const kind = lbl.getAttribute('data-kind') || lbl.dataset.kind;
      if(!kind) return;
      const cb = lbl.querySelector('input[type="checkbox"]');
      // initialize label visual state from model
      const enabled = !!state.tagKindsEnabled[kind];
      lbl.classList.toggle('active', enabled);
      if(cb){
        cb.checked = enabled;
        cb.addEventListener('change', function(e){
          const on = !!e.target.checked;
          state.tagKindsEnabled[kind] = on;
          lbl.classList.toggle('active', on);
          if(state.listMode === 'index') renderTagIndex();
        });
        // clicking the label should also focus / toggle the checkbox (native behavior),
        // but keep a fallback in case input isn't clickable.
        lbl.addEventListener('keydown', function(e){ if(e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); } });
      } else {
        // fallback to old behavior: clicking the label toggles the kind
        lbl.addEventListener('click', ()=>{
          const on = !state.tagKindsEnabled[kind];
          state.tagKindsEnabled[kind] = on;
          lbl.classList.toggle('active', on);
          if(state.listMode === 'index') renderTagIndex();
        });
      }
    });
  }

  // Helpers
  function $(sel){ return document.querySelector(sel); }
  function $all(sel){ return Array.from(document.querySelectorAll(sel)); }

  async function loadData(){
    try{
      const res = await fetch('protest_data.json');
      state.data = await res.json();
      state.filtered = state.data.slice();
    }catch(e){ console.error('Failed to load data', e); }
  }

  function populateFilters(){
    const types = new Set();
    const countries = new Set();
    const causes = new Set();
    state.data.forEach(item=>{
      (item.categories_object_type||[]).forEach(t=>types.add(t));
      (item.categories_country||[]).forEach(c=>countries.add(c));
      (item.categories_cause||[]).forEach(c=>causes.add(c));
    });
    const typeSel = $('#filter-type');
    const countrySel = $('#filter-country');
    const causeSel = $('#filter-cause');
    const addOpts = (sel, items)=>{
      const frag = document.createDocumentFragment();
      [...items].sort().forEach(v=>{
        const o = document.createElement('option'); o.value = v; o.textContent = v; frag.appendChild(o);
      });
      sel.appendChild(frag);
    };
    addOpts(typeSel, types);
    addOpts(countrySel, countries);
    addOpts(causeSel, causes);
  }

  function renderList(cards){
    try{
      const container = $('#list-grid');
      if(!container){ console.warn('renderList: #list-grid not found'); return; }
      container.innerHTML = '';
      if(!cards || cards.length===0){ container.innerHTML = '<p>No results.</p>'; return; }
    const frag = document.createDocumentFragment();
    // If listMode === 'items' render a photos-only grid (no text). Otherwise render rows.
    if(state.listMode === 'items'){
      const grid = document.createElement('div'); grid.className = 'photo-results-grid';
      cards.forEach(item=>{
        const a = document.createElement('a');
        a.href = `object-detail.html?id=${encodeURIComponent(item.id)}`;
        a.className = 'photo-result card-link';
        const img = document.createElement('img');
        img.alt = item.name || '';
        img.loading = 'lazy';
        img.src = item.image_filename || (item.images && item.images[0] && (item.images[0].src || item.images[0].image)) || '';
        a.appendChild(img);
        grid.appendChild(a);
      });
      frag.appendChild(grid);
    } else {
      // Render simplified rows: no images, only title + tags.
      cards.forEach(item=>{
        const a = document.createElement('a');
        a.href = `object-detail.html?id=${encodeURIComponent(item.id)}`;
        a.className = 'list-row card-link';

        const h = document.createElement('h3'); h.textContent = item.name || 'Untitled';

        // Tags container: name, countries, object types, causes
        const tags = document.createElement('div'); tags.className = 'tags';
        // Name tag (kind 1)
        if (item.name){ const t = document.createElement('span'); t.className = 'tag name clickable-tag'; t.textContent = item.name; t.dataset.kind = 'name'; t.dataset.value = item.name; if((state.searchTerm||'') === item.name) t.classList.add('active'); tags.appendChild(t); }
        // Countries (kind 2)
        (item.categories_country||[]).forEach(c => { const t = document.createElement('span'); t.className = 'tag country clickable-tag'; t.textContent = c; t.dataset.kind = 'country'; t.dataset.value = c; if(state.filters.country === c) t.classList.add('active'); tags.appendChild(t); });
        // Object types (kind 3)
        (item.categories_object_type||[]).forEach(tp => { const t = document.createElement('span'); t.className = 'tag type clickable-tag'; t.textContent = tp; t.dataset.kind = 'type'; t.dataset.value = tp; if(state.filters.type === tp) t.classList.add('active'); tags.appendChild(t); });
        // Causes (kind 4)
        (item.categories_cause||[]).forEach(ca => { const t = document.createElement('span'); t.className = 'tag cause clickable-tag'; t.textContent = ca; t.dataset.kind = 'cause'; t.dataset.value = ca; if(state.filters.cause === ca) t.classList.add('active'); tags.appendChild(t); });

        a.appendChild(h);
        a.appendChild(tags);
        frag.appendChild(a);
      });
    }
    container.appendChild(frag);
    const lc = $('#list-count'); if(lc) lc.textContent = `${cards.length} result${cards.length===1? '':'s'}`;
  }catch(err){ console.error('renderList error', err); }
  }

  function applyFilters(){
    const term = state.searchTerm.trim().toLowerCase();
    const { type, country, cause } = state.filters;
    state.filtered = state.data.filter(item=>{
      if(type && !(item.categories_object_type||[]).includes(type)) return false;
      if(country && !(item.categories_country||[]).includes(country)) return false;
      if(cause && !(item.categories_cause||[]).includes(cause)) return false;
      if(term){
        const hay = (item.name+' '+(item.description_html||'')).toLowerCase();
        if(!hay.includes(term)) return false;
      }
      return true;
    });
    renderList(state.filtered);
  }

  function debounceApply(){
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(()=>applyFilters(), 220);
  }

  function setupEventHandlers(){
    // Support both top-bar IDs (if present) and floating buttons
    const galleryBtns = [$('#btn-gallery'), $('#btn-gallery-float')].filter(Boolean);
    const listBtns = [$('#btn-list'), $('#btn-list-float')].filter(Boolean);
    const searchBtns = [$('#btn-search-float'), $('#btn-search')].filter(Boolean);
    galleryBtns.forEach(b=>b.addEventListener('click', ()=>{ toggleView('gallery'); hideSearchPanel(); }));
  // When clicking List toggle, show the aggregated tag index by default
  listBtns.forEach(b=>b.addEventListener('click', ()=>{ state.listMode = 'index'; toggleView('list'); hideSearchPanel(); }));
    searchBtns.forEach(b=>b.addEventListener('click', ()=>{
      // toggle visibility of the search controls
      const panel = document.querySelector('.controls-bar');
      if(panel){
        const isVisible = panel.classList.contains('visible');
        if(isVisible){ hideSearchPanel(); } else { showSearchPanel(); }
      }
    }));

    const searchInput = $('#search-input');
    if(searchInput){
      searchInput.addEventListener('input', (e)=>{
        state.searchTerm = e.target.value;
        debounceApply();
      });
    }
    $('#filter-type').addEventListener('change', (e)=>{ state.filters.type = e.target.value; applyFilters(); });
    $('#filter-country').addEventListener('change', (e)=>{ state.filters.country = e.target.value; applyFilters(); });
    $('#filter-cause').addEventListener('change', (e)=>{ state.filters.cause = e.target.value; applyFilters(); });
    
    // Delegate click handling for tags inside the list view. We attach a single
    // listener to the list container so tags (which are recreated) will be handled.
    const listGrid = $('#list-grid');
    if(listGrid){
      listGrid.addEventListener('click', function(e){
        const t = e.target.closest && e.target.closest('.clickable-tag');
        if(!t) return;
        // prevent the row's anchor navigation
        e.preventDefault(); e.stopPropagation();
        const kind = t.dataset.kind; const value = t.dataset.value;
        if(!kind || !value) return;
        // Toggle behavior: if already set, clear; otherwise set the filter/search
        if(kind === 'name'){
          const cur = (state.searchTerm||'').trim();
          if(cur === value){ state.searchTerm = ''; const si = $('#search-input'); if(si) si.value = ''; }
          else { state.searchTerm = value; const si = $('#search-input'); if(si) si.value = value; }
        } else if(kind === 'type' || kind === 'country' || kind === 'cause'){
          const key = kind;
          if(state.filters[key] === value){ state.filters[key] = ''; const sel = (key==='type'? $('#filter-type') : key==='country'? $('#filter-country') : $('#filter-cause')); if(sel) sel.value = ''; }
          else { state.filters[key] = value; const sel = (key==='type'? $('#filter-type') : key==='country'? $('#filter-country') : $('#filter-cause')); if(sel) sel.value = value; }
        }
        // Now show objects matching the chosen tag
        state.listMode = 'items';
        toggleView('list');
        applyFilters();
      }, false);
    }
  }

  function toggleView(which){
    state.view = which;
    // Add a body class so CSS can switch the brand out of fixed positioning
    // when the list view is active. This keeps the brand in the document flow
    // so the list sits beneath it.
    try{ document.body.classList.toggle('list-view', which === 'list'); }catch(e){}
    const gallery = $('#infinite-gallery');
    const list = $('#list-view');
    const gbtn = $('#btn-gallery') || $('#btn-gallery-float');
    const lbtn = $('#btn-list') || $('#btn-list-float');
    if(which==='gallery'){
      gallery.style.display = '';
      list.style.display = 'none';
      if(gbtn) gbtn.setAttribute('aria-pressed','true'); if(lbtn) lbtn.setAttribute('aria-pressed','false');
    }else{
      gallery.style.display = 'none';
      // Ensure list view is explicitly shown — CSS initially sets #list-view to display:none,
      // so setting an empty string would leave it hidden. Use 'block' to reveal the container.
      list.style.display = 'block';
      if(gbtn) gbtn.setAttribute('aria-pressed','false'); if(lbtn) lbtn.setAttribute('aria-pressed','true');
      // render either the aggregated tag index or the object list depending on mode
      if(state.listMode === 'index'){
        renderTagIndex();
      }else{
        console.log('toggleView -> list; filtered:', state.filtered.length, 'data:', state.data.length);
        renderList(state.filtered.length ? state.filtered : state.data);
      }
    }
  }

  function showSearchPanel(){
    const panel = document.querySelector('.controls-bar');
    if(!panel) return;
    panel.classList.add('visible');
    // position panel above floating toggle if present
    const float = document.getElementById('floating-toggle');
    if(float){
      const rect = float.getBoundingClientRect();
      panel.style.position = 'fixed';
      panel.style.right = (window.innerWidth - rect.right + 6) + 'px';
      panel.style.bottom = (window.innerHeight - rect.top + 12) + 'px';
    }
    const s = $('#search-input'); if(s) s.focus();
  }

  function hideSearchPanel(){
    const panel = document.querySelector('.controls-bar');
    if(!panel) return;
    panel.classList.remove('visible');
    panel.style.position = ''; panel.style.right = ''; panel.style.bottom = '';
  }

  async function init(){
    await loadData();
    populateFilters();
    setupEventHandlers();
    try{ initListControls(); }catch(e){ /* ignore if controls not present */ }
    // default view remains gallery
    toggleView('gallery');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
