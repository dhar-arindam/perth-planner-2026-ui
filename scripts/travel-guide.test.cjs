const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const security = require('../backend/security.cjs');
const contract = require('../guide-contract.js');
const { createHandler: createRuntimeHandler, recommend, TOOLS } = require('../backend/guide.cjs');
const tripSandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../data.js'), 'utf8'), tripSandbox);
const trip = tripSandbox.window.TRIP;

test('canonical projection retains trip event IDs and immutable commitment metadata', () => {
  const projected = contract.projectSnapshot(trip, { now: '2026-10-16T04:30:00Z', selectedDate: '2026-10-17', option: 'option1', rottnestMode: 'bus' });
  contract.validateSnapshot(projected);
  assert.equal(projected.days[7].events.find(event => event.id === '2026-10-17-planned-1').locked, true);
  assert.equal(projected.days[14].events[0].startAt, '2026-10-24T01:10:00+08:00');
  assert.equal(contract.canonicalJSON({ second: 2, first: 1 }), contract.canonicalJSON({ first: 1, second: 2 }));
});

function snapshot() {
  return { version: 1, now: '2026-10-16T04:30:00Z', timezone: 'Australia/Perth', selectedDate: '2026-10-17', option: 'option1', rottnestMode: 'bicycle', location: null, preferences: '',
    days: Array.from({ length: 15 }, (_, index) => ({ date: `2026-10-${index + 10}`, title: 'Trip day', events: index === 7 ? [
      { id: 'beach', title: 'The Basin', time: '11:00', type: 'activity', status: 'pending' },
      { id: 'quokka', title: 'Quokkas', time: '10:00', type: 'activity', status: 'completed' },
      { id: 'ferry', title: 'Return ferry', time: '16:15', type: 'travel', status: 'pending' }
    ] : [] })) };
}
const change = (extra = {}) => ({ action: 'add', date: '2026-10-17', reason: 'Relaxed lunch', title: 'Lunch', type: 'food', time: '12:30', durationMinutes: 60, travelMinutes: 15, ...extra });

test('snapshot retains recorded status, not inferred completion', () => {
  const value = snapshot();
  value.now = '2026-10-17T06:00:00Z';
  assert.equal(contract.validateSnapshot(value).days[7].events[0].status, 'pending');
});
test('valid changes apply to existing actual buckets without mutating originals', () => {
  const buckets = { '2026-10-17': { overrides: {}, additions: [] } };
  const output = contract.applyChanges(snapshot(), [change(), { action: 'complete', date: '2026-10-17', id: 'beach', reason: 'User reported completion' }], buckets, () => 'new-id');
  assert.equal(output.buckets['2026-10-17'].additions[0].time, '12:30\u201313:30');
  assert.equal(output.buckets['2026-10-17'].overrides.beach.completed, true);
  assert.deepEqual(buckets['2026-10-17'], { overrides: {}, additions: [] });
});
test('fixed, unknown, completed and impossible changes are rejected', () => {
  for (const id of ['ferry', 'missing', 'quokka']) assert.throws(() => contract.validateChanges(snapshot(), [{ action: 'skip', date: '2026-10-17', id, reason: 'Change' }]));
  assert.throws(() => contract.validateChanges(snapshot(), [change({ time: '15:00' })]), /buffer/);
  assert.throws(() => contract.validateChanges(snapshot(), [change({ time: '24:00' })]), /24-hour/);
  assert.throws(() => contract.validateChanges(snapshot(), [change({ date: '2026-10-25' })]), /contract/);
  assert.throws(() => contract.validateChanges(snapshot(), [change({ arbitraryCode: 'bad' })]), /Unsupported/);
  assert.throws(() => contract.validateChanges(snapshot(), [change(), change({ time: '13:00' })]), /overlap/);
});
test('unverified ferries block schedule changes but not status updates', () => {
  const value = snapshot();
  value.days[7].events[2].time = '4:15 PM (unconfirmed)';
  assert.throws(() => contract.validateChanges(value, [change()]), /Confirm ferry/);
  assert.equal(contract.validateChanges(value, [{ action: 'complete', date: '2026-10-17', id: 'beach', reason: 'User finished' }]).length, 1);
});

const signingKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const config = { GUIDE_ENABLED: 'true', BEDROCK_MODEL_ID: 'mock-model', ALLOWED_SUB: 'owner', ALLOWED_ORIGIN: 'https://planner.example', EXPECTED_ISSUER: 'https://cognito-idp.ap-south-1.amazonaws.com/test-pool', EXPECTED_CLIENT_ID: 'public-client', AWS_REGION: 'ap-south-1', PROPOSAL_SIGNING_SECRET_ARN: 'arn:aws:secretsmanager:ap-south-1:176515272004:secret:perth-guide/signing-AbCdEf', PROPOSAL_SIGNING_PUBLIC_JWK: JSON.stringify(signingKeys.publicKey.export({ format: 'jwk' })) };
const testSecret = async input => ({ ARN: input.SecretId, VersionId: 'a'.repeat(32), VersionStages: ['AWSCURRENT'], SecretString: signingKeys.privateKey.export({ format: 'pem', type: 'pkcs8' }) });
const createHandler = options => createRuntimeHandler({ getSecret: testSecret, ...options });
const backendSnapshot = () => {
  const value = contract.projectSnapshot(trip, { ...snapshot() });
  const activity = value.days[7].events.find(entry => entry.id === '2026-10-17-planned-2');
  activity.status = 'completed'; activity.source = 'actual';
  return value;
};
const backendChange = () => ({ action: 'skip', date: '2026-10-17', id: '2026-10-17-planned-3', reason: 'Shorter outing' });
const event = (body = {}) => ({ version: '2.0', headers: { origin: config.ALLOWED_ORIGIN }, requestContext: { http: { method: 'POST' }, authorizer: { jwt: { claims: { sub: 'owner', iss: config.EXPECTED_ISSUER, client_id: config.EXPECTED_CLIENT_ID, token_use: 'access', exp: 1792128600, iat: 1792123200, scope: 'guide/chat' }, scopes: ['guide/chat'] } } }, body: JSON.stringify({ sessionId: '12345678-1234-1234-1234-123456789012', message: 'What next?', history: [], snapshot: backendSnapshot(), ...body }) });
const answer = (text = 'Recommendation: have lunch. Needs verification: opening hours and ferry booking.') => ({ output: { message: { role: 'assistant', content: [{ text }] } } });
const tool = (name, input = {}) => ({ output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId: 'tool-1', name, input } }] } } });
const create = (converse) => createHandler({ config, now: () => new Date('2026-10-16T04:30:00Z'), converse });

