// Simple client-side search for protest objects
let ALL_PROTEST_DATA = [];
let indexed = [];
let filterState = { countries: new Set(), causes: new Set(), timeframes: new Set() };
let allFilters = { countries: [], causes: [], timeframes: [] };
let viewMode = 'grid'; // default to grid-only photo view

function normalizeText(t){
  if(!t) return '';
  // strip HTML tags and normalize whitespace
  return t.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
}

async function initSearch(){
  try{
    const res = await fetch('../protest_data.json');
    if(!res.ok) throw new Error('failed to load data');
    ALL_PROTEST_DATA = await res.json();
  }catch(e){
    // try absolute path fallback
    try{ const res2 = await fetch('protest_data.json'); ALL_PROTEST_DATA = await res2.json(); }catch(err){
      document.getElementById('search-count').textContent = 'Error loading data.'; return;
    }
  }

  // Build lightweight index for searching
  indexed = ALL_PROTEST_DATA.map(obj => {
    return {
      id: obj.id,
      name: (obj.name||'').toLowerCase(),
      text: normalizeText(obj.description_html || '') + ' ' + (obj.categories_country||[]).join(' ').toLowerCase() + ' ' + (obj.categories_cause||[]).join(' ').toLowerCase() + ' ' + (obj.categories_protest||[]).join(' ').toLowerCase(),
      raw: obj
    };
  });

  document.getElementById('search-count').textContent = `Loaded ${indexed.length} items.`;
  buildFilters();
  const input = document.getElementById('search-input');
  const clear = document.getElementById('clear-btn');
  const debounced = debounce(onSearch, 200);
  input.addEventListener('input', debounced);
  input.addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ onSearch(); } });
  clear.addEventListener('click', ()=>{ input.value=''; onSearch(); input.focus(); });
  // view toggles (default grid)
  const viewGridBtn = document.getElementById('view-grid');
  const viewListBtn = document.getElementById('view-list');
  if(viewGridBtn && viewListBtn){
    // set initial state
    viewGridBtn.setAttribute('aria-pressed', viewMode === 'grid' ? 'true' : 'false');
    viewListBtn.setAttribute('aria-pressed', viewMode === 'list' ? 'true' : 'false');
    viewGridBtn.addEventListener('click', ()=>{ viewMode='grid'; viewGridBtn.setAttribute('aria-pressed','true'); viewListBtn.setAttribute('aria-pressed','false'); onSearch(); });
    viewListBtn.addEventListener('click', ()=>{ viewMode='list'; viewListBtn.setAttribute('aria-pressed','true'); viewGridBtn.setAttribute('aria-pressed','false'); onSearch(); });
  }

  // initial empty search shows recent or featured (show all small set)
  renderResults(indexed.slice(0, 30));
}

function onSearch(){
  const q = document.getElementById('search-input').value.trim().toLowerCase();
  if(!q){
    document.getElementById('search-count').textContent = `Showing ${Math.min(30, indexed.length)} of ${indexed.length} items`;
    renderResults(indexed.slice(0,30));
    return;
  }

  const terms = q.split(/\s+/).filter(Boolean);

  // simple scoring: count number of term matches in name and text
  const results = indexed.map(item => {
    let score = 0;
    for(const t of terms){
      if(item.name.includes(t)) score += 3;
      if(item.text.includes(t)) score += 1;
    }
    return { item, score };
  }).filter(r => r.score>0).sort((a,b)=>b.score-a.score);

  // apply filters
  const filtered = applyFilters(results.map(r=>r.item));
  document.getElementById('search-count').textContent = `Found ${filtered.length} result(s)`;
  renderResults(filtered);
}

