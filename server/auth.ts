import {randomBytes, createHash, scrypt, timingSafeEqual} from 'node:crypto';
import {mkdirSync, openSync, closeSync, chmodSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import type {UserDTO} from '../shared/contracts.ts';

const SESSION_LIFETIME_MS = 30 * 86400000;
const SCRYPT = {N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024};
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const ACCOUNT = /^acct_[a-f0-9]{32}$/;
const LEGACY_OWNER = /^[a-f0-9]{32}$/;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const same = (left: string, right: string) => {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
};

export class AuthError extends Error {
  constructor(public code: 'INVALID_ACCOUNT_INPUT' | 'INVALID_CREDENTIALS' | 'USERNAME_TAKEN' | 'AUTH_BUSY' | 'AUTH_FAILED' | 'LEGACY_IMPORT_CONFLICT') {
    super(code);
  }
}

export interface AccountIdentity {id: string; owner: string; user: UserDTO;}
export interface AuthResult {account: AccountIdentity; token: string; expiresAt: number; recoveryCode?: string;}
interface AccountRow {id: string; username: string; display_name: string; password_salt: string; password_hash: string; recovery_hash: string;}

function username(value: string) {
  if (!/^[A-Za-z0-9_]{3,24}$/.test(value)) throw new AuthError('INVALID_ACCOUNT_INPUT');
  return value.toLowerCase();
}

function passwordValid(value: string) {
  const length = Array.from(value).length;
  if (length < 6 || length > 128) throw new AuthError('INVALID_ACCOUNT_INPUT');
}

/** One small account store; tokens and recovery codes never enter its public DTOs. */
export class AuthService {
  private db: DatabaseSync;
  private hashing = 0;

  constructor(directory: string) {
    mkdirSync(directory, {recursive: true, mode: 0o700});
    const file = join(directory, 'accounts.sqlite');
    closeSync(openSync(file, 'a', 0o600));
    chmodSync(file, 0o600);
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000;');
    const version = this.db.prepare('PRAGMA user_version').get() as {user_version: number};
    if (version.user_version > 1) {this.db.close(); throw new Error('STUDIO_ACCOUNT_STORE_VERSION');}
    this.transaction(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
          password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
          created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id);
        CREATE TABLE IF NOT EXISTS guest_claims (
          owner TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), claimed_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS guest_claims_account ON guest_claims(account_id);
        PRAGMA user_version=1;
      `);
    });
  }

  private transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {const value = operation(); this.db.exec('COMMIT'); return value;}
    catch (error) {this.db.exec('ROLLBACK'); throw error;}
  }

  private identity(row: Pick<AccountRow, 'id' | 'username' | 'display_name'>): AccountIdentity {
    return {id: row.id, owner: row.id, user: {username: row.username, displayName: row.display_name}};
  }

  private async derive(password: string, salt: string): Promise<string> {
    if (this.hashing >= 2) throw new AuthError('AUTH_BUSY');
    this.hashing++;
    try {
      return await new Promise<string>((resolve, reject) => {
        scrypt(password, salt, 32, SCRYPT, (error, key) => error ? reject(new AuthError('AUTH_FAILED')) : resolve(key.toString('hex')));
      });
    } finally {this.hashing--;}
  }

  private issue(row: Pick<AccountRow, 'id' | 'username' | 'display_name'>, previousToken?: string): AuthResult {
    const token = randomBytes(32).toString('base64url'), now = Date.now(), expiresAt = now + SESSION_LIFETIME_MS;
    if (previousToken) this.revoke(previousToken);
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    this.db.prepare('INSERT INTO sessions(token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(digest(token), row.id, now, expiresAt);
    return {account: this.identity(row), token, expiresAt};
  }

  async register(input: {username: string; displayName?: string; password: string}, previousToken?: string): Promise<AuthResult> {
    const name = username(input.username);
    passwordValid(input.password);
    const displayName = input.displayName?.trim() || name;
    if (Array.from(displayName).length > 30 || Array.from(displayName).length < 2) throw new AuthError('INVALID_ACCOUNT_INPUT');
    if (this.db.prepare('SELECT id FROM accounts WHERE username = ?').get(name)) throw new AuthError('USERNAME_TAKEN');
    const salt = randomBytes(16).toString('base64url'), passwordHash = await this.derive(input.password, salt);
    const recoveryCode = randomBytes(32).toString('base64url');
    const row = {id: 'acct_' + randomBytes(16).toString('hex'), username: name, display_name: displayName};
    return this.transaction(() => {
      if (this.db.prepare('SELECT id FROM accounts WHERE username = ?').get(name)) throw new AuthError('USERNAME_TAKEN');
      this.db.prepare('INSERT INTO accounts(id, username, display_name, password_salt, password_hash, recovery_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(row.id, name, displayName, salt, passwordHash, digest(recoveryCode), Date.now());
      return {...this.issue(row, previousToken), recoveryCode};
    });
  }

  async login(input: {username: string; password: string}, previousToken?: string): Promise<AuthResult> {
    let name: string;
    try {name = username(input.username); passwordValid(input.password);} catch {throw new AuthError('INVALID_CREDENTIALS');}
    const row = this.db.prepare('SELECT * FROM accounts WHERE username = ?').get(name) as unknown as AccountRow | undefined;
    // Unknown names still perform the same expensive derivation as an incorrect password.
    const result = await this.derive(input.password, row?.password_salt ?? 'studio-unregistered-user-salt');
    if (!row || !same(result, row.password_hash)) throw new AuthError('INVALID_CREDENTIALS');
    return this.transaction(() => {
      const current = this.db.prepare('SELECT password_salt, password_hash FROM accounts WHERE id = ?').get(row.id) as {password_salt: string; password_hash: string} | undefined;
      if (!current || !same(current.password_salt, row.password_salt) || !same(current.password_hash, row.password_hash)) throw new AuthError('INVALID_CREDENTIALS');
      return this.issue(row, previousToken);
    });
  }

  async recover(input: {username: string; recoveryCode: string; password: string}, previousToken?: string): Promise<AuthResult> {
    let name: string;
    try {name = username(input.username);} catch {throw new AuthError('INVALID_CREDENTIALS');}
    passwordValid(input.password);
    const row = this.db.prepare('SELECT * FROM accounts WHERE username = ?').get(name) as unknown as AccountRow | undefined;
    const recoveryHash = digest(input.recoveryCode);
    if (!TOKEN.test(input.recoveryCode) || !same(recoveryHash, row?.recovery_hash ?? '0'.repeat(64)) || !row) throw new AuthError('INVALID_CREDENTIALS');
    const salt = randomBytes(16).toString('base64url'), passwordHash = await this.derive(input.password, salt);
    const recoveryCode = randomBytes(32).toString('base64url');
    return this.transaction(() => {
      const update = this.db.prepare('UPDATE accounts SET password_salt = ?, password_hash = ?, recovery_hash = ? WHERE id = ? AND recovery_hash = ?')
        .run(salt, passwordHash, digest(recoveryCode), row.id, recoveryHash);
      if (update.changes !== 1) throw new AuthError('INVALID_CREDENTIALS');
      this.db.prepare('DELETE FROM sessions WHERE account_id = ?').run(row.id);
      return {...this.issue(row, previousToken), recoveryCode};
    });
  }

  authenticate(token: string | undefined): AccountIdentity | null {
    if (!token || !TOKEN.test(token)) return null;
    const row = this.db.prepare('SELECT accounts.id, accounts.username, accounts.display_name FROM sessions JOIN accounts ON sessions.account_id = accounts.id WHERE sessions.token_hash = ? AND sessions.expires_at > ?')
      .get(digest(token), Date.now()) as unknown as Pick<AccountRow, 'id' | 'username' | 'display_name'> | undefined;
    return row ? this.identity(row) : null;
  }

  revoke(token: string | undefined) {
    if (token && TOKEN.test(token)) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token));
  }

  owners(accountId: string): string[] {
    if (!ACCOUNT.test(accountId)) return [];
    const claimed = this.db.prepare('SELECT owner FROM guest_claims WHERE account_id = ? ORDER BY owner').all(accountId) as {owner: string}[];
    return [accountId, ...claimed.map(row => row.owner)];
  }

  legacyClaimed(legacyOwner: string): boolean {
    return !LEGACY_OWNER.test(legacyOwner) || !!this.db.prepare('SELECT owner FROM guest_claims WHERE owner = ?').get(legacyOwner);
  }

  claimLegacy(accountId: string, legacyOwner: string) {
    if (!ACCOUNT.test(accountId) || !LEGACY_OWNER.test(legacyOwner)) throw new AuthError('INVALID_ACCOUNT_INPUT');
    this.transaction(() => {
      const existing = this.db.prepare('SELECT account_id FROM guest_claims WHERE owner = ?').get(legacyOwner) as {account_id: string} | undefined;
      if (existing) {if (existing.account_id !== accountId) throw new AuthError('LEGACY_IMPORT_CONFLICT'); return;}
      this.db.prepare('INSERT INTO guest_claims(owner, account_id, claimed_at) VALUES (?, ?, ?)').run(legacyOwner, accountId, Date.now());
    });
  }

  close() {this.db.close();}
}