test('Converse receives current snapshot, bounded follow-up history and explicit tools', async () => {
  let captured;
  const handler = create(async input => { captured = input; return answer(); });
  const result = await handler(event({ history: [{ role: 'user', text: 'I am tired' }, { role: 'assistant', text: 'Consider lunch' }], message: 'What about the other option?' }));
  assert.equal(result.statusCode, 200);
  assert.equal(captured.messages[0].content[0].text, 'I am tired');
  assert.equal(captured.messages[2].content[0].text, 'What about the other option?');
  assert.match(captured.system[1].text, /"status":"completed"/);
  assert.match(captured.system[1].text, /verifiedLiveSources/);
  assert.equal(TOOLS.length, 5);
  assert.equal(JSON.parse(result.body).liveInformation, false);
});
test('backend tools validate proposals and never mutate browser state', async () => {
  let count = 0;
  const input = event();
  const original = input.body;
  const handler = create(async () => ++count === 1 ? tool('apply_itinerary_changes', { changes: [backendChange()] }) : answer());
  const result = JSON.parse((await handler(input)).body);
  assert.equal(result.changes[0].action, 'skip');
  assert.ok(result.commitment.signature);
  assert.equal(input.body, original);
  count = 0;
  const invalid = create(async () => ++count === 1 ? tool('propose_itinerary_changes', { changes: [{ ...backendChange(), id: '2026-10-17-planned-1' }] }) : answer());
  assert.deepEqual(JSON.parse((await invalid(event())).body).changes, []);
});
test('tools use freshest recorded status and expose uncertainty/remaining time', () => {
  const value = snapshot();
  value.now = '2026-10-17T06:00:00Z';
  const result = recommend(value);
  assert.equal(result.minutesUntilNextCommitment, 135);
  assert.equal(result.options.some(option => option.id === 'quokka'), false);
  assert.equal(result.options.find(option => option.id === 'beach').timing, 'scheduled time passed, completion unknown');
  assert.match(result.uncertainty, /No live data/);
});
test('work hours and inferred completion do not permit unsafe schedule changes', () => {
  const value = snapshot();
  value.days[7].events.push({ id: 'work', title: 'Woodside', type: 'work', time: '8:00 AM\u20134:00 PM, Monday\u2013Friday', status: 'pending' });
  assert.throws(() => contract.validateChanges(value, [change()]), /buffer/);
});
test('authentication, origin, invalid/oversized input and warm rate limit fail closed', async () => {
  let calls = 0;
  const handler = create(async () => { calls++; return answer(); });
  const unauthorized = event(); delete unauthorized.requestContext.authorizer;
  assert.equal((await handler(unauthorized)).statusCode, 401);
  const origin = event(); origin.headers.origin = 'https://attacker.example';
  assert.equal((await handler(origin)).statusCode, 403);
  assert.equal((await handler({ ...event(), body: 'x'.repeat(100000) })).statusCode, 413);
  assert.equal((await handler({ ...event(), body: '{' })).statusCode, 400);
  assert.equal((await handler(event({ message: 'x'.repeat(1001) }))).statusCode, 400);
  assert.equal(calls, 0);
  for (let index = 0; index < 8; index++) assert.equal((await handler(event())).statusCode, 200);
  assert.equal((await handler(event())).statusCode, 429);
});
test('Bedrock throttling/unavailability and unconfigured guide return safe errors', async () => {
  assert.equal((await create(async () => { throw Object.assign(Error('private upstream detail'), { name: 'ThrottlingException' }); })(event())).statusCode, 429);
  const failure = await create(async () => { throw Error('secret diagnostic'); })(event());
  assert.equal(failure.statusCode, 503);
  assert.doesNotMatch(failure.body, /secret diagnostic/);
  assert.equal((await createHandler({ config: {} })(event())).statusCode, 503);
});
test('AM/PM ranges, airport-local instants and pending conflicts are handled conservatively', () => {
  assert.equal(contract.eventStart({ time: '7:00\u20138:30 PM' }), 1140);
  assert.equal(contract.eventEnd({ time: '7:00\u20138:30 PM' }), 1230);
  assert.equal(contract.commitmentStart({ startAt: '2026-10-10T23:05:00+05:30' }, '2026-10-10'), 1535);
  const value = snapshot();
  value.days[7].events.push({ id: 'museum', title: 'Museum', time: '12:00\u201314:00', type: 'activity', status: 'pending' });
  assert.throws(() => contract.validateChanges(value, [change()]), /pending activity/);
  assert.equal(contract.validateChanges(value, [change(), { action: 'skip', date: '2026-10-17', id: 'museum', reason: 'Prefer lunch' }]).length, 2);
});
test('skipping added activities preserves them for manual restoration', () => {
  const value = snapshot();
  value.days[7].events.push({ id: 'added', title: 'Cafe', time: '13:00', type: 'food', status: 'pending' });
  const result = contract.applyChanges(value, [{ action: 'skip', date: '2026-10-17', id: 'added', reason: 'Not hungry' }], { '2026-10-17': { overrides: {}, additions: [{ id: 'added', title: 'Cafe' }] } }, () => 'unused');
  assert.equal(result.buckets['2026-10-17'].additions[0].skipped, true);
});
test('rescheduling reorders actual events without replacing the planned baseline', () => {
  const value = snapshot();
  const changes = [change({ action: 'reschedule', id: 'beach', time: '11:40', durationMinutes: 30 }), change({ time: '13:00', durationMinutes: 30 })];
  const result = contract.applyChanges(value, changes, { '2026-10-17': { overrides: {}, additions: [] } }, () => 'lunch');
  const bucket = result.buckets['2026-10-17'];
  assert.deepEqual(bucket.order, ['quokka', 'beach', 'lunch', 'ferry']);
  assert.equal(value.days[7].events[0].time, '11:00');
  assert.deepEqual(contract.orderEvents([{ id: 'ferry' }, { id: 'beach' }], bucket.order).map(event => event.id), ['beach', 'ferry']);
});