function applyFilters(list){
  // if all filters are empty (means all selected), keep everything
  const activeCountries = filterState.countries;
  const activeCauses = filterState.causes;
  const activeTimeframes = filterState.timeframes;

  return list.filter(entry => {
    const obj = entry.raw || entry;
    // country
    if(activeCountries.size > 0){
      const has = (obj.categories_country || []).some(c => activeCountries.has(c));
      if(!has) return false;
    }
    if(activeCauses.size > 0){
      const has = (obj.categories_cause || []).some(c => activeCauses.has(c));
      if(!has) return false;
    }
    if(activeTimeframes.size > 0){
      const has = (obj.categories_timeframe || []).some(c => activeTimeframes.has(c));
      if(!has) return false;
    }
    return true;
  });
}

function snippetFrom(text, q){
  if(!text) return '';
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if(idx === -1) return text.slice(0,140) + (text.length>140? '…':'');
  const start = Math.max(0, idx-40);
  const end = Math.min(text.length, idx+100);
  return (start>0? '…':'') + text.slice(start,end) + (end<text.length? '…':'');
}

function renderResults(list){
  const container = document.getElementById('results-list');
  container.innerHTML = '';
  if(!list || list.length === 0){
    container.innerHTML = '<p>No results.</p>';
    return;
  }
  if(viewMode === 'grid'){
    const grid = document.createElement('div'); grid.className = 'results-grid';
    for(const entry of list){
      const obj = entry.raw || entry;
      const item = document.createElement('div'); item.className = 'result-item-grid';
      const link = document.createElement('a'); link.href = `object-detail.html?id=${obj.id}`;
  const img = document.createElement('img'); img.alt = obj.name || ''; img.loading = 'lazy'; img.className = 'lazy-img';
  // fade in when loaded to avoid layout shift perception
  img.addEventListener('load', () => { img.classList.add('img-loaded'); });
  img.src = obj.image_filename || (obj.images && obj.images[0]) || 'images/umbrella.jpg';
      // image only in grid — keep original aspect ratio (width fixed by grid column)
      link.appendChild(img);
      item.appendChild(link);
      grid.appendChild(item);
    }
    container.appendChild(grid);
    // Use CSS grid (controlled via CSS variables) for column count — no JS masonry
    // Keep accessibility: ensure links/images fill the grid cell
    grid.querySelectorAll('a').forEach(a=> a.style.display = 'block');
    return;
  }

  // fallback: list view
  for(const entry of list){
    const obj = entry.raw || entry;
    const el = document.createElement('div');
    el.className = 'result-item';

  const thumb = document.createElement('img');
  thumb.className = 'result-thumb lazy-img';
  thumb.alt = obj.name || 'thumbnail';
  thumb.loading = 'lazy';
  thumb.addEventListener('load', () => { thumb.classList.add('img-loaded'); });
  thumb.src = obj.image_filename || (obj.images && obj.images[0]) || 'images/umbrella.jpg';

    const meta = document.createElement('div');
    meta.className = 'result-meta';

    const title = document.createElement('h3');
    title.className = 'result-title';
    const a = document.createElement('a');
    a.className = 'result-link';
    a.href = `object-detail.html?id=${obj.id}`;
    a.textContent = obj.name || 'Untitled';
    title.appendChild(a);

    const snippet = document.createElement('p');
    snippet.className = 'result-snippet';
    const q = document.getElementById('search-input').value.trim().toLowerCase();
    snippet.textContent = snippetFrom((obj.description_html || '').replace(/<[^>]*>/g,' '), q || '');

    meta.appendChild(title);
    meta.appendChild(snippet);

    el.appendChild(thumb);
    el.appendChild(meta);
    container.appendChild(el);
  }
}

