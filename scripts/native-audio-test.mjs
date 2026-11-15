import { chromium } from '../server/node_modules/playwright-core/index.mjs';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import os from 'node:os';
const root=path.resolve(import.meta.dirname,'..');
const adb=process.env.ADB??path.join(process.env.ANDROID_HOME??path.join(os.homedir(),'Library/Android/sdk'),'platform-tools/adb');
const serial=process.env.ANDROID_SERIAL??'emulator-5556';
const cmd=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const xml=()=>{cmd('shell','uiautomator','dump','/sdcard/telecar-window.xml');return cmd('shell','cat','/sdcard/telecar-window.xml');};
async function waitNative(text){for(let i=0;i<20;i++){if(xml().includes(text))return;await delay(500);}throw Error('Native state not found: '+text);}
function tap(text){const nodes=xml().match(/<node\b[^>]*>/g)||[];const n=nodes.find(n=>n.includes(`text="${text}"`));if(!n)throw Error('Button not found: '+text);const b=n.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/).slice(1).map(Number);cmd('shell','input','tap',String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2)));}
async function screenshot(name){const data=execFileSync(adb,['-s',serial,'exec-out','screencap','-p']);await fs.writeFile(path.join(root,'docs',name),data);}
async function mediaStats(){for(let i=0;i<30;i++){try{const s=JSON.parse(cmd('shell','cat','/sdcard/Android/data/com.telecarsee.demo/files/media-metrics.json'));if(s.receivedAudioBytes>100&&s.sentAudioBytes>100)return s;}catch{}await delay(500);}throw Error('Native RTP counters not received');}
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
let recorder;
try{
 const user=cmd('shell','am','get-current-user').trim();
 cmd('shell','am','force-stop','--user',user,'com.telecarsee.demo');
 await delay(500);
 cmd('shell','am','start','--user',user,'-n','com.telecarsee.demo/.MainActivity','--es','profile','A');
 await delay(1500);
 if(xml().includes('앱 사용 중에만 허용')) tap('앱 사용 중에만 허용');
 const context=await browser.newContext({permissions:['microphone'],viewport:{width:1280,height:800}});
 const b=await context.newPage();await b.goto('http://127.0.0.1:8787/?profile=B');
 await b.waitForFunction(()=>window.telecarDemo.metrics.state==='ready');
 await waitNative('주변 차량 연결');
 console.log('Native and browser ready');
 await screenshot('01_pleos_ready.png');
 recorder=spawn(adb,['-s',serial,'shell','screenrecord','--size','1280x720','--bit-rate','4000000','--time-limit','90','/sdcard/telecar-demo.mp4']);
 recorder.stderr.on('data',d=>console.error(String(d)));
 await delay(1500);
 tap('주변 차량 연결');
 if(xml().includes('앱 사용 중에만 허용')) tap('앱 사용 중에만 허용');
 await b.waitForFunction(()=>window.telecarDemo.metrics.state==='incoming');
 console.log('Connection request received by browser');
 assert.equal(await b.evaluate(()=>window.telecarDemo.metrics.mediaConnected),false);
 await screenshot('02_pleos_request.png');
 await b.screenshot({path:path.join(root,'docs/03_remote_accept.png')});
 await delay(2000);
 await b.getByRole('button',{name:'연결',exact:true}).click();
 await b.waitForFunction(()=>window.telecarDemo.metrics.state==='in_call',{},{timeout:35000});
 await waitNative('주변 운전자와 대화 중');
 console.log('Native and browser media connected');
 const outgoingStats=await mediaStats();
 await screenshot('04_pleos_call.png');
 tap('음소거');
 await b.waitForFunction(()=>[...window.telecarDemo.getRoom().remoteParticipants.values()].some(p=>[...p.audioTrackPublications.values()].some(t=>t.isMuted)),{},{timeout:10000});
 await delay(1500);
 await screenshot('05_pleos_muted.png');
 tap('마이크 켜기');
 await delay(1500);
 await b.getByRole('button',{name:'통화 종료',exact:true}).click();
 await waitNative('대화 대기');
 await screenshot('06_pleos_ended.png');
 await delay(1500);
 await b.getByRole('button',{name:'주변 차량 연결',exact:true}).click();
 await waitNative('주변 운전자에게서');
 await screenshot('07_pleos_incoming.png');
 await delay(1500);tap('연결');
 await b.waitForFunction(()=>window.telecarDemo.metrics.state==='in_call',{},{timeout:35000});
 const incomingStats=await mediaStats();
 await delay(2000);tap('통화 종료');
 await b.waitForFunction(()=>window.telecarDemo.metrics.state==='ended');
 await waitNative('대화 대기');
 await delay(2000);
 const report={testedAt:new Date().toISOString(),environment:'Pleos Connect 2.1.0 API 34 ARM64 / 2560x1440',browserMicrophone:'Chromium synthetic microphone',nativeMicrophone:'Emulator microphone',outgoingStats,incomingStats,consentGate:true,muteObservedRemotely:true,endFromBothSides:true,pleosTtsConnected:outgoingStats.pleosTtsReady};
 await fs.writeFile(path.join(root,'docs/native-audio-test.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{
 if(recorder){cmd('shell','pkill','-INT','screenrecord');await new Promise(r=>recorder.once('close',r));cmd('pull','/sdcard/telecar-demo.mp4',path.join(root,'.local/native-recording.mp4'));}
 await browser.close();
}
