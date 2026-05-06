/* ==================== ADMIN CIUDAD PALETA - LÓGICA ==================== */

async function sha256(text){
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

const DEFAULT_USER = 'ciudadpaleta';
const DEFAULT_PASS = 'ciudadpaleta2026';
const SESSION_HOURS = 2;

let DATA = null;
let ORIGINAL = null;
let dirty = false;
let editingIdx = -1;
let pendingImg = null;
let pendingImages = [];

// ==================== HELPERS ====================
function val(id){const el=document.getElementById(id);return el?el.value:'';}
function setVal(id,v){const el=document.getElementById(id);if(el)el.value=v||'';}
function esc(s){return String(s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;');}

// Asegurar que la estructura sea correcta (con defaults)
function normalize(d){
  d = d || {};
  d.site = d.site || {};
  d.hero = d.hero || {};
  d.stats = Array.isArray(d.stats) ? d.stats : [];
  d.sabores_section = d.sabores_section || {};
  d.sabores = Array.isArray(d.sabores) ? d.sabores : [];
  d.mayoreo = d.mayoreo || {};
  d.mayoreo.rangos = Array.isArray(d.mayoreo.rangos) ? d.mayoreo.rangos : [];
  d.ciudades = d.ciudades || {};
  d.ciudades.lista = Array.isArray(d.ciudades.lista) ? d.ciudades.lista : [];
  d.ciudades.lista.forEach(c => { if(!Array.isArray(c.puntos)) c.puntos = []; });
  d.porque = d.porque || {};
  d.porque.items = Array.isArray(d.porque.items) ? d.porque.items : [];
  d.contacto = d.contacto || {};
  return d;
}

// ==================== LOGIN ====================
window.addEventListener('DOMContentLoaded', async ()=>{
  if(!localStorage.getItem('cp_pass_hash')){
    localStorage.setItem('cp_pass_hash', await sha256(DEFAULT_PASS));
    localStorage.setItem('cp_user', DEFAULT_USER);
  }
  const session = localStorage.getItem('cp_session');
  if(session){
    try{
      const s = JSON.parse(session);
      if(s.exp > Date.now()){ showApp(); return; }
    }catch(e){}
  }
  document.getElementById('loginScreen').style.display = 'flex';
});

async function doLogin(e){
  e.preventDefault();
  const user = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  const block = JSON.parse(localStorage.getItem('cp_block') || 'null');
  if(block && block.until > Date.now()){
    const mins = Math.ceil((block.until - Date.now())/60000);
    errEl.textContent = `🔒 Bloqueado por ${mins} min.`;
    return false;
  }
  btn.disabled = true; btn.textContent = 'Verificando...';
  const passHash = await sha256(pass);
  if(user === localStorage.getItem('cp_user') && passHash === localStorage.getItem('cp_pass_hash')){
    localStorage.removeItem('cp_block');
    localStorage.setItem('cp_session', JSON.stringify({user, exp: Date.now() + SESSION_HOURS*3600*1000}));
    showApp();
  } else {
    const fails = (parseInt(localStorage.getItem('cp_fails')||'0')) + 1;
    localStorage.setItem('cp_fails', fails);
    if(fails >= 5){
      localStorage.setItem('cp_block', JSON.stringify({until: Date.now() + 15*60*1000}));
      localStorage.setItem('cp_fails', '0');
      errEl.textContent = '🔒 5 intentos fallidos. Bloqueado 15 min.';
    } else {
      errEl.textContent = `Usuario o contraseña incorrectos. Intentos restantes: ${5-fails}`;
    }
    btn.disabled = false; btn.textContent = 'Entrar';
  }
  return false;
}

function doLogout(){
  if(dirty && !confirm('Tienes cambios sin publicar. ¿Salir de todas formas?')) return;
  localStorage.removeItem('cp_session');
  location.reload();
}

async function showApp(){
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').classList.add('show');
  await loadData();
  setupNav();
  loadGhConfig();
}

// ==================== DATA ====================
async function loadData(){
  try {
    const r = await fetch('data.json?_=' + Date.now());
    ORIGINAL = normalize(await r.json());
  } catch(e){
    toast('Error cargando data.json', 'err');
    ORIGINAL = normalize({});
  }
  const local = localStorage.getItem('cp_data');
  if(local){
    try{
      DATA = normalize(JSON.parse(local));
      dirty = true;
      document.getElementById('dirtyIndicator').style.display = 'inline-flex';
    }catch(e){
      DATA = JSON.parse(JSON.stringify(ORIGINAL));
    }
  } else {
    DATA = JSON.parse(JSON.stringify(ORIGINAL));
  }
  pendingImages = JSON.parse(localStorage.getItem('cp_pending_imgs') || '[]');
  renderAll();
}

function markDirty(){
  syncFormToData();
  dirty = true;
  localStorage.setItem('cp_data', JSON.stringify(DATA));
  document.getElementById('dirtyIndicator').style.display = 'inline-flex';
}

function syncFormToData(){
  // Hero
  DATA.hero.title_main = val('heroMain');
  DATA.hero.title_accent = val('heroAccent');
  DATA.hero.subtitle = val('heroSub');
  DATA.hero.slogan = val('heroSlogan');
  DATA.hero.cta_primary = val('heroCta1');
  DATA.hero.cta_secondary = val('heroCta2');
  // Site
  DATA.site.whatsapp = val('ctWa');
  DATA.site.instagram = val('ctIg');
  DATA.site.facebook = val('ctFb');
  // Sabores section
  DATA.sabores_section.tag = val('sabSecTag');
  DATA.sabores_section.title = val('sabSecTitle');
  DATA.sabores_section.title_accent = val('sabSecAccent');
  DATA.sabores_section.subtitle = val('sabSecSub');
  // Mayoreo
  DATA.mayoreo.title = val('mayTitle');
  DATA.mayoreo.subtitle = val('maySub');
  DATA.mayoreo.nota = val('mayNote');
  DATA.mayoreo.cta = val('mayCta');
  // Ciudades section header
  DATA.ciudades.tag = val('ciuTag');
  DATA.ciudades.title = val('ciuTitle');
  DATA.ciudades.title_accent = val('ciuAccent');
  DATA.ciudades.subtitle = val('ciuSub');
  // Porque
  DATA.porque.tag = val('pqTag');
  DATA.porque.title = val('pqTitle');
  DATA.porque.title_accent = val('pqAccent');
  // Contacto
  DATA.contacto.title = val('coTitle');
  DATA.contacto.subtitle = val('coSub');
  DATA.contacto.cta = val('coCta');
}

// ==================== NAV ====================
function setupNav(){
  document.querySelectorAll('#sbNav a').forEach(a=>{
    a.addEventListener('click', e=>{
      e.preventDefault();
      const tab = a.dataset.tab;
      document.querySelectorAll('#sbNav a').forEach(x=>x.classList.remove('active'));
      a.classList.add('active');
      document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
      document.getElementById('sec-'+tab).classList.add('active');
      const titles = {sabores:'Sabores',hero:'Hero',textos:'Textos',ciudades:'Ciudades',contacto:'Contacto',ajustes:'Ajustes'};
      document.getElementById('topTitle').textContent = titles[tab];
    });
  });
}

// ==================== RENDER ====================
function renderAll(){
  renderSabores();
  renderHero();
  renderTextos();
  renderCiudades();
  renderContacto();
}

function renderSabores(){
  const search = (val('searchSabor')||'').toLowerCase();
  const cat = val('filterCat') || 'all';
  const list = DATA.sabores.filter(s=>{
    if(cat!=='all' && s.cat!==cat) return false;
    if(search && !(s.name||'').toLowerCase().includes(search) && !(s.desc||'').toLowerCase().includes(search)) return false;
    return true;
  });
  const html = list.map(s=>{
    const idx = DATA.sabores.indexOf(s);
    const tag = s.tag==='nuevo' ? '<span class="tag-pill nuevo">✨ NUEVO</span>' :
                s.tag==='temporada' ? '<span class="tag-pill temporada">⏳ TEMPORADA</span>' : '';
    const img = s.img ? `<img src="${s.img}" onerror="this.style.display='none'">` : '';
    return `<div class="sabor-row">
      <div class="sabor-thumb">${img}</div>
      <div class="sabor-info">
        <div class="nm">${esc(s.name)} <span class="cat-pill ${s.cat}">${s.cat}</span> ${tag}</div>
        <div class="ds">${esc(s.desc)}</div>
      </div>
      <div class="sabor-actions">
        <button class="icon-btn" onclick="openSaborModal(${idx})" title="Editar">✏️</button>
        <button class="icon-btn del" onclick="deleteSabor(${idx})" title="Eliminar">🗑️</button>
      </div>
    </div>`;
  }).join('');
  document.getElementById('saboresList').innerHTML = html || '<div style="text-align:center;padding:30px;color:var(--mute);">Sin resultados</div>';
}

function renderHero(){
  setVal('heroMain', DATA.hero.title_main);
  setVal('heroAccent', DATA.hero.title_accent);
  setVal('heroSub', DATA.hero.subtitle);
  setVal('heroSlogan', DATA.hero.slogan);
  setVal('heroCta1', DATA.hero.cta_primary);
  setVal('heroCta2', DATA.hero.cta_secondary);
  const html = DATA.stats.map((s,i)=>`
    <div class="field-row" style="margin-bottom:8px;">
      <div class="field" style="margin:0;"><label>Número ${i+1}</label><input type="number" value="${s.num}" onchange="DATA.stats[${i}].num=parseFloat(this.value);markDirty()"></div>
      <div class="field" style="margin:0;"><label>Sufijo (%, g)</label><input type="text" value="${esc(s.suffix||'')}" onchange="DATA.stats[${i}].suffix=this.value;markDirty()"></div>
      <div class="field" style="margin:0;grid-column:1/-1;"><label>Etiqueta</label><input type="text" value="${esc(s.label||'')}" onchange="DATA.stats[${i}].label=this.value;markDirty()"></div>
    </div>`).join('');
  const el = document.getElementById('statsList');
  if(el) el.innerHTML = html;
}

function renderTextos(){
  setVal('sabSecTag', DATA.sabores_section.tag);
  setVal('sabSecTitle', DATA.sabores_section.title);
  setVal('sabSecAccent', DATA.sabores_section.title_accent);
  setVal('sabSecSub', DATA.sabores_section.subtitle);

  setVal('mayTitle', DATA.mayoreo.title);
  setVal('maySub', DATA.mayoreo.subtitle);
  setVal('mayNote', DATA.mayoreo.nota);
  setVal('mayCta', DATA.mayoreo.cta);

  setVal('pqTag', DATA.porque.tag);
  setVal('pqTitle', DATA.porque.title);
  setVal('pqAccent', DATA.porque.title_accent);

  // Items "Por qué"
  const fHtml = DATA.porque.items.map((f,i)=>`
    <div class="list-item" style="margin-bottom:8px;">
      <input type="text" value="${esc(f.emoji||'')}" style="width:50px;text-align:center;font-size:1.3rem;border:1px solid var(--border);border-radius:8px;padding:6px;" onchange="DATA.porque.items[${i}].emoji=this.value;markDirty()">
      <div style="display:grid;gap:4px;">
        <input type="text" value="${esc(f.title||'')}" placeholder="Título" style="width:100%;border:1px solid var(--border);border-radius:6px;padding:6px;font-weight:700;font-size:.92rem;" onchange="DATA.porque.items[${i}].title=this.value;markDirty()">
        <input type="text" value="${esc(f.desc||'')}" placeholder="Descripción" style="width:100%;border:1px solid var(--border);border-radius:6px;padding:6px;font-size:.82rem;" onchange="DATA.porque.items[${i}].desc=this.value;markDirty()">
      </div>
      <button class="icon-btn del" onclick="DATA.porque.items.splice(${i},1);markDirty();renderTextos()">🗑️</button>
    </div>`).join('');
  const fEl = document.getElementById('featuresList');
  if(fEl) fEl.innerHTML = fHtml + `<button class="add-btn" onclick="DATA.porque.items.push({emoji:'⭐',title:'',desc:''});markDirty();renderTextos()">➕ Agregar feature</button>`;

  // Rangos de mayoreo
  const rHtml = DATA.mayoreo.rangos.map((r,i)=>`
    <div class="list-item" style="margin-bottom:8px;">
      <input type="text" value="${esc(r.emoji||'')}" style="width:50px;text-align:center;font-size:1.3rem;border:1px solid var(--border);border-radius:8px;padding:6px;" onchange="DATA.mayoreo.rangos[${i}].emoji=this.value;markDirty()">
      <div style="display:grid;grid-template-columns:80px 1fr;gap:6px;">
        <input type="text" value="${esc(r.num||'')}" placeholder="30+" style="border:1px solid var(--border);border-radius:6px;padding:6px;font-weight:700;" onchange="DATA.mayoreo.rangos[${i}].num=this.value;markDirty()">
        <input type="text" value="${esc(r.label||'')}" placeholder="Menudeo" style="border:1px solid var(--border);border-radius:6px;padding:6px;" onchange="DATA.mayoreo.rangos[${i}].label=this.value;markDirty()">
        <input type="text" value="${esc(r.desc||'')}" placeholder="desde 30 piezas" style="grid-column:1/-1;border:1px solid var(--border);border-radius:6px;padding:6px;font-size:.85rem;" onchange="DATA.mayoreo.rangos[${i}].desc=this.value;markDirty()">
      </div>
      <button class="icon-btn del" onclick="DATA.mayoreo.rangos.splice(${i},1);markDirty();renderTextos()">🗑️</button>
    </div>`).join('');
  const rEl = document.getElementById('rangosList');
  if(rEl) rEl.innerHTML = rHtml + `<button class="add-btn" onclick="DATA.mayoreo.rangos.push({emoji:'📦',num:'',label:'',desc:''});markDirty();renderTextos()">➕ Agregar rango</button>`;
}

function renderCiudades(){
  setVal('ciuTag', DATA.ciudades.tag);
  setVal('ciuTitle', DATA.ciudades.title);
  setVal('ciuAccent', DATA.ciudades.title_accent);
  setVal('ciuSub', DATA.ciudades.subtitle);

  const html = DATA.ciudades.lista.map((c,i)=>{
    if(!Array.isArray(c.puntos)) c.puntos = [];
    const puntosHtml = c.puntos.map((p,j)=>`
      <div style="display:grid;grid-template-columns:70px 1fr auto;gap:8px;align-items:center;background:#fff;border:1px solid var(--border);border-radius:10px;padding:8px;margin-bottom:6px;">
        <div style="width:64px;height:64px;border-radius:8px;background:#f1f5f9 center/cover no-repeat;${(p._preview||p.img)?`background-image:url('${esc(p._preview||p.img)}');`:''}display:flex;align-items:center;justify-content:center;font-size:1.6rem;color:#94a3b8;cursor:pointer;" onclick="document.getElementById('puntoImgFile_${i}_${j}').click()" title="Cambiar foto">${(p._preview||p.img)?'':'📷'}</div>
        <input type="file" id="puntoImgFile_${i}_${j}" accept="image/*" style="display:none" onchange="handlePuntoImg(event,${i},${j})">
        <div style="display:grid;gap:4px;">
          <input type="text" value="${esc(p.name||'')}" placeholder="Nombre del lugar" style="border:1px solid var(--border);border-radius:6px;padding:6px;font-weight:700;font-size:.9rem;" onchange="DATA.ciudades.lista[${i}].puntos[${j}].name=this.value;markDirty()">
          <input type="text" value="${esc(p.address||'')}" placeholder="Dirección" style="border:1px solid var(--border);border-radius:6px;padding:6px;font-size:.82rem;" onchange="DATA.ciudades.lista[${i}].puntos[${j}].address=this.value;markDirty()">
          <input type="text" value="${esc(p.whatsapp||'')}" placeholder="WhatsApp (522241250998)" style="border:1px solid var(--border);border-radius:6px;padding:6px;font-size:.82rem;" onchange="DATA.ciudades.lista[${i}].puntos[${j}].whatsapp=this.value;markDirty()">
        </div>
        <button class="icon-btn del" onclick="DATA.ciudades.lista[${i}].puntos.splice(${j},1);markDirty();renderCiudades()" title="Eliminar punto">🗑️</button>
      </div>`).join('');
    return `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:14px;">
      <div class="list-item" style="margin-bottom:10px;">
        <input type="text" value="${esc(c.emoji||'')}" style="width:50px;text-align:center;font-size:1.3rem;border:1px solid var(--border);border-radius:8px;padding:6px;" onchange="DATA.ciudades.lista[${i}].emoji=this.value;markDirty()">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <input type="text" value="${esc(c.name||'')}" placeholder="Puebla" style="border:1px solid var(--border);border-radius:6px;padding:8px;font-weight:700;" onchange="DATA.ciudades.lista[${i}].name=this.value;markDirty()">
          <input type="text" value="${esc(c.desc||'')}" placeholder="Plaza activa" style="border:1px solid var(--border);border-radius:6px;padding:8px;" onchange="DATA.ciudades.lista[${i}].desc=this.value;markDirty()">
        </div>
        <button class="icon-btn del" onclick="if(confirm('¿Eliminar ciudad y sus puntos?'))(DATA.ciudades.lista.splice(${i},1),markDirty(),renderCiudades())">🗑️</button>
      </div>
      <div style="font-size:.85rem;font-weight:700;color:var(--mute);margin:10px 0 6px;">📍 Puntos de venta (${c.puntos.length})</div>
      ${puntosHtml || '<div style="text-align:center;padding:14px;color:var(--mute);font-size:.85rem;background:#fff;border-radius:10px;border:1px dashed var(--border);">Sin puntos de venta. Agrega uno abajo 👇</div>'}
      <button class="add-btn" style="margin-top:8px;width:100%;" onclick="addPunto(${i})">➕ Agregar punto de venta</button>
    </div>`;
  }).join('');
  const el = document.getElementById('ciudadesList');
  if(el) el.innerHTML = html;
}

function addCiudad(){
  DATA.ciudades.lista.push({emoji:'📍',name:'',desc:'',puntos:[]});
  markDirty();
  renderCiudades();
}

function addPunto(i){
  if(!Array.isArray(DATA.ciudades.lista[i].puntos)) DATA.ciudades.lista[i].puntos = [];
  DATA.ciudades.lista[i].puntos.push({name:'',address:'',whatsapp:'',img:''});
  markDirty();
  renderCiudades();
}

async function handlePuntoImg(e, i, j){
  const file = e.target.files[0];
  if(!file) return;
  toast('Comprimiendo imagen...', 'info');
  const compressed = await compressImage(file);
  const slug = slugify((DATA.ciudades.lista[i].puntos[j].name || 'punto') + '-' + (DATA.ciudades.lista[i].name || 'ciudad'));
  const filename = `assets/puntos/${slug}-${Date.now()}.jpg`;
  const base64 = compressed.dataUrl.split(',')[1];
  pendingImages.push({path: filename, base64});
  localStorage.setItem('cp_pending_imgs', JSON.stringify(pendingImages));
  DATA.ciudades.lista[i].puntos[j].img = filename;
  // Mostrar preview inmediato (data URL para que se vea sin publicar aún)
  DATA.ciudades.lista[i].puntos[j]._preview = compressed.dataUrl;
  markDirty();
  renderCiudades();
  toast(`Imagen lista (${(compressed.blob.size/1024).toFixed(0)} KB)`, 'ok');
}

function renderContacto(){
  setVal('ctWa', DATA.site.whatsapp);
  setVal('ctIg', DATA.site.instagram);
  setVal('ctFb', DATA.site.facebook);
  setVal('coTitle', DATA.contacto.title);
  setVal('coSub', DATA.contacto.subtitle);
  setVal('coCta', DATA.contacto.cta);
}

// ==================== SABOR MODAL ====================
function openSaborModal(idx){
  editingIdx = (idx===undefined||idx===null) ? -1 : idx;
  pendingImg = null;
  document.getElementById('modalTitle').textContent = editingIdx===-1 ? 'Nuevo sabor' : 'Editar sabor';
  if(editingIdx>=0){
    const s = DATA.sabores[editingIdx];
    setVal('modName', s.name); setVal('modDesc', s.desc); setVal('modCat', s.cat);
    setVal('modTag', s.tag||''); setVal('modColor', s.color||'#db2777');
    showImgPreview(s.img || null);
  } else {
    setVal('modName',''); setVal('modDesc',''); setVal('modCat','gourmet');
    setVal('modTag',''); setVal('modColor','#db2777');
    showImgPreview(null);
  }
  document.getElementById('saborModal').classList.add('show');
}
function closeSaborModal(){document.getElementById('saborModal').classList.remove('show');}

function showImgPreview(src){
  const wrap = document.getElementById('imgPreviewWrap');
  if(src){
    wrap.innerHTML = `<img src="${src}"><div class="txt"><strong>Cambiar foto</strong></div>`;
  } else {
    wrap.innerHTML = `<div class="ph">📸</div><div class="txt"><strong>Clic para subir foto</strong> o arrastra aquí<br><span style="font-size:.75rem;">JPG/PNG · se comprime automático</span></div>`;
  }
}

async function handleImgFile(e){
  const file = e.target.files[0];
  if(!file) return;
  toast('Comprimiendo imagen...', 'info');
  const compressed = await compressImage(file);
  pendingImg = compressed;
  showImgPreview(compressed.dataUrl);
  toast(`Imagen lista (${(compressed.blob.size/1024).toFixed(0)} KB)`, 'ok');
}

async function compressImage(file){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    const reader = new FileReader();
    reader.onload = ev => img.src = ev.target.result;
    img.onload = ()=>{
      const maxW = 800, maxH = 1000;
      let w = img.width, h = img.height;
      if(w>maxW){h=h*maxW/w;w=maxW;}
      if(h>maxH){w=w*maxH/h;h=maxH;}
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0,0, w, h);
      c.toBlob(blob=>{
        const fr = new FileReader();
        fr.onload = ()=> resolve({blob, dataUrl: fr.result});
        fr.readAsDataURL(blob);
      }, 'image/jpeg', 0.82);
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function slugify(s){
  return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

async function saveSabor(){
  const sabor = {
    name: val('modName').trim(),
    desc: val('modDesc').trim(),
    cat: val('modCat'),
    tag: val('modTag'),
    color: val('modColor') || '#db2777',
    img: editingIdx>=0 ? (DATA.sabores[editingIdx].img||'') : ''
  };
  if(!sabor.name){toast('Falta el nombre','err');return;}
  if(!sabor.desc){toast('Falta la descripción','err');return;}
  if(pendingImg){
    const slug = slugify(sabor.name);
    const filename = `assets/sabores/${slug}-${Date.now()}.jpg`;
    sabor.img = filename;
    const base64 = pendingImg.dataUrl.split(',')[1];
    pendingImages.push({path: filename, base64});
    localStorage.setItem('cp_pending_imgs', JSON.stringify(pendingImages));
  }
  if(editingIdx>=0) DATA.sabores[editingIdx] = sabor;
  else DATA.sabores.push(sabor);
  markDirty();
  renderSabores();
  closeSaborModal();
  toast('Sabor guardado (no publicado aún)', 'ok');
}

function deleteSabor(idx){
  if(!confirm(`¿Eliminar "${DATA.sabores[idx].name}"?`)) return;
  DATA.sabores.splice(idx, 1);
  markDirty();
  renderSabores();
}

// ==================== GITHUB ====================
function loadGhConfig(){
  setVal('ghToken', localStorage.getItem('cp_gh_token')||'');
  setVal('ghUser',  localStorage.getItem('cp_gh_user')||'');
  setVal('ghRepo',  localStorage.getItem('cp_gh_repo')||'');
  setVal('ghBranch',localStorage.getItem('cp_gh_branch')||'main');
}
function saveToken(){
  localStorage.setItem('cp_gh_token',  val('ghToken'));
  localStorage.setItem('cp_gh_user',   val('ghUser'));
  localStorage.setItem('cp_gh_repo',   val('ghRepo'));
  localStorage.setItem('cp_gh_branch', val('ghBranch')||'main');
}

async function ghApi(path, opts={}){
  const token = localStorage.getItem('cp_gh_token');
  const user  = localStorage.getItem('cp_gh_user');
  const repo  = localStorage.getItem('cp_gh_repo');
  if(!token||!user||!repo) throw new Error('Falta config en Ajustes (token/usuario/repo)');
  const r = await fetch(`https://api.github.com/repos/${user}/${repo}${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(opts.headers||{})
    }
  });
  if(!r.ok){
    const t = await r.text();
    throw new Error(`GitHub ${r.status}: ${t.slice(0,150)}`);
  }
  return r.status===204 ? null : r.json();
}

async function testGitHub(){
  toast('Probando conexión...', 'info');
  try {
    const data = await ghApi('');
    toast(`✅ Conectado a ${data.full_name}`, 'ok');
  } catch(e){
    toast(`❌ ${e.message}`, 'err');
  }
}

// ==================== PUBLICAR ====================
function openPublish(){
  if(!dirty){toast('No hay cambios pendientes','info');return;}
  syncFormToData();
  const stats = [];
  const oCount = (ORIGINAL.sabores||[]).length;
  const nCount = DATA.sabores.length;
  if(oCount!==nCount) stats.push(`Sabores: ${oCount} → ${nCount}`);
  if(pendingImages.length) stats.push(`Imágenes nuevas: ${pendingImages.length}`);
  stats.push('Configuración general actualizada');
  document.getElementById('publishStats').innerHTML = stats.map(s=>'• '+s).join('<br>');
  document.getElementById('commitMsg').value = '';
  document.getElementById('publishModal').classList.add('show');
}
function closePublish(){document.getElementById('publishModal').classList.remove('show');}

async function doPublish(){
  const body = document.getElementById('publishBody');
  const foot = document.getElementById('pubFoot');
  document.getElementById('pubCloseBtn').style.display = 'none';
  foot.style.display = 'none';
  const msg = (val('commitMsg')||`Actualización ${new Date().toLocaleDateString('es-MX')}`).trim();
  body.innerHTML = '<div class="publish-progress" id="pubSteps"></div>';
  const stepsEl = document.getElementById('pubSteps');
  const steps = [];
  function addStep(t){steps.push({t,status:'active'});render();}
  function done(){steps[steps.length-1].status='done';render();}
  function err(m){steps[steps.length-1].status='err';steps[steps.length-1].t+=' — '+m;render();}
  function render(){
    stepsEl.innerHTML = steps.map((s,i)=>{
      const ic = s.status==='done'?'✓':s.status==='err'?'✕':i+1;
      return `<div class="publish-step ${s.status}"><div class="icn">${ic}</div>${s.t}</div>`;
    }).join('');
  }
  try {
    if(pendingImages.length){
      addStep(`Subiendo ${pendingImages.length} imagen(es)...`);
      for(const img of pendingImages){
        await ghPutFile(img.path, img.base64, msg+' (img)');
      }
      done();
    }
    addStep('Subiendo data.json...');
    // Limpiar campos auxiliares antes de publicar
    const cleanData = JSON.parse(JSON.stringify(DATA));
    if(cleanData.ciudades && Array.isArray(cleanData.ciudades.lista)){
      cleanData.ciudades.lista.forEach(c => {
        if(Array.isArray(c.puntos)) c.puntos.forEach(p => { delete p._preview; });
      });
    }
    const dataJson = JSON.stringify(cleanData, null, 2);
    const dataB64 = btoa(unescape(encodeURIComponent(dataJson)));
    await ghPutFile('data.json', dataB64, msg);
    done();
    addStep('GitHub Pages publicará en ~1-2 min');
    done();
    localStorage.removeItem('cp_data');
    localStorage.removeItem('cp_pending_imgs');
    pendingImages = [];
    dirty = false;
    document.getElementById('dirtyIndicator').style.display = 'none';
    foot.innerHTML = '<button class="btn btn-success" onclick="closePublish();location.reload()">✓ Listo</button>';
    foot.style.display = 'flex';
    document.getElementById('pubCloseBtn').style.display = 'block';
    toast('🎉 Publicado correctamente', 'ok');
  } catch(e){
    err(e.message);
    foot.innerHTML = '<button class="btn btn-ghost" onclick="closePublish()">Cerrar</button>';
    foot.style.display = 'flex';
    document.getElementById('pubCloseBtn').style.display = 'block';
  }
}

async function ghPutFile(path, contentB64, message){
  const branch = localStorage.getItem('cp_gh_branch')||'main';
  let sha;
  try {
    const existing = await ghApi(`/contents/${path}?ref=${branch}`);
    sha = existing.sha;
  } catch(e){}
  return ghApi(`/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({message, content: contentB64, branch, sha})
  });
}

// ==================== PASSWORD ====================
async function changePassword(){
  const old = val('pwOld'), n = val('pwNew'), n2 = val('pwNew2');
  if(n!==n2){toast('Las nuevas contraseñas no coinciden','err');return;}
  if(n.length<8){toast('Mínimo 8 caracteres','err');return;}
  const oldHash = await sha256(old);
  if(oldHash !== localStorage.getItem('cp_pass_hash')){toast('Contraseña actual incorrecta','err');return;}
  localStorage.setItem('cp_pass_hash', await sha256(n));
  setVal('pwOld',''); setVal('pwNew',''); setVal('pwNew2','');
  toast('✅ Contraseña actualizada', 'ok');
}

function resetLocal(){
  if(!confirm('¿Descartar TODOS los cambios locales? Esto NO afecta el sitio publicado.')) return;
  localStorage.removeItem('cp_data');
  localStorage.removeItem('cp_pending_imgs');
  location.reload();
}
function downloadBackup(){
  syncFormToData();
  const blob = new Blob([JSON.stringify(DATA,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ciudadpaleta-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

let toastTO;
function toast(msg, type='info'){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show '+type;
  clearTimeout(toastTO);
  toastTO = setTimeout(()=>el.classList.remove('show'), 3200);
}

document.addEventListener('DOMContentLoaded', ()=>{
  const drop = document.getElementById('imgDrop');
  if(!drop) return;
  drop.addEventListener('dragover', e=>{e.preventDefault();drop.classList.add('drag');});
  drop.addEventListener('dragleave', ()=>drop.classList.remove('drag'));
  drop.addEventListener('drop', async e=>{
    e.preventDefault();
    drop.classList.remove('drag');
    const file = e.dataTransfer.files[0];
    if(file && file.type.startsWith('image/')){
      const inp = document.getElementById('imgFile');
      const dt = new DataTransfer();
      dt.items.add(file);
      inp.files = dt.files;
      handleImgFile({target:inp});
    }
  });
});

window.addEventListener('beforeunload', e=>{
  if(dirty){e.preventDefault();e.returnValue='';}
});
