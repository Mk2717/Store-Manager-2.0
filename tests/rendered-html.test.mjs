import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const env = {ASSETS:{fetch:async()=>new Response("Not found",{status:404})}};
const context = {waitUntil(){},passThroughOnException(){}};

test("renders development preview metadata", async () => {
  const worker = await loadWorker();

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: {
        accept: "text/html",
        "oai-authenticated-user-email": "owner@example.com",
        "oai-authenticated-user-full-name": "Store%20Owner",
        "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
      },
    }),
    env,
    context,
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("protects account APIs from anonymous access", async()=>{
  const worker=await loadWorker();
  const response=await worker.fetch(new Request("http://localhost/api/account"),env,context);
  assert.equal(response.status,401);
  assert.match((await response.json()).error,/sign in/i);
});

test("shows the email account entry screen without compulsory ChatGPT sign-in",async()=>{
  const worker=await loadWorker();
  const response=await worker.fetch(new Request("http://localhost/",{headers:{accept:"text/html"}}),env,context);
  assert.equal(response.status,200);
  const html=await response.text();
  assert.doesNotMatch(html,/signin-with-chatgpt\?return_to/);
});

test("quick intake writes the saved cloud state into the dashboard inventory cache",async()=>{
  const source=await readFile(new URL("../app/dashboard-shell.tsx",import.meta.url),"utf8");
  assert.match(source,/mode==="inventory"\?"\/api\/quick-inventory":"\/api\/state"/);
  assert.match(source,/writeDashboardState\(\(saveData\.state\|\|current\)/);
  assert.match(source,/liveResponse\.ok&&liveData\.state/);
  assert.match(source,/objectStore\("state"\)\.put\(state,"main"\)/);
});

test("inventory navigation counts all products and POS cards keep readable details below images",async()=>{
  const [bundle,styles,worker]=await Promise.all([
    readFile(new URL("../public/latest-assets/dashboard-client-BG1tO6mo.js",import.meta.url),"utf8"),
    readFile(new URL("../app/globals.css",import.meta.url),"utf8"),
    readFile(new URL("../worker/index.ts",import.meta.url),"utf8"),
  ]);
  assert.match(bundle,/e===`Inventory`&&\(0,Y\.jsx\)\(`em`,\{children:a\.length\}\)/);
  assert.doesNotMatch(bundle,/e===`Inventory`&&\(0,Y\.jsx\)\(`em`,\{children:jt\.length\}\)/);
  assert.match(styles,/\.latestStoreRoot \.products button>strong\{/);
  assert.match(styles,/background:#173c2b;color:#fff/);
  assert.match(styles,/button>em\{[^}]*color:#ffd447!important/);
  assert.doesNotMatch(worker,/CREATE TABLE IF NOT EXISTS/);
});
