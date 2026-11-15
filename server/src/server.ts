import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { Matching, PROFILES, type Profile } from './matching.ts';

const port = Number(process.env.PORT ?? 8787);
const mediaUrl = process.env.LIVEKIT_URL ?? 'ws://127.0.0.1:7880';
const key = process.env.LIVEKIT_API_KEY;
const secret = process.env.LIVEKIT_API_SECRET;
if (!key || !secret || secret.length < 32) {
  throw new Error('LIVEKIT_API_KEY와 32자 이상의 LIVEKIT_API_SECRET을 서버 환경변수로 설정하세요.');
}
const rooms = new RoomServiceClient(mediaUrl.replace(/^ws/,'http'),key,secret);
const engine = new Matching(undefined,12000,id => { void rooms.deleteRoom(id).catch(() => {}); });
const root = fileURLToPath(new URL('../public/',import.meta.url));
const files: Record<string,[string,string]> = {
  '/': ['index.html','text/html; charset=utf-8'],
  '/tester.js': ['tester.js','text/javascript; charset=utf-8'],
  '/style.css': ['style.css','text/css; charset=utf-8'],
};
const server = http.createServer(async (req,res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
  if (path === '/health') { res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true,demo:true,participants:engine.sessions.size})); return; }
  let file: string, mime: string;
  if (path === '/livekit.js') { file=fileURLToPath(new URL('../node_modules/livekit-client/dist/livekit-client.umd.js',import.meta.url)); mime='text/javascript'; }
  else if (files[path]) { [file,mime]=files[path]; file=root+file; }
  else { res.writeHead(404); res.end('Not found'); return; }
  try { const body=await readFile(file); res.writeHead(200,{'Content-Type':mime}); res.end(body); }
  catch { res.writeHead(500); res.end('File unavailable'); }
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection',(socket,req) => {
  const origin = req.headers.origin;
  if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) { socket.close(1008,'Local demo only'); return; }
  let session: ReturnType<typeof engine.join> | undefined;
  let lastRequest=0;
  const send = (event: unknown) => { if (socket.readyState===WebSocket.OPEN) socket.send(JSON.stringify(event)); };
  socket.on('message',async raw => {
    let data: any;
    try { data=JSON.parse(raw.toString()); } catch { socket.close(1007,'Invalid JSON'); return; }
    if (data?.type === 'join' && !session) {
      if (!(data.profile in PROFILES) || engine.sessions.size >= 30) { socket.close(1008,'Invalid profile'); return; }
      session=engine.join(data.profile as Profile,send); return;
    }
    if (!session || !engine.sessions.has(session.id)) { socket.close(1008,'Join required'); return; }
    engine.touch(session);
    switch(data.type) {
      case 'ping': send({type:'pong'}); break;
      case 'available': engine.setAvailable(session,data.value === true); break;
      case 'request':
        if (Date.now()-lastRequest < 1500) return;
        lastRequest=Date.now(); engine.request(session); break;
      case 'decline': engine.decline(session,String(data.callId)); break;
      case 'accept': {
        const pair=engine.accept(session,String(data.callId)); if (!pair) return;
        try {
          const credentials: Record<string,{url:string;token:string}>={};
          await Promise.all([pair.caller,pair.callee].map(async id => {
            const at=new AccessToken(key,secret,{identity:id,ttl:'2m'});
            at.addGrant({roomJoin:true,room:pair.id,canPublish:true,canSubscribe:true,canPublishData:false,canPublishSources:[TrackSource.MICROPHONE]});
            credentials[id]={url:mediaUrl,token:await at.toJwt()};
          }));
          engine.mediaReady(pair.id,credentials);
        } catch { engine.end(session,pair.id,'connection_error'); }
        break;
      }
      case 'connected': engine.connected(session,String(data.callId)); break;
      case 'end': engine.end(session,String(data.callId)); break;
      case 'media_error': engine.end(session,String(data.callId),'connection_error'); break;
      default: send({type:'notice',message:'지원하지 않는 요청입니다.'});
    }
  });
  socket.on('close',() => { if(session) engine.leave(session); });
  socket.on('error',() => {});
});
const timer=setInterval(() => engine.tick(),1000);
server.listen(port,'127.0.0.1',() => console.log(`텔레CAR시 로컬 데모 http://127.0.0.1:${port} / 가상 위치 · 실제 음성`));
process.on('SIGTERM',() => { clearInterval(timer); wss.close(); server.close(); });
