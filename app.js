import {CSV_HEADERS, SIZES, DEFAULT_SETTINGS, newListing, newWorkspace, normalizeWorkspace, isStarted, assignSize, createCsv, validateExport, listPhotoUrls} from './core.mjs';

const $ = id => document.getElementById(id);
const LOCAL_KEY='fuse-prep-v3-workspace';
const CONFIG_KEY='fuse-prep-v3-supabase';
const SESSION_KEY='fuse-prep-v3-session';
const BLOB_DB='fuse-prep-v3-photo-blobs';
const BUCKET='fuse-images';
let ws=readLocal();
let config=safeJSON(localStorage.getItem(CONFIG_KEY),{});
let session=safeJSON(localStorage.getItem(SESSION_KEY),null);
let objectUrls=new Map();
let selectedPhotoId=null;
let saveTimer,cloudTimer,toastTimer;
let savingCloud=false,cloudDirty=false,uploading=false;
let deferredInstall=null;
let preventCloudSave=false;
const encode=x=>encodeURIComponent(x);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function safeJSON(value,fallback){try{return JSON.parse(value)||fallback;}catch{return fallback;}}
function readLocal(){return normalizeWorkspace(safeJSON(localStorage.getItem(LOCAL_KEY),null));}
function setBadge(text,error=false){$('saveBadge').innerHTML=`<span class="pulse" style="background:${error?'#e78d94':'#dcf28c'}"></span>${esc(text)}`;}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3600);}
function saveLocalNow(){
  clearTimeout(saveTimer);
  try{localStorage.setItem(LOCAL_KEY,JSON.stringify(ws));setBadge(session?'Saved locally · cloud queued':'Saved on this device');}
  catch(e){setBadge('Local storage full — download a backup',true);toast('Storage is full. Download a backup immediately.');}
}
function edited(){
  ws.modifiedAt=new Date().toISOString();setBadge('Saving…');
  clearTimeout(saveTimer);saveTimer=setTimeout(saveLocalNow,200);
  if(session&&!preventCloudSave)queueCloud();
  updateStats();
}
function queueCloud(){cloudDirty=true;clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>saveCloud(),1700);}
function updateStats(){
  $('statSlots').textContent=ws.listings.length;
  $('statStarted').textContent=ws.listings.filter(isStarted).length;
  $('statPhotos').textContent=ws.photos.length;
  $('statAssigned').textContent=ws.photos.filter(p=>ws.listings.some(l=>l.photoIds.includes(p.id))).length;
  $('photoCounter').textContent=`${ws.photos.length} added`;
  $('listingsSubtitle').textContent=`${ws.listings.length} slots · ${ws.listings.filter(isStarted).length} started`;
}
function renderSettings(){for(const id of Object.keys(DEFAULT_SETTINGS)){
  const el=$(id);if(!el)continue;
  if(el.type==='checkbox')el.checked=!!ws.settings[id];else el.value=ws.settings[id];
}}
function photoSrc(p){return objectUrls.get(p.id)||p.publicUrl||'';}
function renderTray(){
  const photoUsed=new Set(ws.listings.flatMap(l=>l.photoIds));
  $('photoTray').innerHTML=ws.photos.length?ws.photos.map((p,i)=>{
    const used=photoUsed.has(p.id),src=photoSrc(p);
    return `<div class="thumb ${used?'assigned':''}" data-photo="${esc(p.id)}" draggable="true" title="Tap to assign to selected slot">
      ${used?'<span class="assigned-tag">USED</span>':''}
      ${src?`<img src="${esc(src)}" alt="Photo ${i+1}" loading="lazy">`:'<div class="empty-state" style="padding:20px 0">No preview</div>'}
      <div class="pic-caption">${i+1}. ${esc(p.name)}</div>
      <button data-remove-photo="${esc(p.id)}" aria-label="Remove photo" title="Remove from tray" class="thumb-remove" style="position:absolute;right:5px;top:5px;border:0;border-radius:4px;background:#111d;color:#ffbcc3;padding:1px 5px">×</button>
      </div>`;
  }).join(''):'<div class="empty-state">No photos yet. Add a batch to start.</div>';
  updateStats();
}
function previewHtml(l){
  const first=ws.photos.find(p=>p.id===l.photoIds[0]);
  const src=first&&photoSrc(first);
  return src?`<img src="${esc(src)}" loading="lazy" alt="Assigned listing photo"><span class="count-pill">${l.photoIds.length}/8</span>`:
    `<span>${l.photoIds.length?'Photo not available':'Tap to choose slot / drop photos'}</span>`;
}
function listingMarkup(l,i){
  const chips=l.photoIds.map(pid=>{
    const p=ws.photos.find(p=>p.id===pid);
    return `<span class="photo-chip">${p?esc(String(ws.photos.indexOf(p)+1)):'?'} <button type="button" data-unassign="${esc(pid)}" data-index="${i}" aria-label="Unassign photo">×</button></span>`;
  }).join('');
  return `<article class="listing" data-row="${i}">
  <div class="slotno"><b>${String(i+1).padStart(3,'0')}</b><small>${esc(l.sku)}</small></div>
  <button type="button" class="preview" data-slot-pick="${i}" data-drop="${i}" title="Select slot for photo assignment">${previewHtml(l)}</button>
  <div class="column col-title"><label>Title</label><input data-index="${i}" data-field="title" value="${esc(l.title)}" placeholder="Vintage graphic tee…" aria-label="Listing ${i+1} title"><label>Size</label><div class="size-set">${SIZES.map(s=>`<button type="button" class="size-btn ${l.size===s?'selected':''}" data-size="${s}" data-index="${i}">${s}</button>`).join('')}</div><label>Description</label><textarea data-index="${i}" data-field="description" placeholder="Condition / measurements" aria-label="Listing ${i+1} description">${esc(l.description)}</textarea></div>
  <div class="column col-photo"><label>Photos (${l.photoIds.length}/8)</label><div class="photo-chips">${chips||'<span class="photo-placeholder">Use the tray or drag images onto photo box.</span>'}</div><label>Public image URL (optional)</label><input data-index="${i}" data-field="imageUrl" value="${esc(l.imageUrl)}" placeholder="https://…" aria-label="Listing ${i+1} public image URL"><button type="button" class="small-btn" data-select-slot="${i}">+ Assign tray photo to this slot</button></div>
  <div class="column col-price"><label>Price ($)</label><input type="number" min="0" step="0.01" data-index="${i}" data-field="price" value="${esc(l.price)}" placeholder="0.00" aria-label="Listing ${i+1} price"><button type="button" class="small-btn clear" data-clear-row="${i}">Clear row</button></div>
  </article>`;
}
function renderListings(){
  const term=$('searchListings').value.trim().toLowerCase(); const filter=$('filterListings').value;
  const visible=ws.listings.map((l,i)=>({l,i})).filter(({l})=>{
    if(term && !(l.title+' '+l.sku+' '+l.description).toLowerCase().includes(term))return false;
    if(filter==='started'&&!isStarted(l))return false;
    if(filter==='empty'&&isStarted(l))return false;
    if(filter==='photos'&&!l.photoIds.length&&!l.imageUrl.trim())return false;
    return true;
  });
  $('listings').innerHTML=visible.length?visible.map(({l,i})=>listingMarkup(l,i)).join(''):'<div class="empty-state">No listings match this filter.</div>';
  updateStats();
}
function rerender(){renderSettings();renderTray();renderListings();updateStats();}

