import assert from 'node:assert/strict';
import test from 'node:test';
import { newestBooks, openingExcerpt } from '../../src/books';
import { upsert } from '../../src/api';
import { educationPreset, libraryPresets } from '../../src/preset';

test('new books precede fixed-date presets, and later updates do not reorder old books', () => {
  const recent = { ...educationPreset, id: 'recent', createdAt: '2026-10-28T01:00:00Z', updatedAt: '2026-10-28T01:00:00Z' };
  const old = { ...educationPreset, id: 'old', createdAt: '2026-01-01T01:00:00Z', updatedAt: '2026-10-29T01:00:00Z' };
  const input = [...libraryPresets, old, recent];
  const result = newestBooks(input);
  assert.equal(result[0].id, 'recent');
  assert.equal(result.at(-1)?.id, 'old');
  assert.deepEqual(input.map(job => job.id), [...libraryPresets.map(job => job.id), 'old', 'recent']);
  assert.deepEqual(upsert(result, { ...old, status: 'paused' }).map(job => job.id), result.map(job => job.id));
  assert.deepEqual(result.filter(job => job.provenance === 'preset' && libraryPresets.some(preset => preset.id === job.id)).map(job => job.createdAt).sort(), libraryPresets.map(job => job.createdAt).sort());
});

test('missing, invalid and tied dates have a deterministic fallback across refresh order', () => {
  const jobs = ['z', 'a', 'b'].map(id => ({ ...educationPreset, id, createdAt: id === 'a' ? '' : 'unknown' }));
  assert.deepEqual(newestBooks(jobs).map(job => job.id), ['a', 'b', 'z']);
  assert.deepEqual(newestBooks([...jobs].reverse()).map(job => job.id), ['a', 'b', 'z']);
});

test('cover excerpt uses the opening story text, preserves literal content and bounds Unicode safely', () => {
  assert.ok(openingExcerpt(educationPreset).startsWith(educationPreset.stories[0].paragraphs[0].text));
  assert.ok(!openingExcerpt(educationPreset).startsWith(educationPreset.stories[0].title));
  const story = { ...educationPreset.stories[0], paragraphs: [{ id: 'p', text: '<script>literal</script> * 甲\n\n' + '🐱'.repeat(200) }] };
  const excerpt = openingExcerpt({ ...educationPreset, stories: [story] });
  assert.ok(excerpt.startsWith('<script>literal</script> * 甲 '));
  assert.equal(Array.from(excerpt).length, 181);
  assert.equal(excerpt.at(-1), '…');
  assert.ok(!excerpt.includes('\ufffd'));
  assert.equal(openingExcerpt({ ...educationPreset, stories: [] }), '');
});