test('a validation-only tool call retains the proposal being validated', async () => {
  let count = 0;
  const handler = create(async () => {
    count++;
    if (count === 1) return tool('propose_itinerary_changes', { changes: [backendChange()] });
    if (count === 2) return tool('validate_itinerary_changes', { changes: [backendChange()] });
    return answer();
  });
  const response = await handler(event());
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).changes.length, 1);
});

test('late activities respect next-day flights and their travel/boarding buffer', () => {
  const value = snapshot();
  value.days[8].events.push({ id: 'early-flight', title: 'Flight departure', type: 'flight', status: 'pending', time: '01:10', startAt: '2026-10-18T01:10:00+08:00' });
  assert.throws(() => contract.validateChanges(value, [change({ time: '23:20', durationMinutes: 30 })]), /buffer/);
  value.now = '2026-10-17T14:00:00Z';
  const recommendation = recommend(value);
  assert.equal(recommendation.nextCommitment.id, 'early-flight');
  assert.equal(recommendation.nextCommitment.date, '2026-10-18');
  assert.equal(recommendation.minutesUntilNextCommitment, 190);
});
test('device location preserves coordinates, accuracy and observation time', () => {
  const value = snapshot();
  value.location = { source: 'device', label: 'Device coordinates', observedAt: '2026-10-16T04:29:00Z', latitude: -31.9554, longitude: 115.859, accuracyMeters: 24 };
  assert.equal(contract.validateSnapshot(value).location.accuracyMeters, 24);
  for (const invalid of [{ latitude: 91 }, { longitude: -181 }, { accuracyMeters: -1 }, { accuracyMeters: '24' }, { latitude: null }, { altitude: 20 }, { observedAt: 'unknown' }]) {
    assert.throws(() => contract.validateSnapshot({ ...value, location: { ...value.location, ...invalid } }), /location|coordinates|accuracy/i);
  }
  assert.equal(contract.validateSnapshot({ ...value, location: { source: 'user', label: 'Hotel lobby', observedAt: value.location.observedAt } }).location.source, 'user');
});

test('AI changes cannot persist precise coordinates in activity text', () => {
  assert.throws(() => contract.validateChanges(snapshot(), [change({ title: 'Meet at -31.95540, 115.85900' })]), /coordinates/i);
  assert.throws(() => contract.validateChanges(snapshot(), [change({ note: 'Longitude: 115.85900' })]), /coordinates/i);
  assert.throws(() => contract.validateChanges(snapshot(), [change({ note: 'Meet at 31 deg 57 min 19.44 sec S' })]), /coordinates/i);
});

test('device location cannot supply identity or bypass owner authorization', async () => {
  let calls = 0;
  const handler = create(async () => { calls++; return answer(); });
  const value = snapshot();
  value.location = { source: 'device', label: 'Device coordinates', observedAt: value.now, latitude: -31.9554, longitude: 115.859, accuracyMeters: 24 };
  const unauthorized = event({ snapshot: value });
  unauthorized.requestContext.authorizer.jwt.claims.sub = 'another-user';
  assert.equal((await handler(unauthorized)).statusCode, 403);
  delete unauthorized.requestContext.authorizer;
  assert.equal((await handler(unauthorized)).statusCode, 401);
  assert.equal(calls, 0);
  assert.throws(() => contract.validateSnapshot({ ...value, location: { ...value.location, sub: 'owner' } }), /Unsupported location field/);
});

test('trusted gateway claims require issuer, client, expiry and access-token identity', async () => {
  let calls = 0;
  const guarded = { ...config, EXPECTED_ISSUER: 'https://cognito-idp.ap-south-1.amazonaws.com/test-pool', EXPECTED_CLIENT_ID: 'public-client' };
  const handler = createHandler({ config: guarded, now: () => new Date('2026-10-16T04:30:00Z'), converse: async () => { calls++; return answer(); } });
  const claims = { sub: 'owner', iss: guarded.EXPECTED_ISSUER, client_id: guarded.EXPECTED_CLIENT_ID, token_use: 'access', exp: 1792128600, iat: 1792123200, scope: 'guide/chat' };
  for (const patch of [{ iss: 'https://wrong.invalid' }, { client_id: 'wrong-client' }, { exp: 1 }, { exp: 'invalid' }, { token_use: 'id' }, { sub: 'someone-else' }]) {
    const request = event();
    request.requestContext.authorizer.jwt.claims = { ...claims, ...patch };
    const result = await handler(request);
    assert.ok([401, 403].includes(result.statusCode), JSON.stringify(patch));
  }
  assert.equal(calls, 0);
});

