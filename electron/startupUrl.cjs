const fs = require('fs');
const path = require('path');

const ORG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set([
  'auth',
  'reset-password',
  'organization-setup',
  'platform-admin',
  'invoice',
  'pay',
  'payment-status',
  'oauth',
  'downloads',
  'assets',
  'fonts',
  'install',
]);

function isOrgSlug(value) {
  const slug = String(value ?? '').trim().toLowerCase();
  return ORG_SLUG_PATTERN.test(slug) && !RESERVED.has(slug);
}

function parseOrgSlugFromHref(href) {
  if (typeof href !== 'string' || !href.trim()) return null;
  try {
    if (href.startsWith('ezzyerp:')) {
      const parsed = new URL(href);
      const pathSlug = parsed.pathname.split('/').filter(Boolean)[0];
      if (isOrgSlug(pathSlug)) return pathSlug;
      const host = parsed.hostname || parsed.host;
      return isOrgSlug(host) ? host : null;
    }
    const parsed = new URL(href);
    const first = parsed.pathname.split('/').filter(Boolean)[0];
    return isOrgSlug(first) ? first : null;
  } catch {
    return null;
  }
}

function findProtocolArg(argv) {
  const list = Array.isArray(argv) ? argv : [];
  return list.find((arg) => typeof arg === 'string' && arg.startsWith('ezzyerp:')) || null;
}

function startupOrgFile(userDataPath) {
  return path.join(userDataPath, 'startup-org.json');
}

function readSavedOrgSlug(userDataPath) {
  try {
    const raw = fs.readFileSync(startupOrgFile(userDataPath), 'utf8');
    const parsed = JSON.parse(raw);
    return isOrgSlug(parsed?.slug) ? String(parsed.slug).toLowerCase() : null;
  } catch {
    return null;
  }
}

function writeSavedOrgSlug(userDataPath, slug) {
  if (!isOrgSlug(slug)) return false;
  try {
    fs.writeFileSync(
      startupOrgFile(userDataPath),
      JSON.stringify({ slug: String(slug).toLowerCase(), savedAt: new Date().toISOString() }),
      'utf8',
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * First paint URL for the remote desktop shell.
 * Prefer a real shop slug so /organization-setup is never mistaken for an org.
 */
function resolveElectronStartUrl({ prodUrl, userDataPath, argv } = {}) {
  const origin = String(prodUrl || 'https://app.inventoryshop.in').replace(/\/$/, '');
  const fromProtocol = parseOrgSlugFromHref(findProtocolArg(argv));
  const saved = userDataPath ? readSavedOrgSlug(userDataPath) : null;
  const slug = fromProtocol || saved;
  if (slug) return `${origin}/${slug}`;
  return `${origin}/organization-setup`;
}

module.exports = {
  isOrgSlug,
  parseOrgSlugFromHref,
  findProtocolArg,
  readSavedOrgSlug,
  writeSavedOrgSlug,
  resolveElectronStartUrl,
};
