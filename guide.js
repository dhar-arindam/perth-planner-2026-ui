(() => {
  const config = window.TRAVEL_GUIDE_CONFIG;
  const contract = window.TravelGuideContract;
  const planner = window.PerthPlannerGuide;
  const query = selector => document.querySelector(selector);
  const historyKey = 'perth-guide-conversation';
  let conversation = [];
  let privateConversation = false;
  let sessionId = crypto.randomUUID();
  let token = null;
  let expiresAt = 0;
  let authEpoch = 0;
  let busy = false;
  let pending = '';
  let error = '';
  let proposal = null;
  let locationContext = null;
  let locating = false;
  let locationRequestId = 0;
  let locationMessage = 'No location selected.';
  try {
    const stored = JSON.parse(sessionStorage.getItem(historyKey) || 'null');
    if (stored && /^[a-f0-9-]{36}$/i.test(stored.sessionId) && Array.isArray(stored.history) && stored.history.length <= 10 && stored.history.length % 2 === 0 && stored.history.every((entry, index) => entry.role === (index % 2 ? 'assistant' : 'user') && typeof entry.text === 'string' && entry.text.length <= 2500)) {
      sessionId = stored.sessionId;
      conversation = stored.history;
      if (conversation.some(entry => contract.containsCoordinates(entry.text))) {
        privateConversation = true;
        sessionStorage.removeItem(historyKey);
      }
    }
  } catch {}
  const configured = (() => {
    try {
      return new URL(config.apiUrl).protocol === 'https:' && new URL(config.oauthDomain).protocol === 'https:' && new URL(config.redirectUri).origin === location.origin && Boolean(config.clientId) && config.scope.split(' ').includes('guide/chat') && config.proposalPublicKey?.kty === 'EC' && config.proposalPublicKey.crv === 'P-256' && !('d' in config.proposalPublicKey);
    } catch { return false; }
  })();
  const context = () => ({ location: locationContext, preferences: query('#guide-preferences').value.trim() });
  const revision = contract.contextRevision;
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  function renderLocation() {
    query('#guide-use-location').disabled = locating;
    query('#guide-use-location').textContent = locating ? 'Getting location...' : 'Use my location';
    query('#guide-clear-location').disabled = !locationContext && !locating;
    query('#guide-location-status').textContent = locationMessage;
  }
  function render() {
    const signedIn = token && Date.now() < expiresAt;
    query('#guide-status').textContent = busy ? 'Thinking and checking your trip...' : !navigator.onLine ? 'AI requires connectivity. Your itinerary remains available offline.' : !configured ? 'AI is not connected. AWS setup is required.' : error || (signedIn ? 'Signed in. Ready.' : 'Sign in to use the AI guide.');
    query('#guide-error').textContent = error;
    query('#guide-retry').hidden = !error || !pending;
    query('#guide-retry').disabled = busy || !signedIn || !navigator.onLine;
    query('#guide-send').disabled = busy || !configured || !signedIn || !navigator.onLine;
    query('#guide-sign-in').disabled = busy || !configured || !navigator.onLine;
    query('#guide-sign-in').hidden = Boolean(signedIn);
    query('#guide-sign-out').hidden = !signedIn;
    query('#guide-form').setAttribute('aria-busy', String(busy));
    const entries = [...conversation, ...(pending ? [{ role: 'user', text: pending }] : [])];
    query('#guide-messages').innerHTML = entries.map(entry => `<article class="guide-message"><strong>${entry.role === 'user' ? 'You' : 'Travel guide'}</strong><p>${escape(entry.text)}</p></article>`).join('');
    const root = query('#guide-proposal');
    root.hidden = !proposal;
    if (proposal) root.innerHTML = `<h4>Proposed itinerary changes</h4><ul>${proposal.changes.map(change => `<li><strong>${escape(change.date)}: ${escape(change.action.replaceAll('_', ' '))}</strong> ${escape(change.title || proposal.labels[change.id] || change.id || 'Bus and walking')}${change.time ? ` at ${escape(change.time)} (${change.durationMinutes} minutes)` : ''}<p>${escape(change.reason)}</p></li>`).join('')}</ul><p>Travel estimates and buffers are not verified routes. Bookings remain unchanged.</p><div class="quick-plan-actions"><button type="button" data-guide-apply>Apply changes</button><button type="button" data-guide-discard>Discard</button></div>`;
    const apply = query('[data-guide-apply]');
    if (apply) apply.disabled = busy || !signedIn || !navigator.onLine;
  }
  function saveConversation() {
    conversation = conversation.slice(-10);
    if (conversation.some(entry => contract.containsCoordinates(entry.text))) privateConversation = true;
    try {
      if (privateConversation) sessionStorage.removeItem(historyKey);
      else sessionStorage.setItem(historyKey, JSON.stringify({ sessionId, history: conversation }));
    } catch {}
  }
  async function requestGuide(body) {
    const serialized = JSON.stringify(body);
    if (new TextEncoder().encode(serialized).length > 98304) throw Error('Trip context is too large. Shorten activity notes or clear the chat.');
    const response = await fetch(config.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: serialized, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(28000) });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) { token = null; throw Error('Sign-in expired or access denied. Sign in again.'); }
      if (response.status === 409) throw Error('Proposal authorization is stale or invalid. Ask for an updated proposal.');
      throw Error(response.status === 429 ? 'Guide is busy or rate-limited. Retry shortly.' : 'Travel Guide is unavailable. Your itinerary has not changed.');
    }
    try { return await response.json(); }
    catch { throw Error('Guide returned an unreadable response. No changes were applied.'); }
  }
  async function send(message, retry = false) {
    if (busy || !configured || !navigator.onLine || !token || Date.now() >= expiresAt) { render(); return; }
    message = message.trim();
    if (!message || message.length > 1000) return;
    busy = true;
    pending = message;
    error = '';
    proposal = null;
    render();
    const requestEpoch = authEpoch;
    try {
      const snapshot = planner.snapshot(context());
      contract.validateSnapshot(snapshot);
      if (snapshot.location || contract.containsCoordinates(message) || contract.containsCoordinates(snapshot.preferences)) {
        privateConversation = true;
        saveConversation();
      }
      const data = await requestGuide({ sessionId, message, history: conversation, snapshot });
      if (requestEpoch !== authEpoch) return;
      if (!data || Object.keys(data).some(field => !['sessionId', 'reply', 'changes', 'commitment', 'liveInformation'].includes(field)) || data.sessionId !== sessionId || typeof data.reply !== 'string' || !data.reply.trim() || data.reply.length > 6000 || data.liveInformation !== false || !Array.isArray(data.changes) || data.changes.length > 8) throw Error('Invalid guide response. No changes were applied.');
      const changes = data.changes.length ? contract.validateChanges(snapshot, data.changes) : [];
      if (contract.canonicalJSON(changes) !== contract.canonicalJSON(data.changes)) throw Error('Noncanonical guide proposal.');
      if (changes.length) await contract.verifyAuthorization(data.commitment, { kind: 'proposal', snapshot, changes, trip: window.TRIP, sessionId, publicKey: config.proposalPublicKey });
      else if (data.commitment !== null) throw Error('Unexpected proposal commitment.');
      if (requestEpoch !== authEpoch) return;
      conversation.push({ role: 'user', text: message }, { role: 'assistant', text: data.reply.slice(0, 2500) });
      saveConversation();
      pending = '';
      if (!retry) query('#guide-input').value = '';
      if (changes.length) proposal = { changes, commitment: data.commitment, revision: revision(snapshot), labels: Object.fromEntries(snapshot.days.flatMap(day => day.events.map(event => [event.id, event.title]))) };
    } catch (failure) {
      if (requestEpoch === authEpoch) error = failure.name === 'TimeoutError' || failure.name === 'AbortError' ? 'Guide timed out. Your itinerary has not changed. Retry when ready.' : failure.message || 'Connection failed. Retry when online.';
    } finally { busy = false; render(); }
  }
  const base64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  query('#guide-sign-in').addEventListener('click', async () => {
    try {
      const verifier = base64(crypto.getRandomValues(new Uint8Array(48)));
      const state = crypto.randomUUID();
      const challenge = base64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
      sessionStorage.setItem('perth-guide-oauth', JSON.stringify({ verifier, state, createdAt: Date.now() }));
      const url = new URL('/oauth2/authorize', config.oauthDomain);
      url.search = new URLSearchParams({ response_type: 'code', client_id: config.clientId, redirect_uri: config.redirectUri, scope: config.scope, state, code_challenge: challenge, code_challenge_method: 'S256' });
      location.assign(url.href);
    } catch { error = 'Unable to start secure sign-in.'; render(); }
  });
  query('#guide-sign-out').addEventListener('click', () => { authEpoch++; token = null; expiresAt = 0; proposal = null; pending = ''; error = ''; render(); });
  query('#guide-form').addEventListener('submit', event => { event.preventDefault(); send(query('#guide-input').value); });
  query('#guide-retry').addEventListener('click', () => send(pending, true));
  query('#guide-prompts').addEventListener('click', event => {
    const button = event.target.closest('[data-guide-prompt]');
    if (!button) return;
    query('#guide-input').value = button.textContent;
    query('#guide-input').focus();
  });
  query('#guide-location').addEventListener('input', event => {
    locationRequestId++;
    locating = false;
    locationContext = event.target.value.trim() ? { label: event.target.value.trim(), observedAt: new Date().toISOString(), source: 'user' } : null;
    locationMessage = locationContext ? 'Using your typed last-known location.' : 'No location selected.';
    renderLocation();
  });
  query('#guide-clear-location').addEventListener('click', () => {
    locationRequestId++;
    locating = false;
    locationContext = null;
    query('#guide-location').value = '';
    locationMessage = 'Location cleared.';
    renderLocation();
  });
  query('#guide-use-location').addEventListener('click', () => {
    if (!window.isSecureContext || !navigator.geolocation) {
      locationMessage = !window.isSecureContext ? 'Device location requires HTTPS or localhost. You can type a location instead.' : 'Device location is not supported by this browser. You can type a location instead.';
      renderLocation();
      return;
    }
    const requestId = ++locationRequestId;
    locating = true;
    locationMessage = 'Waiting for location permission and a device reading...';
    renderLocation();
    const failed = failure => {
      if (requestId !== locationRequestId) return;
      locating = false;
      locationMessage = failure.code === 1 ? 'Location permission denied. Allow location in browser settings or type a location.' : failure.code === 3 ? 'Location request timed out. Try again or type a location.' : 'Device location is unavailable. Try again or type a location.';
      if (locationContext) locationMessage += ' Your previous location is unchanged.';
      renderLocation();
    };
    try {
      navigator.geolocation.getCurrentPosition(position => {
        if (requestId !== locationRequestId) return;
        try {
          const { latitude, longitude, accuracy } = position.coords;
          if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180 || !Number.isFinite(accuracy) || accuracy < 0) throw Error('Invalid device reading');
          if (!Number.isFinite(position.timestamp)) throw Error('Invalid device timestamp');
          const observedAt = new Date(position.timestamp).toISOString();
          const label = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
          locationContext = { label, source: 'device', observedAt, latitude, longitude, accuracyMeters: accuracy };
          query('#guide-location').value = label;
          locating = false;
          locationMessage = `Device reading: ${label}; accuracy about ${Math.ceil(accuracy)} metres. Recorded ${new Date(observedAt).toLocaleString('en-AU', { timeZone: 'Australia/Perth' })} Perth time.`;
          if (accuracy > 250) locationMessage += ' Approximate location: enter a nearby landmark if this is too imprecise.';
          renderLocation();
        } catch { failed({ code: 2 }); }
      }, failed, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
    } catch { failed({ code: 2 }); }
  });
  query('#guide-clear').addEventListener('click', () => { if (busy) return; conversation = []; privateConversation = false; pending = ''; proposal = null; error = ''; sessionId = crypto.randomUUID(); saveConversation(); render(); });
  query('#guide-proposal').addEventListener('click', async event => {
    if (event.target.closest('[data-guide-discard]')) { proposal = null; render(); return; }
    if (!event.target.closest('[data-guide-apply]') || !proposal || busy) return;
    const candidate = proposal;
    const requestEpoch = authEpoch;
    busy = true;
    render();
    try {
      if (!navigator.onLine || !token || Date.now() >= expiresAt) throw Error('Sign in online to validate this proposal before applying it.');
      const current = planner.snapshot(context());
      if (revision(current) !== candidate.revision) throw Error('Your trip context changed. Ask again for an updated proposal.');
      const result = await requestGuide({ operation: 'confirm', sessionId, snapshot: current, changes: candidate.changes, commitment: candidate.commitment });
      if (requestEpoch !== authEpoch) return;
      if (!result || Object.keys(result).some(field => !['sessionId', 'changes', 'authorization'].includes(field)) || result.sessionId !== sessionId || contract.canonicalJSON(result.changes) !== contract.canonicalJSON(candidate.changes)) throw Error('Altered confirmation response.');
      const currentContext = () => {
        if (requestEpoch !== authEpoch || !token || Date.now() >= expiresAt || !navigator.onLine) throw Error('Sign-in changed while applying the proposal.');
        return context();
      };
      await planner.apply(candidate.changes, currentContext, { receipt: result.authorization, sessionId, parentId: candidate.commitment.payload.id });
      proposal = null;
      error = '';
      query('#guide-applied').textContent = 'Changes applied to your actual plan and saved on this device.';
    } catch (failure) { if (requestEpoch === authEpoch) error = failure.message; proposal = null; }
    finally { busy = false; render(); }
  });
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  async function completeSignIn() {
    const params = new URLSearchParams(location.search);
    if (!params.has('code') && !params.has('error')) return;
    history.replaceState(null, '', location.pathname + '#travel-guide');
    try {
      const transaction = JSON.parse(sessionStorage.getItem('perth-guide-oauth') || 'null');
      sessionStorage.removeItem('perth-guide-oauth');
      if (!configured || params.has('error') || !transaction || params.get('state') !== transaction.state || Date.now() - transaction.createdAt > 600000) throw Error('Sign-in failed or expired. Try again.');
      const response = await fetch(new URL('/oauth2/token', config.oauthDomain), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId, redirect_uri: config.redirectUri, code: params.get('code'), code_verifier: transaction.verifier }), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw Error('Sign-in token exchange failed.');
      const data = await response.json();
      if (typeof data.access_token !== 'string' || data.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw Error('Invalid sign-in response.');
      token = data.access_token;
      expiresAt = Date.now() + Math.min(data.expires_in, 3600) * 1000;
    } catch (failure) { error = failure.message; }
    render();
  }
  render();
  renderLocation();
  completeSignIn();
})();