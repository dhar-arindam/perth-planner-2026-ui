(() => {
  function renderFlights() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('perth-trip-flight-reminders') || '{}'); } catch { saved = {}; }
    $('#flight-journeys').innerHTML = trip.flightJourneys.map((journey) => {
      const segments = journey.segmentIds.map((id) => trip.flights.find((segment) => segment.id === id)).filter(Boolean);
      const route = segments.length ? [segments[0].origin.code, ...segments.map((segment) => segment.destination.code)].join(' → ') : '';
      const flightNumbers = segments.map((segment) => segment.flightNumber).join(' → ');
      const reminders = trip.flightReminders.find((entry) => entry.journeyId === journey.id)?.items || [];
      const segmentMarkup = segments.map((segment) => {
        const arrival = segment.arrivalTime ? `${segment.arrivalTime} · ${segment.destination.name}` : segment.arrivalTimeNote || 'Arrival time: verify ticket';
        const connection = segment.connectionAfter ? `<p class="flight-connection">Connection in ${esc(segment.connectionAfter.airportCode)}: ${esc(segment.connectionAfter.duration)}.</p>` : '';
        return `<article class="flight-segment"><div class="flight-segment-heading"><strong>${esc(segment.id)}</strong><span>CONFIRMED · FIXED</span></div><p class="flight-route">${esc(segment.origin.code)} → ${esc(segment.destination.code)}</p><div class="flight-points"><div><span>DEPART</span><strong>${esc(segment.departureTime)} · ${dateParts(segment.date).shortDate}</strong><span>${esc(segment.origin.name)}</span><span>Terminal ${esc(segment.origin.terminal)}</span></div><div><span>ARRIVE</span><strong>${esc(arrival)}</strong><span>${esc(segment.destination.name)}</span><span>Terminal ${esc(segment.destination.terminal)}</span></div></div><p class="flight-equipment">${esc(segment.airline)} · ${esc(segment.cabin)} · ${esc(segment.aircraft)}</p>${connection}${mapsLink(`${segment.origin.name}, Terminal ${segment.origin.terminal}`, `Map ${segment.origin.code} Terminal ${segment.origin.terminal}`)}</article>`;
      }).join('');
      return `<article class="flight-journey"><div class="flight-overview"><div><p class="eyebrow">${esc(journey.direction)} / ${esc(journey.dateLabel)}</p><h3>${esc(route)}</h3><p class="flight-numbers">${esc(flightNumbers)}</p><span class="flight-cabin">${esc(journey.cabin)}</span></div><div class="flight-overview-facts"><span>${esc(journey.layover.duration)} layover · ${esc(journey.layover.airportCode)}</span><span>${esc(journey.totalDuration)} total journey</span></div></div><details class="flight-segment-details"><summary>Full segment details</summary><div class="flight-segments">${segmentMarkup}</div></details><div class="flight-reminders"><div class="flight-reminder-heading"><span class="eyebrow">OPTIONAL FLIGHT REMINDERS</span><span>Saved on this device</span></div><div class="flight-reminder-list">${reminders.map((reminder, index) => `<label class="flight-reminder"><input type="checkbox" data-flight-reminder="${journey.id}" data-reminder-index="${index}" ${(saved[journey.id] || {})[index] ? 'checked' : ''}><span class="custom-check" aria-hidden="true"></span><span>${esc(reminder)}</span></label>`).join('')}</div></div></article>`;
    }).join('');
      $$('.flight-journey').forEach((card, index) => {
        const journey = trip.flightJourneys[index];
        const segments = journey.segmentIds.map((id) => trip.flights.find((segment) => segment.id === id)).filter(Boolean);
        const perthSegment = segments.find((segment) => segment.origin.code === 'PER' || segment.destination.code === 'PER');
        if (!perthSegment) return;
        const milestone = perthSegment.destination.code === 'PER' ? `Arrive Perth: ${perthSegment.arrivalTime}` : `Depart Perth: ${perthSegment.departureTime}`;
        card.querySelector('.flight-overview-facts').insertAdjacentHTML('afterbegin', `<strong class="flight-key-time">${esc(milestone)}</strong>`);
      });
  }

  function planButton(label, action, eventId, source = 'planned') {
    return `<button type="button" class="plan-item-action" data-plan-action="${action}" data-event-id="${esc(eventId)}" data-source="${source}">${esc(label)}</button>`;
  }

  function renderPlanItem(event, label, controls = '', state = '') {
    const type = event.type || 'activity';
    const query = event.query || (event.location === 'work' ? trip.work.query : event.location ? trip.locations[event.location]?.query : null);
    return `<article class="selected-event ${state}"><div class="selected-event-top"><div><span class="event-type event-type-${esc(type)}">${esc(type.toUpperCase())}</span><span class="plan-label">${esc(label)}</span>${event.optional ? '<span class="optional-label">OPTIONAL</span>' : ''}</div><time>${esc(event.time || 'Flexible')}</time></div><h4>${esc(event.title)}</h4>${event.note ? `<p>${esc(event.note)}</p>` : ''}${event.transport ? `<span class="selected-event-transport">${esc(event.transport)}</span>` : ''}${query ? mapsLink(query, 'Map') : ''}${controls ? `<div class="plan-item-actions">${controls}</div>` : ''}</article>`;
  }

  function renderPlannedEntry(event, bucket) {
    if (event.confirmed) return renderPlanItem(event, 'CONFIRMED · FIXED');
    const override = bucket.overrides[event.id];
    if (override?.skipped) {
      return renderPlanItem(event, 'PLANNED · SKIPPED', planButton('Restore planned', 'restore-event', event.id), 'is-skipped');
    }
    if (override) {
      const actual = { ...event, ...override };
      const label = override.completed ? 'ACTUAL · COMPLETED' : 'ACTUAL';
      const doneLabel = override.completed ? 'Undo done' : 'Done';
      return `${renderPlanItem(event, 'PLANNED · ORIGINAL', '', 'is-original')}${renderPlanItem(actual, label, `${planButton('Edit actual', 'edit-event', event.id, 'override')}${planButton(doneLabel, 'complete-event', event.id)}${planButton('Restore planned', 'restore-event', event.id)}`, 'is-actual')}`;
    }
    const controls = `${planButton('Edit', 'edit-event', event.id)}${planButton('Skip', 'skip-event', event.id)}${planButton('Done', 'complete-event', event.id)}`;
    return renderPlanItem(event, 'PLANNED', controls);
  }

  function renderAddedEntry(event) {
    const status = event.completed ? 'ACTUAL · COMPLETED' : 'ACTUAL · ADDED';
    const doneLabel = event.completed ? 'Undo done' : 'Done';
    const controls = `${planButton('Edit actual', 'edit-event', event.id, 'addition')}${planButton(doneLabel, 'complete-event', event.id, 'addition')}${planButton('Delete', 'delete-event', event.id, 'addition')}`;
    return renderPlanItem(event, status, controls, 'is-actual');
  }

  function renderSelectedDay() {
    const date = currentDate();
    const day = dayFor(date);
    if (!day) return;
    const pendingBranch = Boolean(day.variants && !weekendChoice);
    const bucket = actualBucket(date);
    const hasActual = Object.keys(bucket.overrides || {}).length > 0 || (bucket.additions || []).length > 0;
    const heading = `${dateParts(date).shortDay} ${dateParts(date).shortDate} · ${day.title}`;
    $('#selected-day-title').textContent = heading;
    $('#change-tonight').disabled = pendingBranch;
    $('#restore-planned').disabled = pendingBranch || !hasActual;
    if (pendingBranch) {
      const branches = trip.options.filter((option) => option.dates.includes(date) || date === '2026-10-15').map((option) => {
        const branch = dayFor(date, option.id);
        const events = plannedEvents(date, branch, option.id);
        return `<details class="branch-day-preview"><summary>Option ${option.number} · ${esc(branch.title)}</summary><div class="selected-event-list">${events.map((event) => renderPlanItem(event, 'PLANNED')).join('')}</div></details>`;
      }).join('');
      $('#today-events').innerHTML = `<p class="branch-pending-note">Preview a weekend option to edit this branch day. No option is selected or saved automatically.</p>${branches}`;
      $('.quick-plan-actions').hidden = true;
      return;
    }
    const events = plannedEvents(date, day);
    const rows = events.map((event) => renderPlannedEntry(event, bucket)).join('');
    const additions = (bucket.additions || []).map(renderAddedEntry).join('');
    $('#today-events').innerHTML = rows || additions ? `<div class="selected-event-list">${rows}${additions}</div>` : '<p class="empty-day-note">No plan is set. Add free time or a custom activity if useful.</p>';
    $('.quick-plan-actions').hidden = false;
  }

  function splitTimeRange(value = '') {
    const parts = String(value).split(/\s*[–—]\s*/);
    const end = parts.slice(1).join('–');
    let start = parts[0] || '';
    const meridiem = end.match(/\b(AM|PM)\b/i)?.[1];
    if (meridiem && !/\b(AM|PM)\b/i.test(start)) start = `${start} ${meridiem}`;
    return { start, end };
  }

  function openPlanEditor(mode, event = null, eventId = '') {
    const form = $('#plan-form');
    const time = splitTimeRange(event?.time || '');
    form.dataset.mode = mode;
    $('#plan-event-id').value = eventId;
    $('#plan-title').value = event?.title || '';
    $('#plan-start').value = time.start;
    $('#plan-end').value = time.end;
    $('#plan-type').value = event?.type || 'activity';
    $('#plan-notes').value = event?.note || '';
    $('#plan-editor-title').textContent = mode === 'addition' ? 'Add to actual plan' : 'Change actual plan';
    $('#plan-editor').showModal();
  }

  function renderActualPlan() {
    renderTodaySummary();
    renderSelectedDay();
  }

  function restorePlannedDay() {
    saveActualPlan(currentDate(), { overrides: {}, additions: [] });
    renderActualPlan();
  }

  function renderEventActions(action, eventId, source = 'planned') {
    const date = currentDate();
    const day = dayFor(date);
    const bucket = actualBucket(date);
    const base = plannedEvents(date, day);
    const original = base.find((event) => event.id === eventId);
    const addition = (bucket.additions || []).find((event) => event.id === eventId);
    if (original?.confirmed) return;
    if (action === 'edit-event') {
      openPlanEditor(source === 'addition' ? 'addition' : 'override', addition || bucket.overrides[eventId] && { ...original, ...bucket.overrides[eventId] } || original, eventId);
      return;
    }
    if (action === 'delete-event' && source === 'addition') {
      bucket.additions = bucket.additions.filter((event) => event.id !== eventId);
      saveActualPlan(date, bucket);
      renderActualPlan();
      return;
    }
    if (action === 'restore-event') delete bucket.overrides[eventId];
    if (action === 'skip-event') bucket.overrides[eventId] = { ...(bucket.overrides[eventId] || {}), skipped: true };
    if (action === 'complete-event' && source === 'addition' && addition) {
      bucket.additions = bucket.additions.map((event) => event.id === eventId ? { ...event, completed: !event.completed } : event);
    } else if (action === 'complete-event') {
      bucket.overrides[eventId] = { ...(bucket.overrides[eventId] || {}), completed: !bucket.overrides[eventId]?.completed };
    }
    saveActualPlan(date, bucket);
    renderActualPlan();
  }

  function addPlanPreset(preset) {
    const presets = {
      dinner: { title: 'Dinner', start: '7:00 PM', end: '8:30 PM', type: 'food', notes: 'Planned restaurant: optional.' },
      shopping: { title: 'Optional shopping', start: '4:30 PM', end: '5:45 PM', type: 'shopping', notes: 'Optional; skip if you would rather rest or explore elsewhere.' },
      activity: { title: '', start: '', end: '', type: 'activity', notes: '' },
      free: { title: 'Free time / return to hotel', start: '8:30 PM', end: 'Onwards', type: 'free', notes: '' },
      custom: { title: '', start: '', end: '', type: 'activity', notes: '' }
    };
    openPlanEditor('addition', presets[preset]);
  }

  function replacePlannedDinner() {
    const date = currentDate();
    const day = dayFor(date);
    const dinner = effectiveEvents(date, day).find((event) => event.type === 'food' && /dinner/i.test(event.title))
      || plannedEvents(date, day).find((event) => event.type === 'food');
    if (dinner) openPlanEditor(dinner.source === 'actual-addition' ? 'addition' : 'override', dinner, dinner.id);
    else addPlanPreset('dinner');
  }
  const trip = window.TRIP;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const mapUrl = (query) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const currentDate = () => $('#today-date').value;
  $('#today-date').min = trip.trip.start;
  $('#today-date').max = trip.trip.end;
  const perthDateParts = new Intl.DateTimeFormat('en-AU', {
    timeZone: trip.trip.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const perthDate = Object.fromEntries(perthDateParts
    .filter(({ type }) => type !== 'literal')
    .map(({ type, value }) => [type, value]));
  const todayDate = `${perthDate.year}-${perthDate.month}-${perthDate.day}`;
  $('#today-date').value = todayDate < trip.trip.start ? trip.trip.start : todayDate > trip.trip.end ? trip.trip.end : todayDate;
  let activeFilter = 'all';
  let weekendChoice = null;

  function briefingContext() {
    const selectedDate = currentDate();
    const tripDayNumber = trip.days.findIndex(({ date }) => date === selectedDate) + 1;
    if (selectedDate === todayDate) return { title: 'Today, in a glance', badge: 'TODAY' };
    if (todayDate < trip.trip.start && selectedDate === trip.trip.start) return { title: 'Your first day, in a glance', badge: 'NEXT UP' };
    if (todayDate > trip.trip.end && selectedDate === trip.trip.end) return { title: 'Final trip day, in a glance', badge: 'FINAL DAY' };
    return { title: `Day ${String(tripDayNumber).padStart(2, '0')}, in a glance`, badge: 'DATE PREVIEW' };
  }

  const dateParts = (date) => {
    const parsed = new Date(`${date}T00:00:00Z`);
    const options = { timeZone: trip.trip.timezone };
    return { shortDay: parsed.toLocaleDateString('en-AU', { ...options, weekday: 'short' }).toUpperCase(), shortDate: parsed.toLocaleDateString('en-AU', { ...options, day: 'numeric', month: 'short' }).toUpperCase() };
  };
  const externalNote = '<span class="external-link-note">Internet required</span>';
  const mapsLink = (query, label = 'Open in Google Maps', className = 'text-link') => `<a class="${className}" href="${mapUrl(query)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)}; internet required">${esc(label)} <span aria-hidden="true">↗</span>${externalNote}</a>`;
  const officialLink = (url, label = 'Official website') => url ? `<a class="text-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)}; internet required">${esc(label)} <span aria-hidden="true">↗</span>${externalNote}</a>` : '';
  const actionLinks = (item, transport = '') => `<div class="action-links">${mapsLink(item.query || `${item.name}, ${item.address || 'Perth WA'}`, 'Navigate')}${officialLink(item.url)}${transport ? `<span class="transport-chip">${esc(transport)}</span>` : ''}</div>`;

  function renderTripEssentials() {
    const perthArrival = trip.flights.find((segment) => segment.id === 'SQ223');
    const perthReturn = trip.flights.find((segment) => segment.id === 'SQ216');
    const entries = [
      ...trip.hotels.map((hotel) => ({ label: 'HOTEL', title: hotel.name, address: hotel.address, detail: `${hotel.dates} 2026 · ${hotel.checkin}`, query: hotel.query, url: hotel.url, verify: true })),
      { label: 'WORK', title: trip.work.name, address: trip.work.address, detail: trip.work.hours, query: trip.work.query },
      { label: 'AIRPORT TRANSFER', title: 'Uber · no self-drive', detail: `Arrival 11 Oct: ~16:00 after ${perthArrival.id} lands ${perthArrival.arrivalTime} at Terminal ${perthArrival.destination.terminal}. Return: late Friday 23 Oct for ${perthReturn.id} at ${perthReturn.departureTime} Saturday; transfer time adjustable.`, query: 'Perth Airport, Western Australia', url: trip.official.airport, verify: true },
      { label: 'SOUTHWEST TOUR', title: trip.southwest.recommended.tour, detail: `${trip.southwest.recommended.price} · indicative only; verify title, inclusions and current price.`, url: trip.southwest.recommended.url, verify: true },
      { label: 'ROTTNEST FERRY', title: 'Rottnest Express', address: trip.locations.jetty.address, detail: 'Barrack Street Jetty · timetable and booking: verify closer to trip.', query: trip.locations.jetty.query, url: trip.official.ferry, verify: true },
      { label: 'GETTING AROUND', title: 'Walk · Transperth · Uber', detail: 'No self-drive. Journey and ferry schedules: verify closer to trip.', url: trip.official.transperth, verify: true }
    ];
    $('#stay').innerHTML = `<div class="essentials-intro"><p class="eyebrow">QUICK REFERENCE / NO SELF-DRIVE</p><h2>Trip essentials</h2></div><div class="trip-essentials-grid">${entries.map((entry) => `<article class="essential-entry"><p class="eyebrow">${esc(entry.label)}</p><h3>${esc(entry.title)}</h3>${entry.address ? `<p class="essential-address">${esc(entry.address)}</p>` : ''}<p class="essential-detail">${esc(entry.detail)}</p>${entry.verify ? '<span class="verify-label">VERIFY CLOSER TO TRIP</span>' : ''}<div class="action-links">${entry.query ? mapsLink(entry.query, 'Navigate') : ''}${officialLink(entry.url, entry.label === 'AIRPORT TRANSFER' ? 'Perth Airport' : entry.label === 'SOUTHWEST TOUR' ? 'Official 2-day tour' : entry.label === 'ROTTNEST FERRY' ? 'Official ferry operator' : entry.label === 'GETTING AROUND' ? 'Transperth' : 'Official hotel site')}</div></article>`).join('')}</div>`;
  }

  function renderFlights() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('perth-trip-flight-reminders') || '{}'); } catch { saved = {}; }
    $('#flight-journeys').innerHTML = trip.flightJourneys.map((journey) => {
      const segments = journey.segmentIds.map((id) => trip.flights.find((segment) => segment.id === id)).filter(Boolean);
      const route = segments.length ? [segments[0].origin.code, ...segments.map((segment) => segment.destination.code)].join(' → ') : '';
      const numbers = segments.map((segment) => segment.id).join(' → ');
      const reminders = trip.flightReminders.find((entry) => entry.journeyId === journey.id)?.items || [];
      return `<article class="flight-journey"><div class="flight-overview"><div><p class="eyebrow">${esc(journey.direction)} / ${esc(journey.dateLabel)}</p><h3>${esc(route)}</h3><p class="flight-numbers">${esc(numbers)}</p></div><div class="flight-overview-facts"><span>${esc(journey.cabin)}</span><span>${esc(journey.totalDuration)} total</span><span>${esc(journey.layover.duration)} in ${esc(journey.layover.airportCode)}</span></div></div><details class="flight-segment-details"><summary>Full segment details</summary><div class="flight-segments">${segments.map((segment) => `<article class="flight-segment"><div class="flight-segment-heading"><strong>${esc(segment.id)}</strong><span>CONFIRMED · FIXED</span></div><p class="flight-route">${esc(segment.origin.code)} → ${esc(segment.destination.code)}</p><div class="flight-points"><div><span>DEPART</span><strong>${esc(segment.departureTime)} · ${dateParts(segment.date).shortDate}</strong><span>${esc(segment.origin.name)}</span><span>Terminal ${esc(segment.origin.terminal)}</span></div><div><span>ARRIVE</span><strong>${segment.arrivalTime ? esc(segment.arrivalTime) : 'Time not supplied'}</strong><span>${esc(segment.destination.name)}</span><span>Terminal ${esc(segment.destination.terminal)}</span>${segment.arrivalTimeNote ? `<span class="verify-label">${esc(segment.arrivalTimeNote)}</span>` : ''}</div></div><p class="flight-equipment">${esc(segment.airline)} · ${esc(segment.cabin)} · ${esc(segment.aircraft)}</p>${mapsLink(`${segment.origin.name}, Terminal ${segment.origin.terminal}`, `Map ${segment.origin.code} Terminal ${segment.origin.terminal}`)}</article>`).join('')}</div></details><div class="flight-reminders"><div class="flight-reminder-heading"><span class="eyebrow">OPTIONAL REMINDERS</span><span>Saved on this device</span></div><div class="flight-reminder-list">${reminders.map((reminder, index) => `<label class="flight-reminder"><input type="checkbox" data-flight-reminder="${journey.id}" data-reminder-index="${index}" ${(saved[journey.id] || {})[index] ? 'checked' : ''}><span class="custom-check" aria-hidden="true"></span><span>${esc(reminder)}</span></label>`).join('')}</div></div></article>`;
    }).join('');
    $$('.flight-journey').forEach((card, index) => {
      const journey = trip.flightJourneys[index];
      const segments = journey.segmentIds.map((id) => trip.flights.find((segment) => segment.id === id)).filter(Boolean);
      const segmentCards = card.querySelectorAll('.flight-segment');
      segments.forEach((segment, segmentIndex) => {
        if (!segment.duration) return;
        const duration = document.createElement('p');
        duration.className = 'flight-duration';
        duration.textContent = `Flight time: ${segment.duration}`;
        segmentCards[segmentIndex].querySelector('.flight-equipment').after(duration);
      });
      const perthSegment = segments.find((segment) => segment.origin.code === 'PER' || segment.destination.code === 'PER');
      if (!perthSegment) return;
      const milestone = perthSegment.destination.code === 'PER' ? `Arrive Perth: ${perthSegment.arrivalTime}` : `Depart Perth: ${perthSegment.departureTime}`;
      card.querySelector('.flight-overview-facts').insertAdjacentHTML('afterbegin', `<strong class="flight-key-time">${esc(milestone)}</strong>`);
    });
  }

  function dayFor(date, choice = weekendChoice) {
    const day = trip.days.find((entry) => entry.date === date);
    if (!day) return null;
    const variant = choice && day.variants?.[choice];
    return variant ? { ...day, ...variant } : day;
  }

  function isWorkday(day, choice = weekendChoice) {
    return day.kind === 'work-evening' || day.kind === 'departure' || (day.date === '2026-10-16' && choice === 'option1');
  }

  function flightDepartureEvent(segment) {
    const arrival = segment.arrivalTime ? `Arrives ${segment.destination.code} Terminal ${segment.destination.terminal} at ${segment.arrivalTime}.` : `${segment.arrivalTimeNote || 'Arrival time: verify ticket.'}`;
    return { time: segment.departureTime, title: `${segment.flightNumber} departure · ${segment.origin.code} → ${segment.destination.code}`, type: 'flight', transport: segment.airline, note: `Depart ${segment.origin.name}, Terminal ${segment.origin.terminal}. ${arrival} ${segment.duration ? `Flight time ${segment.duration}.` : ''}`, query: `${segment.origin.name}, Terminal ${segment.origin.terminal}`, confirmed: true };
  }

  function flightArrivalEvent(segment) {
    return { time: segment.arrivalTime || 'Arrival time: verify ticket', title: `${segment.flightNumber} arrival · ${segment.origin.code} → ${segment.destination.code}`, type: 'flight', transport: segment.airline, note: `Arrive ${segment.destination.name}, Terminal ${segment.destination.terminal}.${segment.duration ? ` Flight time ${segment.duration}.` : ''}`, query: `${segment.destination.name}, Terminal ${segment.destination.terminal}`, confirmed: true };
  }

  function flightConnectionEvent(inbound, outbound) {
    return { time: `${inbound.arrivalTime}–${outbound.departureTime}`, title: `${inbound.connectionAfter.airportCode} connection · ${inbound.connectionAfter.duration}`, type: 'flight', transport: 'Connection time', note: `${inbound.flightNumber} arrives at ${inbound.arrivalTime}; ${outbound.flightNumber} departs at ${outbound.departureTime}.`, query: `${trip.flights.find((segment) => segment.origin.code === inbound.connectionAfter.airportCode)?.origin.name || 'Singapore Changi Airport'} Terminal ${outbound.origin.terminal}`, confirmed: true };
  }

  function flightTimelineEvents(date) {
    const events = [];
    for (const journey of trip.flightJourneys) {
      const segments = journey.segmentIds.map((id) => trip.flights.find((segment) => segment.id === id)).filter(Boolean);
      segments.forEach((segment, index) => {
        if (segment.date === date) events.push(flightDepartureEvent(segment));
        if (segment.arrivalDate === date) {
          events.push(flightArrivalEvent(segment));
          const nextSegment = segments[index + 1];
          if (segment.connectionAfter && nextSegment?.date === date) events.push(flightConnectionEvent(segment, nextSegment));
        }
      });
    }
    return events;
  }

  function dayEvents(day, choice = weekendChoice) {
    const flightEvents = flightTimelineEvents(day.date);
    if (day.events === 'flights') return flightEvents;
    if (day.events === 'arrival') return [...flightEvents, ...trip.arrival];
    const events = Array.isArray(day.events) ? [...day.events].map((event) => {
      const flight = event.flightRef && trip.flights.find((segment) => segment.id === event.flightRef);
      return flight ? { ...event, title: `Late-night Uber to ${flight.origin.name} for ${flight.flightNumber} at ${flight.departureTime}` } : event;
    }) : [];
    if (day.schedule && Array.isArray(trip[day.schedule])) events.push(...trip[day.schedule]);
    if (isWorkday(day, choice)) {
      events.unshift({ time: trip.work.hours, title: trip.work.name, type: 'work', transport: 'Walk', query: trip.work.query, note: 'Woodside workday.' });
      if (!Array.isArray(day.events) && !day.schedule) {
        events.push({ time: day.activityTime || 'After work', title: day.kind === 'departure' ? 'Uber to Perth Airport' : 'After-work plan', type: day.kind === 'departure' ? 'travel' : 'activity', note: day.activity, transport: day.transport, query: day.kind === 'departure' ? 'Perth Airport, Western Australia' : day.location ? trip.locations[day.location]?.query : null });
      }
    }
    if (events.length) return [...flightEvents, ...events];
    return [{
      time: day.activityTime || (day.date === '2026-10-16' ? 'Plan-dependent' : 'Today'),
      title: day.title,
      note: day.activity,
      type: day.activityType || (day.kind === 'departure' ? 'travel' : 'activity'),
      transport: day.transport,
      query: day.kind === 'departure' ? 'Perth Airport, Western Australia' : day.location ? trip.locations[day.location]?.query : null
    }];
  }

  function plannedEvents(date, day = dayFor(date), choice = weekendChoice) {
    return dayEvents(day, choice).map((event, index) => ({ ...event, id: `${date}-planned-${index}`, source: 'planned' }));
  }

  const actualPlanStorageKey = 'perth-trip-actual-plans';
  function readActualPlans() {
    try { return JSON.parse(localStorage.getItem(actualPlanStorageKey) || '{}'); } catch { return {}; }
  }

  function saveActualPlan(date, bucket, choice = weekendChoice) {
    const allPlans = readActualPlans();
    allPlans[`${date}|${choice || 'none'}`] = bucket;
    try { localStorage.setItem(actualPlanStorageKey, JSON.stringify(allPlans)); } catch { return false; }
    return true;
  }

  function actualBucket(date, choice = weekendChoice) {
    const plans = readActualPlans();
    const bucket = plans[`${date}|${choice || 'none'}`] || {};
    return { overrides: bucket.overrides || {}, additions: Array.isArray(bucket.additions) ? bucket.additions : [] };
  }

  function effectiveEvents(date, day = dayFor(date), choice = weekendChoice) {
    const bucket = actualBucket(date, choice);
    const baseline = plannedEvents(date, day, choice).flatMap((event) => {
      if (event.confirmed) return [event];
      const override = bucket.overrides[event.id];
      if (override?.skipped) return [];
      return [override ? { ...event, ...override, id: event.id, source: 'actual' } : event];
    });
    return [...baseline, ...bucket.additions.map((event) => ({ ...event, source: 'actual-addition' }))];
  }

  function optionDays(option) {
    return option.dates.map((date) => ({ date, ...dayFor(date, option.id) }));
  }

  function optionDestinations(option) {
    return [...new Set(optionDays(option).map((day) => day.destination).filter(Boolean))].join(' · ');
  }

  function getTodaySummary() {
    const day = dayFor(currentDate());
    if (!day) return;
    const context = briefingContext();
    $('#today-title').textContent = context.title;
    const workday = isWorkday(day);
    const onLeave = day.date === '2026-10-16' && ['option2', 'option3'].includes(weekendChoice);
    const nextEvent = effectiveEvents(day.date, day).find((event) => !event.completed) || { time: 'Flexible', title: 'No activity planned', type: 'free', transport: 'At your discretion' };
    const next = nextEvent.title;
    const transport = nextEvent.transport || day.transport;
    const nextType = nextEvent.type || 'activity';
    const flightDay = day.kind === 'flight';
    const hotel = day.date < '2026-10-16' ? trip.hotels[0] : trip.hotels[1];
    const hotelBrief = flightDay
      ? `<strong>In transit</strong><span>${esc(day.title)}</span><span>Flight times are local to each airport.</span>`
      : day.date === '2026-10-16'
      ? `<strong>Hotel change day</strong><span>${esc(trip.hotels[0].name)} → ${esc(trip.hotels[1].name)}</span><span>${esc(trip.hotels[0].address)} → ${esc(trip.hotels[1].address)}</span><div class="action-links">${mapsLink(trip.hotels[0].query, 'Navigate to Parmelia')}${mapsLink(trip.hotels[1].query, 'Navigate to DoubleTree')}</div>`
      : `<strong>${esc(hotel.name)}</strong><span>${esc(hotel.address)}</span>${mapsLink(hotel.query, 'Navigate to hotel')}`;
    const firstOutbound = trip.flights.find((segment) => segment.id === 'SQ511');
    const perthArrivalFlight = trip.flights.find((segment) => segment.id === 'SQ223');
    const perthReturnFlight = trip.flights.find((segment) => segment.id === 'SQ216');
    const finalConnection = trip.flights.find((segment) => segment.id === 'SQ508');
    const reminder = day.date === '2026-10-10'
      ? `Check ${firstOutbound.flightNumber} flight status and departure preparation at ${firstOutbound.origin.code} Terminal ${firstOutbound.origin.terminal}. It arrives SIN Terminal ${firstOutbound.destination.terminal} at ${firstOutbound.arrivalTime}; ${firstOutbound.connectionAfter.duration} connection before ${finalConnection.flightNumber} at ${finalConnection.departureTime}.`
      : day.date === '2026-10-24'
        ? `${perthReturnFlight.flightNumber} arrives SIN Terminal ${perthReturnFlight.destination.terminal} at ${perthReturnFlight.arrivalTime}; ${finalConnection.flightNumber} departs at ${finalConnection.departureTime} and arrives BLR Terminal ${finalConnection.destination.terminal} at ${finalConnection.arrivalTime}. Singapore connection: ${perthReturnFlight.connectionAfter.duration}.`
        : day.date === '2026-10-23'
          ? `${perthReturnFlight.flightNumber} departs ${perthReturnFlight.origin.code} Terminal ${perthReturnFlight.origin.terminal} at ${perthReturnFlight.departureTime} on Saturday 24 October. Keep the late Friday airport-transfer time adjustable.`
      : day.date === '2026-10-16' && ['option2', 'option3'].includes(weekendChoice)
      ? trip.southwest.reminder
      : day.date === '2026-10-16' && !weekendChoice
        ? 'Weekend undecided: choose a plan below to preview Friday’s hotel change.'
        : day.date === '2026-10-16'
          ? 'Finish work at 4:00 PM, then use Uber for the luggage move to DoubleTree.'
        : day.date === '2026-10-14'
          ? 'Check the Transperth journey planner and sunset time closer to the date.'
          : day.date === '2026-10-11'
            ? `${perthArrivalFlight.flightNumber} arrives Perth at ${perthArrivalFlight.arrivalTime} at Terminal ${perthArrivalFlight.destination.terminal}; plan the Uber after baggage and customs.`
            : day.note || 'Schedules and opening hours: verify closer to the trip.';
    const status = flightDay ? 'Flight day' : day.kind === 'arrival' ? 'Arrival day' : day.kind === 'departure' ? 'Final workday' : day.date === '2026-10-16' && !weekendChoice ? 'Weekend choice pending' : onLeave ? 'On leave' : workday ? 'Work · 8:00 AM–4:00 PM' : 'No work planned';
    const location = day.location ? trip.locations[day.location] : null;
    const nextLocation = nextEvent.location ? trip.locations[nextEvent.location] : null;
    const category = nextType.toUpperCase();
    const where = day.destination || location?.name || (day.date === '2026-10-11' ? 'Perth Airport → Perth' : day.base);
    $('#today-content').innerHTML = `<div class="today-primary"><div class="today-date-line"><span>${dateParts(day.date).shortDay} / ${dateParts(day.date).shortDate}</span><span class="preview-pill">${context.badge}</span></div><p class="today-status">${esc(status)}</p><h3>${esc(day.title)}</h3><p class="today-location"><span>WHERE</span><strong>${esc(where)}</strong></p><p class="today-description">${esc(day.activity)}</p><div class="today-next"><span class="next-icon" aria-hidden="true">↗</span><div class="next-details"><span class="eyebrow">NEXT UP</span><div class="next-heading"><span class="event-type event-type-${esc(nextType)}">${esc(category)}</span><time>${esc(nextEvent.time)}</time></div><strong>${esc(next)}</strong><span>${esc(transport)}</span>${nextEvent.query ? mapsLink(nextEvent.query, 'Navigate to next stop') : nextLocation ? mapsLink(nextLocation.query, `Navigate to ${nextLocation.name}`) : ''}</div></div></div><div class="today-side"><div class="brief-row"><span class="eyebrow">HOTEL</span>${hotelBrief}</div>${workday && !onLeave ? `<div class="brief-row"><span class="eyebrow">WORK / 8:00 AM–4:00 PM</span><strong>${esc(trip.work.name)}</strong><span>${esc(trip.work.address)}</span>${mapsLink(trip.work.query, 'Navigate to Woodside')}</div>` : ''}<div class="brief-row"><span class="eyebrow">TRANSPORT</span><strong>${esc(transport)}</strong>${location ? mapsLink(location.query, `Navigate to ${location.name}`) : ''}</div><div class="brief-reminder"><span class="eyebrow">REMINDER</span><p>${esc(reminder)}</p></div></div>`;
  }

  function renderDay(day) {
    const parts = dateParts(day.date);
    const location = day.location ? trip.locations[day.location] : null;
    const eventMarkup = dayEvents(day).map((event) => `<div class="timeline-event"><div class="event-time">${esc(event.time)}</div><div class="event-marker" aria-hidden="true"></div><div class="event-content"><div class="event-heading"><span class="event-type event-type-${esc(event.type || 'activity')}">${esc((event.type || 'activity').toUpperCase())}</span>${event.optional ? '<span class="optional-label">OPTIONAL</span>' : ''}<h4>${esc(event.title)}</h4></div>${event.note ? `<p>${esc(event.note)}</p>` : ''}<div class="event-meta">${event.transport ? `<span>${esc(event.transport)}</span>` : ''}${event.query ? mapsLink(event.query, 'Map') : event.location === 'work' ? mapsLink(trip.work.query, 'Map') : event.location ? mapsLink(trip.locations[event.location].query, 'Map') : ''}</div></div></div>`).join('');
    const stopMarkup = day.stops ? `<div class="stop-strip">${day.stops.map((stop) => {
      const place = Object.values(trip.locations).find((entry) => stop.toLowerCase().includes(entry.name.toLowerCase())) || (stop.includes(trip.work.name) ? trip.work : null);
      return `<span class="stop-item">${mapsLink(place?.query || stop, stop, 'stop-link')}${place?.address ? `<small>${esc(place.address)}</small>` : ''}${place?.url ? officialLink(place.url) : ''}</span>`;
    }).join('')}</div>` : '';
    const links = [...(day.links || [])].map((key) => key === 'transperth' ? officialLink(trip.official.transperth, 'Transperth journey planner') : key === 'airport' ? officialLink(trip.official.airport, 'Perth Airport') : '').join('');
    const dinnerLinks = day.events === 'arrival' ? `<div class="restaurant-shortlist"><span class="eyebrow">DINNER SHORTLIST / ELIZABETH QUAY</span><div>${trip.restaurants.map((restaurant) => `${mapsLink(restaurant.query, restaurant.name, 'stop-link')}${restaurant.url ? officialLink(restaurant.url, 'Official site') : ''}`).join('')}</div></div>` : '';
    const branchLabel = day.date === '2026-10-16' ? weekendChoice === 'option1' ? 'NO LEAVE · WORK 8–4' : ['option2', 'option3'].includes(weekendChoice) ? 'FRIDAY LEAVE · SOUTHWEST' : 'SELECT PLAN · FRIDAY CHANGES' : '';
    return `<article class="day-card ${branchLabel ? 'is-branch-day' : ''}" data-date="${day.date}"><div class="day-card-date"><span>${parts.shortDay}</span><strong>${parts.shortDate}</strong><span class="day-tag">${esc(day.tag)}</span></div><div class="day-card-main"><div class="day-card-head"><div><h3>${esc(day.title)}</h3><p class="day-base">BASE / ${esc(day.base)}</p></div><span class="day-transport">${esc(day.transport)}</span></div>${branchLabel ? `<span class="branch-badge">${esc(branchLabel)}</span>` : ''}<div class="event-list">${eventMarkup}</div>${stopMarkup}${dinnerLinks}<div class="day-card-foot">${location ? `<span class="address-line">${esc(location.address)}</span>${actionLinks(location, day.transport)}` : ''}${links ? `<div class="action-links">${links}</div>` : ''}${day.note ? `<p class="day-note">${esc(day.note)}</p>` : ''}</div></div></article>`;
  }

  function filterDays() {
    let days = trip.days.map((day) => ({ ...dayFor(day.date) }));
    if (activeFilter === 'workdays') days = days.filter((day) => ['work-evening', 'departure'].includes(day.kind) || (day.date === '2026-10-16' && weekendChoice === 'option1'));
    if (activeFilter === 'evenings') days = days.filter((day) => ['work-evening', 'arrival', 'transition'].includes(day.kind));
    if (activeFilter === 'weekend') days = days.filter((day) => ['2026-10-10', '2026-10-17', '2026-10-18', '2026-10-24'].includes(day.date));
    if (activeFilter.startsWith('option')) days = days.filter((day) => ['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'].includes(day.date));
    $('#timeline').innerHTML = days.length ? days.map(renderDay).join('') : '<p class="empty-state">No days match this filter.</p>';
  }

  function renderOptions() {
    $('#option-selector').innerHTML = trip.options.map((option) => `<article class="option-card ${weekendChoice === option.id ? 'is-current' : ''}"><div class="option-topline"><span>${option.number} / WEEKEND PLAN</span><span class="leave-pill">${esc(option.leave)}</span></div><h3>${esc(option.title)}</h3><p class="option-subtitle">${esc(option.subtitle)}</p><div class="option-facts"><div><span>KEY DESTINATIONS</span><strong>${esc(optionDestinations(option))}</strong></div><div><span>EFFORT</span><strong>${esc(option.effort)}</strong></div><div><span>MAIN HIGHLIGHT</span><p>${esc(option.highlight)}</p></div><div><span>DEPENDENCY</span><p>${esc(option.dependency)}</p></div></div><button class="option-button" type="button" data-option="${option.id}" aria-pressed="${weekendChoice === option.id}">${weekendChoice === option.id ? 'Previewing this plan' : 'Preview this plan'} <span aria-hidden="true">→</span></button></article>`).join('');
    const detail = $('#option-detail');
    if (!weekendChoice) {
      detail.innerHTML = '<div class="option-empty"><span class="eyebrow">NO PLAN PREVIEWED</span><p>Choose any option above to see the day-by-day version. Your choice is only held until you close or refresh this page.</p></div>';
      $('#weekend-day-detail').innerHTML = '';
      return;
    }
    const option = trip.options.find((entry) => entry.id === weekendChoice);
    const showReminder = weekendChoice !== 'option1';
    const schedule = optionDays(option);
    detail.innerHTML = `<div class="option-plan-head"><div><p class="eyebrow">PREVIEW / ${option.number}</p><h3>${esc(option.title)}</h3></div><button class="clear-choice" type="button" id="clear-choice">Clear preview</button></div><div class="option-plan-days">${schedule.map((day) => `<article><span class="eyebrow">${dateParts(day.date).shortDay} ${dateParts(day.date).shortDate}</span><h4>${esc(day.title)}</h4><p>${esc(day.activity)}</p></article>`).join('')}</div>${showReminder ? `<div class="luggage-alert"><span aria-hidden="true">!</span><strong>${esc(trip.southwest.reminder)}</strong></div>` : ''}${weekendChoice === 'option2' ? '<div class="option-detail-note">Monday 19 October: work normally.</div>' : weekendChoice === 'option3' ? '<div class="option-detail-note">Monday 19 October: work normally. Swan Valley tour: select an operator later; no tour is preselected.</div>' : ''}`;
    renderWeekendDays();
  }

  function miniTimeline(items) {
    return `<div class="mini-timeline">${items.map((item) => `<div class="mini-event"><span>${esc(item.time)}</span><div><strong>${esc(item.title)}</strong><p>${esc(item.transport || '')}${item.note ? ` · ${esc(item.note)}` : ''}</p>${item.query ? mapsLink(item.query, 'Map') : item.location ? mapsLink(trip.locations[item.location].query, 'Map') : ''}</div></div>`).join('')}</div>`;
  }

  function renderWeekendDays() {
    const root = $('#weekend-day-detail');
    if (weekendChoice === 'option1') {
      root.innerHTML = `<div class="weekend-plan-grid">${renderRottnestCard('SAT 17 OCT / OPTION 1')}<article class="plan-detail-card"><p class="eyebrow">SUN 18 OCT / OPTION 1</p><h3>Fremantle Sunday</h3><p>Markets are generally Friday–Sunday; confirm current opening details before you go.</p><p class="address-line">${esc(trip.locations.fremantle.address)}</p>${miniTimeline(trip.fremantlePlan)}<div class="action-links">${officialLink(trip.locations.fremantle.url, 'Fremantle Markets')}${officialLink(trip.official.transperth, 'Transperth journey planner')}${mapsLink(trip.locations.fremantle.query, 'Navigate to Fremantle Markets')}</div></article></div>`;
    } else if (weekendChoice === 'option2') {
      root.innerHTML = `<div class="weekend-plan-grid">${renderRottnestCard('SUN 18 OCT / OPTION 2')}<article class="plan-detail-card"><p class="eyebrow">FRI 16 + SAT 17 OCT</p><h3>Southwest tour</h3><p>${esc(trip.southwest.recommended.tour)} · two days, overnight. Verify pickup, schedule, inclusions and 2026/27 price with the operator.</p>${officialLink(trip.southwest.recommended.url, 'Australian Pinnacle Tours')}</article></div>`;
    } else {
      root.innerHTML = `<div class="weekend-plan-grid"><article class="plan-detail-card"><p class="eyebrow">FRI 16 + SAT 17 OCT</p><h3>Southwest tour</h3><p>${esc(trip.southwest.recommended.tour)} · two days, overnight. Verify pickup, schedule, inclusions and 2026/27 price with the operator.</p>${officialLink(trip.southwest.recommended.url, 'Australian Pinnacle Tours')}</article><article class="plan-detail-card swan-placeholder"><p class="eyebrow">SUN 18 OCT / OPTION 3</p><h3>Swan Valley day trip</h3><p>Tour not selected yet. Prioritize food, scenery, local produce and chocolate/coffee; keep wine optional and the pace relaxed.</p><p class="address-line">${esc(trip.locations.swan.address)}</p><div class="tour-placeholder"><span class="eyebrow">SELECT A TOUR LATER</span><span>Operator / tour name</span><span>Pickup time · inclusions · price</span></div>${officialLink(trip.locations.swan.url, 'Swan Valley official visitor site')}${mapsLink(trip.locations.swan.query, 'Navigate to Swan Valley')}</article></div>`;
    }
  }

  function renderRottnestCard(dateLabel) {
    const jetty = trip.locations.jetty;
    const island = trip.locations.rottnest;
    return `<article class="plan-detail-card"><p class="eyebrow">${esc(dateLabel)}</p><h3>Rottnest Island</h3><p>Quokkas, beaches, walking or cycling. No car needed.</p><p class="address-line">Barrack Street Jetty: ${esc(jetty.address)}<br>Rottnest Island: ${esc(island.address)}</p>${miniTimeline(trip.rottnestPlan)}<div class="action-links">${officialLink(island.url, 'Rottnest official site')}${officialLink(trip.official.ferry, 'Ferry operator')}${mapsLink(jetty.query, 'Barrack Street Jetty map')}${mapsLink(island.query, 'Navigate to Rottnest')}</div></article>`;
  }

  function renderTours() {
    const tours = trip.southwest;
    $('#tour-comparison').innerHTML = `<div class="tour-heading"><p class="eyebrow">SOUTHWEST / NATURE FIRST</p><h3>Two tours worth comparing.</h3><p>Prices supplied as indicative 2026/27 references, not live quotes. Verify directly before booking.</p></div><article class="tour-card recommended"><div class="tour-label">RECOMMENDED / BEST VALUE</div><h4>${esc(tours.recommended.name)}</h4><p class="tour-price">${esc(tours.recommended.price)}</p><p class="tour-name">${esc(tours.recommended.tour)}</p><p>${esc(tours.recommended.why)}</p><p class="tour-note">${esc(tours.recommended.nameNote)}</p>${officialLink(tours.recommended.url, tours.recommended.linkLabel)}</article><article class="tour-card"><div class="tour-label">ALTERNATIVE / SIGHTSEEING-LED</div><h4>${esc(tours.alternative.name)}</h4><p class="tour-price">${esc(tours.alternative.price)}</p><p>${esc(tours.alternative.why)}</p>${officialLink(tours.alternative.url, tours.alternative.linkLabel)}</article>`;
  }

  function renderChecklistGroup(group) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(`perth-trip-checklist-${group.id}`) || '{}'); } catch { saved = {}; }
    return `<section class="checklist-panel"><div class="panel-heading"><div><p class="eyebrow">TRIP PHASE</p><h3>${esc(group.title)}</h3></div><span class="check-count" data-count="${group.id}"></span></div><div class="checklist">${group.items.map((item, index) => `<label class="check-item"><input type="checkbox" data-checklist="${group.id}" data-index="${index}" ${saved[index] ? 'checked' : ''}><span class="custom-check" aria-hidden="true"></span><span>${esc(item)}</span></label>`).join('')}</div></section>`;
  }

  function renderChecklists() {
    $('#checklists').innerHTML = trip.checklists.map(renderChecklistGroup).join('');
    updateCheckCounts();
  }

  function updateCheckCounts() {
    $$('[data-count]').forEach((count) => {
      const boxes = $$(`[data-checklist="${count.dataset.count}"]`);
      count.textContent = `${boxes.filter((box) => box.checked).length}/${boxes.length}`;
    });
  }

  function renderBudget() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('perth-trip-budget') || '{}'); } catch { saved = {}; }
    const rows = trip.budgetCategories.map((category, index) => {
      const item = saved[category.name] || {};
      const estimated = Number(item.estimated || 0);
      const actual = item.actual === '' || item.actual == null ? null : Number(item.actual);
      const difference = actual == null ? '—' : `${actual - estimated < 0 ? '−' : actual - estimated > 0 ? '+' : ''}A$${Math.abs(actual - estimated).toFixed(2)}`;
      const status = actual == null ? category.status : 'Confirmed';
      const statusClass = status === 'Confirmed' ? 'confirmed' : status === 'Indicative' ? 'indicative' : 'confirm';
      return `<tr><th scope="row"><span class="budget-category">${esc(category.name)}</span><span class="budget-status status-${statusClass}" data-budget-status data-default-status="${esc(category.status)}">${esc(status)}</span></th><td><label class="sr-only" for="estimated-${index}">Estimated ${esc(category.name)} cost in AUD</label><span class="currency-input"><span>A$</span><input id="estimated-${index}" type="number" min="0" step="0.01" inputmode="decimal" data-budget="${esc(category.name)}" data-field="estimated" value="${estimated || ''}" placeholder="—"></span></td><td><label class="sr-only" for="actual-${index}">Actual ${esc(category.name)} cost in AUD</label><span class="currency-input"><span>A$</span><input id="actual-${index}" type="number" min="0" step="0.01" inputmode="decimal" data-budget="${esc(category.name)}" data-field="actual" value="${actual ?? ''}" placeholder="—"></span></td><td class="difference-cell" data-difference="${esc(category.name)}">${difference}</td></tr>`;
    }).join('');
    $('#budget-table').innerHTML = `<div class="table-scroll"><table><thead><tr><th>Category</th><th>Estimated</th><th>Actual</th><th>Difference</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function setFilter(filter) {
    activeFilter = filter;
    if (filter.startsWith('option')) weekendChoice = filter;
    $$('.filter-button').forEach((button) => {
      const active = button.dataset.filter === filter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    renderOptions();
    renderTodaySummary();
    renderSelectedDay();
    filterDays();
  }

  function renderTodaySummary() { getTodaySummary(); }

  renderTripEssentials();
  renderFlights();
  renderOptions();
  renderTours();
  renderChecklists();
  renderBudget();
  renderTodaySummary();
  renderSelectedDay();
  filterDays();

  $('#today-date').addEventListener('change', () => { renderTodaySummary(); renderSelectedDay(); });
  $('.filter-wrap').addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (button) setFilter(button.dataset.filter);
  });
  $('#option-selector').addEventListener('click', (event) => {
    const button = event.target.closest('[data-option]');
    if (!button) return;
    weekendChoice = button.dataset.option;
    activeFilter = 'all';
    $$('.filter-button').forEach((item) => { item.classList.toggle('is-active', item.dataset.filter === 'all'); item.setAttribute('aria-pressed', String(item.dataset.filter === 'all')); });
    renderOptions();
    renderTodaySummary();
    renderSelectedDay();
    filterDays();
  });
  $('#option-detail').addEventListener('click', (event) => {
    if (event.target.closest('#clear-choice')) {
      weekendChoice = null;
      activeFilter = 'all';
      $$('.filter-button').forEach((item) => { item.classList.toggle('is-active', item.dataset.filter === 'all'); item.setAttribute('aria-pressed', String(item.dataset.filter === 'all')); });
      renderOptions();
      renderTodaySummary();
      renderSelectedDay();
      filterDays();
    }
  });
  $('#today-events').addEventListener('click', (event) => {
    const button = event.target.closest('[data-plan-action]');
    if (button) renderEventActions(button.dataset.planAction, button.dataset.eventId, button.dataset.source);
  });
  $('#change-tonight').addEventListener('click', () => openPlanEditor('addition', { title: '', time: '', type: 'activity', note: '' }));
  $('#restore-planned').addEventListener('click', restorePlannedDay);
  $('.quick-plan-actions').addEventListener('click', (event) => {
    const addButton = event.target.closest('[data-add-event]');
    if (addButton) addPlanPreset(addButton.dataset.addEvent);
    if (event.target.closest('[data-edit-dinner]')) replacePlannedDinner();
  });
  const closePlanEditor = () => $('#plan-editor').close();
  $('#cancel-plan').addEventListener('click', closePlanEditor);
  $('#cancel-plan-bottom').addEventListener('click', closePlanEditor);
  $('#plan-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const title = $('#plan-title').value.trim();
    const start = $('#plan-start').value.trim();
    const end = $('#plan-end').value.trim();
    if (!title || !start) return;
    const actual = { title, time: end ? `${start}–${end}` : start, type: $('#plan-type').value, note: $('#plan-notes').value.trim(), completed: false, skipped: false };
    const mode = $('#plan-form').dataset.mode;
    const eventId = $('#plan-event-id').value;
    const bucket = actualBucket(currentDate());
    if (mode === 'addition') {
      const id = eventId || `actual-${Date.now()}`;
      const added = { ...actual, id };
      const index = bucket.additions.findIndex((item) => item.id === id);
      if (index < 0) bucket.additions.push(added);
      else bucket.additions[index] = added;
    } else {
      bucket.overrides[eventId] = { ...(bucket.overrides[eventId] || {}), ...actual };
    }
    saveActualPlan(currentDate(), bucket);
    closePlanEditor();
    renderActualPlan();
  });
  $('#flight-journeys').addEventListener('change', (event) => {
    const box = event.target.closest('[data-flight-reminder]');
    if (!box) return;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('perth-trip-flight-reminders') || '{}'); } catch { saved = {}; }
    saved[box.dataset.flightReminder] ||= {};
    saved[box.dataset.flightReminder][box.dataset.reminderIndex] = box.checked;
    try { localStorage.setItem('perth-trip-flight-reminders', JSON.stringify(saved)); } catch { return; }
  });
  $('#checklists').addEventListener('change', (event) => {
    const box = event.target.closest('[data-checklist]');
    if (!box) return;
    const key = `perth-trip-checklist-${box.dataset.checklist}`;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch { saved = {}; }
    saved[box.dataset.index] = box.checked;
    localStorage.setItem(key, JSON.stringify(saved));
    updateCheckCounts();
  });
  $('#budget-table').addEventListener('input', (event) => {
    const input = event.target.closest('[data-budget]');
    if (!input) return;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('perth-trip-budget') || '{}'); } catch { saved = {}; }
    const item = saved[input.dataset.budget] || {};
    item[input.dataset.field] = input.value;
    saved[input.dataset.budget] = item;
    localStorage.setItem('perth-trip-budget', JSON.stringify(saved));
    const row = input.closest('tr');
    const estimated = Number(row.querySelector('[data-field="estimated"]').value || 0);
    const actualValue = row.querySelector('[data-field="actual"]').value;
    const actual = actualValue === '' ? null : Number(actualValue);
    const difference = actual == null ? '—' : `${actual - estimated < 0 ? '−' : actual - estimated > 0 ? '+' : ''}A$${Math.abs(actual - estimated).toFixed(2)}`;
    row.querySelector('.difference-cell').textContent = difference;
    const status = row.querySelector('[data-budget-status]');
    const nextStatus = actual == null ? status.dataset.defaultStatus : 'Confirmed';
    status.textContent = nextStatus;
    status.className = `budget-status status-${nextStatus === 'Confirmed' ? 'confirmed' : nextStatus === 'Indicative' ? 'indicative' : 'confirm'}`;
  });
  const offlineStatus = $('#offline-status');
  if ('serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(() => navigator.serviceWorker.ready)
      .then(() => { offlineStatus.textContent = 'Available offline on this device'; })
      .catch(() => { offlineStatus.textContent = 'Offline setup unavailable; retry online'; });
  } else {
    offlineStatus.textContent = 'Offline setup requires HTTPS or localhost';
  }
})();