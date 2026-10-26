import assert from 'node:assert/strict';
import test from 'node:test';
import { educationPreset, libraryPresets, preset, presetForDemo, presetURL } from '../../src/preset';

test('both fixed bookshelf examples are complete public lessons with stable links', () => {
  assert.equal(libraryPresets.length, 2);
  assert.equal(new Set(libraryPresets.map(job => job.id)).size, 2);
  assert.equal(presetForDemo('1'), preset);
  assert.equal(presetForDemo('education-xai'), educationPreset);
  assert.equal(presetForDemo('unknown-example'), null);
  for (const job of libraryPresets) {
    const url = new URL(presetURL(job), 'https://fablelab.invalid');
    assert.equal(presetForDemo(url.searchParams.get('demo'))?.id, job.id);
    assert.equal(job.provenance, 'preset');
    assert.equal(job.status, 'completed');
    assert.ok(job.lesson?.definition);
    assert.equal(job.progress.attempts, 0);
    assert.ok(!url.searchParams.has('job'));
  }
});

test('the seven-page education case retains every paragraph and real quotation anchors', () => {
  const story = educationPreset.stories[0];
  assert.equal(story.pages.length, 7);
  assert.equal(story.paragraphs.length, 17);
  assert.equal(story.pages.map(page => page.text).join('\n\n'), story.text);
  assert.deepEqual(story.pages.flatMap(page => page.paragraphIds), story.paragraphs.map(paragraph => paragraph.id));
  for (const mapping of educationPreset.lesson!.mapping) {
    const paragraph = story.paragraphs.find(item => item.id === mapping.paragraphId);
    assert.ok(paragraph && paragraph.text.includes(mapping.quote));
    assert.equal(mapping.storyId, story.id);
  }
  assert.equal(educationPreset.discussion.length, 3);
  assert.equal(educationPreset.knowledge!.sources.length, 3);
  assert.ok(!educationPreset.lesson!.academicExplanation.includes('<'));
});
