import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readdirSync, readFileSync} from 'node:fs';
import {join, resolve, sep, basename} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {AuthService, AuthError} from '../../server/auth.ts';

const password = '  a synthetic phrase with spaces  ';
const nextPassword = 'a different local synthetic phrase';
function fixture() {const dir = mkdtempSync(join(tmpdir(), 'studio-auth-')); return {dir, auth: new AuthService(dir)};}
function removeFixture(directory: string) {
  const target = resolve(directory);
  assert.ok(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith('studio-auth-'));
  rmSync(target, {recursive: true, force: true});
}
const error = (code: string) => (value: unknown) => value instanceof AuthError && value.code === code;

test('usernames are canonical, passwords preserve spaces, and only derived secrets persist', async () => {
  const s = fixture();
  try {
    const result = await s.auth.register({username: 'Reader_A', displayName: '本地读者', password});
    assert.match(result.account.id, /^acct_[a-f0-9]{32}$/); assert.deepEqual(result.account.user, {username: 'reader_a', displayName: '本地读者'});
    assert.deepEqual(s.auth.authenticate(result.token)?.user, result.account.user);
    await assert.rejects(s.auth.login({username: 'READER_A', password: password.trim()}), error('INVALID_CREDENTIALS'));
    const signedIn = await s.auth.login({username: 'READER_A', password}); assert.equal(signedIn.recoveryCode, undefined);
    for (const file of readdirSync(s.dir).filter(name => name.startsWith('accounts.sqlite'))) {
      const stored = readFileSync(join(s.dir, file));
      for (const secret of [password, result.token, signedIn.token, result.recoveryCode!]) assert.equal(stored.includes(Buffer.from(secret)), false);
    }
    await assert.rejects(s.auth.register({username: 'reader_a', password}), error('USERNAME_TAKEN'));
    await assert.rejects(s.auth.register({username: 'reader@example.com', password}), error('INVALID_ACCOUNT_INPUT'));
    await assert.rejects(s.auth.register({username: 'short_pw', password: 'a'.repeat(5)}), error('INVALID_ACCOUNT_INPUT'));
    await assert.rejects(s.auth.register({username: 'long_pw', password: '😀'.repeat(129)}), error('INVALID_ACCOUNT_INPUT'));
  } finally {s.auth.close(); removeFixture(s.dir);}
});

test('six-character passwords work for registration, login, and recovery, counting Unicode code points', async () => {
  const s = fixture();
  try {
    const six = 'abc123', unicodeSix = '😀'.repeat(6), unicodeFive = '😀'.repeat(5);
    await assert.rejects(s.auth.register({username: 'unicode_short', password: unicodeFive}), error('INVALID_ACCOUNT_INPUT'));
    const registered = await s.auth.register({username: 'six_boundary', password: six});
    const loggedIn = await s.auth.login({username: 'six_boundary', password: six});
    assert.equal(loggedIn.account.id, registered.account.id);
    await assert.rejects(s.auth.login({username: 'six_boundary', password: six.slice(0, 5)}), error('INVALID_CREDENTIALS'));
    for (const short of [six.slice(0, 5), unicodeFive]) {
      await assert.rejects(s.auth.recover({username: 'six_boundary', recoveryCode: registered.recoveryCode!, password: short}), error('INVALID_ACCOUNT_INPUT'));
    }
    const recovered = await s.auth.recover({username: 'six_boundary', recoveryCode: registered.recoveryCode!, password: unicodeSix});
    assert.equal(recovered.account.id, registered.account.id);
    assert.equal(s.auth.authenticate(loggedIn.token), null);
    const unicodeLogin = await s.auth.login({username: 'six_boundary', password: unicodeSix});
    assert.equal(unicodeLogin.account.id, registered.account.id);
  } finally {s.auth.close(); removeFixture(s.dir);}
});

test('sessions survive service restart, expire on the server, and reads do not renew them', async () => {
  const s = fixture(); let auth = s.auth;
  try {
    const result = await auth.register({username: 'persistent', password}); auth.close(); auth = new AuthService(s.dir);
    assert.equal(auth.authenticate(result.token)?.id, result.account.id);
    auth.close();
    const db = new DatabaseSync(join(s.dir, 'accounts.sqlite')); db.prepare('UPDATE sessions SET expires_at = ?').run(Date.now() - 1); db.close();
    auth = new AuthService(s.dir); assert.equal(auth.authenticate(result.token), null);
    const inspect = new DatabaseSync(join(s.dir, 'accounts.sqlite'));
    assert.equal((inspect.prepare('SELECT count(*) AS count FROM sessions').get() as {count: number}).count, 1); inspect.close();
    assert.equal(auth.authenticate('é'.repeat(43)), null); assert.equal(auth.authenticate('short'), null);
  } finally {auth.close(); removeFixture(s.dir);}
});