// Build filter lists and render panels
function buildFilters(){
  const countries = new Set();
  const causes = new Set();
  const timeframes = new Set();
  ALL_PROTEST_DATA.forEach(obj=>{
    (obj.categories_country||[]).forEach(c=>countries.add(c));
    (obj.categories_cause||[]).forEach(c=>causes.add(c));
    (obj.categories_timeframe||[]).forEach(c=>timeframes.add(c));
  });
  allFilters.countries = Array.from(countries).sort();
  allFilters.causes = Array.from(causes).sort();
  allFilters.timeframes = Array.from(timeframes).sort();

  // default: no active filters means all pass; but we'll initialize sets to empty (meaning 'all')
  renderFilterPanel('countries', allFilters.countries);
  renderFilterPanel('causes', allFilters.causes);
  renderFilterPanel('timeframes', allFilters.timeframes);

  // panel toggle wiring
  document.querySelectorAll('.filter-toggle').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const parent = btn.closest('.filter-dropdown');
      const panel = parent.querySelector('.filter-panel');
      const open = panel.hasAttribute('hidden');
      // close others
      document.querySelectorAll('.filter-panel').forEach(p=>{ p.hidden = true; p.previousElementSibling.setAttribute('aria-expanded','false'); });
      if(open){ panel.hidden = false; btn.setAttribute('aria-expanded','true'); } else { panel.hidden = true; btn.setAttribute('aria-expanded','false'); }
    });
  });
}

function renderFilterPanel(kind, items){
  const container = document.querySelector(`.filter-dropdown[data-filter="${kind}"] .filter-panel`);
  if(!container) return;
  container.innerHTML = '';
  // add handy buttons
  const allBtn = document.createElement('div'); allBtn.style.marginBottom='8px'; allBtn.innerHTML = `<button class="filter-button" data-act="select-all">All</button> <button class="filter-button" data-act="clear-all">None</button>`;
  container.appendChild(allBtn);
  allBtn.querySelector('[data-act="select-all"]').addEventListener('click', ()=>{ items.forEach(it=>filterState[kind].add(it)); onSearch(); });
  allBtn.querySelector('[data-act="clear-all"]').addEventListener('click', ()=>{ filterState[kind].clear(); onSearch(); });

  items.forEach(val=>{
    const id = `filter-${kind}-${cssSafe(val)}`;
    const label = document.createElement('label');
    label.htmlFor = id;
    const cb = document.createElement('input'); cb.type='checkbox'; cb.id=id; cb.checked = true; // default checked
    // when checked -> included; when unchecked -> excluded
    filterState[kind].add(val);
    cb.addEventListener('change', ()=>{
      if(cb.checked) filterState[kind].add(val); else filterState[kind].delete(val);
      onSearch();
    });
    const span = document.createElement('span'); span.textContent = val;
    label.appendChild(cb); label.appendChild(span);
    container.appendChild(label);
  });
}

function cssSafe(s){ return (''+s).replace(/[^a-z0-9]/gi,'_'); }

function adjustMasonryColumns(grid){
  if(!grid) grid = document.querySelector('.results-grid');
  if(!grid) return;
  const style = getComputedStyle(grid);
  // read padding and gap
  const gap = parseInt(style.columnGap) || 10;
  const paddingLeft = parseInt(style.paddingLeft) || 0;
  const paddingRight = parseInt(style.paddingRight) || 0;
  const containerWidth = grid.clientWidth - paddingLeft - paddingRight;
  const desiredMin = 220; // target minimum column width
  // compute number of columns that can fit
  let cols = Math.floor((containerWidth + gap) / (desiredMin + gap));
  if(cols < 1) cols = 1;
  // compute adjusted column width so columns fill container exactly (minus gaps)
  const adjusted = Math.floor((containerWidth - gap * (cols - 1)) / cols);
  grid.style.columnWidth = adjusted + 'px';
}

// reflow masonry on resize (debounced)
let _resizeTimer;
window.addEventListener('resize', ()=>{ clearTimeout(_resizeTimer); _resizeTimer = setTimeout(()=>{ adjustMasonryColumns(); }, 120); });

function debounce(fn, wait){
  let t;
  return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn.apply(this,args), wait); };
}

// Initialize on load
document.addEventListener('DOMContentLoaded', initSearch);
