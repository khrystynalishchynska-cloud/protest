// Minimal standalone script for welcome-new.html
// Loads protest_data.json and creates three views: Explore (scatter), Search (controls), About

(async function(){
  const DATA_URL = 'protest_data.json';
  let data = [];
  try{
    const res = await fetch(DATA_URL);
    data = await res.json();
  }catch(e){ console.error('failed to load data', e); return; }

  // DOM refs
  const canvas = document.getElementById('canvas');
  const canvasWrap = document.getElementById('canvas-wrap');
  const searchHeader = document.getElementById('search-header');
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('clear-btn');
  const toggleImages = document.getElementById('toggle-images');
  const toggleList = document.getElementById('toggle-list');
  const tagsWrap = document.getElementById('tags-wrap');
  const listResults = document.getElementById('list-results');
  const nav = document.querySelector('.main-nav');
  const aboutPanel = document.getElementById('about-panel');
  const aboutClose = document.getElementById('about-close');
  const siteBrand = document.getElementById('site-brand');

  // state
  let view = 'explore'; // explore | search | about
  let searchMode = 'images'; // images | list
  let activeKinds = new Set(['name','country','type','cause']);

  // helpers: split brand into chars
  (function splitBrand(){
    const el = siteBrand;
    const txt = el.textContent || '';
    el.innerHTML = '';
    for(let ch of txt){
      if(ch === '\n' || ch === '\r'){
        el.appendChild(document.createElement('br')); continue;
      }
      const span = document.createElement('span'); span.className = 'brand-char'; span.textContent = ch; el.appendChild(span);
    }
  })();

  // Build scatter canvas items
  const itemsById = {};
  function placeItems(){
    canvas.innerHTML = '';
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    let remaining = data.length;
    data.forEach((it, idx)=>{
      const a = document.createElement('a');
      a.className = 'photo';
      a.href = `object-detail.html?id=${encodeURIComponent(it.id)}`;
      a.dataset.id = it.id;
      // image
      const img = document.createElement('img');
      img.alt = it.name || '';
      // when image loads, compute aspect ratio and size, then position and append
      img.addEventListener('load', ()=>{
        try{
          const baseWidth = 240; // desired display width
          const ratio = (img.naturalHeight && img.naturalWidth) ? (img.naturalHeight / img.naturalWidth) : (160/220);
          const w = Math.min(baseWidth, Math.max(120, Math.round(baseWidth)));
          const h = Math.max(100, Math.round(w * ratio));
          a.style.width = w + 'px'; a.style.height = h + 'px';
          // random positions within canvas bounds (leave some margin)
          const pad = 60;
          const left = Math.floor(pad + Math.random() * Math.max(0, canvas.offsetWidth - pad*2 - w));
          const top = Math.floor(pad + Math.random() * Math.max(0, canvas.offsetHeight - pad*2 - h));
          a.style.left = left + 'px'; a.style.top = top + 'px';
          a.appendChild(img);
          canvas.appendChild(a);
          itemsById[it.id] = {el:a, data:it};
          if(io) io.observe(a);
        }catch(e){
          // fallback: append with default size
          a.style.width = '220px'; a.style.height = '160px';
          a.appendChild(img); canvas.appendChild(a); itemsById[it.id] = {el:a, data:it}; if(io) io.observe(a);
        }
        remaining--; if(remaining === 0){ scheduleBrandCheck(); centerCanvasView(); }
      });
      img.addEventListener('error', ()=>{
        // on error, still append placeholder
        a.style.width = '220px'; a.style.height = '160px';
        const ph = document.createElement('div'); ph.style.width='100%'; ph.style.height='100%'; ph.style.background='#ddd'; a.appendChild(ph); canvas.appendChild(a); itemsById[it.id] = {el:a, data:it}; if(io) io.observe(a);
        remaining--; if(remaining === 0){ scheduleBrandCheck(); centerCanvasView(); }
      });
      // start loading
      img.src = it.image_filename || (it.image && it.image[0] && it.image[0].src) || '';
      // click with View Transition API (attach now)
      a.addEventListener('click', (ev)=>{
        ev.preventDefault();
        const url = a.href;
        if(document.startViewTransition){
          document.startViewTransition(()=> { location.href = url; });
        } else {
          location.href = url;
        }
      });
    });
  }

  // Resize canvas dimensions to large area
  function resizeCanvas(){
    // make canvas at least 3x bigger than viewport to allow pan & scatter
    const pw = Math.max(window.innerWidth * 8);
    const ph = Math.max(window.innerHeight * 8);
    canvas.style.width = pw + 'px'; canvas.style.height = ph + 'px';
  }

  // center the scroll position so users can pan in all directions
  function centerCanvasView(){
    // scroll the wrapper so the canvas' center is visible in the wrapper
    try{
      const wrap = canvasWrap;
      // scrollLeft should be (canvas.scrollWidth - wrap.clientWidth)/2 but because
      // canvas is absolutely positioned, use offsetWidth/height
      const scrollLeft = (canvas.offsetWidth - wrap.clientWidth) / 2;
      const scrollTop = (canvas.offsetHeight - wrap.clientHeight) / 2;
      if(!Number.isNaN(scrollLeft)) wrap.scrollLeft = Math.max(0, scrollLeft);
      if(!Number.isNaN(scrollTop)) wrap.scrollTop = Math.max(0, scrollTop);
    }catch(e){/* ignore */}
  }

  // Intersection observer to scale items when in viewport
  let io = null;
  function setupObserver(){
    if(io) io.disconnect();
    io = new IntersectionObserver(entries=>{
      entries.forEach(ent=>{
        const el = ent.target;
        if(ent.isIntersecting){ el.classList.add('inview'); }
        else { el.classList.remove('inview'); }
      });
    },{root: canvasWrap, threshold: 0.45});

    document.querySelectorAll('.photo').forEach(p => io.observe(p));
  }

  // simple overlap check to toggle brand-char 'overlap' class
  function scheduleBrandCheck(){
    requestAnimationFrame(()=>{
      const chars = Array.from(document.querySelectorAll('.brand-char'));
      const imgs = Array.from(document.querySelectorAll('.photo.inview img'));
      const rects = imgs.map(i=> i.getBoundingClientRect());
      chars.forEach(ch=>{
        const r = ch.getBoundingClientRect();
        let overlapped = rects.some(rr => !(rr.left > r.right || rr.right < r.left || rr.top > r.bottom || rr.bottom < r.top));
        ch.classList.toggle('overlap', overlapped);
      });
    });
  }

  // search/filter logic
  function getFieldValues(item, kind){
    if(kind === 'name') return [ (item.name||'') ];
    if(kind === 'country') return (item.categories_country||[]).map(String);
    if(kind === 'type') return (item.categories_object_type||[]).map(String);
    if(kind === 'cause') return (item.categories_cause||[]).map(String);
    return [];
  }

  function buildTags(){
    // build unique tags from activeKinds
    const set = new Set();
    data.forEach(it=>{
      activeKinds.forEach(k=>{
        getFieldValues(it,k).forEach(v=>{ if(v) set.add(v); });
      });
    });
    tagsWrap.innerHTML = '';
    Array.from(set).sort().forEach(tag=>{
      const b = document.createElement('button'); b.className = 'tag-chip'; b.textContent = tag;
      b.addEventListener('click', ()=>{ searchInput.value = tag; triggerSearch(); });
      tagsWrap.appendChild(b);
    });
  }

  function highlightMatches(query){
    if(!query) return;
    // trivial -- not highlighting text inside images, only controls
  }

  function triggerSearch(){
    const q = (searchInput.value || '').trim().toLowerCase();
    if(!q){ // reset
      document.querySelectorAll('.photo').forEach(p=> p.classList.remove('dimmed'));
      clearBtn.style.display = 'none';
      listResults.style.display = 'none';
      return;
    }
    clearBtn.style.display = 'inline-block';
    // collect matches
    const matches = [];
    data.forEach(it=>{
      // if any activeKind has a value that includes q
      let ok = false;
      activeKinds.forEach(k=>{
        getFieldValues(it,k).forEach(v=>{ if(String(v).toLowerCase().includes(q)) ok = true; });
      });
      if(ok) matches.push(it);
    });

    if(searchMode === 'images'){
      // dim non-matches and bring first match into view
      document.querySelectorAll('.photo').forEach(p=> p.classList.add('dimmed'));
      if(matches.length > 0){
        matches.forEach(m => { const e = itemsById[m.id] && itemsById[m.id].el; if(e){ e.classList.remove('dimmed'); e.style.zIndex = 400; }});
        // scroll to first match
        const first = itemsById[matches[0].id].el;
        scrollElementToView(first);
      }
    } else {
      // list mode: render list of matches
      listResults.innerHTML = '';
      listResults.style.display = 'block';
      matches.forEach(it=>{
        const li = document.createElement('div'); li.className='list-item';
        const img = document.createElement('img'); img.src = it.image_filename || '';
        const a = document.createElement('a'); a.href = `object-detail.html?id=${encodeURIComponent(it.id)}`; a.textContent = it.name || 'Unnamed';
        a.addEventListener('click', (ev)=>{ ev.preventDefault(); const url = a.href; if(document.startViewTransition) document.startViewTransition(()=> location.href = url); else location.href = url; });
        const meta = document.createElement('div'); meta.appendChild(a);
        li.appendChild(img); li.appendChild(meta); listResults.appendChild(li);
      });
    }
  }

  function scrollElementToView(el){
    if(!el) return;
    const wrap = canvasWrap;
    const r = el.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    // compute center in canvas coordinate
    const left = (el.offsetLeft + el.offsetWidth/2) - wrap.clientWidth/2;
    const top = (el.offsetTop + el.offsetHeight/2) - wrap.clientHeight/2;
    wrap.scrollTo({left: Math.max(0, left), top: Math.max(0, top), behavior: 'smooth'});
  }

  // UI wiring
  function setView(v){ view = v;
    document.querySelectorAll('.nav-item').forEach(n=> n.classList.toggle('active', n.dataset.action === (v==='search'?'search':(v==='about'?'about':'explore'))));
    if(v === 'explore'){
      searchHeader.style.display = 'none';
      listResults.style.display = 'none';
      // show canvas big
      canvasWrap.style.display = 'block';
      // ensure about panel is closed
      closeAbout();
    } else if(v === 'search'){
      searchHeader.style.display = 'block';
      // show header + images by default
      if(searchMode === 'images') listResults.style.display = 'none';
      canvasWrap.style.display = 'block';
      buildTags();
      closeAbout();
    } else if(v === 'about'){
      openAbout();
    }
  }

  // About panel open/close helpers
  function openAbout(){ if(!aboutPanel) return; aboutPanel.classList.add('open'); aboutPanel.setAttribute('aria-hidden','false'); }
  function closeAbout(){ if(!aboutPanel) return; aboutPanel.classList.remove('open'); aboutPanel.setAttribute('aria-hidden','true'); }

  // toggles
  toggleImages.addEventListener('click', ()=>{ searchMode = 'images'; toggleImages.setAttribute('aria-pressed','true'); toggleList.setAttribute('aria-pressed','false'); listResults.style.display = 'none'; triggerSearch(); });
  toggleList.addEventListener('click', ()=>{ searchMode = 'list'; toggleImages.setAttribute('aria-pressed','false'); toggleList.setAttribute('aria-pressed','true'); triggerSearch(); });

  // filter buttons (Names/Countries/Types/Causes)
  document.querySelectorAll('.filter-btn').forEach(b=>{
    const kind = b.dataset.kind;
    b.addEventListener('click', ()=>{
      // toggle active state
      if(activeKinds.has(kind)){ activeKinds.delete(kind); b.style.opacity = 0.45; }
      else { activeKinds.add(kind); b.style.opacity = 1; }
      buildTags();
      triggerSearch();
    });
  });

  // search input
  let timer = null;
  searchInput.addEventListener('input', ()=>{ clearTimeout(timer); timer = setTimeout(()=> triggerSearch(), 200); });
  clearBtn.addEventListener('click', ()=>{ searchInput.value=''; clearBtn.style.display='none'; document.querySelectorAll('.photo').forEach(p=> p.classList.remove('dimmed')); listResults.style.display='none'; });

  // nav wiring
  nav.addEventListener('click', (e)=>{
    const a = e.target.closest('.nav-item'); if(!a) return; const action = a.dataset.action; if(action === 'explore'){ setView('explore'); aboutPanel.classList.remove('open'); aboutPanel.setAttribute('aria-hidden','true'); }
    else if(action === 'search'){ setView('search'); aboutPanel.classList.remove('open'); aboutPanel.setAttribute('aria-hidden','true'); const s = document.getElementById('search-input'); if(s) s.focus(); }
    else if(action === 'about'){ setView('about'); }
  });

  // wire about close button, backdrop click, and Escape key
  if(aboutClose){ aboutClose.addEventListener('click', (e)=>{ e.preventDefault(); closeAbout(); }); }
  if(aboutPanel){
    aboutPanel.addEventListener('click', (e)=>{ if(e.target === aboutPanel) closeAbout(); });
  }
  window.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeAbout(); });

  // initial render
  // initial render: prepare observer, then place items (placeItems will call center when all images loaded)
  resizeCanvas(); setupObserver(); placeItems();
  // watch resize (rebuild layout)
  window.addEventListener('resize', ()=>{ resizeCanvas(); /* re-place items for fresh layout */ placeItems(); });

  // small interval to update brand overlap when items change in-view
  setInterval(scheduleBrandCheck, 600);

  // expose for debug
  window.__welcomeNew = { data, itemsById };

})();
