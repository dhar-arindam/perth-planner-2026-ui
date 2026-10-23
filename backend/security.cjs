const crypto = require('node:crypto');
const contract = require('../guide-contract.js');

function authenticate(event, config, nowMilliseconds) {
  const deny = (statusCode, message) => { throw Object.assign(Error(message), { statusCode }); };
  if (!config.EXPECTED_ISSUER || !/^https:\/\/cognito-idp\.[a-z0-9-]+\.amazonaws\.com\/[A-Za-z0-9_-]+$/.test(config.EXPECTED_ISSUER) || !config.EXPECTED_CLIENT_ID || !config.ALLOWED_SUB) deny(503, 'Travel Guide authentication is not configured.');
  const auth = event.requestContext?.authorizer?.jwt;
  const claims = auth?.claims;
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) deny(401, 'Trusted API Gateway authentication required.');
  const numericDate = value => (typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  const expires = numericDate(claims.exp);
  const issued = numericDate(claims.iat);
  const notBefore = claims.nbf === undefined ? null : numericDate(claims.nbf);
  const seconds = Math.floor(nowMilliseconds / 1000);
  const audienceValid = claims.aud === undefined || claims.aud === config.EXPECTED_CLIENT_ID || Array.isArray(claims.aud) && claims.aud.every(value => typeof value === 'string') && claims.aud.includes(config.EXPECTED_CLIENT_ID);
  if (claims.iss !== config.EXPECTED_ISSUER || claims.client_id !== config.EXPECTED_CLIENT_ID || !audienceValid || claims.token_use !== 'access' || typeof claims.sub !== 'string' || !claims.sub || expires === null || issued === null || issued > seconds || expires <= seconds || expires <= issued || claims.nbf !== undefined && (notBefore === null || notBefore > seconds)) deny(401, 'Invalid or expired authentication claims.');
  if (claims.sub !== config.ALLOWED_SUB || !Array.isArray(auth.scopes) || !auth.scopes.includes('guide/chat') || typeof claims.scope !== 'string' || !claims.scope.split(/\s+/).includes('guide/chat')) deny(403, 'Travel Guide owner access required.');
  return claims.sub;
}

function exactFields(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw Error('Unsupported snapshot field.');
}

function canonicalSnapshot(snapshot, trip) {
  contract.validateSnapshot(snapshot);
  exactFields(snapshot, ['version', 'now', 'timezone', 'option', 'rottnestMode', 'selectedDate', 'location', 'preferences', 'days']);
  const baseline = contract.projectSnapshot(trip, snapshot);
  for (const day of snapshot.days) {
    exactFields(day, ['date', 'title', 'destination', 'hotel', 'events']);
    const original = baseline.days.find(entry => entry.date === day.date);
    if (day.title !== original.title || day.destination !== original.destination || contract.canonicalJSON(day.hotel) !== contract.canonicalJSON(original.hotel)) throw Error('Trip commitments do not match the canonical itinerary.');
    for (const expected of original.events) if (!day.events.some(event => event.id === expected.id)) throw Error('Missing canonical activity or commitment.');
    for (const event of day.events) {
      exactFields(event, ['id', 'title', 'time', 'type', 'transport', 'note', 'source', 'status', 'locked', 'startAt']);
      const expected = original.events.find(entry => entry.id === event.id);
      if (!expected && (!/^actual-[A-Za-z0-9-]{1,80}$/.test(event.id) || event.source !== 'actual-addition')) throw Error('Unknown planned activity ID.');
      if (expected && !['planned', 'actual'].includes(event.source)) throw Error('Invalid planned activity source.');
      if (typeof event.locked !== 'boolean') throw Error('Invalid commitment metadata.');
      if (expected?.locked) {
        if (!event.locked || ['title', 'time', 'type', 'transport', 'note', 'startAt'].some(field => event[field] !== expected[field])) throw Error('Altered canonical commitment.');
      } else {
        if (!['activity', 'food', 'shopping', 'free', 'travel', 'hotel'].includes(event.type) || event.startAt !== undefined || event.locked !== contract.locked({ ...event, locked: false })) throw Error('Invalid mutable activity metadata.');
        if (expected && event.transport !== expected.transport) throw Error('Altered transport metadata.');
        if (expected && event.source === 'planned' && ['title', 'time', 'type', 'note', 'status'].some(field => event[field] !== expected[field])) throw Error('Unlabelled actual activity change.');
      }
    }
  }
  return snapshot;
}

