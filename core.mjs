// Exact header sequence from the user's uploaded Whatnot CSV template (October 2026).
export const CSV_HEADERS = Object.freeze([
  'Category','Sub Category','Title','Description','Quantity','Type','Price',
  'Shipping Profile','Offerable','Hazmat','Condition','Cost Per Item','SKU',
  'Image URL 1','Image URL 2','Image URL 3','Image URL 4',
  'Image URL 5','Image URL 6','Image URL 7','Image URL 8'
]);

export const SIZES = Object.freeze(['XS','S','M','L','XL','XXL','XXXL']);
export const DEFAULT_SETTINGS = Object.freeze({
  category:'', subCategory:'', type:'Auction', shippingProfile:'',
  condition:'', offerable:false, hazmat:'Not Hazmat', costPerItem:'',
  quantity:'1', defaultTitle:'', bulkPrice:'5', photosPerItem:'1'
});

export function newListing(n){
  return {id: `slot-${n}`, sku:`FUSE-${String(n).padStart(3,'0')}`,
    title:'', description:'', price:'', size:'', photoIds:[], imageUrl:''};
}
export function newWorkspace(count=100){
  return {version:3, settings:{...DEFAULT_SETTINGS},
    listings:Array.from({length:count},(_,i)=>newListing(i+1)), photos:[],
    modifiedAt:new Date().toISOString()};
}
export function isStarted(l){return Boolean(l.title.trim() || l.description.trim() || l.photoIds.length || l.imageUrl.trim());}
export function assignSize(l, size){
  if(!SIZES.includes(size)) return l;
  const title = String(l.title||'').replace(/\s+(?:XS|S|M|L|XL|XXL|XXXL)$/i,'').trim();
  const description = String(l.description||'').replace(/(?:\n|^)?SIZE:\s*(?:XS|S|M|L|XL|XXL|XXXL)\s*$/i,'').trim();
  l.size=size;
  l.title = (title ? title + ' ' : '') + size;
  l.description=(description ? description+'\n' : '')+`SIZE: ${size}`;
  return l;
}
export function isHttpsUrl(u){try{const parsed=new URL(u); return parsed.protocol==='https:' && Boolean(parsed.hostname);}catch{return false;}}
export function listPhotoUrls(listing,photos){
  const lookup=new Map(photos.map(p=>[p.id,p]));
  const urls=[];
  if(listing.imageUrl?.trim()) urls.push(listing.imageUrl.trim());
  for(const id of listing.photoIds){const p=lookup.get(id); if(p?.publicUrl && !urls.includes(p.publicUrl)) urls.push(p.publicUrl);}
  return urls.slice(0,8);
}
export function validateExport(ws){
  const problems=[]; const s=ws.settings;
  if(!s.category.trim()) problems.push('Enter Category exactly as listed in Whatnot’s Values tab.');
  if(!s.subCategory.trim()) problems.push('Enter Sub Category exactly as listed in Whatnot’s Values tab.');
  if(!s.type.trim()) problems.push('Select a listing Type.');
  if(!s.shippingProfile.trim()) problems.push('Enter an approved Whatnot Shipping Profile.');
  if(!Number.isInteger(Number(s.quantity)) || Number(s.quantity)<1) problems.push('Quantity must be at least 1.');
  const active=ws.listings.filter(isStarted);
  if(!active.length) problems.push('Add at least one title, description, or photo before exporting.');
  active.forEach((l)=>{
    if(!l.title.trim() || SIZES.includes(l.title.trim().toUpperCase())) problems.push(`${l.sku}: enter an item title.`);
    if(l.price==='' || !Number.isFinite(Number(l.price)) || Number(l.price)<0) problems.push(`${l.sku}: enter a valid price / starting bid.`);
    if(l.imageUrl && !isHttpsUrl(l.imageUrl)) problems.push(`${l.sku}: pasted image URL must start with https://`);
    for(const url of listPhotoUrls(l,ws.photos)){if(!isHttpsUrl(url)) problems.push(`${l.sku}: hosted image URL is invalid.`);}
    if(l.photoIds.length && listPhotoUrls(l,ws.photos).length===0) problems.push(`${l.sku}: its photos are only on this device; connect cloud or export without those images.`);
    if(l.photoIds.length && l.photoIds.some(id=>!ws.photos.some(p=>p.id===id))) problems.push(`${l.sku}: an assigned photo is missing.`);
  });
  return {problems, active};
}
export function listingToCsvRow(listing,settings,photos){
  const urls=listPhotoUrls(listing,photos);
  return [settings.category,settings.subCategory,listing.title.trim(),listing.description.trim(),
    settings.quantity,settings.type,listing.price,settings.shippingProfile,
    settings.offerable?'TRUE':'FALSE',settings.hazmat,settings.condition,
    settings.costPerItem,listing.sku,...Array.from({length:8},(_,i)=>urls[i]||'')];
}
export function csvEscape(value){return '"'+String(value??'').replace(/"/g,'""')+'"';}
export function createCsv(workspace,{allowMissingLocalPhotos=false}={}){
  const ws=structuredClone(workspace);
  if(allowMissingLocalPhotos){
    // Explicit photo-free option: local-only assignments are ignored in CSV, not silently misrepresented.
    for(const l of ws.listings){l.photoIds=l.photoIds.filter(id=>ws.photos.find(p=>p.id===id)?.publicUrl);}
  }
  const {problems,active}=validateExport(ws);
  if(problems.length)return {csv:null,problems,count:active.length};
  const rows=[CSV_HEADERS,...active.map(l=>listingToCsvRow(l,ws.settings,ws.photos))];
  return {csv:'\uFEFF'+rows.map(r=>r.map(csvEscape).join(',')).join('\r\n')+'\r\n',problems:[],count:active.length};
}
export function normalizeWorkspace(raw){
  if(!raw || !Array.isArray(raw.listings))return newWorkspace();
  const listings=raw.listings.map((l,i)=>({...newListing(i+1),...l,
    photoIds:Array.isArray(l.photoIds)?l.photoIds.slice(0,8):[],
    imageUrl:String(l.imageUrl||'')}));
  return {version:3,settings:{...DEFAULT_SETTINGS,...(raw.settings||{})},
    listings:listings.length?listings:newWorkspace().listings,
    photos:(Array.isArray(raw.photos)?raw.photos:[]).map(p=>({id:String(p.id),
      name:String(p.name||'photo.jpg'),publicUrl:String(p.publicUrl||''),
      path:String(p.path||''),size:Number(p.size)||0,createdAt:p.createdAt||''})),
    modifiedAt:raw.modifiedAt||new Date().toISOString()};
}
