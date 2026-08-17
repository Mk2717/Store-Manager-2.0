import {readFile,writeFile} from "node:fs/promises";

async function replace(path,from,to,expected){
  const source=await readFile(path,"utf8");
  if(source.includes(to))return;
  const count=source.split(from).length-1;
  if(count!==expected)throw new Error(`${path}: expected ${expected} patch target(s), found ${count}`);
  await writeFile(path,source.split(from).join(to));
}

await replace(
  "app/dashboard-shell.tsx",
  'sku:`${settings?.barcodePrefix||"ITEM"}-${Date.now().toString(36).toUpperCase()}-${index+1}`,cat:"General"',
  'sku:`${settings?.barcodePrefix||"CFX"}-${Date.now().toString(36).toUpperCase()}-${index+1}`,barcode:`${(settings?.barcodePrefix||"CFX").toUpperCase()}-GEN-GEN-GEN-${String((Date.now()+index)%1_000_000).padStart(6,"0")}`,barcodeAssignedAt:now,cat:"General"',
  1,
);

await replace(
  "app/dashboard-shell.tsx",
  'const saveResponse=await fetchReliable("/api/state",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({state:current})})',
  'const saveResponse=await fetchReliable(mode==="inventory"?"/api/quick-inventory":"/api/state",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(mode==="inventory"?{items:(current.items as Array<{createdAt?:string}>).filter(item=>item.createdAt===now)}:{state:current})})',
  1,
);

await replace(
  "app/dashboard-shell.tsx",
  'await writeDashboardState(current);close();location.reload()',
  'await writeDashboardState((saveData.state||current) as Record<string,unknown>);close();location.reload()',
  1,
);

await replace(
  "app/dashboard-shell.tsx",
  'browserGlobal.__storeManagerIDBPatched=true}const assetRoot=',
  'browserGlobal.__storeManagerIDBPatched=true}try{const liveResponse=await fetchReliable("/api/state",{cache:"no-store"}),liveData=await responseData(liveResponse);if(liveResponse.ok&&liveData.state)await writeDashboardState(liveData.state)}catch{}const assetRoot=',
  1,
);

await replace(
  "app/dashboard-shell.tsx",
  'closest("nav button")',
  'closest("button")',
  1,
);

await replace(
  "app/dashboard-shell.tsx",
  'const applyBrand=()=>{const brand=',
  'const applyBrand=()=>{const active=Array.from(document.querySelectorAll("button.active")).map(button=>button.textContent||"").find(text=>["Settings","Reports","Purchases"].some(name=>text.includes(name)));if(active)for(const name of ["Settings","Reports","Purchases"])if(active.includes(name)){setSection(name);break}const brand=',
  1,
);

await replace(
  "app/dashboard-shell.tsx",
  '}{account.role==="Owner"&&<button className="brandAccountButton" onClick={()=>setEditing(true)} aria-label="Edit owner and store branding">⚙ Brand & account</button>}{editing&&',
  '}<OwnerTools account={account} section={section} openBrand={()=>setEditing(true)}/>{editing&&',
  1,
);

await replace(
  "app/dashboard-shell.tsx",
  'placeholder={`Product ${index+1}`}/></label><label>Quantity',
  'placeholder={`Product ${index+1}`}/>{mode==="inventory"&&<small className="quickBarcode">Internal C.Flex barcode generated on save</small>}</label><label>Quantity',
  1,
);

await replace(
  "app/globals.css",
  ".brandAccountButton{bottom:72px}}",
  ".brandAccountButton{bottom:72px}}.quickPurchaseButton{position:fixed;right:175px;bottom:18px;z-index:40;border:0;background:#173c2b;color:#fff;border-radius:999px;padding:12px 17px;font-weight:900;box-shadow:0 10px 30px #102f2035}.quickIntakeButton{right:320px}.quickBarcode{display:block;margin-top:5px;color:#145c3c!important;font-size:9px!important;font-weight:800!important}@media(max-width:700px){.quickPurchaseButton{right:12px;bottom:122px;font-size:11px;padding:10px 13px}.quickIntakeButton{bottom:167px}}",
  1,
);

await replace(
  "public/latest-assets/dashboard-client-BG1tO6mo.js",
  "sourceImage:e.imageUrls[0],intakeId",
  "sourceImage:e.imageUrls[0],image:e.imageUrls[0],intakeId",
  2,
);

await replace(
  "public/latest-assets/dashboard-client-BG1tO6mo.js",
  'e===`Inventory`&&(0,Y.jsx)(`em`,{children:jt.length})',
  'e===`Inventory`&&(0,Y.jsx)(`em`,{children:a.length})',
  1,
);