function createSigningKeyProvider({ getSecret, now = Date.now }) {
  let cached = null;
  let cachedFor = '';
  let expiresAt = 0;
  return async config => {
    try {
      const arn = config.PROPOSAL_SIGNING_SECRET_ARN;
      const region = typeof arn === 'string' && /^arn:aws:secretsmanager:([a-z0-9-]+):\d{12}:secret:[A-Za-z0-9/_+=.@-]+$/.exec(arn)?.[1];
      if (!region || region !== config.AWS_REGION || config.PROPOSAL_SIGNING_PRIVATE_KEY !== undefined) throw Error('Invalid signing configuration');
      const expected = JSON.parse(config.PROPOSAL_SIGNING_PUBLIC_JWK);
      if (!expected || Object.keys(expected).sort().join(',') !== 'crv,kty,x,y' || expected.kty !== 'EC' || expected.crv !== 'P-256' || !/^[A-Za-z0-9_-]{43}$/.test(expected.x) || !/^[A-Za-z0-9_-]{43}$/.test(expected.y)) throw Error('Invalid public pin');
      const identity = `${arn}|${contract.canonicalJSON(expected)}`;
      const started = now();
      if (cached && cachedFor === identity && started < expiresAt) return cached;
      cached = null;
      cachedFor = '';
      expiresAt = 0;
      const secret = await getSecret({ SecretId: arn, VersionStage: 'AWSCURRENT' }, AbortSignal.timeout(3000));
      if (secret?.ARN !== arn || typeof secret.VersionId !== 'string' || secret.VersionId.length < 32 || secret.VersionId.length > 64 || !Array.isArray(secret.VersionStages) || !secret.VersionStages.includes('AWSCURRENT') || secret.SecretBinary !== undefined || typeof secret.SecretString !== 'string' || Buffer.byteLength(secret.SecretString) > 4096 || !/^-----BEGIN PRIVATE KEY-----\r?\n[\s\S]+\r?\n-----END PRIVATE KEY-----\s*$/.test(secret.SecretString)) throw Error('Invalid secret value');
      const key = crypto.createPrivateKey({ key: secret.SecretString, format: 'pem', type: 'pkcs8' });
      if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails.namedCurve !== 'prime256v1' || contract.canonicalJSON(crypto.createPublicKey(key).export({ format: 'jwk' })) !== contract.canonicalJSON(expected)) throw Error('Signing key does not match public pin');
      cached = key;
      cachedFor = identity;
      expiresAt = started + 60000;
      return key;
    } catch {
      cached = null;
      cachedFor = '';
      expiresAt = 0;
      throw Error('Proposal signing key is unavailable.');
    }
  };
}

async function issueReceipt(kind, { snapshot, changes, trip, sessionId, subject, key, now, parentId = null }) {
  const issuedAt = Math.floor(now / 1000);
  const payload = { v: 1, kind, id: crypto.randomUUID(), parentId, sessionId, subject,
    tripRevision: await contract.digest(trip), contextHash: await contract.digest(contract.contextRevision(snapshot)),
    changesHash: await contract.digest(changes), issuedAt, expiresAt: issuedAt + 300 };
  const signature = crypto.sign('sha256', Buffer.from(contract.canonicalJSON(payload)), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return { payload, signature };
}

async function confirmProposal(receipt, { snapshot, changes, trip, sessionId, subject, key, now }) {
  const canonical = contract.validateChanges(snapshot, changes);
  if (contract.canonicalJSON(canonical) !== contract.canonicalJSON(changes)) throw Error('Noncanonical proposal.');
  const publicKey = crypto.createPublicKey(key).export({ format: 'jwk' });
  const payload = await contract.verifyAuthorization(receipt, { kind: 'proposal', snapshot, changes: canonical, trip, sessionId, publicKey, now });
  if (payload.subject !== subject) throw Error('Proposal belongs to a different subject.');
  return issueReceipt('apply', { snapshot, changes: canonical, trip, sessionId, subject, key, now, parentId: payload.id });
}

module.exports = { authenticate, canonicalSnapshot, createSigningKeyProvider, issueReceipt, confirmProposal };