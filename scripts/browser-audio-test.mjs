import { chromium } from '../server/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
try {
 const context=await browser.newContext({permissions:['microphone'],viewport:{width:1280,height:800}});
 const a=await context.newPage(),b=await context.newPage();
 for(const p of [a,b]) p.on('pageerror',error=>console.error('pageerror',error.message));
 await a.goto('http://127.0.0.1:8787/?profile=A');await b.goto('http://127.0.0.1:8787/?profile=B');
 await a.waitForFunction(()=>window.telecarDemo.metrics.state==='ready');
 await b.waitForFunction(()=>window.telecarDemo.metrics.state==='ready');
 await a.getByRole('button',{name:'주변 차량 연결',exact:true}).click();
 await b.getByRole('button',{name:'연결',exact:true}).waitFor();
 assert.equal(await a.evaluate(()=>window.telecarDemo.metrics.mediaConnected),false);
 assert.equal(await b.evaluate(()=>window.telecarDemo.metrics.mediaConnected),false);
 await b.getByRole('button',{name:'연결',exact:true}).click();
 await a.waitForFunction(()=>window.telecarDemo.metrics.state==='in_call',{},{timeout:30000});
 await b.waitForFunction(()=>window.telecarDemo.metrics.state==='in_call',{},{timeout:30000});
 await a.waitForFunction(()=>window.telecarDemo.metrics.receivedAudioTracks>0);
 await b.waitForFunction(()=>window.telecarDemo.metrics.receivedAudioTracks>0);
 await a.waitForTimeout(2500);
 // Count actual RTP audio bytes received on both clients, not only connection events.
 for(const p of [a,b]) await p.waitForFunction(async()=>{
   const reports=await window.telecarDemo.getRoom().engine.pcManager.subscriber.getStats();
   let bytes=0;reports.forEach(s=>{if(s.type==='inbound-rtp'&&(s.kind==='audio'||s.mediaType==='audio'))bytes+=s.bytesReceived||0;});return bytes>100;
 },{},{timeout:20000});
 const stats=await Promise.all([a,b].map(p=>p.evaluate(async()=>{
   const r=window.telecarDemo.getRoom();const reports=await r.engine.pcManager.subscriber.getStats();
   let bytes=0,packets=0;reports.forEach(s=>{if(s.type==='inbound-rtp'&&(s.kind==='audio'||s.mediaType==='audio')){bytes+=s.bytesReceived||0;packets+=s.packetsReceived||0;}});
   return {bytes,packets,reports:[...reports.values()].filter(s=>s.type==='inbound-rtp')};
 })));
 console.log('RTP counters',JSON.stringify(stats));
 assert.ok(stats.every(s=>s.bytes>0),'Both clients must receive actual audio bytes');
 await a.getByRole('button',{name:'음소거',exact:true}).click();
 const disabled=await a.evaluate(()=>!window.telecarDemo.getRoom().localParticipant.isMicrophoneEnabled);assert.equal(disabled,true);
 await a.getByRole('button',{name:'통화 종료',exact:true}).click();
 await b.waitForFunction(()=>window.telecarDemo.metrics.state==='ended');
 assert.equal(await b.evaluate(()=>window.telecarDemo.getRoom()),null);
 const report={testedAt:new Date().toISOString(),scope:'Two browser clients; synthetic microphone source',consentGate:true,bidirectionalRtp:stats,mute:true,remoteEnd:true};
 await fs.writeFile(path.join(root,'docs/browser-audio-test.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
} finally {await browser.close();}
