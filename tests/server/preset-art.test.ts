import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import manifest from '../../src/preset-art.json';
import data from '../../src/preset-data.json';
import {preset} from '../../src/preset.ts';

function webpSize(bytes: Buffer) {
  assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length);
  const kind = bytes.subarray(12, 16).toString();
  if (kind === 'VP8X') return {width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1};
  if (kind === 'VP8L') {
    assert.equal(bytes[20], 0x2f);
    const bits = bytes.readUInt32LE(21);
    return {width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1};
  }
  assert.equal(kind, 'VP8 ');
  assert.deepEqual(bytes.subarray(23, 26), Buffer.from([0x9d, 0x01, 0x2a]));
  return {width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff};
}

test('all public preset WebP files are complete, content-addressed and match their actual dimensions', () => {
  const images: Record<string, typeof manifest[keyof typeof manifest]> = manifest;
  const sources = ['forest', 'lighthouse', ...data.stories.flatMap(story => story.pages.map(page => page.image))];
  assert.deepEqual(Object.keys(images).sort(), [...sources].sort());
  assert.equal(sources.length, 12);
  const names = [];
  for (const image of Object.values(images)) {
    const display = readFileSync(new URL('../../public/' + image.url.slice('/learn/'.length), import.meta.url));
    const sha256 = createHash('sha256').update(display).digest('hex');
    assert.equal(image.sha256, sha256);
    assert.equal(image.url, '/learn/art/optimized/' + sha256 + '.webp');
    assert.equal(display.length, image.bytes);
    assert.deepEqual(webpSize(display), {width: image.width, height: image.height});
    assert.ok(image.width <= 1280 && image.height <= 1280);
    assert.ok(image.bytes < 250_000);
    names.push(sha256 + '.webp');
  }
  assert.deepEqual(readdirSync(new URL('../../public/art/optimized/', import.meta.url)).sort(), names.sort());
  assert.deepEqual(preset.stories.flatMap(story => story.pages.map(page => page.image.url)),
    data.stories.flatMap(story => story.pages.map(page => images[page.image].url)));
});
