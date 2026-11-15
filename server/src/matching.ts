import { randomUUID } from 'node:crypto';

export const PROFILES = {
  A: { name: '가상 차량 A', road: 'demo-road', direction: 'north', lat: 37.500, lon: 127.030 },
  B: { name: '가상 차량 B', road: 'demo-road', direction: 'north', lat: 37.502, lon: 127.030 },
  C: { name: '범위 밖 차량 C', road: 'demo-road', direction: 'north', lat: 37.520, lon: 127.030 },
  D: { name: '반대 방향 차량 D', road: 'demo-road', direction: 'south', lat: 37.501, lon: 127.030 },
} as const;
export type Profile = keyof typeof PROFILES;
export type State = 'ready' | 'outgoing' | 'incoming' | 'connecting' | 'in_call';
export type Event = Record<string, unknown> & { type: string };
export interface Session {
  id: string; profile: Profile; available: boolean; state: State; lastSeen: number;
  send: (event: Event) => void;
}
interface Pair { id: string; caller: string; callee: string; phase: 'ringing' | 'connecting' | 'in_call'; deadline: number; tried: Set<string> }
export function distance(a: Profile, b: Profile): number {
  const pa = PROFILES[a], pb = PROFILES[b], r = Math.PI / 180;
  const h = Math.sin((pb.lat-pa.lat)*r/2)**2 + Math.cos(pa.lat*r)*Math.cos(pb.lat*r)*Math.sin((pb.lon-pa.lon)*r/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}

export class Matching {
  sessions = new Map<string, Session>();
  pairs = new Map<string, Pair>();
  constructor(private now = () => Date.now(), private ringMs = 12000, private endMedia = (_: string) => {}) {}

  join(profile: Profile, send: Session['send']) {
    const s: Session = { id: randomUUID(), profile, available: true, state: 'ready', lastSeen: this.now(), send };
    this.sessions.set(s.id, s);
    send({ type: 'hello', sessionId: s.id, profile, profiles: PROFILES, demo: true });
    this.broadcast();
    return s;
  }
  candidates(s: Session, excluded = new Set<string>()) {
    return [...this.sessions.values()].filter(t => t.id !== s.id && !excluded.has(t.id)
      && t.available && t.state === 'ready' && this.now()-t.lastSeen < 20000
      && PROFILES[t.profile].road === PROFILES[s.profile].road
      && PROFILES[t.profile].direction === PROFILES[s.profile].direction
      && distance(t.profile, s.profile) <= 500)
      .sort((a,b) => distance(s.profile,a.profile)-distance(s.profile,b.profile));
  }
  broadcast() {
    for (const s of this.sessions.values()) s.send({ type: 'snapshot', state: s.state, profile: s.profile,
      available: s.available, nearby: this.candidates(s).length, radius: 500, demo: true });
  }
  touch(s: Session) { s.lastSeen = this.now(); }
  setAvailable(s: Session, value: boolean) { s.available = value; this.broadcast(); }
  request(s: Session) {
    if (s.state !== 'ready') return s.send({ type: 'notice', message: '이미 연결을 진행하고 있습니다.' });
    this.offer(s, new Set());
  }
  private offer(s: Session, tried: Set<string>) {
    const target = this.candidates(s, tried)[0];
    if (!target) {
      s.state = 'ready'; s.send({ type: 'ended', reason: 'no_candidate', message: '현재 연결 가능한 주변 참여자가 없습니다.' });
      this.broadcast(); return;
    }
    tried.add(target.id);
    const pair: Pair = { id: randomUUID(), caller: s.id, callee: target.id, phase: 'ringing', deadline: this.now()+this.ringMs, tried };
    this.pairs.set(pair.id, pair); s.state = 'outgoing'; target.state = 'incoming';
    s.send({ type: 'outgoing', callId: pair.id, expiresIn: this.ringMs/1000 });
    target.send({ type: 'incoming', callId: pair.id, expiresIn: this.ringMs/1000 });
    this.broadcast();
  }
  find(s: Session, id: string) { const p = this.pairs.get(id); return p && (p.caller === s.id || p.callee === s.id) ? p : undefined; }
  accept(s: Session, id: string) {
    const p = this.find(s,id);
    if (!p || p.callee !== s.id || p.phase !== 'ringing') return undefined;
    if (this.now() >= p.deadline) { this.decline(s,id); return undefined; }
    p.phase = 'connecting'; p.deadline = this.now()+25000;
    for (const sid of [p.caller,p.callee]) {
      const member = this.sessions.get(sid);
      if (member) { member.state = 'connecting'; member.send({ type: 'connecting', callId: p.id }); }
    }
    this.broadcast(); return p;
  }
  mediaReady(id: string, credentials: Record<string, { url: string; token: string }>) {
    const p = this.pairs.get(id);
    if (!p || p.phase !== 'connecting') return false;
    for (const sid of [p.caller,p.callee]) {
      const s = this.sessions.get(sid);
      if (s) s.send({ type: 'media', callId: p.id, ...credentials[sid] });
    }
    return true;
  }
  connected(s: Session, id: string) {
    const p = this.find(s,id);
    if (!p || p.phase === 'ringing') return;
    s.state = 'in_call';
    if ([p.caller,p.callee].every(sid => this.sessions.get(sid)?.state === 'in_call')) {
      p.phase = 'in_call'; p.deadline = Infinity;
      for (const sid of [p.caller,p.callee]) this.sessions.get(sid)?.send({ type: 'active', callId: id });
    }
    this.broadcast();
  }
  decline(s: Session, id: string) {
    const p = this.find(s,id);
    if (!p || p.callee !== s.id || p.phase !== 'ringing') return;
    this.pairs.delete(id); s.state = 'ready';
    s.send({ type: 'ended', reason: 'declined', message: '연결 요청을 거절했습니다.' });
    const caller = this.sessions.get(p.caller);
    if (caller) { caller.state = 'ready'; this.offer(caller,p.tried); }
    this.broadcast();
  }
  end(s: Session, id: string, reason = 'ended') {
    const p = this.find(s,id); if (!p) return;
    this.finish(p,reason);
  }
  private finish(p: Pair, reason: string) {
    this.pairs.delete(p.id);
    for (const sid of [p.caller,p.callee]) {
      const s = this.sessions.get(sid);
      if (s) { s.state = 'ready'; s.send({ type: 'ended', reason, message: reason === 'connection_error' ? '음성 연결을 완료하지 못했습니다.' : reason === 'disconnected' ? '상대방의 연결이 끊어졌습니다.' : '대화가 종료됐습니다.' }); }
    }
    this.endMedia(p.id); this.broadcast();
  }
  leave(s: Session) {
    for (const p of [...this.pairs.values()]) if (p.caller === s.id || p.callee === s.id) this.finish(p,'disconnected');
    this.sessions.delete(s.id); this.broadcast();
  }
  tick() {
    for (const p of [...this.pairs.values()]) if (this.now() >= p.deadline) {
      if (p.phase === 'ringing') { const callee = this.sessions.get(p.callee); if (callee) this.decline(callee,p.id); else this.finish(p,'disconnected'); }
      else this.finish(p,'connection_error');
    }
    for (const s of [...this.sessions.values()]) if (this.now()-s.lastSeen >= 30000) this.leave(s);
  }
}
