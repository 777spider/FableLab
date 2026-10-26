import {createHash} from 'node:crypto';

export interface ProductionConfig {
  synthetic: boolean;
  cookieSecret?: string;
  accessCodeHash: string;
  publicOrigin?: string;
}

/** Fail before accepting requests if a public deployment still uses demo settings. */
export function validateProductionConfig(config: ProductionConfig) {
  if (config.synthetic) throw new Error('SYNTHETIC_DISABLED_IN_PRODUCTION');
  if (!config.cookieSecret || config.cookieSecret.length < 32 || !/^[a-f0-9]{64}$/.test(config.accessCodeHash)) {
    throw new Error('STUDIO_ACCESS_ENV_REQUIRED');
  }
  if (config.accessCodeHash === createHash('sha256').update('1025').digest('hex')) {
    throw new Error('DEMO_ACCESS_CODE_DISABLED_IN_PRODUCTION');
  }
  let origin: URL;
  try {origin = new URL(config.publicOrigin ?? '');} catch {throw new Error('STUDIO_HTTPS_ORIGIN_REQUIRED');}
  if (origin.protocol !== 'https:' || origin.origin !== config.publicOrigin) throw new Error('STUDIO_HTTPS_ORIGIN_REQUIRED');
}
