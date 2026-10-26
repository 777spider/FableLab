import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateProductionConfig} from '../../server/config.ts';

const valid = {
  synthetic: false,
  cookieSecret: 'synthetic-test-secret-'.repeat(3),
  accessCodeHash: createHash('sha256').update('a custom synthetic invite code').digest('hex'),
  publicOrigin: 'https://fablelab.example',
};

test('production rejects synthetic generation and the local demo invitation code', () => {
  assert.throws(() => validateProductionConfig({...valid, synthetic: true}), /SYNTHETIC_DISABLED_IN_PRODUCTION/);
  assert.throws(() => validateProductionConfig({...valid, accessCodeHash: createHash('sha256').update('1025').digest('hex')}), /DEMO_ACCESS_CODE_DISABLED_IN_PRODUCTION/);
});

test('production requires independent access settings and an explicit HTTPS origin', () => {
  for (const changed of [{cookieSecret: undefined}, {cookieSecret: 'short'}, {accessCodeHash: ''}]) {
    assert.throws(() => validateProductionConfig({...valid, ...changed}), /STUDIO_ACCESS_ENV_REQUIRED/);
  }
  for (const publicOrigin of [undefined, 'http://fablelab.example', 'https://fablelab.example/learn', 'https://user:pass@fablelab.example']) {
    assert.throws(() => validateProductionConfig({...valid, publicOrigin}), /STUDIO_HTTPS_ORIGIN_REQUIRED/);
  }
  assert.doesNotThrow(() => validateProductionConfig(valid));
});
