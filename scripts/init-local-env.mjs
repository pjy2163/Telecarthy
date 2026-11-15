import { randomBytes } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const envFile = path.join(root, 'server', '.env');
const configFile = path.join(root, '.local', 'livekit.yaml');
for (const file of [envFile, configFile]) {
  try {
    await access(file);
    throw new Error('기존 로컬 설정이 있습니다. 파일을 덮어쓰지 않았습니다.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const key = `telecarthy-${randomBytes(8).toString('hex')}`;
const secret = randomBytes(32).toString('hex');
await mkdir(path.dirname(configFile), { recursive: true, mode: 0o700 });
const config = [
  'port: 7880',
  'rtc:',
  '  tcp_port: 7881',
  '  udp_port: 7882',
  '  use_external_ip: false',
  '  node_ip: 127.0.0.1',
  'keys:',
  `  ${key}: ${secret}`,
  '',
].join('\n');
await writeFile(configFile, config, { mode: 0o600, flag: 'wx' });
await writeFile(envFile, [
  'PORT=8787',
  'LIVEKIT_URL=ws://127.0.0.1:7880',
  `LIVEKIT_API_KEY=${key}`,
  `LIVEKIT_API_SECRET=${secret}`,
  '',
].join('\n'), { mode: 0o600, flag: 'wx' });
console.log('로컬 서버 설정을 생성했습니다. 키 값은 출력하지 않았습니다.');