test('canonical reconciliation rejects forged flags, IDs and altered or missing commitments', () => {
  for (const option of ['option1', 'option2', 'option3']) for (const rottnestMode of ['bus', 'bicycle']) {
    security.canonicalSnapshot(contract.projectSnapshot(trip, { ...snapshot(), option, rottnestMode }), trip);
  }
  const mutations = [
    value => { value.validated = true; },
    value => { value.days[7].events[0].confirmed = true; },
    value => { const fixed = value.days[7].events.find(entry => entry.id.endsWith('planned-1')); Object.assign(fixed, { locked: false, type: 'activity', title: 'Walk' }); },
    value => { value.days[7].events = value.days[7].events.filter(entry => !entry.id.endsWith('planned-1')); },
    value => { value.days[14].events[0].startAt = '2026-10-24T12:00:00+08:00'; },
    value => { value.days[7].events.find(entry => entry.id.endsWith('planned-3')).id = 'forged-id'; }
  ];
  for (const mutate of mutations) { const value = backendSnapshot(); mutate(value); assert.throws(() => security.canonicalSnapshot(value, trip)); }
});

test('exact signed proposals require authenticated confirmation before a verifiable apply receipt', async () => {
  let calls = 0;
  const handler = create(async () => ++calls === 1 ? tool('propose_itinerary_changes', { changes: [backendChange()] }) : answer());
  const input = event();
  const request = JSON.parse(input.body);
  const proposal = JSON.parse((await handler(input)).body);
  const body = { operation: 'confirm', sessionId: request.sessionId, snapshot: request.snapshot, changes: proposal.changes, commitment: proposal.commitment };
  const response = await handler({ ...input, body: JSON.stringify(body) });
  assert.equal(response.statusCode, 200);
  assert.equal(calls, 2, 'Confirmation never calls Bedrock');
  const { authorization } = JSON.parse(response.body);
  const payload = await contract.verifyAuthorization(authorization, { kind: 'apply', snapshot: request.snapshot, changes: proposal.changes, trip, sessionId: request.sessionId, parentId: proposal.commitment.payload.id, publicKey: signingKeys.publicKey.export({ format: 'jwk' }), now: Date.parse(request.snapshot.now) });
  assert.equal(payload.subject, 'owner');
  const repeated = await handler({ ...input, body: JSON.stringify(body) });
  assert.equal(repeated.statusCode, 200, 'Stateless verification is not a global one-time-use ledger');
  assert.equal((await handler({ ...input, body: JSON.stringify({ ...body, commitment: authorization }) })).statusCode, 409, 'Apply-phase receipts cannot be replayed as proposal validation');
});

test('altered, stale, wrong-session, wrong-subject and replayed-phase commitments fail closed', async () => {
  const value = backendSnapshot();
  const changes = contract.validateChanges(value, [backendChange()]);
  const sessionId = JSON.parse(event().body).sessionId;
  const key = signingKeys.privateKey;
  const receipt = await security.issueReceipt('proposal', { snapshot: value, changes, trip, sessionId, subject: 'owner', key, now: Date.parse(value.now) });
  const base = { operation: 'confirm', sessionId, snapshot: value, changes, commitment: receipt };
  const variants = [
    body => { body.confirmed = true; },
    body => { body.changes[0].validated = true; },
    body => { body.changes[0].reason = 'Modified after validation'; },
    body => { body.snapshot.preferences = 'Changed context'; },
    body => { body.commitment.signature = 'A'.repeat(86); },
    body => { body.commitment.payload.kind = 'apply'; },
    body => { body.sessionId = '22345678-1234-1234-1234-123456789012'; }
  ];
  for (const mutate of variants) {
    const body = structuredClone(base); mutate(body);
    const handler = create(async () => { throw Error('Must not invoke model'); });
    assert.ok([400, 409].includes((await handler({ ...event(), body: JSON.stringify(body) })).statusCode));
  }
  const staleHandler = createHandler({ config, now: () => new Date('2026-10-16T04:36:00Z'), converse: async () => { throw Error('Must not invoke model'); } });
  assert.equal((await staleHandler({ ...event(), body: JSON.stringify(base) })).statusCode, 409);
  const foreign = await security.issueReceipt('proposal', { snapshot: value, changes, trip, sessionId, subject: 'another-owner', key, now: Date.parse(value.now) });
  assert.equal((await create(async () => answer())({ ...event(), body: JSON.stringify({ ...base, commitment: foreign }) })).statusCode, 409);
});

