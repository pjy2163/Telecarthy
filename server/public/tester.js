/* Browser companion for the native automotive APK. Location is synthetic. */
const $=id=>document.getElementById(id);
const query=new URLSearchParams(location.search);
const profile=$('profile');profile.value=query.get('profile')||'B';
let socket,room,callId,state='offline',muted=false,nearby=0,connectedAt=0,timer;
let connectionGeneration=0,mediaGeneration=0;
const metrics={receivedAudioTracks:0,mediaConnected:false,state:'offline',bytesReceived:0};
window.telecarDemo={metrics,getRoom:()=>room};
function send(type,extra={}){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type,callId,...extra}));}
function button(label,fn,kind=''){const b=document.createElement('button');b.textContent=label;b.className=kind;b.onclick=fn;return b;}
function render(message){
 metrics.state=state;profile.disabled=['outgoing','incoming','connecting','in_call'].includes(state);
 $('available').disabled=profile.disabled;
 $('state').textContent=({offline:'매칭 서버 연결 중',ready:'대화 준비',outgoing:'연결 요청 중',incoming:'연결 요청 수신',connecting:'음성 연결 중',in_call:'실제 음성 통화',ended:'대화 종료'})[state];
 $('title').textContent=({offline:'서버 연결 확인',ready:'주변 운전자와 연결',outgoing:'연결 응답을\n기다리고 있어요',incoming:'주변 운전자에게서\n연결 요청이 왔어요',connecting:'음성을 연결하고 있어요',in_call:'주변 운전자와 대화 중',ended:'대화가 종료됐어요'})[state];
 if(message)$('message').textContent=message;
 $('nearby').textContent=`가상 차량 ${profile.value} · 반경 500m · 대화 가능한 참여자 ${nearby}명`;
 const a=$('actions');a.replaceChildren();
 if(['ready','ended'].includes(state))a.append(button('주변 차량 연결',()=>{void preparePlayback();send('request');}));
 if(state==='incoming')a.append(button('거절',()=>send('decline'),'secondary'),button('연결',accept));
 if(['outgoing','connecting'].includes(state))a.append(button('연결 취소',end,'secondary'));
 if(state==='in_call')a.append(button(muted?'마이크 켜기':'음소거',toggleMute,'secondary'),button('통화 종료',end,'danger'));
 if(state==='offline')a.append(button('서버 다시 연결',connect,'secondary'));
}
async function preparePlayback(){
 // User gesture unlocks playback, but never starts microphone capture before consent.
 const AudioContext=window.AudioContext||window.webkitAudioContext;
 if(AudioContext){window.telecarAudioContext??=new AudioContext();await window.telecarAudioContext.resume();}
}
async function accept(){await preparePlayback();send('accept');}
async function clearMedia(){
 mediaGeneration++;metrics.mediaConnected=false;clearInterval(timer);
 const r=room;room=null;if(r)await r.disconnect();
 $('remote-audio').replaceChildren();muted=false;
}
async function end(){send('end');await clearMedia();callId=null;state='ended';render('대화가 종료됐습니다.');}
async function toggleMute(){try{if(room){await room.localParticipant.setMicrophoneEnabled(muted);muted=!muted;render();}}catch{render('마이크 상태를 변경하지 못했습니다.');}}
async function media(e){
 const id=e.callId;if(id!==callId)return;
 await clearMedia();const generation=mediaGeneration;
 const r=new LivekitClient.Room({adaptiveStream:false,dynacast:false});room=r;
 r.on(LivekitClient.RoomEvent.TrackSubscribed,(track)=>{
  if(track.kind==='audio'){metrics.receivedAudioTracks++;const el=track.attach();el.autoplay=true;$('remote-audio').append(el);}
 });
 r.on(LivekitClient.RoomEvent.Disconnected,()=>{
  if(room===r&&callId===id){send('media_error');void clearMedia();state='ended';render('음성 연결이 끊어졌습니다.');}
 });
 try{
  await r.connect(e.url,e.token);
  if(generation!==mediaGeneration||id!==callId){await r.disconnect();return;}
  await r.startAudio();
  await r.localParticipant.setMicrophoneEnabled(true);
  metrics.mediaConnected=true;send('connected');
 }catch(error){
  if(generation!==mediaGeneration)return;
  send('media_error');await clearMedia();state='ended';render('마이크 권한과 음성 서버 연결을 확인해주세요.');
  console.error('Media connection failed:',error.message);
 }
}
function connect(){
 const generation=++connectionGeneration;
 socket?.close();void clearMedia();callId=null;state='offline';render();
 socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);
 socket.onopen=()=>{send('join',{profile:profile.value});$('connection').textContent='매칭 서버 연결됨';};
 socket.onmessage=({data})=>{
  if(generation!==connectionGeneration)return;
  const e=JSON.parse(data);
  if(e.type==='hello'){state='ready';render('같은 도로·방향의 참여자에게 연결을 요청하세요.');}
  if(e.type==='snapshot'){nearby=e.nearby;$('available').checked=e.available;render();}
  if(['incoming','outgoing','connecting'].includes(e.type)){state=e.type;callId=e.callId;metrics.callId=e.callId;render(state==='incoming'?'수락하면 실제 목소리가 전달됩니다.':'상대방의 수락 후 음성이 연결됩니다.');}
  if(e.type==='media')void media(e);
  if(e.type==='active'){state='in_call';connectedAt=Date.now();render('00:00 · 실제 목소리가 전달되고 있습니다.');timer=setInterval(()=>{const t=Math.floor((Date.now()-connectedAt)/1000);$('message').textContent=`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')} · 실제 목소리가 전달되고 있습니다.`;},1000);}
  if(e.type==='ended'){void clearMedia();callId=null;state='ended';render(e.message);}
  if(e.type==='notice')render(e.message);
 };
 socket.onclose=()=>{if(generation!==connectionGeneration)return;void clearMedia();callId=null;state='offline';render('서버 연결이 끊어졌습니다. 다시 연결해주세요.');$('connection').textContent='오프라인';};
 socket.onerror=()=>{};
}
profile.onchange=()=>connect();$('available').onchange=()=>send('available',{value:$('available').checked});
setInterval(()=>send('ping'),5000);window.addEventListener('pagehide',()=>{send('end');socket?.close();void clearMedia();});
connect();
