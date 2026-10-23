((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TravelGuideContract = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const actions = ['skip', 'complete', 'reschedule', 'replace', 'add', 'set_transport'];
  const types = ['activity', 'food', 'shopping', 'free'];
  const fail = (message) => { throw new Error(message); };
  const text = (value, max = 240) => typeof value === 'string' && value.length > 0 && value.length <= max;
  const containsCoordinates = value => {
    const content = String(value || '');
    return /\d{1,3}\s*(?:\u00b0|deg(?:ree)?s?)\s*\d{1,2}\s*(?:['\u2032]|min(?:ute)?s?)\s*\d{1,2}(?:\.\d+)?/i.test(content)
      || [...content.matchAll(/[+-]?\d{1,3}\.\d{3,}/g)].some(match => Math.abs(Number(match[0])) <= 180);
  };
  const dateValid = (date) => /^2026-10-(1[0-9]|2[0-4])$/.test(date);
  const locked = (event) => Boolean(event.confirmed || event.locked || ['flight', 'work', 'hotel'].includes(event.type) || /ferry|boarding|check-in|checkin|jetty/i.test(`${event.title} ${event.transport || ''}`));
  const perthDate = (now) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  function minutes(time) {
    const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(time || '');
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    if (minute > 59 || hour > (match[3] ? 12 : 23) || (match[3] && hour < 1)) return null;
    if (match[3]) hour = hour % 12 + (/PM/i.test(match[3]) ? 12 : 0);
    return hour * 60 + minute;
  }
  function eventStart(event) {
    if (/unconfirmed|proposed|~|verify/i.test(event.time || '')) return null;
    const parts = String(event.time || '').split(/[\u2013\u2014]/);
    let start = parts[0].trim();
    const meridiem = parts[1]?.match(/\b(AM|PM)\b/i)?.[1];
    if (meridiem && !/\b(AM|PM)\b/i.test(start)) start += ` ${meridiem}`;
    return minutes(start);
  }
  function eventEnd(event) {
    if (eventStart(event) === null) return null;
    return minutes(String(event.time || '').split(/[\u2013\u2014]/)[1]?.split(',')[0].trim()) ?? eventStart(event);
  }
  function commitmentStart(event, date) {
    if (event.startAt) return (Date.parse(event.startAt) - Date.parse(`${date}T00:00:00+08:00`)) / 60000;
    return eventStart(event);
  }
  function orderEvents(events, order) {
    if (!Array.isArray(order)) return events;
    const positions = new Map(order.map((id, index) => [id, index]));
    return [...events].sort((first, second) => (positions.get(first.id) ?? order.length) - (positions.get(second.id) ?? order.length));
  }
  function canonicalJSON(value) {
    if (Array.isArray(value)) return `[${value.map(entry => canonicalJSON(entry === undefined ? null : entry)).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  }
  const contextRevision = snapshot => canonicalJSON({ ...snapshot, now: undefined });
  async function digest(value) {
    const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJSON(value)));
    return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function plannedTripDay(trip, date, option, mode) {
    const original = trip.days.find(day => day.date === date);
    if (!original) fail('Unknown trip day.');
    const day = { ...original, ...(original.variants?.[option] || {}) };
    const flights = [];
    for (const journey of trip.flightJourneys) {
      const segments = journey.segmentIds.map(id => trip.flights.find(segment => segment.id === id)).filter(Boolean);
      segments.forEach((segment, index) => {
        if (segment.date === date) {
          const arrival = segment.arrivalTime ? `Arrives ${segment.destination.code} Terminal ${segment.destination.terminal} at ${segment.arrivalTime}.` : segment.arrivalTimeNote || 'Arrival time: verify ticket.';
          flights.push({ time: segment.departureTime, title: `${segment.flightNumber} departure \u00b7 ${segment.origin.code} \u2192 ${segment.destination.code}`, type: 'flight', transport: segment.airline, note: `Depart ${segment.origin.name}, Terminal ${segment.origin.terminal}. ${arrival} ${segment.duration ? `Flight time ${segment.duration}.` : ''}`, query: `${segment.origin.name}, Terminal ${segment.origin.terminal}`, confirmed: true });
        }
        if (segment.arrivalDate === date) {
          flights.push({ time: segment.arrivalTime || 'Arrival time: verify ticket', title: `${segment.flightNumber} arrival \u00b7 ${segment.origin.code} \u2192 ${segment.destination.code}`, type: 'flight', transport: segment.airline, note: `Arrive ${segment.destination.name}, Terminal ${segment.destination.terminal}.${segment.duration ? ` Flight time ${segment.duration}.` : ''}`, query: `${segment.destination.name}, Terminal ${segment.destination.terminal}`, confirmed: true });
          const next = segments[index + 1];
          if (segment.connectionAfter && next?.date === date) flights.push({ time: `${segment.arrivalTime}\u2013${next.departureTime}`, title: `${segment.connectionAfter.airportCode} connection \u00b7 ${segment.connectionAfter.duration}`, type: 'flight', transport: 'Connection time', note: `${segment.flightNumber} arrives at ${segment.arrivalTime}; ${next.flightNumber} departs at ${next.departureTime}.`, query: `${trip.flights.find(entry => entry.origin.code === segment.connectionAfter.airportCode)?.origin.name || 'Singapore Changi Airport'} Terminal ${next.origin.terminal}`, confirmed: true });
        }
      });
    }
    let events;
    if (day.events === 'flights') events = flights;
    else if (day.events === 'arrival') events = [...flights, ...trip.arrival];
    else {
      const activities = Array.isArray(day.events) ? day.events.map(event => {
        const segment = event.flightRef && trip.flights.find(flight => flight.id === event.flightRef);
        return segment ? { ...event, title: `Late-night Uber to ${segment.origin.name} for ${segment.flightNumber} at ${segment.departureTime}` } : event;
      }) : [];
      if (day.schedule && Array.isArray(trip[day.schedule])) {
        let stopsInserted = false;
        activities.push(...(day.schedule === 'rottnestPlan' && mode === 'bicycle' ? trip.rottnestPlan.flatMap(event => {
          if (!event.modeStop) return [event];
          if (stopsInserted) return [];
          stopsInserted = true;
          return trip.rottnestBicycleStops;
        }) : trip[day.schedule]));
      }
      if (day.kind === 'work-evening' || day.kind === 'departure' || date === '2026-10-16' && option === 'option1') {
        activities.unshift({ time: trip.work.hours, title: trip.work.name, type: 'work', transport: 'Walk', query: trip.work.query, note: 'Woodside workday.' });
        if (!Array.isArray(day.events) && !day.schedule) activities.push({ time: day.activityTime || 'After work', title: day.kind === 'departure' ? 'Uber to Perth Airport' : 'After-work plan', type: day.kind === 'departure' ? 'travel' : 'activity', note: day.activity, transport: day.transport, query: day.kind === 'departure' ? 'Perth Airport, Western Australia' : day.location ? trip.locations[day.location]?.query : null });
      }
      events = activities.length ? [...flights, ...activities] : [{ time: day.activityTime || (date === '2026-10-16' ? 'Plan-dependent' : 'Today'), title: day.title, note: day.activity, type: day.activityType || (day.kind === 'departure' ? 'travel' : 'activity'), transport: day.transport, query: day.location ? trip.locations[day.location]?.query : null }];
    }
    return { ...day, events };
  }
  function projectSnapshot(trip, { now, option, rottnestMode, selectedDate, location = null, preferences = '' }) {
    return { version: 1, now, timezone: trip.trip.timezone, option, rottnestMode, selectedDate, location, preferences,
      days: trip.days.map(({ date }) => {
        const day = plannedTripDay(trip, date, option, rottnestMode);
        return { date, title: day.title, destination: day.destination || day.base, hotel: day.kind === 'flight' ? null : trip.hotels[date < '2026-10-16' ? 0 : 1],
          events: day.events.map((event, index) => {
            const segment = event.type === 'flight' && trip.flights.find(flight => event.title.startsWith(`${flight.id} departure`) || event.title.startsWith(`${flight.id} arrival`));
            const arrival = segment && event.title.startsWith(`${segment.id} arrival`);
            const airport = segment && (arrival ? segment.destination : segment.origin);
            const time = segment && (arrival ? segment.arrivalTime : segment.departureTime);
            return { id: `${date}-${event.id || `planned-${index}`}`, title: event.title, time: event.time || 'Flexible', type: event.type || 'activity', transport: event.transport || '', note: event.note || '', source: 'planned', status: 'pending', locked: locked(event), ...(time ? { startAt: `${arrival ? segment.arrivalDate : segment.date}T${time}:00${airport.code === 'BLR' ? '+05:30' : '+08:00'}` } : {}) };
          }) };
      }) };
  }
  async function verifyAuthorization(receipt, { kind, snapshot, changes, trip, sessionId, publicKey, parentId = null, now = Date.now() }) {
    try {
      if (!receipt || Object.keys(receipt).sort().join(',') !== 'payload,signature' || typeof receipt.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(receipt.signature)) fail('Invalid authorization receipt.');
      const payload = receipt.payload;
      const fields = ['v', 'kind', 'id', 'parentId', 'sessionId', 'subject', 'tripRevision', 'contextHash', 'changesHash', 'issuedAt', 'expiresAt'];
      if (!payload || Object.keys(payload).sort().join(',') !== fields.sort().join(',') || payload.v !== 1 || payload.kind !== kind || payload.sessionId !== sessionId || payload.parentId !== parentId || !/^[a-f0-9-]{36}$/i.test(payload.id) || typeof payload.subject !== 'string' || !payload.subject || !Number.isSafeInteger(payload.issuedAt) || !Number.isSafeInteger(payload.expiresAt) || payload.expiresAt - payload.issuedAt !== 300 || payload.issuedAt > Math.floor(now / 1000) + 60 || payload.expiresAt <= Math.floor(now / 1000)) fail('Expired or mismatched authorization receipt.');
      if (payload.tripRevision !== await digest(trip) || payload.contextHash !== await digest(contextRevision(snapshot)) || payload.changesHash !== await digest(changes)) fail('Proposal or itinerary context changed.');
      const key = await globalThis.crypto.subtle.importKey('jwk', publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      const signature = Uint8Array.from(atob(receipt.signature.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
      if (!await globalThis.crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, new TextEncoder().encode(canonicalJSON(payload)))) fail('Invalid authorization signature.');
      return payload;
    } catch { fail('Invalid, stale or altered server authorization.'); }
  }
  function validateSnapshot(snapshot) {
    if (!snapshot || snapshot.version !== 1 || !dateValid(snapshot.selectedDate) || !['option1', 'option2', 'option3'].includes(snapshot.option) || !['bus', 'bicycle'].includes(snapshot.rottnestMode)) fail('Invalid trip selection.');
    if (!Number.isFinite(Date.parse(snapshot.now)) || snapshot.timezone !== 'Australia/Perth') fail('Invalid current time.');
    if (!Array.isArray(snapshot.days) || snapshot.days.length !== 15) fail('Expected the complete 15-day itinerary.');
    const dates = new Set();
    for (const day of snapshot.days) {
      if (!dateValid(day.date) || dates.has(day.date) || !text(day.title, 160) || !Array.isArray(day.events) || day.events.length > 60) fail('Invalid itinerary day.');
      dates.add(day.date);
      const ids = new Set();
      for (const event of day.events) {
        if (!text(event.id, 100) || ids.has(event.id) || !text(event.title, 160) || !text(event.time, 100) || !['pending', 'completed', 'skipped'].includes(event.status) || !text(event.type, 20)) fail('Invalid activity snapshot.');
        if ((event.note && !text(event.note, 2000)) || (event.transport && !text(event.transport, 240))) fail('Activity details too long.');
        if (event.startAt && !Number.isFinite(Date.parse(event.startAt))) fail('Invalid commitment instant.');
        ids.add(event.id);
      }
    }
    if (snapshot.location !== null) {
      const location = snapshot.location;
      if (!location || !text(location.label, 160) || !Number.isFinite(Date.parse(location.observedAt)) || !['user', 'device'].includes(location.source)) fail('Invalid location.');
      const allowed = location.source === 'device' ? ['label', 'observedAt', 'source', 'latitude', 'longitude', 'accuracyMeters'] : ['label', 'observedAt', 'source'];
      if (Object.keys(location).some(key => !allowed.includes(key))) fail('Unsupported location field.');
      if (location.source === 'device' && (!Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90 || !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180 || !Number.isFinite(location.accuracyMeters) || location.accuracyMeters < 0)) fail('Invalid device coordinates or accuracy.');
    }
    if (typeof snapshot.preferences !== 'string' || snapshot.preferences.length > 400) fail('Invalid preferences.');
    return snapshot;
  }
  function validateChanges(snapshot, changes) {
    validateSnapshot(snapshot);
    if (!Array.isArray(changes) || !changes.length || changes.length > 8) fail('Propose between one and eight changes.');
    const seen = new Set();
    const today = perthDate(snapshot.now);
    const normalized = changes.map((change) => {
      if (!change || !actions.includes(change.action) || !dateValid(change.date) || !text(change.reason, 300)) fail('Invalid change contract.');
      const allowed = ['action', 'date', 'reason', 'id', 'title', 'time', 'type', 'note', 'durationMinutes', 'travelMinutes', 'mode'];
      if (Object.keys(change).some(key => !allowed.includes(key))) fail('Unsupported change field.');
      const day = snapshot.days.find(entry => entry.date === change.date);
      const key = `${change.date}|${change.id || change.action + (change.time || '')}`;
      if (seen.has(key)) fail('Conflicting changes for the same activity.');
      seen.add(key);
      if (change.action === 'set_transport') {
        if (change.mode !== 'bus' || !day.events.some(event => /Rottnest|Thomson|Basin/i.test(event.title))) fail('Only switching a Rottnest day to bus/walking is supported.');
        return { action: change.action, date: change.date, mode: 'bus', reason: change.reason };
      }
      const event = day.events.find(entry => entry.id === change.id);
      if (change.action !== 'add' && (!event || locked(event))) fail('Unknown or fixed activity cannot be changed.');
      if (event?.status === 'completed' && change.action !== 'complete') fail('Completed activities stay as recorded.');
      if (['skip', 'complete'].includes(change.action)) return { action: change.action, date: change.date, id: event.id, reason: change.reason };
      const start = minutes(change.time);
      if (start === null || !/^\d{2}:\d{2}$/.test(change.time) || !Number.isInteger(change.durationMinutes) || change.durationMinutes < 10 || change.durationMinutes > 180 || !Number.isInteger(change.travelMinutes) || change.travelMinutes < 0 || change.travelMinutes > 180) fail('Changes need a 24-hour start, duration and estimated travel minutes.');
      if (change.date < today || (change.date === today && Date.parse(`${change.date}T${change.time}:00+08:00`) < Date.parse(snapshot.now))) fail('Cannot schedule in the past.');
      const finish = start + change.durationMinutes;
      if (finish > 1440) fail('Activity runs past midnight.');
      const travel = Math.max(30, change.travelMinutes);
      for (const commitmentDay of snapshot.days) {
        const offset = (Date.parse(`${commitmentDay.date}T00:00:00+08:00`) - Date.parse(`${day.date}T00:00:00+08:00`)) / 60000;
        for (const commitment of commitmentDay.events.filter(locked)) {
          const localStart = commitmentStart(commitment, commitmentDay.date);
          if (localStart === null) {
            if (commitmentDay.date === day.date && /ferry|boarding/i.test(`${commitment.title} ${commitment.transport || ''}`)) fail('Confirm ferry times before adding or rescheduling activities on this day.');
            continue;
          }
          const fixed = localStart + offset;
          const end = commitment.startAt ? fixed : eventEnd(commitment) + offset;
          if (start < end + travel && finish + travel + 60 > fixed) fail('Change overlaps a fixed commitment or its conservative travel/boarding buffer.');
        }
      }
      if (change.action !== 'reschedule' && (!text(change.title, 100) || !types.includes(change.type))) fail('New activities need a title and supported type.');
      if (change.note !== undefined && (typeof change.note !== 'string' || change.note.length > 240)) fail('Activity note too long.');
      if (containsCoordinates(change.action === 'reschedule' ? event.title : change.title) || containsCoordinates(change.note)) fail('Use place names, not precise coordinates, in itinerary text.');
      return { action: change.action, date: change.date, ...(event ? { id: event.id } : {}), title: change.action === 'reschedule' ? event.title : change.title, type: change.action === 'reschedule' ? event.type : change.type, time: change.time, durationMinutes: change.durationMinutes, travelMinutes: change.travelMinutes, note: change.note || '', reason: change.reason };
    });
    const scheduled = normalized.filter(change => change.time);
    for (const [index, change] of scheduled.entries()) {
      const day = snapshot.days.find(entry => entry.date === change.date);
      const changedIds = new Set(normalized.filter(other => other.date === change.date && ['skip', 'replace', 'reschedule'].includes(other.action)).map(other => other.id));
      for (const existing of day.events.filter(event => event.status === 'pending' && !locked(event) && !changedIds.has(event.id))) {
        const start = eventStart(existing);
        const end = eventEnd(existing);
        if (start !== null && end !== null && minutes(change.time) < Math.max(start + 30, end) + 30 && minutes(change.time) + change.durationMinutes + Math.max(30, change.travelMinutes) > start) fail('Change overlaps another pending activity. Skip or reschedule it in the same proposal.');
      }
      for (const other of scheduled.slice(index + 1)) {
        if (change.date === other.date && minutes(change.time) < minutes(other.time) + other.durationMinutes + Math.max(30, other.travelMinutes) && minutes(other.time) < minutes(change.time) + change.durationMinutes + Math.max(30, change.travelMinutes)) fail('Proposed activities overlap or omit travel time.');
      }
    }
    return normalized;
  }
  function applyChanges(snapshot, changes, buckets, makeId) {
    const validated = validateChanges(snapshot, changes);
    const result = JSON.parse(JSON.stringify(buckets));
    let mode = snapshot.rottnestMode;
    for (const change of validated) {
      if (change.action === 'set_transport') { mode = 'bus'; continue; }
      const bucket = result[change.date];
      if (!bucket || !bucket.overrides || !Array.isArray(bucket.additions)) fail('Missing actual plan bucket.');
      const addition = bucket.additions.find(entry => entry.id === change.id);
      const patch = change.action === 'skip' ? { skipped: true } : change.action === 'complete' ? { completed: true, skipped: false } : {
        title: change.title, time: `${change.time}\u2013${String(Math.floor((minutes(change.time) + change.durationMinutes) / 60)).padStart(2, '0')}:${String((minutes(change.time) + change.durationMinutes) % 60).padStart(2, '0')}`,
        type: change.type, note: change.note, completed: false, skipped: false
      };
      if (change.action === 'add') bucket.additions.push({ ...patch, id: makeId() });
      else if (addition) Object.assign(addition, patch);
      else bucket.overrides[change.id] = { ...(bucket.overrides[change.id] || {}), ...patch };
    }
    for (const date of new Set(validated.filter(change => change.time).map(change => change.date))) {
      const bucket = result[date];
      const addedIds = new Set(bucket.additions.map(event => event.id));
      const entries = snapshot.days.find(day => day.date === date).events.filter(event => !addedIds.has(event.id)).map(event => ({ ...event, ...bucket.overrides[event.id] })).concat(bucket.additions);
      bucket.order = entries.sort((first, second) => (eventStart(first) ?? 1440) - (eventStart(second) ?? 1440)).map(event => event.id);
    }
    return { buckets: result, rottnestMode: mode };
  }
  return { validateSnapshot, validateChanges, applyChanges, orderEvents, containsCoordinates, locked, minutes, eventStart, eventEnd, commitmentStart, perthDate, canonicalJSON, contextRevision, digest, plannedTripDay, projectSnapshot, verifyAuthorization };
});