test('disabled mode authenticates first and never invokes a model or confirms proposals', async () => {
  let calls = 0;
  const handler = createHandler({ config: { ...config, GUIDE_ENABLED: 'false' }, now: () => new Date('2026-10-16T04:30:00Z'), converse: async () => { calls++; return answer(); } });
  assert.equal((await handler(event())).statusCode, 503);
  const spoofed = event({ sub: 'owner', confirmed: true }); delete spoofed.requestContext.authorizer;
  assert.equal((await handler(spoofed)).statusCode, 401);
  const wrongOwner = event(); wrongOwner.requestContext.authorizer.jwt.claims.sub = 'intruder';
  assert.equal((await handler(wrongOwner)).statusCode, 403);
  const attempt = { ...event(), body: JSON.stringify({ operation: 'confirm', confirmed: true, validated: true }) };
  assert.equal((await handler(attempt)).statusCode, 503);
  assert.equal(calls, 0);
});

test('missing/malformed trusted credentials and identity spoofing never reach protected work', async () => {
  let calls = 0;
  const handler = create(async () => { calls++; return answer(); });
  const original = event().requestContext.authorizer.jwt.claims;
  const variants = [null, {}, [], { ...original, exp: null }, { ...original, iat: 9999999999 }, { ...original, nbf: 9999999999 }, { ...original, aud: 'wrong-client' }, { ...original, scope: 'openid' }];
  for (const claims of variants) {
    const request = event(); request.requestContext.authorizer.jwt.claims = claims;
    assert.ok([401, 403].includes((await handler(request)).statusCode));
  }
  const spoof = event({ claims: original, sub: 'owner' }); delete spoof.requestContext.authorizer;
  spoof.queryStringParameters = { sub: 'owner' };
  assert.equal((await handler(spoof)).statusCode, 401);
  assert.equal((await handler(event({ validated: true, confirmed: true }))).statusCode, 400);
  assert.equal(calls, 0);
});

test('model-generated validation/confirmation flags cannot mint an authorization', async () => {
  let calls = 0;
  const handler = create(async () => ++calls === 1 ? tool('apply_itinerary_changes', { changes: [{ ...backendChange(), validated: true, confirmed: true }] }) : answer());
  const response = JSON.parse((await handler(event())).body);
  assert.deepEqual(response.changes, []);
  assert.equal(response.commitment, null);
});

test('runtime secret retrieval is exact-scoped, cached for 60 seconds and never stale on failure', async () => {
  const secretArn = 'arn:aws:secretsmanager:ap-south-1:176515272004:secret:perth-guide/signing-AbCdEf';
  const settings = { AWS_REGION: 'ap-south-1', PROPOSAL_SIGNING_SECRET_ARN: secretArn, PROPOSAL_SIGNING_PUBLIC_JWK: JSON.stringify(signingKeys.publicKey.export({ format: 'jwk' })) };
  let clock = 1000000;
  let calls = 0;
  let unavailable = false;
  const getKey = security.createSigningKeyProvider({ now: () => clock, getSecret: async (input, signal) => {
    calls++;
    assert.deepEqual(input, { SecretId: secretArn, VersionStage: 'AWSCURRENT' });
    assert.ok(signal instanceof AbortSignal);
    if (unavailable) throw Error('Sensitive upstream detail must not leak');
    return { ARN: secretArn, VersionId: 'a'.repeat(32), VersionStages: ['AWSCURRENT'], SecretString: signingKeys.privateKey.export({ format: 'pem', type: 'pkcs8' }) };
  } });
  const first = await getKey(settings);
  assert.equal(await getKey(settings), first);
  clock += 59999;
  assert.equal(await getKey(settings), first);
  assert.equal(calls, 1);
  clock++;
  await getKey(settings);
  assert.equal(calls, 2);
  unavailable = true;
  clock += 60000;
  await assert.rejects(getKey(settings), /^Error: Proposal signing key is unavailable\.$/);
});

