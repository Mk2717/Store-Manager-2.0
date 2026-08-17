import {handleImageOptimization,DEFAULT_DEVICE_SIZES,DEFAULT_IMAGE_SIZES} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env{ASSETS:Fetcher;DB:D1Database;IMAGES:{input(stream:ReadableStream):{transform(options:Record<string,unknown>):{output(options:{format:string;quality:number}):Promise<{response():Response}>}}}}
interface ExecutionContext{waitUntil(promise:Promise<unknown>):void;passThroughOnException():void}
type Role="Owner"|"Manager"|"Stock keeper"|"Cashier";
type Identity={email:string;name:string};
type Account=Identity&{tenantId:string;role:Role;storeName:string;logo:string;profileComplete:boolean};

const baseSettings={storeName:"My Store",branchName:"Main Store",phone:"",whatsapp:"",address:"Ghana",baseCurrency:"GHS",acceptedCurrencies:["GHS","CNY","USD","XOF"],taxRate:0,lowStockDefault:10,allowNegativeStock:false,requireCustomerForCredit:true,autoSync:true,locations:["Main Store","In transit","Quarantine","Damaged"],receiptFooter:"Thank you for shopping with us.",barcodePrefix:"STORE",barcodeAutoAssign:true,barcodeLabelPrice:true,updatedAt:new Date(0).toISOString()};
const emptyNames=["items","stockMovements","sales","purchases","suppliers","supplierScans","supplierClaims","landedCostReconciliations","reservations","expenses","customers","customerPayments","orders","transfers","importRequests","financeRecords","statementRecords","loans","dailyClosings","campaigns","branches","stockCounts","attendanceRecords","payrollRecords","tillClosings","returns","discounts"];
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{"cache-control":"no-store"}});
const id=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`;
const normalizeEmail=(value:string)=>value.trim().toLowerCase();

const bytesToHex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
async function sha256(value:string){return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))))}
async function passwordHash(password:string,saltHex:string){const salt=new Uint8Array((saltHex.match(/../g)||[]).map(v=>parseInt(v,16))),key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]),bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations:100000},key,256);return bytesToHex(new Uint8Array(bits))}
function cookieValue(request:Request,name:string){for(const part of (request.headers.get("cookie")||"").split(";")){const [key,...rest]=part.trim().split("=");if(key===name)return rest.join("=")}return ""}
async function sessionIdentity(request:Request,env:Env):Promise<Identity|null>{const token=cookieValue(request,"store_session");if(!token)return null;const tokenHash=await sha256(token),row=await env.DB.prepare("SELECT s.email,u.name FROM auth_sessions s JOIN auth_users u ON u.email=s.email WHERE s.token_hash=? AND s.expires_at>?").bind(tokenHash,new Date().toISOString()).first<{email:string;name:string}>();return row?{email:row.email,name:row.name}:null}
async function createSession(env:Env,email:string){const token=bytesToHex(crypto.getRandomValues(new Uint8Array(32))),now=new Date(),expires=new Date(now.getTime()+30*24*60*60*1000);await env.DB.prepare("INSERT INTO auth_sessions (token_hash,email,expires_at,created_at) VALUES (?, ?, ?, ?)").bind(await sha256(token),email,expires.toISOString(),now.toISOString()).run();return {token,maxAge:30*24*60*60}}
const withSession=(body:unknown,session:{token:string;maxAge:number})=>new Response(JSON.stringify(body),{status:200,headers:{"content-type":"application/json","cache-control":"no-store","set-cookie":`store_session=${session.token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${session.maxAge}`}});

function identity(request:Request):Identity|null{
  const email=request.headers.get("oai-authenticated-user-email");
  const preview=new URL(request.url).hostname==="terminal.local";
  if(!email&&!preview)return null;
  const resolved=normalizeEmail(email||"owner@preview.local");
  const encoded=request.headers.get("oai-authenticated-user-full-name");
  let name="";
  if(encoded&&request.headers.get("oai-authenticated-user-full-name-encoding")==="percent-encoded-utf-8")try{name=decodeURIComponent(encoded)}catch{}
  return {email:resolved,name:name.trim()||resolved.split("@")[0].replace(/[._-]+/g," ").replace(/\b\w/g,c=>c.toUpperCase())};
}

async function audit(db:D1Database,account:Account,action:string,detail:string){await db.prepare("INSERT INTO audit_events (id, tenant_id, actor_email, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id("AUD"),account.tenantId,account.email,action,detail,new Date().toISOString()).run();}

async function accountFor(request:Request,env:Env):Promise<Account|null>{
  const headerPerson=identity(request),hasSession=!!cookieValue(request,"store_session");if(!headerPerson&&!hasSession)return null;const person=hasSession?await sessionIdentity(request,env)??headerPerson:headerPerson;if(!person)return null;
  const member=await env.DB.prepare("SELECT m.tenant_id, m.name, m.role, m.status, t.store_name, t.logo, t.profile_complete FROM tenant_members m JOIN tenants t ON t.id=m.tenant_id WHERE m.email=?").bind(person.email).first<{tenant_id:string;name:string;role:Role;status:string;store_name:string;logo:string;profile_complete:number}>();
  if(member){if(member.status!=="Active")return null;return {tenantId:member.tenant_id,email:person.email,name:member.name||person.name,role:member.role,storeName:member.store_name,logo:member.logo,profileComplete:!!member.profile_complete};}
  const now=new Date().toISOString(),tenantId=id("TEN"),counts=await env.DB.prepare("SELECT COUNT(*) AS total FROM tenants").first<{total:number}>(),legacy=counts?.total===0?await env.DB.prepare("SELECT state_json FROM store_state WHERE id='main'").first<{state_json:string}>():null;
  const legacyOwner=!!legacy,storeName=legacyOwner?"C.Flex Clothing":"My Store",logo=legacyOwner?"/cflex-logo.png":"";
  await env.DB.batch([
    env.DB.prepare("INSERT INTO tenants (id, owner_email, owner_name, store_name, logo, profile_complete, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(tenantId,person.email,person.name,storeName,logo,legacyOwner?1:0,now,now),
    env.DB.prepare("INSERT INTO tenant_members (id, tenant_id, email, name, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'Owner', 'Active', ?, ?)").bind(id("MEM"),tenantId,person.email,person.name,now,now),
    ...(legacy?[env.DB.prepare("INSERT OR REPLACE INTO store_state (id, state_json, updated_at) VALUES (?, ?, ?)").bind(tenantId,legacy.state_json,now)]:[]),
  ]);
  return {tenantId,email:person.email,name:person.name,role:"Owner",storeName,logo,profileComplete:legacyOwner};
}

function freshState(account:Account,staff:unknown[]){return Object.assign(Object.fromEntries(emptyNames.map(name=>[name,[]])),{settings:{...baseSettings,storeName:account.storeName,branchName:account.storeName,receiptFooter:`Thank you for shopping with ${account.storeName}.`},staff});}
async function staffFor(env:Env,tenantId:string){return (await env.DB.prepare("SELECT id, name, email, role, status FROM tenant_members WHERE tenant_id=? ORDER BY role='Owner' DESC, name").bind(tenantId).all()).results.map(row=>({...row,phone:"",permissions:row.role==="Owner"?["all"]:[],lastActive:"Authorized"}));}
async function readState(env:Env,account:Account){const [staff,row,quickRows]=await Promise.all([staffFor(env,account.tenantId),env.DB.prepare("SELECT state_json, updated_at FROM store_state WHERE id=?").bind(account.tenantId).first<{state_json:string;updated_at:string}>(),env.DB.prepare("SELECT item_json FROM quick_inventory_items WHERE tenant_id=? ORDER BY created_at DESC").bind(account.tenantId).all<{item_json:string}>()]);let state=row?JSON.parse(row.state_json):freshState(account,staff);const quickItems=quickRows.results.flatMap(record=>{try{return [JSON.parse(record.item_json)]}catch{return []}}),storedItems=Array.isArray(state.items)?state.items:[],quickIds=new Set(quickItems.map(item=>item.id));state={...state,items:[...quickItems,...storedItems.filter((item:{id?:string})=>!quickIds.has(item.id))],staff,settings:{...baseSettings,...state.settings,storeName:account.storeName,branchName:state.settings?.branchName||account.storeName,logo:account.logo}};if(!row){const updatedAt=new Date().toISOString();await env.DB.prepare("INSERT INTO store_state (id, state_json, updated_at) VALUES (?, ?, ?)").bind(account.tenantId,JSON.stringify(state),updatedAt).run();return {state,updatedAt};}return {state,updatedAt:row.updated_at};}

async function quickInventoryApi(request:Request,env:Env,account:Account){if(!["Owner","Manager","Stock keeper"].includes(account.role))return json({error:"This account cannot add inventory."},403);const body=await request.json() as {items?:Array<Record<string,unknown>>},items=Array.isArray(body.items)?body.items.filter(item=>typeof item.id==="string"&&typeof item.name==="string"&&String(item.name).trim()).slice(0,100):[];if(!items.length)return json({error:"Add at least one valid inventory item."},400);const now=new Date().toISOString();await env.DB.batch(items.map(item=>env.DB.prepare("INSERT OR REPLACE INTO quick_inventory_items (id,tenant_id,item_json,created_at) VALUES (?, ?, ?, ?)").bind(String(item.id),account.tenantId,JSON.stringify(item),now)));const current=await readState(env,account);await audit(env.DB,account,"inventory.quick_added",`Added ${items.length} quick inventory item${items.length===1?"":"s"}`);return json({state:current.state,updatedAt:now,saved:items.length});}

const allowedByRole:Record<Role,string[]|null>={Owner:null,Manager:["items","stockMovements","sales","purchases","suppliers","supplierScans","supplierClaims","landedCostReconciliations","reservations","expenses","customers","customerPayments","orders","transfers","importRequests","financeRecords","statementRecords","loans","dailyClosings","campaigns","branches","stockCounts","attendanceRecords","payrollRecords","tillClosings","returns","discounts"],"Stock keeper":["items","stockMovements","purchases","suppliers","supplierScans","supplierClaims","landedCostReconciliations","reservations","transfers","stockCounts"],Cashier:["sales","customers","customerPayments","orders","reservations","returns","discounts","tillClosings","dailyClosings"]};

async function stateApi(request:Request,env:Env,account:Account){
  if(request.method==="GET"){const current=await readState(env,account);return json({state:current.state,role:account.role,updatedAt:current.updatedAt});}
  const payload=await request.json() as {state?:Record<string,unknown>};if(!payload.state||typeof payload.state!=="object")return json({error:"Invalid store state."},400);
  const current=await readState(env,account),allowed=allowedByRole[account.role];let next=payload.state;
  if(allowed){next={...current.state};for(const key of allowed)if(key in payload.state)next[key]=payload.state[key];}
  next={...next,staff:current.state.staff,settings:account.role==="Owner"?payload.state.settings??current.state.settings:current.state.settings};
  const updatedAt=new Date().toISOString();await env.DB.prepare("INSERT INTO store_state (id, state_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at").bind(account.tenantId,JSON.stringify(next),updatedAt).run();return json({updatedAt,merged:false});
}

async function accountApi(request:Request,env:Env,account:Account,ctx:ExecutionContext){
  if(request.method==="GET")return json({account});if(account.role!=="Owner")return json({error:"Only the store owner can change branding."},403);
  const body=await request.json() as {name?:string;storeName?:string;logo?:string},name=(body.name||"").trim(),storeName=(body.storeName||"").trim(),logo=(body.logo||"").trim();if(name.length<2||storeName.length<2)return json({error:"Enter the owner and store names."},400);if(logo&&logo!=="/cflex-logo.png"&&!logo.startsWith("data:image/"))return json({error:"Choose a valid logo image."},400);if(logo.length>2_800_000)return json({error:"Choose a smaller logo image."},400);
  const now=new Date().toISOString();await env.DB.batch([env.DB.prepare("UPDATE tenants SET owner_name=?,store_name=?,logo=?,profile_complete=1,updated_at=? WHERE id=?").bind(name,storeName,logo,now,account.tenantId),env.DB.prepare("UPDATE tenant_members SET name=?,updated_at=? WHERE tenant_id=? AND email=?").bind(name,now,account.tenantId,account.email)]);const updated={...account,name,storeName,logo,profileComplete:true};ctx.waitUntil(audit(env.DB,updated,"account.brand_updated",`Updated owner and store identity to ${storeName}`));return json({account:updated});
}

async function staffApi(request:Request,env:Env,account:Account){if(account.role!=="Owner")return json({error:"Only the owner can manage staff accounts."},403);const body=await request.json() as {email?:string;name?:string;role?:Role|"Live sales host"},email=normalizeEmail(body.email||""),name=(body.name||"").trim(),role:Role=body.role==="Live sales host"?"Cashier":body.role as Role;if(!email.includes("@")||name.length<2||!role||role==="Owner"||!allowedByRole[role])return json({error:"Enter a valid staff name, email and role."},400);const existing=await env.DB.prepare("SELECT id,tenant_id FROM tenant_members WHERE email=?").bind(email).first<{id:string;tenant_id:string}>();if(existing&&existing.tenant_id!==account.tenantId)return json({error:"This email already belongs to another store."},409);const now=new Date().toISOString();if(existing)await env.DB.prepare("UPDATE tenant_members SET name=?,role=?,status='Active',updated_at=? WHERE id=?").bind(name,role,now,existing.id).run();else await env.DB.prepare("INSERT INTO tenant_members (id,tenant_id,email,name,role,status,created_at,updated_at) VALUES (?, ?, ?, ?, ?, 'Active', ?, ?)").bind(id("MEM"),account.tenantId,email,name,role,now,now).run();await audit(env.DB,account,existing?"staff.account_updated":"staff.account_created",`${name} · ${role}`);return json({reset:!!existing,emailSignIn:true});}

async function imageApi(request:Request){const bytes=new Uint8Array(await request.arrayBuffer());if(!bytes.length||bytes.length>4_000_000)return json({error:"Choose an image smaller than 4 MB."},400);let binary="";for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return json({url:`data:${request.headers.get("content-type")||"image/jpeg"};base64,${btoa(binary)}`});}

async function emailAuthApi(request:Request,env:Env,mode:"signin"|"signup"){
  const body=await request.json() as {name?:string;email?:string;password?:string},email=normalizeEmail(body.email||""),password=body.password||"",name=(body.name||"").trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8)return json({error:"Enter a valid email and a password of at least 8 characters."},400);
  const existing=await env.DB.prepare("SELECT name,password_hash,password_salt FROM auth_users WHERE email=?").bind(email).first<{name:string;password_hash:string;password_salt:string}>();
  if(mode==="signup"){
    if(name.length<2)return json({error:"Enter your full name."},400);if(existing){if(await passwordHash(password,existing.password_salt)===existing.password_hash)return withSession({ok:true},await createSession(env,email));return json({error:"An account already exists for this email. Sign in instead."},409)}
    const salt=bytesToHex(crypto.getRandomValues(new Uint8Array(16))),hash=await passwordHash(password,salt),now=new Date().toISOString();await env.DB.prepare("INSERT INTO auth_users (email,name,password_hash,password_salt,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(email,name,hash,salt,now,now).run();
  }else{
    if(!existing||await passwordHash(password,existing.password_salt)!==existing.password_hash)return json({error:"Incorrect email or password."},401);
  }
  const session=await createSession(env,email);return withSession({ok:true},session);
}

const worker={async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{const url=new URL(request.url);
  if(url.pathname.startsWith("/api/")){
    if(url.pathname==="/api/auth/signup"&&request.method==="POST")try{return await emailAuthApi(request,env,"signup")}catch(error){console.error("Email signup failed",error);return json({error:"We couldn't create the account right now. Please try again."},500)}
    if(url.pathname==="/api/auth/signin"&&request.method==="POST")try{return await emailAuthApi(request,env,"signin")}catch(error){console.error("Email sign-in failed",error);return json({error:"We couldn't sign you in right now. Please try again."},500)}
    const account=await accountFor(request,env);if(!account)return json({error:"Sign in with your email to continue."},401);
    if(url.pathname==="/api/account"&&(request.method==="GET"||request.method==="POST"))try{return await accountApi(request,env,account,ctx)}catch(error){console.error("Account operation failed",error);return json({error:"Your store could not be saved right now. Please try again."},500)}
    if(url.pathname==="/api/state"&&(request.method==="GET"||request.method==="POST"))return stateApi(request,env,account);
    if(url.pathname==="/api/quick-inventory"&&request.method==="POST")return quickInventoryApi(request,env,account);
    if(url.pathname==="/api/image"&&request.method==="POST")return imageApi(request);
    if(url.pathname==="/api/audit"&&request.method==="GET"){const events=(await env.DB.prepare("SELECT action,detail,actor_email,created_at FROM audit_events WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100").bind(account.tenantId).all()).results;return json({events});}
    if(url.pathname==="/api/auth/accounts"&&request.method==="POST")return staffApi(request,env,account);
    if(url.pathname==="/api/auth/logout"&&request.method==="POST"){const token=cookieValue(request,"store_session");if(token)await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash=?").bind(await sha256(token)).run();return new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json","set-cookie":"store_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"}});}
    if(url.pathname==="/api/auth/password"&&request.method==="POST")return json({error:"Password changes will be added in account security settings."},400);
    return json({error:"Not found."},404);
  }
  if(url.pathname==="/_vinext/image"){const allowed=[...DEFAULT_DEVICE_SIZES,...DEFAULT_IMAGE_SIZES];return handleImageOptimization(request,{fetchAsset:(path)=>env.ASSETS.fetch(new Request(new URL(path,request.url))),transformImage:async(body,{width,format,quality})=>(await env.IMAGES.input(body).transform(width>0?{width}:{}).output({format,quality})).response()},allowed);}
  return handler.fetch(request,env,ctx);
}};
export default worker;