// Store resized photo bytes in IndexedDB so photos survive browser reloads in local mode.
function openPhotoDb(){return new Promise((resolve,reject)=>{
  if(!('indexedDB'in window))return reject(new Error('This browser does not support photo storage.'));
  const req=indexedDB.open(BLOB_DB,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('files'))req.result.createObjectStore('files');};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});}
async function idbAction(method,key,value){
  const db=await openPhotoDb();return new Promise((resolve,reject)=>{
    const tx=db.transaction('files',method==='get'?'readonly':'readwrite');
    const store=tx.objectStore('files');const req=method==='put'?store.put(value,key):method==='delete'?store.delete(key):store.get(key);
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    tx.oncomplete=()=>db.close();tx.onerror=()=>{db.close();reject(tx.error)};
  });
}
function resizePhoto(file){return new Promise((resolve,reject)=>{
  const local=URL.createObjectURL(file),image=new Image();
  image.onload=()=>{
    try{const maxSide=1440,scale=Math.min(1,maxSide/Math.max(image.width,image.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
      const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      canvas.toBlob(blob=>{URL.revokeObjectURL(local);if(blob)resolve(blob);else reject(new Error('Could not compress photo.'));},'image/jpeg',.79);
    }catch(e){URL.revokeObjectURL(local);reject(e);}
  };
  image.onerror=()=>{URL.revokeObjectURL(local);reject(new Error(`Cannot open ${file.name}`));};image.src=local;
});}
async function hydrateLocalPhotoPreviews(){
  let count=0;
  for(const p of ws.photos){
    if(objectUrls.has(p.id))continue;
    try{const blob=await idbAction('get',p.id);if(blob){objectUrls.set(p.id,URL.createObjectURL(blob));count++;}}
    catch(e){console.warn('Photo cache unavailable:',e);break;}
  }
  if(count){renderTray();renderListings();}
}
async function addPhotos(fileList){
  const files=Array.from(fileList||[]).filter(f=>f.type.startsWith('image/'));
  if(!files.length){toast('Choose JPEG, PNG, HEIC (when browser-supported), or other image files.');return;}
  $('choosePhotos').disabled=true;
  const start=ws.photos.length;let failed=0;
  for(let i=0;i<files.length;i++){
    const f=files[i];try{
      setBadge(`Importing photos ${i+1}/${files.length}`);
      const blob=await resizePhoto(f);
      const id=crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2);
      await idbAction('put',id,blob);
      const p={id,name:f.name||`image-${start+i+1}.jpg`,publicUrl:'',path:'',size:blob.size,createdAt:new Date().toISOString()};
      ws.photos.push(p);objectUrls.set(id,URL.createObjectURL(blob));
      if((i+1)%10===0){renderTray();edited();await new Promise(resolve=>setTimeout(resolve,0));}
    }catch(e){failed++;console.error(e);}
  }
  $('choosePhotos').disabled=false;renderTray();renderListings();edited();saveLocalNow();
  toast(`Added ${ws.photos.length-start} photos${failed?` · ${failed} could not be processed`:''}.`);
  if(session)uploadPendingPhotos();
}
function assignPhoto(photoId,idx){
  const photo=ws.photos.find(p=>p.id===photoId),listing=ws.listings[idx];
  if(!photo||!listing)return;
  if(listing.photoIds.includes(photoId)){toast('That photo is already on this listing.');return;}
  if(listing.photoIds.length>=8){toast('Whatnot supports up to 8 photos per listing.');return;}
  listing.photoIds.push(photoId);edited();renderListings();renderTray();
}
async function removePhoto(photoId){
  const p=ws.photos.find(p=>p.id===photoId);if(!p)return;
  ws.listings.forEach(l=>l.photoIds=l.photoIds.filter(id=>id!==photoId));
  ws.photos=ws.photos.filter(p=>p.id!==photoId);
  const old=objectUrls.get(photoId);if(old){URL.revokeObjectURL(old);objectUrls.delete(photoId);}
  try{await idbAction('delete',photoId);}catch(e){console.warn(e)}
  edited();renderTray();renderListings();
}
function autoAssign(){
  if(!ws.photos.length)return toast('Add photos first.');
  const per=Math.max(1,Math.min(8,Number(ws.settings.photosPerItem)||1));
  const needed=Math.ceil(ws.photos.length/per);
  if(ws.listings.some(l=>l.photoIds.length)&&!confirm(`Reassign photos in upload order, ${per} per listing? This replaces current photo assignments (not titles or prices).`))return;
  while(ws.listings.length<needed)ws.listings.push(newListing(ws.listings.length+1));
  ws.listings.forEach(l=>l.photoIds=[]);
  ws.photos.forEach((p,i)=>ws.listings[Math.floor(i/per)].photoIds.push(p.id));
  edited();renderTray();renderListings();toast(`Assigned ${ws.photos.length} photos across ${needed} listings.`);
}

// REST-only Supabase integration: no npm, build step, or paid application dependency.
function baseUrl(){return String(config.url||'').replace(/\/+$/,'');}
function readyCloud(){return /^https:\/\/[a-z0-9.-]+\.supabase\.co$/i.test(baseUrl()) && !!config.key;}
function authHeaders(accessToken=session?.access_token,contentType='application/json'){
  const headers={'apikey':config.key};if(contentType)headers['Content-Type']=contentType;
  if(accessToken)headers.Authorization=`Bearer ${accessToken}`;
  return headers;
}
async function responseData(res){const raw=await res.text();const obj=raw?safeJSON(raw,{}):{};if(!res.ok)throw new Error(obj.msg||obj.error_description||obj.message||obj.error||`HTTP ${res.status}`);return obj;}
async function authApi(endpoint,body,token){
  const res=await fetch(baseUrl()+'/auth/v1/'+endpoint,{method:'POST',headers:authHeaders(token||null),body:JSON.stringify(body)});
  return responseData(res);
}
function storeSession(data){session={access_token:data.access_token,refresh_token:data.refresh_token,expires_at:Date.now()+((data.expires_in||3600)-90)*1000,user:data.user};localStorage.setItem(SESSION_KEY,JSON.stringify(session));}
async function accessToken(){
  if(!session)throw new Error('Sign in to sync.');
  if(Date.now()>session.expires_at){
    try{const data=await authApi('token?grant_type=refresh_token',{refresh_token:session.refresh_token},null);storeSession(data);}
    catch(e){session=null;localStorage.removeItem(SESSION_KEY);updateCloudUi();throw new Error('Please sign in again. '+e.message);}
  }
  return session.access_token;
}
async function cloudRequest(path,{method='GET',body,headers={}}={}){
  if(!readyCloud())throw new Error('Add a valid Supabase URL and publishable key first.');
  const token=await accessToken();const request={method,headers:{...authHeaders(token,body===undefined?null:'application/json'),...headers}};
  if(body!==undefined)request.body=JSON.stringify(body);
  const res=await fetch(baseUrl()+path,request);return responseData(res);
}
async function loadCloudWorkspace({ask=true}={}){
  const userId=session?.user?.id;if(!userId)return;
  const rows=await cloudRequest(`/rest/v1/fuse_workspaces?user_id=eq.${encode(userId)}&select=content,updated_at`,{headers:{'Accept':'application/json'}});
  if(!Array.isArray(rows)||!rows.length){
    await saveCloud(true);toast('New cloud workspace created from this device.');return;
  }
  const remote=normalizeWorkspace(rows[0].content);
  const localStarted=ws.listings.some(isStarted)||ws.photos.length;
  if(ask&&localStarted&&JSON.stringify(ws)!==JSON.stringify(remote)){
    if(!confirm('A cloud workspace already exists. OK = load cloud data onto this device. Cancel = keep this device and replace the cloud workspace.')){
      await uploadPendingPhotos();await saveCloud(true);return;
    }
  }
  if(!ask && (ws.listings.some(isStarted)||ws.photos.length) && new Date(ws.modifiedAt)>new Date(remote.modifiedAt)){
    await uploadPendingPhotos();await saveCloud(true);return;
  }
  preventCloudSave=true;
  ws=remote;
  saveLocalNow();rerender();
  preventCloudSave=false;
  hydrateLocalPhotoPreviews();
  toast('Cloud workspace loaded.');
}
async function saveCloud(force=false){
  clearTimeout(cloudTimer);
  if(!session||!readyCloud()||preventCloudSave)return;
  if(!force&&!cloudDirty)return;
  if(savingCloud){cloudDirty=true;return;}
  savingCloud=true;cloudDirty=false;
  const frozen=JSON.parse(JSON.stringify(ws));
  try{
    await cloudRequest('/rest/v1/fuse_workspaces?on_conflict=user_id',{
      method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      body:{user_id:session.user.id,content:frozen,updated_at:new Date().toISOString()}});
    setBadge('Saved · cloud synced');
  }catch(e){cloudDirty=true;setBadge('Cloud sync failed · local saved',true);console.warn(e);}
  finally{savingCloud=false;if(cloudDirty&&session){clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>saveCloud(),3500);}}
}
async function uploadPhoto(p){
  if(!session||p.publicUrl)return;
  const blob=await idbAction('get',p.id);
  if(!blob)throw new Error(`${p.name}: no local file found on this device.`);
  const token=await accessToken();
  const filename=`${p.id.replace(/[^a-zA-Z0-9-]/g,'')}.jpg`;
  const path=`${session.user.id}/${filename}`;
  const res=await fetch(baseUrl()+`/storage/v1/object/${BUCKET}/${path}`,{
    method:'POST',headers:{...authHeaders(token,'image/jpeg'),'cache-control':'3600','x-upsert':'false'},body:blob
  });
  if(!res.ok){const error=await responseData(res);throw new Error(error.message||`Storage upload failed ${res.status}`);}
  // Publish only an HTTPS public storage URL: Whatnot must retrieve without logging in.
  p.path=path;p.publicUrl=baseUrl()+`/storage/v1/object/public/${BUCKET}/${path}`;
  edited();
}
async function uploadPendingPhotos(){
  if(uploading)return;
  if(!readyCloud()||!session){$('openCloud').click();toast('Connect cloud and sign in before uploading photos.');return;}
  const pending=ws.photos.filter(p=>!p.publicUrl);
  if(!pending.length)return toast('All photos with local files are already uploaded.');
  uploading=true;let done=0,failures=[];let index=0;
  $('uploadPending').disabled=true;
  async function worker(){while(index<pending.length){
    const current=pending[index++];
    try{await uploadPhoto(current);done++;}catch(e){failures.push(e.message||String(e));console.warn(e);}
    $('uploadNote').textContent=`Uploading ${done+failures.length}/${pending.length} · ${done} successful`;
  }}
  try{await Promise.all([worker(),worker()]);}
  finally{
    uploading=false;$('uploadPending').disabled=false;renderTray();renderListings();saveLocalNow();
    if(session)await saveCloud(true);
    $('uploadNote').textContent=failures.length?`Uploaded ${done}; ${failures.length} failed. ${failures[0]}`:`${done} photos hosted. Their public URLs can now be included in the CSV.`;
    toast(`${done} photos uploaded${failures.length?` · ${failures.length} failed`:''}.`);
  }
}
function updateCloudUi(){
  $('cloudLoggedOut').hidden=!!session;$('cloudLoggedIn').hidden=!session;
  $('cloudUser').textContent=session?`Signed in as ${session.user?.email||'your account'}`:'';
  $('openCloud').textContent=session?'☁ Synced account':'☁ Cloud sync';
  if(readyCloud()){$('sbUrl').value=config.url;$('sbKey').value=config.key;}
}
async function cloudLogin(create){
  if(!readyCloud()){$('cloudConfigDetails').open=true;return setCloudMessage('First enter your Supabase Project URL and publishable key.');}
  const email=$('cloudEmail').value.trim(),password=$('cloudPassword').value;
  if(!email||password.length<6)return setCloudMessage('Enter a valid email and password (6+ characters).');
  $('cloudSignIn').disabled=true;$('cloudSignUp').disabled=true;
  try{
    const data=await authApi(create?'signup':'token?grant_type=password',{email,password},null);
    if(!data.access_token){setCloudMessage('Account created. Check your email for a confirmation link, then come back and sign in.');return;}
    storeSession(data);updateCloudUi();setCloudMessage('Signed in. Connecting workspace…');
    await loadCloudWorkspace({ask:true});
    $('cloudDialog').close();setCloudMessage('');
    uploadPendingPhotos();
  }catch(e){setCloudMessage(e.message);}
  finally{$('cloudSignIn').disabled=false;$('cloudSignUp').disabled=false;}
}
function setCloudMessage(text){$('cloudMessage').textContent=text;}
function downloadString(data,filename,type){
  const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function backup(){saveLocalNow();downloadString(JSON.stringify({app:'Fuse Prep v3',exported:new Date().toISOString(),workspace:ws},null,2),'fuse-prep-workspace-backup.json','application/json');toast('Backup downloaded. Photo bytes are only stored locally; cloud images stay linked by URL.');}
function showExport(){
  const count=ws.listings.filter(isStarted).length,localOnly=ws.photos.filter(p=>!p.publicUrl&&ws.listings.some(l=>l.photoIds.includes(p.id))).length;
  $('exportOverview').textContent=`${count} started listings. ${localOnly} assigned photos do not have public URLs yet.`;
  $('excludeLocalPhotos').checked=false;
  refreshExportIssues();$('exportDialog').showModal();
}
function refreshExportIssues(){
  const allowMissingLocalPhotos=$('excludeLocalPhotos').checked;
  const check=createCsv(ws,{allowMissingLocalPhotos});
  const issues=check.problems.slice(0,12);
  $('exportIssues').innerHTML=issues.length?issues.map(p=>`<div class="issue">${esc(p)}</div>`).join('')+(check.problems.length>12?`<p>...and ${check.problems.length-12} more issues.</p>`:''):`<div class="issue good">Ready to export ${check.count} listing rows in the exact ${CSV_HEADERS.length}-column template order.</div>`;
  $('confirmExport').disabled=check.problems.length>0;
}
function exportCsv(){
  const result=createCsv(ws,{allowMissingLocalPhotos:$('excludeLocalPhotos').checked});
  if(result.problems.length){refreshExportIssues();return;}
  const date=new Date().toISOString().slice(0,10);
  downloadString(result.csv,`FUSE-WHATNOT-${date}-${result.count}-LISTINGS.csv`,'text/csv;charset=utf-8');
  $('exportDialog').close();toast(`Exported ${result.count} rows. Import on Whatnot.com using a computer.`);
}

// User interaction wiring
$('priceAll').onclick=()=>{const value=$('bulkPrice').value;if(value===''||Number(value)<0)return toast('Enter a valid price.');ws.listings.forEach(l=>l.price=value);edited();renderListings();toast(`Applied $${value} to every listing.`);};
$('clearPrices').onclick=()=>{if(!confirm('Clear the price field for every listing?'))return;ws.listings.forEach(l=>l.price='');edited();renderListings();};
$('fillEmptyTitles').onclick=()=>{const title=ws.settings.defaultTitle.trim();if(!title)return toast('Enter a default title first.');let count=0;ws.listings.forEach(l=>{if(!l.title.trim()||SIZES.includes(l.title.trim().toUpperCase())){l.title=title+(l.size?' '+l.size:'');count++;}});edited();renderListings();toast(`Filled ${count} blank titles.`);};
$('addSlots').onclick=()=>{const old=ws.listings.length;for(let i=old;i<old+25;i++)ws.listings.push(newListing(i+1));edited();renderListings();toast('25 slots added.');};
$('resetSlots').onclick=()=>{if(!confirm('Clear ALL listing titles, descriptions, prices, and photo assignments? The photo tray will stay. Download a backup first if unsure.'))return;ws.listings=Array.from({length:100},(_,i)=>newListing(i+1));edited();renderListings();renderTray();};
$('choosePhotos').onclick=()=>$('filePhotos').click();
$('filePhotos').addEventListener('change',e=>{addPhotos(e.target.files);e.target.value='';});
$('photoPanel').addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
$('photoPanel').addEventListener('drop',e=>{if(e.dataTransfer.files?.length){e.preventDefault();addPhotos(e.dataTransfer.files);}});
$('photoTray').addEventListener('dragstart',e=>{const el=e.target.closest('[data-photo]');if(el)e.dataTransfer.setData('text/fuse-photo-id',el.dataset.photo);});
$('photoTray').addEventListener('click',e=>{
  const remove=e.target.closest('[data-remove-photo]');if(remove){removePhoto(remove.dataset.removePhoto);return;}
  const thumb=e.target.closest('[data-photo]');if(!thumb)return;
  const index=Number($('targetSlot').value)-1;
  if(!Number.isInteger(index)||index<0||index>=ws.listings.length)return toast('Choose a slot number between 1 and '+ws.listings.length+'.');
  assignPhoto(thumb.dataset.photo,index);selectedPhotoId=thumb.dataset.photo;
  toast(`Photo assigned to slot ${index+1}.`);
});
$('autoAssign').onclick=autoAssign;
$('uploadPending').onclick=uploadPendingPhotos;
$('clearUnassigned').onclick=async()=>{
  const used=new Set(ws.listings.flatMap(l=>l.photoIds));const ids=ws.photos.filter(p=>!used.has(p.id)).map(p=>p.id);
  if(!ids.length)return toast('Every tray photo is assigned.');
  if(!confirm(`Remove ${ids.length} unused photos from the tray? Already hosted images will stay on cloud storage so old CSV links keep working.`))return;
  for(const id of ids)await removePhoto(id);
  toast(`${ids.length} unused tray photos removed.`);
};
$('photosPerItem').addEventListener('change',()=>{ws.settings.photosPerItem=$('photosPerItem').value;edited();});
$('listings').addEventListener('input',e=>{
  const field=e.target.dataset.field,idx=Number(e.target.dataset.index);
  if(!field||!ws.listings[idx])return;
  ws.listings[idx][field]=e.target.value;
  // Editing a title/description intentionally doesn't reset the size, which can still be applied with shortcut buttons.
  edited();
});
$('listings').addEventListener('click',e=>{
  const s=e.target.closest('[data-size]');if(s){const i=Number(s.dataset.index);assignSize(ws.listings[i],s.dataset.size);edited();renderListings();return;}
  const u=e.target.closest('[data-unassign]');if(u){ws.listings[Number(u.dataset.index)].photoIds=ws.listings[Number(u.dataset.index)].photoIds.filter(id=>id!==u.dataset.unassign);edited();renderListings();renderTray();return;}
  const c=e.target.closest('[data-clear-row]');if(c){const i=Number(c.dataset.clearRow);if(!confirm(`Clear ${ws.listings[i].sku}?`))return;ws.listings[i]=newListing(i+1);edited();renderListings();renderTray();return;}
  const pick=e.target.closest('[data-slot-pick],[data-select-slot]');if(pick){const idx=Number(pick.dataset.slotPick??pick.dataset.selectSlot);$('targetSlot').value=idx+1;if(selectedPhotoId)assignPhoto(selectedPhotoId,idx);else toast(`Slot ${idx+1} selected. Tap any photo in the tray to assign it.`);return;}
});
$('listings').addEventListener('dragover',e=>{const row=e.target.closest('[data-row]');if(row){e.preventDefault();row.classList.add('is-dragover');}});
$('listings').addEventListener('dragleave',e=>{const row=e.target.closest('[data-row]');if(row&&!row.contains(e.relatedTarget))row.classList.remove('is-dragover');});
$('listings').addEventListener('drop',e=>{const row=e.target.closest('[data-row]');if(!row)return;e.preventDefault();row.classList.remove('is-dragover');
  const id=e.dataTransfer.getData('text/fuse-photo-id');if(id)assignPhoto(id,Number(row.dataset.row));
  else if(e.dataTransfer.files?.length)toast('Drop photo files into the Photo tray on the left first.');
});
$('searchListings').addEventListener('input',renderListings);
$('filterListings').addEventListener('change',renderListings);
$('jumpToPhotos').onclick=()=>$('photoPanel').scrollIntoView({behavior:'smooth',block:'start'});
for(const key of Object.keys(DEFAULT_SETTINGS)){
  if(key==='photosPerItem')continue;
  const element=$(key);if(!element)continue;
  const handler=()=>{ws.settings[key]=element.type==='checkbox'?element.checked:element.value;edited();};
  element.addEventListener(element.type==='checkbox'||element.tagName==='SELECT'?'change':'input',handler);
}
$('downloadBackup').onclick=backup;
$('restoreBackup').onclick=()=>$('restoreBackupFile').click();
$('restoreBackupFile').addEventListener('change',async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  try{const json=JSON.parse(await file.text());const data=json.workspace||json;
    if(!data.listings)throw new Error('Not a Fuse Prep workspace file.');
    if(!confirm('Replace the current workspace with this backup?'))return;
    ws=normalizeWorkspace(data);saveLocalNow();rerender();await hydrateLocalPhotoPreviews();edited();toast('Backup restored. On a new device, local-only photo bytes are not included.');
  }catch(err){toast(`Could not restore backup: ${err.message}`);}
});
$('exportBtn').onclick=showExport;
$('excludeLocalPhotos').onchange=refreshExportIssues;
$('confirmExport').onclick=exportCsv;
$('closeExport').onclick=$('closeExportSecondary').onclick=()=>$('exportDialog').close();
$('openCloud').onclick=()=>{$('cloudDialog').showModal();updateCloudUi();};
$('closeCloud').onclick=()=>$('cloudDialog').close();
$('saveCloudConfig').onclick=()=>{
  const url=$('sbUrl').value.trim().replace(/\/+$/,'');const key=$('sbKey').value.trim();
  if(!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/i.test(url)||!key)return setCloudMessage('Enter a valid https://…supabase.co project URL and a public/publishable key.');
  config={url,key};localStorage.setItem(CONFIG_KEY,JSON.stringify(config));setCloudMessage('Connection settings saved. Now sign in.');updateCloudUi();
};
$('cloudSignIn').onclick=()=>cloudLogin(false);
$('cloudSignUp').onclick=()=>cloudLogin(true);
$('cloudSaveNow').onclick=async()=>{setCloudMessage('Syncing…');try{await uploadPendingPhotos();await saveCloud(true);setCloudMessage('Cloud sync complete (check badge for errors).');}catch(e){setCloudMessage(e.message)}};
$('cloudDownload').onclick=async()=>{try{await loadCloudWorkspace({ask:false});setCloudMessage('Cloud workspace loaded.');}catch(e){setCloudMessage(e.message)}};
$('cloudUpload').onclick=async()=>{if(!confirm('Overwrite the cloud workspace with this device?'))return;try{await uploadPendingPhotos();await saveCloud(true);setCloudMessage('Sent this device workspace to cloud.');}catch(e){setCloudMessage(e.message)}};
$('cloudSignOut').onclick=async()=>{
  try{if(readyCloud()&&session)await cloudRequest('/auth/v1/logout',{method:'POST'});}catch(e){console.warn(e)}
  session=null;localStorage.removeItem(SESSION_KEY);updateCloudUi();setBadge('Saved on this device');setCloudMessage('Signed out. Local data remains on this device.');
};
window.addEventListener('online',()=>{if(session)saveCloud(true);});
window.addEventListener('beforeunload',()=>{saveLocalNow();});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('installBtn').hidden=false;});
$('installBtn').onclick=async()=>{if(!deferredInstall)return toast('On iPhone: Safari → Share → Add to Home Screen. On Mac: Chrome → Install.');deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$('installBtn').hidden=true;};
if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')) navigator.serviceWorker.register('./sw.js').catch(console.warn);

rerender();updateCloudUi();hydrateLocalPhotoPreviews();
if(session&&readyCloud()){
  // Existing signed-in device: reconcile newest workspace by client edit timestamp.
  accessToken().then(()=>loadCloudWorkspace({ask:false})).then(()=>{uploadPendingPhotos();}).catch(e=>{console.warn(e);setBadge('Offline or login needed · local saved',true)});
}