test('secret metadata, key format and public pin failures never reach Bedrock or expose details', async () => {
  const alternate = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const wrongCurve = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
  const invalidValues = [
    { ARN: config.PROPOSAL_SIGNING_SECRET_ARN + '-wrong' },
    { VersionId: '' }, { VersionStages: ['AWSPREVIOUS'] }, { VersionStages: 'AWSCURRENT' },
    { SecretBinary: Buffer.from('not a supported private key') },
    { SecretString: 'sensitive broken PEM' }, { SecretString: 'x'.repeat(4097) },
    { SecretString: alternate.privateKey.export({ format: 'pem', type: 'pkcs8' }) },
    { SecretString: wrongCurve.privateKey.export({ format: 'pem', type: 'pkcs8' }) }
  ];
  for (const patch of invalidValues) {
    let modelCalls = 0;
    const handler = createHandler({ config, now: () => new Date('2026-10-16T04:30:00Z'), getSecret: async input => ({ ...await testSecret(input), ...patch }), converse: async () => { modelCalls++; return answer(); } });
    const result = await handler(event());
    assert.equal(result.statusCode, 503);
    assert.deepEqual(JSON.parse(result.body), { error: 'Proposal signing key is unavailable.' });
    assert.equal(modelCalls, 0);
  }
  for (const name of ['AccessDeniedException', 'ResourceNotFoundException', 'TimeoutError']) {
    const handler = createHandler({ config, now: () => new Date('2026-10-16T04:30:00Z'), getSecret: async () => { throw Object.assign(Error('sensitive upstream detail'), { name }); }, converse: async () => { throw Error('Must not invoke model'); } });
    const result = await handler(event());
    assert.equal(result.statusCode, 503);
    assert.doesNotMatch(result.body, /sensitive|PRIVATE KEY|SecretString/);
  }
});

test('secret config is server-only and disabled/invalid requests never read it', async () => {
  let reads = 0;
  const reader = async input => { reads++; return testSecret(input); };
  for (const settings of [
    { ...config, PROPOSAL_SIGNING_SECRET_ARN: '' },
    { ...config, AWS_REGION: 'us-east-1' },
    { ...config, PROPOSAL_SIGNING_PUBLIC_JWK: '{}' },
    { ...config, PROPOSAL_SIGNING_PRIVATE_KEY: 'legacy-value-must-not-be-used' }
  ]) {
    const getKey = security.createSigningKeyProvider({ getSecret: reader });
    await assert.rejects(getKey(settings), /unavailable/);
  }
  assert.equal(reads, 0);
  const disabled = createHandler({ config: { ...config, GUIDE_ENABLED: 'false' }, now: () => new Date('2026-10-16T04:30:00Z'), getSecret: reader, converse: async () => answer() });
  assert.equal((await disabled(event())).statusCode, 503);
  const active = createHandler({ config, now: () => new Date('2026-10-16T04:30:00Z'), getSecret: reader, converse: async () => answer() });
  const unauthorized = event(); delete unauthorized.requestContext.authorizer;
  assert.equal((await active(unauthorized)).statusCode, 401);
  assert.equal((await active({ ...event(), body: '{' })).statusCode, 400);
  assert.equal(reads, 0);
});

test('rotation invalidates cached key on public-pin change and requires a matching current secret', async () => {
  const alternate = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  let rotated = false;
  let reads = 0;
  const getKey = security.createSigningKeyProvider({ getSecret: async input => {
    reads++;
    return { ...await testSecret(input), ...(rotated ? { VersionId: 'b'.repeat(32), SecretString: alternate.privateKey.export({ format: 'pem', type: 'pkcs8' }) } : {}) };
  } });
  await getKey(config);
  const nextConfig = { ...config, PROPOSAL_SIGNING_PUBLIC_JWK: JSON.stringify(alternate.publicKey.export({ format: 'jwk' })) };
  await assert.rejects(getKey(nextConfig), /unavailable/);
  rotated = true;
  const key = await getKey(nextConfig);
  assert.deepEqual(crypto.createPublicKey(key).export({ format: 'jwk' }), alternate.publicKey.export({ format: 'jwk' }));
  assert.equal(reads, 3);
});