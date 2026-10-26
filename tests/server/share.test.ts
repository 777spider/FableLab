import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, unlinkSync, existsSync} from 'node:fs';
import {join, resolve, sep, basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {ShareService, ShareError} from '../../server/share.ts';
import type {JobDTO} from '../../shared/contracts.ts';

const owner = 'acct_' + 'a'.repeat(32);
function fixture() {const dir = mkdtempSync(join(tmpdir(), 'studio-share-')); return {dir, shares: new ShareService(dir)};}
function removeFixture(directory: string) {
  const target = resolve(directory);
  assert.ok(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith('studio-share-'));
  rmSync(target, {recursive: true, force: true});
}
function job(): JobDTO {
  return {id: 'local-private-job-id', concept: '反馈', format: 'comic', status: 'completed', phase: 'complete', storyCount: 1,
    createdAt: '2026-10-26T00:00:00.000Z', updatedAt: '2026-10-26T00:01:00.000Z',
    progress: {completedStages: ['knowledge'], stageLabel: 'private stage', elapsedMs: 1000, etaMs: null, attempts: 7, attemptBudget: 48},
    knowledge: {concept: '反馈', definition: '依据结果调整后续行动。', coreRelations: ['结果影响下一轮行动'], prerequisites: [], misconceptions: [], academicUse: '局部调整', searchTerms: ['反馈'], sources: [{title: '合成资料', authors: '本地测试', year: '2026', url: 'https://example.test/source', verificationStatus: 'unverified'}]},
    stories: [{id: 'story-1', title: '灯塔', sourceDomain: '航海', text: '船员根据回声修正航向。', characters: [{name: '船员', visualDesign: 'PRIVATE_VISUAL_DESIGN'}],
      paragraphs: [{id: 'p1', text: '船员根据回声修正航向。'}], pages: [{id: 'page-1', title: '回声', text: '船员根据回声修正航向。', alt: '船与灯塔', paragraphIds: ['p1'], image: {status: 'pending', error: 'PRIVATE_IMAGE_ERROR'}}]}],
    lesson: {definition: '依据结果调整后续行动。', principles: ['下一轮行动受已有结果影响'], academicExplanation: '反馈关系具有时间方向。', mapping: [{storyId: 'story-1', paragraphId: 'p1', quote: '船员根据回声修正航向。', relation: '依据结果调整', explanation: '回声是后续调整的依据。'}], boundaries: ['无需推断所有系统都稳定'], workedExample: '根据练习结果调整训练。'},
    tasks: [{id: 'apply-1', kind: 'application', prompt: '下一轮如何调整？', options: [{id: 'a', text: '依据结果调整'}], correctAnswer: 'a', explanation: '结果影响后续行动。'}],
    discussion: [{prompt: '何时反馈可能无效？', guidance: '检查结果是否及时。'}], error: null, quality: 'checked', provenance: 'generated'};
}
function image(directory: string, label: string) {
  const bytes = Buffer.from('synthetic local image bytes ' + label), name = createHash('sha256').update(bytes).digest('hex') + '.png', path = join(directory, name);
  writeFileSync(path, bytes); return {bytes, name, path};
}

test('snapshots project only allowed fields and remain immutable after private files and job objects change', () => {
  const s = fixture(); let shares = s.shares;
  try {
    const value = job(), media = image(s.dir, 'first'); value.stories[0].pages[0].image = {status: 'ready', url: '/learn/media/' + media.name};
    const extra = value as JobDTO & {owner: string; prompts: string[]}; extra.owner = 'PRIVATE_OWNER'; extra.prompts = ['PRIVATE_PROMPT'];
    Object.assign(value.lesson!, {trace: 'PRIVATE_LESSON_TRACE'}); Object.assign(value.knowledge!.sources[0], {providerKey: 'PRIVATE_SOURCE_KEY'});
    Object.assign(value.stories[0].pages[0], {raw: 'PRIVATE_PAGE_RAW'});
    const published = shares.publish(owner, value, name => name === media.name ? media.path : null), token = published.url.split('/').at(-1)!;
    assert.equal(shares.status('acct_' + 'b'.repeat(32), value.id), null); assert.deepEqual(shares.status(owner, value.id), published);
    const snapshot = shares.read(token)!, text = JSON.stringify(snapshot);
    for (const key of ['PRIVATE_', value.id, 'visualDesign', 'elapsedMs', 'attemptBudget', 'storyCount']) assert.equal(text.includes(key), false);
    assert.deepEqual(snapshot.stories[0].characters, [{name: '船员'}]);
    assert.equal(snapshot.knowledge!.sources[0].verificationStatus, 'unverified');
    const publicName = snapshot.stories[0].pages[0].image.url!.split('/').at(-1)!;
    assert.deepEqual(readFileSync(shares.media(token, publicName)!), media.bytes);
    value.concept = '之后修改的概念'; value.stories[0].pages[0].text = '之后修改的正文'; unlinkSync(media.path);
    assert.deepEqual(shares.read(token), snapshot); assert.deepEqual(readFileSync(shares.media(token, publicName)!), media.bytes);
    assert.deepEqual(shares.publish(owner, value, () => null), published);
    shares.close(); shares = new ShareService(s.dir); assert.deepEqual(shares.read(token), snapshot);
  } finally {shares.close(); removeFixture(s.dir);}
});

test('each share can serve only its own frozen image allowlist and revoked tokens never recover', () => {
  const s = fixture();
  try {
    const a = job(), b = job(), imageA = image(s.dir, 'A'), imageB = image(s.dir, 'B'); b.id = 'other-private-job-id';
    a.stories[0].pages[0].image = {status: 'ready', url: '/learn/media/' + imageA.name}; b.stories[0].pages[0].image = {status: 'ready', url: '/learn/media/' + imageB.name};
    const shareA = s.shares.publish(owner, a, () => imageA.path), shareB = s.shares.publish(owner, b, () => imageB.path), tokenA = shareA.url.split('/').at(-1)!, tokenB = shareB.url.split('/').at(-1)!;
    assert.ok(s.shares.media(tokenA, imageA.name)); assert.equal(s.shares.media(tokenA, imageB.name), null); assert.ok(s.shares.media(tokenB, imageB.name));
    assert.equal(s.shares.media(tokenA, '../' + imageA.name), null); assert.equal(s.shares.read('é'.repeat(43)), null);
    s.shares.revoke(owner, a.id); s.shares.revoke(owner, a.id); assert.equal(s.shares.read(tokenA), null); assert.equal(s.shares.media(tokenA, imageA.name), null);
    const replacement = s.shares.publish(owner, a, () => imageA.path); assert.notEqual(replacement.url, shareA.url); assert.equal(s.shares.read(tokenA), null); assert.ok(s.shares.read(tokenB));
  } finally {s.shares.close(); removeFixture(s.dir);}
});

test('revocation removes only its frozen image copy and preserves the private original bytes', () => {
  const s = fixture();
  try {
    const value = job(), original = image(s.dir, 'private-original');
    value.stories[0].pages[0].image = {status: 'ready', url: '/learn/media/' + original.name};
    const published = s.shares.publish(owner, value, () => original.path), token = published.url.split('/').at(-1)!;
    const copy = s.shares.media(token, original.name)!; assert.notEqual(copy, original.path); assert.equal(existsSync(copy), true);
    s.shares.revoke(owner, value.id);
    assert.equal(s.shares.read(token), null); assert.equal(existsSync(copy), false); assert.deepEqual(readFileSync(original.path), original.bytes);
    assert.deepEqual(readdirSync(join(s.dir, 'shares')), []);
  } finally {s.shares.close(); removeFixture(s.dir);}
});

test('missing and unfinished pictures become a frozen failure without blocking readable text', () => {
  const s = fixture();
  try {
    const missing = job(); missing.stories[0].pages[0].image = {status: 'ready', url: '/learn/media/' + 'a'.repeat(64) + '.png'};
    const first = s.shares.publish(owner, missing, () => null), token = first.url.split('/').at(-1)!;
    assert.deepEqual(s.shares.read(token)!.stories[0].pages[0].image, {status: 'failed'});
    const unfinished = job(); unfinished.id = 'unfinished-image-job'; unfinished.stories[0].pages[0].image = {status: 'generating', url: 'https://private.example/image', error: 'PRIVATE_PROVIDER_ERROR'};
    const second = s.shares.publish(owner, unfinished, () => assert.fail('unfinished media must not resolve'));
    assert.deepEqual(s.shares.read(second.url.split('/').at(-1)!)!.stories[0].pages[0].image, {status: 'failed'});
  } finally {s.shares.close(); removeFixture(s.dir);}
});

test('incomplete/unreviewed jobs and changed image bytes cannot produce active snapshots', () => {
  const s = fixture();
  try {
    const failed = job(); failed.status = 'failed';
    assert.throws(() => s.shares.publish(owner, failed, () => null), (error: unknown) => error instanceof ShareError && error.code === 'NOT_SHAREABLE');
    const unreviewed = job(); unreviewed.quality = 'needs_review';
    assert.throws(() => s.shares.publish(owner, unreviewed, () => null), (error: unknown) => error instanceof ShareError && error.code === 'NOT_SHAREABLE');
    const changed = job(), picture = image(s.dir, 'before'); changed.stories[0].pages[0].image = {status: 'ready', url: '/learn/media/' + picture.name}; writeFileSync(picture.path, 'changed bytes');
    assert.throws(() => s.shares.publish(owner, changed, () => picture.path), (error: unknown) => error instanceof ShareError && error.code === 'SHARE_MEDIA_INVALID');
    assert.equal(s.shares.status(owner, changed.id), null); assert.deepEqual(readdirSync(join(s.dir, 'shares')), []);
  } finally {s.shares.close(); removeFixture(s.dir);}
});
