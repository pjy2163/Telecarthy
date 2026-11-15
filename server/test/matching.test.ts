import test from 'node:test';
import assert from 'node:assert/strict';
import { Matching, type Event, type Profile } from '../src/matching.ts';

function setup() {
  let now=100000;
  const ended:string[]=[];
  const e=new Matching(()=>now,1000,id=>ended.push(id));
  const add=(profile:Profile) => { const events:Event[]=[]; const s=e.join(profile,v=>events.push(v)); return {s,events}; };
  return {e,add,ended,advance:(ms:number)=>{now+=ms;}};
}
test('같은 도로 방향과 반경의 대화 가능한 세션만 매칭',()=>{
 const {e,add}=setup();const a=add('A'),b=add('B');add('C');add('D');
 assert.deepEqual(e.candidates(a.s).map(s=>s.id),[b.s.id]);
 e.setAvailable(b.s,false);assert.equal(e.candidates(a.s).length,0);
});
test('수락 전에는 음성 자격 증명을 보내지 않음',()=>{
 const {e,add}=setup();const a=add('A'),b=add('B');e.request(a.s);
 assert.equal(a.s.state,'outgoing');assert.equal(b.s.state,'incoming');
 assert.equal(a.events.some(v=>v.type==='media'),false);
 const id=[...e.pairs.keys()][0];assert.equal(e.accept(a.s,id),undefined);
 assert.equal(e.accept(b.s,id)?.phase,'connecting');
});
test('다른 세션이 요청을 수락하거나 종료할 수 없음',()=>{
 const {e,add}=setup();const a=add('A'),b=add('B'),c=add('C');e.request(a.s);
 const id=[...e.pairs.keys()][0];assert.equal(e.accept(c.s,id),undefined);
 e.end(c.s,id);assert.equal(e.pairs.size,1);assert.equal(b.s.state,'incoming');
});
test('거절 시 다음 후보에게 순차 요청',()=>{
 const {e,add}=setup();const a=add('A'),b=add('B'),b2=add('B');e.request(a.s);
 const first=[...e.pairs.keys()][0];e.decline(b.s,first);
 assert.equal(b.s.state,'ready');assert.equal(b2.s.state,'incoming');
 assert.notEqual([...e.pairs.keys()][0],first);
});
test('시간이 지난 수락은 통화로 연결되지 않음',()=>{
 const {e,add,advance}=setup();const a=add('A'),b=add('B');e.request(a.s);
 const id=[...e.pairs.keys()][0];advance(1001);
 assert.equal(e.accept(b.s,id),undefined);assert.equal(e.pairs.size,0);
});
test('통화가 끝나면 두 참여자와 미디어 룸 정리',()=>{
 const {e,add,ended}=setup();const a=add('A'),b=add('B');e.request(a.s);
 const id=[...e.pairs.keys()][0];e.accept(b.s,id);e.connected(a.s,id);e.connected(b.s,id);
 assert.equal(e.pairs.get(id)?.phase,'in_call');e.end(a.s,id);
 assert.equal(a.s.state,'ready');assert.equal(b.s.state,'ready');assert.deepEqual(ended,[id]);
});
test('종료된 요청의 늦은 토큰 발급 결과를 무시',()=>{
 const {e,add}=setup();const a=add('A'),b=add('B');e.request(a.s);
 const id=[...e.pairs.keys()][0];e.accept(b.s,id);e.end(a.s,id);
 assert.equal(e.mediaReady(id,{}),false);
});
test('연결 해제와 연결 시간 초과 시 상대 상태를 복원',()=>{
 const {e,add,advance}=setup();const a=add('A'),b=add('B');e.request(a.s);
 const id=[...e.pairs.keys()][0];e.accept(b.s,id);advance(26000);e.tick();
 assert.equal(e.pairs.size,0);assert.equal(a.s.state,'ready');
 e.touch(a.s);e.touch(b.s);e.request(a.s);e.leave(b.s);assert.equal(a.s.state,'ready');
});
