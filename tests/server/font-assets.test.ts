import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import manifest from '../../src/font-assets.json';

test('self-hosted reading font uses verified WOFF2 slices with local URLs and retained licenses', () => {
  const root = join(process.cwd(), 'public/fonts/lxgw-wenkai-screen-v1.7.0');
  const css = readFileSync(join(process.cwd(), 'src/fonts.css'), 'utf8');
  const references = [...css.matchAll(/url\('([^']+)'\)/g)].map(match => match[1]);
  assert.equal(references.length, manifest.files.length);
  assert.equal((css.match(/unicode-range:/g) || []).length, references.length);
  assert.ok(!/url\(['"]?https?:\/\//.test(css));
  assert.deepEqual(new Set(readdirSync(root).filter(file => file.endsWith('.woff2'))), new Set(manifest.files.map(file => file.file)));
  for (const file of manifest.files) {
    const raw = readFileSync(join(root, file.file));
    assert.equal(raw.subarray(0, 4).toString(), 'wOF2');
    assert.equal(raw.byteLength, file.bytes);
    assert.equal(createHash('sha256').update(raw).digest('hex'), file.sha256);
    assert.equal(file.file, `${file.sha256}.woff2`);
    assert.ok(references.includes(`/fonts/lxgw-wenkai-screen-v1.7.0/${file.file}`));
  }
  assert.match(readFileSync(join(root, 'OFL.txt'), 'utf8'), /SIL OPEN FONT LICENSE/);
  assert.match(readFileSync(join(root, 'LICENSE'), 'utf8'), /MIT License/);
});