test('login rotates its previous token; recovery is single use and revokes all old sessions', async () => {
  const s = fixture();
  try {
    const original = await s.auth.register({username: 'recoverable', password});
    const rotated = await s.auth.login({username: 'recoverable', password}, original.token);
    assert.notEqual(rotated.token, original.token); assert.equal(s.auth.authenticate(original.token), null);
    const anotherDevice = await s.auth.login({username: 'recoverable', password});
    const recovered = await s.auth.recover({username: 'recoverable', recoveryCode: original.recoveryCode!, password: nextPassword});
    assert.notEqual(recovered.recoveryCode, original.recoveryCode); assert.equal(s.auth.authenticate(rotated.token), null); assert.equal(s.auth.authenticate(anotherDevice.token), null);
    assert.equal(s.auth.authenticate(recovered.token)?.id, original.account.id);
    await assert.rejects(s.auth.recover({username: 'recoverable', recoveryCode: original.recoveryCode!, password}), error('INVALID_CREDENTIALS'));
    await assert.rejects(s.auth.login({username: 'recoverable', password}), error('INVALID_CREDENTIALS'));
    const loggedIn = await s.auth.login({username: 'recoverable', password: nextPassword}); s.auth.revoke(loggedIn.token); assert.equal(s.auth.authenticate(loggedIn.token), null);
    await assert.rejects(s.auth.login({username: 'absent_user', password}), error('INVALID_CREDENTIALS'));
  } finally {s.auth.close(); removeFixture(s.dir);}
});

test('a password reset prevents an already-hashed old-password login from issuing a new token', async () => {
  const s = fixture();
  let release = () => {};
  try {
    const original = await s.auth.register({username: 'login_race', password});
    const internals = s.auth as unknown as {derive(password: string, salt: string): Promise<string>}, derive = internals.derive.bind(s.auth);
    let ready = () => {}; const hashed = new Promise<void>(done => {ready = done;}), held = new Promise<void>(done => {release = done;});
    internals.derive = async (value, salt) => {const result = await derive(value, salt); if (value === password) {ready(); await held;} return result;};
    const pending = s.auth.login({username: 'login_race', password});
    const rejected = assert.rejects(pending, error('INVALID_CREDENTIALS'));
    await hashed;
    const recovered = await s.auth.recover({username: 'login_race', recoveryCode: original.recoveryCode!, password: nextPassword});
    release(); await rejected;
    assert.equal(s.auth.authenticate(original.token), null); assert.equal(s.auth.authenticate(recovered.token)?.id, original.account.id);
  } finally {release(); s.auth.close(); removeFixture(s.dir);}
});

test('asynchronous scrypt has two slots and rejects a third request without a queue', async context => {
  const s = fixture();
  try {
    const start = performance.now(); let eventLoopAdvanced = false; setTimeout(() => {eventLoopAdvanced = true;}, 0);
    const results = await Promise.allSettled(['slot_a', 'slot_b', 'slot_c'].map(username => s.auth.register({username, password})));
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'fulfilled'); assert.equal(results[2].status, 'rejected');
    assert.ok(results[2].status === 'rejected' && error('AUTH_BUSY')(results[2].reason)); assert.equal(eventLoopAdvanced, true);
    context.diagnostic(JSON.stringify({scrypt: {N: 131072, r: 8, p: 1, maxmemMiB: 256, concurrency: 2}, twoDerivationsMs: Math.round(performance.now() - start)}));
  } finally {s.auth.close(); removeFixture(s.dir);}
});

test('legacy owner claims are durable, idempotent, and unique across accounts', async () => {
  const s = fixture(); let auth = s.auth;
  try {
    const a = await auth.register({username: 'owner_a', password}), b = await auth.register({username: 'owner_b', password}), owner = 'a'.repeat(32);
    assert.equal(auth.legacyClaimed(owner), false); auth.claimLegacy(a.account.id, owner); auth.claimLegacy(a.account.id, owner);
    assert.equal(auth.legacyClaimed(owner), true); assert.deepEqual(auth.owners(a.account.id), [a.account.owner, owner]); assert.deepEqual(auth.owners(b.account.id), [b.account.owner]);
    assert.throws(() => auth.claimLegacy(b.account.id, owner), error('LEGACY_IMPORT_CONFLICT'));
    auth.close(); auth = new AuthService(s.dir); assert.deepEqual(auth.owners(a.account.id), [a.account.owner, owner]);
    assert.throws(() => auth.claimLegacy(b.account.id, owner), error('LEGACY_IMPORT_CONFLICT'));
  } finally {auth.close(); removeFixture(s.dir);}
});
