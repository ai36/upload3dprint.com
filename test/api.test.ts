import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preflight, type Context } from '../functions/api/_lib.ts';
import { presign } from '../functions/api/upload-url.ts';

const ctx = (origin: string) =>
  ({ request: new Request('http://x/api/quote', { method: 'OPTIONS', headers: { Origin: origin } }), env: { APP_ORIGINS: 'https://a.test, capacitor://localhost' } }) as unknown as Context;

test('T005: allowed origin gets CORS headers', () => {
  const r = preflight(ctx('capacitor://localhost'));
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'capacitor://localhost');
});

test('T005: foreign origin gets none', () => {
  assert.equal(preflight(ctx('https://evil.test')).headers.get('Access-Control-Allow-Origin'), null);
});

test('T014: SigV4 presign matches the AWS documentation example', async () => {
  const url = await presign({
    method: 'GET',
    host: 'examplebucket.s3.amazonaws.com',
    path: '/test.txt',
    region: 'us-east-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    date: new Date('2013-05-24T00:00:00Z'),
    expires: 86400,
  });
  assert.match(url, /X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404$/);
});
