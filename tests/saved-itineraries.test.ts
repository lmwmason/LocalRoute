import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";

describe("account-owned saved itinerary list", () => {
  let server: ViteDevServer, browser: Browser, base: string;
  beforeAll(async () => {
    server = await createServer({configFile:false,envDir:false,logLevel:"silent",plugins:[{
      name:"saved-itinerary-fixture",enforce:"pre",
      transform(code,id) {
        if(!id.includes("/src/components/SavedItineraries.tsx"))return;
        return code.replace('import { api } from "../api";', 'const api={plans:()=>globalThis.__savedFixture.load()};').replace('import { supabase } from "../supabase";', 'const supabase={auth:{getSession:async()=>({data:{session:{user:{id:globalThis.__savedFixture.user}}}})}};');
      },
      resolveId(id){if(id==="/__saved_fixture.tsx")return id;},
      load(id){if(id!=="/__saved_fixture.tsx")return;return `import React from"react";import{createRoot}from"react-dom/client";import{MemoryRouter}from"react-router-dom";import{I18nProvider}from"/src/i18n";import{SavedItineraries}from"/src/components/SavedItineraries";import"/src/styles.css";
const root=createRoot(document.getElementById("root"));const sample=Array.from({length:4},(_,i)=>({id:"plan-"+i,result:{schedule:{title:"을지로 예약 시연 · "+(20+i)},input:{startDate:"2026-10-"+(20+i),endDate:"2026-10-"+(20+i)},provenance:"operator_example",cost:0}}));
const fixture=globalThis.__savedFixture={user:"owner",scenario:"success",calls:0,release:null,load(){this.calls++;if(this.scenario==="error")return Promise.reject(new Error("fixture"));if(this.scenario==="pending")return new Promise(resolve=>{this.release=()=>resolve(sample)});return Promise.resolve(this.scenario==="empty"?[]:sample);},render(user="owner"){this.user=user;root.render(<I18nProvider><MemoryRouter><SavedItineraries userId={user}/></MemoryRouter></I18nProvider>);}};fixture.render();`;},
      configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url!=="/__saved_fixture")return next();res.setHeader("Content-Type","text/html");res.end(await s.transformIndexHtml(req.url,'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__saved_fixture.tsx"></script>'));});},
    },react()],server:{host:"127.0.0.1",port:0}});
    await server.listen();const address=server.httpServer!.address();if(!address||typeof address==="string")throw new Error("Missing fixture port");base=`http://127.0.0.1:${address.port}`;browser=await chromium.launch();
  },30000);
  afterAll(async()=>{await browser?.close();await server?.close();});
  for(const width of[360,390,1440])it(`shows all four account plans, labels and 44px links in both languages at ${width}px`,async()=>{
    for(const language of["ko","en"]){const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,reducedMotion:"reduce"});await context.addInitScript(lang=>localStorage.setItem("localroute.language",lang),language);const page=await context.newPage();await page.route("**/*",route=>route.request().url().startsWith(base)?route.continue():route.abort());await page.goto(base+"/__saved_fixture");await page.locator(".saved-plan").first().waitFor();expect(await page.locator(".saved-plan").count()).toBe(4);expect(await page.locator(".saved-plan .badge").first().textContent()).toContain(language==="ko"?"운영자":"Operator");for(const link of await page.locator(".saved-plan").all()){expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);expect(await link.getAttribute("href")).toMatch(/^\/itineraries\/plan-/);}expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await context.close();}
  });
  it("retries errors, shows empty state and ignores a late previous-account result",async()=>{
    const context=await browser.newContext();const page=await context.newPage();await page.goto(base+"/__saved_fixture");await page.locator(".saved-plan").first().waitFor();
    await page.evaluate(()=>{const f=Reflect.get(globalThis,"__savedFixture");f.scenario="error";f.render("error-user");});await page.getByRole("alert").waitFor();
    await page.evaluate(()=>{Reflect.get(globalThis,"__savedFixture").scenario="empty";});await page.getByRole("button").click();await page.getByText(/no saved itineraries|아직 저장한/).waitFor();
    await page.evaluate(()=>{const f=Reflect.get(globalThis,"__savedFixture");f.scenario="pending";f.render("previous-user");});await page.getByRole("status").waitFor();await page.waitForFunction(()=>Boolean(Reflect.get(globalThis,"__savedFixture").release));
    await page.evaluate(()=>{const f=Reflect.get(globalThis,"__savedFixture");f.scenario="empty";f.render("current-user");});await page.getByText(/no saved itineraries|아직 저장한/).waitFor();await page.evaluate(()=>Reflect.get(globalThis,"__savedFixture").release());await page.waitForTimeout(100);expect(await page.locator(".saved-plan").count()).toBe(0);await context.close();
  });
});
