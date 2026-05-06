/* ==================== ADMIN CIUDAD PALETA - LÓGICA ==================== */

// ---- HASH SHA-256 (para contraseña) ----
async function sha256(text){
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

// ---- CONFIG INICIAL (contraseña por defecto: ciudadpaleta2026) ----
// Hash de "ciudadpaleta2026"
const DEFAULT_PASS_HASH = '8e7b4c1f9d0e2a3f5c6b7a8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f';
const DEFAULT_USER = 'ciudadpaleta';
const SESSION_HOURS = 2;

// ---- ESTADO GLOBAL ----
let DATA = null;       // copia editable
let ORIGINAL = null;   // copia desde data.json para detectar cambios
let dirty = false;
let editingIdx = -1;   // índice del sabor en edición (-1 = nuevo)
let pendingImg = null; // {filename, blob, dataUrl}
let pendingImages = []; // imágenes pendientes de subir al publicar

// ==================== LOGIN ====================
window.addEventListener('DOMContentLoaded', async ()=>{
  // Setup user/pass si no existe
  if(!localStorage.getItem('cp_pass_hash')){
    localStorage.setItem('cp_pass_hash', await sha256('ciudadpaleta2026'));
    localStorage.setItem('cp_user', DEFAULT_USER);
  }
  // Check sesión activa
  const session = localStorage.getItem('cp_session');
  if(session){
    const s = JSON.parse(session);
    if(s.exp > Date.now()){
      showApp();
      return;
    }
  }
  document.getElementById('loginScreen').style.display = 'flex';
});

async function doLogin(e){
  e.preventDefault();
  const user = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  // Bloqueo por intentos fallidos
  const block = JSON.parse(localStorage.getItem('cp_block') || 'null');
  if(block && block.until > Date.now()){
    const mins = Math.ceil((block.until - Date.now())/60000);
    errEl.textContent = `🔒 Bloqueado por ${mins} min (demasiados intentos).`;
    return false;
  }

  btn.disabled = true; btn.textContent = 'Verificando...';
  const passHash = await sha256(pass);
  const savedHash = localStorage.getItem('cp_pass_hash');
  const savedUser = localStorage.getItem('cp_user');

  if(user === savedUser && passHash === savedHash){
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
  // 1) Cargar desde localStorage si hay cambios pendientes
  const local = localStorage.getItem('cp_data');
  // 2) Cargar el data.json publicado para tener referencia
  try {
    const r = await fetch('data.json?_=' + Date.now());
    ORIGINAL = await r.json();
  } catch(e){
    toast('Error cargando data.json', 'err');
    ORIGINAL = {sabores:[],hero:{},stats:[],site:{},ciudades:[],features:[],rangos:[],quienes:{},mayoreo:{},sabores_section:{}};
  }
  if(local){
    DATA = JSON.parse(local);
    dirty = true;
    document.getElementById('dirtyIndicator').style.display = 'inline-flex';
  } else {
    DATA = JSON.parse(JSON.stringify(ORIGINAL));
  }
  // Asegurar arrays
  DATA.sabores = DATA.sabores || [];
  DATA.stats = DATA.stats || [];
  DATA.ciudades = DATA.ciudades || [];
  DATA.features = DATA.features || [];
  DATA.rangos = DATA.rangos || [];

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
  if(DATA.hero){
    DATA.hero.title_main = val('heroMain');
    DATA.hero.title_accent = val('heroAccent');
    DATA.hero.subtitle = val('heroSub');
    DATA.hero.slogan = val('heroSlogan');
    DATA.hero.cta_primary = val('heroCta1');
    DATA.hero.cta_secondary = val('heroCta2');
  }
  // Site
  if(DATA.site){
    DATA.site.whatsapp = val('ctWa');
    DATA.site.instagram = val('ctIg');
    DATA.site.facebook = val('ctFb');
  }
  // Sabores section
  if(DATA.sabores_section){
    DATA.sabores_section.tag = val('sabSecTag');
    DATA.sabores_section.title = val('sabSecTitle');
    DATA.sabores_section.title_accent = val('sabSecAccent');
    DATA.sabores_section.subtitle = val('sabSecSub');
  }
  // Mayoreo
  if(DATA.mayoreo){
    DATA.mayoreo.tag = val('mayTag');
    DATA.mayoreo.title = val('mayTitle');
    DATA.mayoreo.title_accent = val('mayAccent');
    DATA.mayoreo.subtitle = val('maySub');
    DATA.mayoreo.note = val('mayNote');
  }
  // Quienes somos
  if(DATA.quienes){
    DATA.quienes.tag = val('qsTag');
    DATA.quienes.title = val('qsTitle');
    DATA.quienes.title_accent = val('qsAccent');
    DATA.quienes.p1 = val('qsP1');
    DATA.quienes.p2 = val('qsP2');
  }
}
function val(id){const el=document.getElementById(id);return el?el.value:'';}

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
    if(search && !s.name.toLowerCase().includes(search) && !s.desc.toLowerCase().includes(search)) return false;
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
        <div class="nm">${s.name} <span class="cat-pill ${s.cat}">${s.cat}</span> ${tag}</div>
        <div class="ds">${s.desc}</div>
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
  if(!DATA.hero) return;
  setVal('heroMain', DATA.hero.title_main);
  setVal('heroAccent', DATA.hero.title_accent);
  setVal('heroSub', DATA.hero.subtitle);
  setVal('heroSlogan', DATA.hero.slogan);
  setVal('heroCta1', DATA.hero.cta_primary);
  setVal('heroCta2', DATA.hero.cta_secondary);

  const html = (DATA.stats||[]).map((s,i)=>`
    <div class="field-row" style="margin-bottom:8px;">
      <div class="field" style="margin:0;"><label>Número ${i+1}</label><input type="number" value="${s.num}" onchange="DATA.stats[${i}].num=parseFloat(this.value);markDirty()"></div>
      <div class="field" style="margin:0;"><label>Sufijo (%, g, etc)</label><input type="text" value="${s.suffix||''}" onchange="DATA.stats[${i}].suffix=this.value;markDirty()"></div>
      <div class="field" style="margin:0;grid-column:1/-1;"><label>Etiqueta</label><input type="text" value="${s.label||''}" onchange="DATA.stats[${i}].label=this.value;markDirty()"></div>
    </div>`).join('');
  document.getElementById('statsList').innerHTML = html;
}

function renderTextos(){
  if(DATA.sabores_section){
    setVal('sabSecTag', DATA.sabores_section.tag);
    setVal('sabSecTitle', DATA.sabores_section.title);
    setVal('sabSecAccent', DATA.sabores_section.title_accent);
    setVal('sabSecSub', DATA.sabores_section.subtitle);
  }
  if(DATA.mayoreo){
    setVal('mayTag', DATA.mayoreo.tag);
    setVal('mayTitle', DATA.mayoreo.title);
    setVal('mayAccent', DATA.mayoreo.title_accent);
    setVal('maySub', DATA.mayoreo.subtitle);
    setVal('mayNote', DATA.mayoreo.note);
  }
  if(DATA.quienes){
    setVal('qsTag', DATA.quienes.tag);
    setVal('qsTitle', DATA.quienes.title);
    setVal('qsAccent', DATA.quienes.title_accent);
    setVal('qsP1', DATA.quienes.p1);
    setVal('qsP2', DATA.quienes.p2);
  }
  // Features
  const fHtml = (DATA.features||[]).map((f,i)=>`
    <div class="list-item" style="margin-bottom:8px;">
      <input type="text" value="${f.icon||''}" style="width:50px;text-align:center;font-size:1.3rem;border:1px solid var(--border);border-radius:8px;padding:6px;" onchange="DATA.features[${i}].icon=this.value;markDirty()">
      <div>
        <input type="text" value="${(f.title||'').replace(/"/g,'&quot;')}" placeholder="Título" style="width:100%;border:none;font-weight:700;font-size:.92rem;" onchange="DATA.features[${i}].title=this.value;markDirty()">
        <input type="text" value="${(f.desc||'').replace(/"/g,'&quot;')}" placeholder="Descripción" style="width:100%;border:none;font-size:.78rem;color:var(--mute);" onchange="DATA.features[${i}].desc=this.value;markDirty()">
      </div>
      <button class="icon-btn del" onclick="DATA.features.splice(${i},1);markDirty();renderTextos()">🗑️</button>
    </div>`).join('');
  document.getElementById('featuresList').innerHTML = fHtml + `<button class="add-btn" onclick="DATA.features.push({icon:'⭐',title:'',desc:''});markDirty();renderTextos()">➕ Agregar feature</button>`;

  // Rangos
  const rHtml = (DATA.rangos||[]).map((r,i)=>`
    <div class="list-item" style="margin-bottom:8px;">
      <input type="text" value="${r.icon||''}" style="width:50px;text-align:center;font-size:1.3rem;border:1px solid var(--border);border-radius:8px;padding:6px;" onchange="DATA.rangos[${i}].icon=this.value;markDirty()">
      <div class="field-row" style="gap:8px;">
        <input type="text" value="${(r.cantidad||'').replace(/"/g,'&quot;')}" placeholder="30+" style="border:1px solid var(--border);border-radius:8px;padding:6px;font-weight:700;" onchange="DATA.rangos[${i}].cantidad=this.value;markDirty()">
        <input type="text" value="${(r.label||'').replace(/"/g,'&quot;')}" placeholder="Menudeo" style="border:1px solid var(--border);border-radius:8px;padding:6px;" onchange="DATA.rangos[${i}].label=this.value;markDirty()">
        <input type="text" value="${(r.desc||'').replace(/"/g,'&quot;')}" placeholder="desde $11/pza" style="border:1px solid var(--border);border-radius:8px;padding:6px;grid-column:1/-1;" onchange="DATA.rangos[${i}].desc=this.value;markDirty()">
      </div>
      <button class="icon-btn del" onclick="DATA.rangos.splice(${i},1);markDirty();renderTextos()">🗑️</button>
    </div>`).join('');
  document.getElementById('rangosList').innerHTML = rHtml + `<button class="add-btn" onclick="DATA.rangos.push({icon:'📦',cantidad:'',label:'',desc:''});markDirty();renderTextos()">➕ Agregar rango</button>`;
}

function renderCiudades(){
  const html = (DATA.ciudades||[]).map((c,i)=>`
    <div class="list-item" style="margin-bottom:8px;">
      <span class="em">📍</span>
      <div class="field-row" style="gap:8px;">
        <input type="text" value="${(c.nombre||'').replace(/"/g,'&quot;')}" placeholder="Atlixco" style="border:1px solid var(--border);border-radius:8px;padding:8px;font-weight:700;" onchange="DATA.ciudades[${i}].nombre=this.value;markDirty()">
        <input type="text" value="${(c.estado||'').replace(/"/g,'&quot;')}" placeholder="Puebla" style="border:1px solid var(--border);border-radius:8px;padding:8px;" onchange="DATA.ciudades[${i}].estado=this.value;markDirty()">
      </div>
      <button class="icon-btn del" onclick="DATA.ciudades.splice(${i},1);markDirty();renderCiudades()">🗑️</button>
    </div>`).join('');
  document.getElementById('ciudadesList').innerHTML = html;
}

function addCiudad(){
  DATA.ciudades.push({nombre:'',estado:''});
  markDirty();
  renderCiudades();
}

function renderContacto(){
  if(!DATA.site) return;
  setVal('ctWa', DATA.site.whatsapp);
  setVal('ctIg', DATA.site.instagram);
  setVal('ctFb', DATA.site.facebook);
}

function setVal(id,v){const el=document.getElementById(id);if(el)el.value=v||'';}

// ==================== SABOR MODAL ====================
function openSaborModal(idx){
  editingIdx = (idx===undefined||idx===null) ? -1 : idx;
  pendingImg = null;
  document.getElementById('modalTitle').textContent = editingIdx===-1 ? 'Nuevo sabor' : 'Editar sabor';
  if(editingIdx>=0){
    const s = DATA.sabores[editingIdx];
    setVal('modName', s.name);
    setVal('modDesc', s.desc);
    setVal('modCat', s.cat);
    setVal('modTag', s.tag||'');
    setVal('modColor', s.color||'#db2777');
    showImgPreview(s.img || null);
  } else {
    setVal('modName',''); setVal('modDesc',''); setVal('modCat','gourmet'); setVal('modTag',''); setVal('modColor','#db2777');
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
      let {width:w, height:h} = img;
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

  // Si hay imagen pendiente, generar nombre y guardar para subir luego
  if(pendingImg){
    const slug = slugify(sabor.name);
    const filename = `assets/sabores/${slug}-${Date.now()}.jpg`;
    sabor.img = filename;
    // Convertir blob a base64 para guardar en localStorage
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
    throw new Error(`GitHub ${r.status}: ${t}`);
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
  function done(i){steps[i].status='done';render();}
  function err(i,m){steps[i].status='err';steps[i].t+=' — '+m;render();}
  function render(){
    stepsEl.innerHTML = steps.map(s=>{
      const ic = s.status==='done'?'✓':s.status==='err'?'✕':steps.indexOf(s)+1;
      return `<div class="publish-step ${s.status}"><div class="icn">${ic}</div>${s.t}</div>`;
    }).join('');
  }

  try {
    // 1) Subir imágenes pendientes
    if(pendingImages.length){
      addStep(`Subiendo ${pendingImages.length} imagen(es)...`);
      for(const img of pendingImages){
        await ghPutFile(img.path, img.base64, msg+' (img)', true);
      }
      done(steps.length-1);
    }

    // 2) Subir data.json
    addStep('Subiendo data.json...');
    const dataJson = JSON.stringify(DATA, null, 2);
    const dataB64 = btoa(unescape(encodeURIComponent(dataJson)));
    await ghPutFile('data.json', dataB64, msg);
    done(steps.length-1);

    // 3) Esperar a deploy
    addStep('GitHub Pages publicará en ~1-2 min');
    done(steps.length-1);

    // Limpiar estado dirty
    localStorage.removeItem('cp_data');
    localStorage.removeItem('cp_pending_imgs');
    pendingImages = [];
    dirty = false;
    document.getElementById('dirtyIndicator').style.display = 'none';

    // Botón cerrar
    foot.innerHTML = '<button class="btn btn-success" onclick="closePublish();location.reload()">✓ Listo</button>';
    foot.style.display = 'flex';
    document.getElementById('pubCloseBtn').style.display = 'block';

    toast('🎉 Publicado correctamente', 'ok');
  } catch(e){
    err(steps.length-1, e.message);
    foot.innerHTML = '<button class="btn btn-ghost" onclick="closePublish()">Cerrar</button><button class="btn btn-primary" onclick="closePublish();openPublish()">🔄 Reintentar</button>';
    foot.style.display = 'flex';
    document.getElementById('pubCloseBtn').style.display = 'block';
  }
}

async function ghPutFile(path, contentB64, message, isBinary){
  const branch = localStorage.getItem('cp_gh_branch')||'main';
  // Get SHA si existe
  let sha;
  try {
    const existing = await ghApi(`/contents/${encodeURIComponent(path).replace(/%2F/g,'/')}?ref=${branch}`);
    sha = existing.sha;
  } catch(e){/* no existe, ok */}

  return ghApi(`/contents/${encodeURIComponent(path).replace(/%2F/g,'/')}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: contentB64,
      branch,
      sha
    })
  });
}

// ==================== PASSWORD ====================
async function changePassword(){
  const old = val('pwOld'), n = val('pwNew'), n2 = val('pwNew2');
  if(n!==n2){toast('Las nuevas contraseñas no coinciden','err');return;}
  if(n.length<8){toast('Mínimo 8 caracteres','err');return;}
  const oldHash = await sha256(old);
  if(oldHash !== localStorage.getItem('cp_pass_hash')){toast('Contraseña actual incorrecta','err');return;}
  const newHash = await sha256(n);
  localStorage.setItem('cp_pass_hash', newHash);
  setVal('pwOld',''); setVal('pwNew',''); setVal('pwNew2','');
  toast('✅ Contraseña actualizada', 'ok');
}

// ==================== ACCIONES ====================
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

// ==================== TOAST ====================
let toastTO;
function toast(msg, type='info'){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show '+type;
  clearTimeout(toastTO);
  toastTO = setTimeout(()=>el.classList.remove('show'), 3200);
}

// ==================== DRAG & DROP ====================
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

// Aviso al cerrar con cambios
window.addEventListener('beforeunload', e=>{
  if(dirty){e.preventDefault();e.returnValue='';}
});
