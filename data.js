const plannedDinner = { time: '7:00–8:30 PM', title: 'Dinner', type: 'food', transport: 'Choose on the day', optional: true, note: 'Planned restaurant: optional. Street food, another restaurant, or a spontaneous plan all work.' };
const flexibleEvening = { time: '8:30 PM onwards', title: 'Flexible evening / return to hotel', type: 'free', transport: 'Walk / Uber as preferred', optional: true };
const southwestFridayEvents = [
  { time: '~6:30 AM', title: 'Check out of Parmelia Hilton', type: 'hotel', transport: 'At hotel' },
  { time: 'After check-out', title: 'Uber main luggage to DoubleTree and request storage before check-in', type: 'travel', transport: 'Uber', note: 'Confirm the hotel can hold the main suitcase before you leave it.' },
  { time: 'Before tour pickup', title: 'Leave the main suitcase; take only an overnight bag', type: 'hotel', transport: 'DoubleTree luggage hold' },
  { time: 'Tour day 1', title: 'Southwest tour begins', type: 'activity', transport: 'Organized tour', note: 'Pickup time and location: verify with the operator.' }
];
const southwestSecondDayEvents = [
  { time: 'Tour day 2', title: 'Continue the Southwest itinerary', type: 'activity', transport: 'Organized tour', note: 'Return to Perth in the evening; confirm the current schedule.' },
  { time: 'After tour return', title: 'Dinner or free time', type: 'food', transport: 'Flexible', note: 'Meal inclusion and return time: verify with the operator.' },
  flexibleEvening
];
const mallShopping = (name, location) => ({ time: '4:30–5:45 PM (optional)', title: `Optional shopping — ${name}`, type: 'shopping', transport: 'Walking', optional: true, note: `${name === 'Hay Street Mall' ? 'Open-air mall between Barrack and William Streets with department, specialty and food options.' : name === 'Murray Street Mall' ? 'Mall between Barrack and William Streets; retailer examples include Myer, David Jones, Zara and Uniqlo.' : 'Choose either central mall for a short browse.'} Allow 60–90 minutes; current store mix and hours: verify. Skip if you would rather rest or explore elsewhere.`, location });
const southwestPreparation = {
  title: 'Southwest preparation',
  activity: 'Pack a small overnight bag, confirm tour pickup and DoubleTree luggage storage, then have an early dinner and night.',
  transport: 'Walk',
  destination: 'Perth',
  checklist: true,
  events: [{ time: '4:30–5:30 PM', title: 'Pack an overnight bag; confirm tour pickup and DoubleTree luggage storage', type: 'hotel', transport: 'At hotel' }, { time: '5:30–7:00 PM', title: 'Flexible tour preparation / downtime', type: 'free', transport: 'At hotel' }, plannedDinner, { ...flexibleEvening, title: 'Early night before the tour' }]
};
const southwestDayOne = {
  title: 'Southwest tour, day one',
  activity: 'Leave the main suitcase at DoubleTree after confirming luggage storage; take a small overnight bag on tour.',
  transport: 'Uber · organized tour',
  destination: 'Southwest',
  events: southwestFridayEvents
};
const southwestDayTwo = {
  title: 'Southwest tour, day two',
  activity: 'Continue the two-day Margaret River tour; return to Perth in the evening.',
  transport: 'Organized tour',
  destination: 'Southwest',
  events: southwestSecondDayEvents
};

window.TRIP = {
  trip: { start: '2026-10-10', end: '2026-10-24', timezone: 'Australia/Perth' },
  flightJourneys: [
    { id: 'outbound', direction: 'OUTBOUND', dateLabel: '10–11 Oct 2026', cabin: 'Business Class (Z)', layover: { airportCode: 'SIN', duration: '3 hours 20 minutes' }, totalDuration: '13 hours 05 minutes', segmentIds: ['SQ511', 'SQ223'] },
    { id: 'return', direction: 'RETURN', dateLabel: '24 Oct 2026', cabin: 'Business Class (Z)', layover: { airportCode: 'SIN', duration: '2 hours 05 minutes' }, totalDuration: '11 hours 45 minutes', segmentIds: ['SQ216', 'SQ508'] }
  ],
  flights: [
    { id: 'SQ511', flightNumber: 'SQ511', date: '2026-10-10', arrivalDate: '2026-10-11', direction: 'outbound', airline: 'Singapore Airlines', origin: { code: 'BLR', name: 'Bengaluru Kempegowda International Airport', terminal: '2' }, departureTime: '23:05', destination: { code: 'SIN', name: 'Singapore Changi Airport', terminal: '3' }, arrivalTime: '06:10', duration: '4 hours 35 minutes', cabin: 'Business Class (Z)', aircraft: 'Airbus A350-900 Medium Haul', connectionAfter: { airportCode: 'SIN', duration: '3 hours 20 minutes' } },
    { id: 'SQ223', flightNumber: 'SQ223', date: '2026-10-11', arrivalDate: '2026-10-11', direction: 'outbound', airline: 'Singapore Airlines', origin: { code: 'SIN', name: 'Singapore Changi Airport', terminal: '3' }, departureTime: '09:30', destination: { code: 'PER', name: 'Perth Airport', terminal: '1' }, arrivalTime: '14:40', cabin: 'Business Class (Z)', aircraft: 'Airbus A350-900 Medium Haul' },
    { id: 'SQ216', flightNumber: 'SQ216', date: '2026-10-24', arrivalDate: '2026-10-24', direction: 'return', airline: 'Singapore Airlines', origin: { code: 'PER', name: 'Perth Airport', terminal: '1' }, departureTime: '01:10', destination: { code: 'SIN', name: 'Singapore Changi Airport', terminal: '3' }, arrivalTime: '06:35', cabin: 'Business Class (Z)', aircraft: 'Boeing 787-10', connectionAfter: { airportCode: 'SIN', duration: '2 hours 05 minutes' } },
    { id: 'SQ508', flightNumber: 'SQ508', date: '2026-10-24', arrivalDate: '2026-10-24', direction: 'return', airline: 'Singapore Airlines', origin: { code: 'SIN', name: 'Singapore Changi Airport', terminal: '3' }, departureTime: '08:40', destination: { code: 'BLR', name: 'Bengaluru Kempegowda International Airport', terminal: '2' }, arrivalTime: '10:25', cabin: 'Business Class (Z)', aircraft: 'Airbus A350-900 Medium Haul' }
  ],
  flightReminders: [
    { journeyId: 'outbound', items: ['Check flight status', 'Airport transfer / departure preparation', 'BLR Terminal 2', 'Singapore connection', 'Perth Terminal 1'] },
    { journeyId: 'return', items: ['Final luggage check', 'Airport transfer', 'Perth Terminal 1', 'Singapore connection', 'BLR Terminal 2'] }
  ],
  hotels: [
    { name: 'Parmelia Hilton Perth', address: '14 Mill Street, Perth WA 6000', dates: 'Sun 11 – Fri 16 Oct', checkin: 'Check-in and check-out times: verify directly with hotel', url: 'https://www.hilton.com/en/hotels/perphhi-parmelia-hilton-perth/', role: 'Arrival base · Week one', query: 'Parmelia Hilton Perth, 14 Mill Street, Perth WA 6000' },
    { name: 'DoubleTree by Hilton Perth Waterfront', address: '1 Barrack Square, Perth WA 6000', dates: 'Fri 16 – Fri 23 Oct', checkin: 'Check-in and check-out times: verify directly with hotel', url: 'https://www.hilton.com/en/hotels/perwtdi-doubletree-perth-waterfront/', role: 'Elizabeth Quay · Week two', query: 'DoubleTree by Hilton Perth Waterfront, 1 Barrack Square, Perth WA 6000' }
  ],
  work: { name: 'Woodside Perth Office', address: '11 Mount Street, Perth WA 6000', hours: '8:00 AM–4:00 PM, Monday–Friday', query: 'Woodside Perth Office, 11 Mount Street, Perth WA 6000' },
  restaurants: [
    { name: 'Argyle Bar & Restaurant', query: 'Argyle Bar & Restaurant Elizabeth Quay Perth' },
    { name: 'Six Senses The Quay', query: 'Six Senses The Quay Elizabeth Quay Perth' },
    { name: 'The Island at Elizabeth Quay', query: 'The Island Elizabeth Quay Perth' },
    { name: '6HEAD Perth', query: '6HEAD Perth Elizabeth Quay' },
    { name: 'The Lucky Shag', query: 'The Lucky Shag Perth Elizabeth Quay' }
  ],
  locations: {
    elizabeth: { name: 'Elizabeth Quay', address: 'The Esplanade, Perth WA 6000', url: 'https://www.mra.wa.gov.au/projects-and-places/elizabeth-quay', query: 'Elizabeth Quay, Perth WA' },
    kingsPark: { name: 'Kings Park & Botanic Garden', address: 'Fraser Avenue, Perth WA 6005', url: 'https://www.bgpa.wa.gov.au/kings-park', query: 'Kings Park and Botanic Garden, Perth WA' },
    brookfield: { name: 'Brookfield Place', address: '125 St Georges Terrace, Perth WA 6000', url: 'https://brookfieldplaceperth.com/', query: 'Brookfield Place, Perth WA' },
    cottesloe: { name: 'Cottesloe Beach', address: 'Marine Parade, Cottesloe WA 6011', url: 'https://www.cottesloe.wa.gov.au/', query: 'Cottesloe Beach, WA' },
    supreme: { name: 'Supreme Court Gardens', address: 'Riverside Drive, Perth WA 6000', url: 'https://perth.wa.gov.au/community/parks-and-reserves', query: 'Supreme Court Gardens, Perth WA' },
    northbridge: { name: 'Northbridge', address: 'Northbridge WA 6003', url: 'https://perth.wa.gov.au/community/neighbourhoods', query: 'Northbridge Perth WA' },
    hayMall: { name: 'Hay Street Mall', address: 'Hay Street between Barrack and William Streets, Perth WA 6000', query: 'Hay Street Mall, Perth WA' },
    murrayMall: { name: 'Murray Street Mall', address: 'Murray Street between Barrack and William Streets, Perth WA 6000', query: 'Murray Street Mall, Perth WA' },
    forrestPlace: { name: 'Forrest Place', address: 'Forrest Place, Perth WA 6000', query: 'Forrest Place, Perth WA' },
    fremantle: { name: 'Fremantle Markets', address: 'Henderson Street, Fremantle WA 6160', url: 'https://fremantlemarkets.com.au/', query: 'Fremantle Markets, Fremantle WA' },
    swan: { name: 'Swan Valley', address: 'Swan Valley, Western Australia', url: 'https://www.swanvalley.com.au/', query: 'Swan Valley Western Australia' },
    jetty: { name: 'Barrack Street Jetty', address: 'The Esplanade, Perth WA 6000', query: 'Barrack Street Jetty, Perth WA' },
    rottnest: { name: 'Rottnest Island', address: 'Rottnest Island, WA 6161', url: 'https://www.rottnestisland.com/', query: 'Rottnest Island, Western Australia' }
  },
  official: { transperth: 'https://www.transperth.wa.gov.au/', ferry: 'https://www.rottnestexpress.com.au/', airport: 'https://www.perthairport.com.au/' },
  arrival: [
    { time: '14:40–16:00', title: 'Immigration, baggage and customs', note: 'SQ223 arrives at Perth Airport Terminal 1 at 14:40.', transport: 'On foot', type: 'travel' },
    { time: '~16:00', title: 'Uber to Parmelia Hilton', note: 'Use the signed rideshare pickup area. No self-drive.', transport: 'Uber', type: 'travel', query: 'Parmelia Hilton Perth, 14 Mill Street, Perth WA 6000' },
    { time: '~16:30–17:00', title: 'Hotel check-in', note: 'Check-in timing: verify directly with hotel.', transport: 'On foot', type: 'hotel' },
    { time: '17:00–18:15', title: 'Rest and freshen up', note: 'Keep the first evening deliberately easy.', transport: 'At the hotel', type: 'hotel' },
    { time: '18:15', title: 'Walk toward Elizabeth Quay', note: 'A gentle first look at central Perth.', transport: 'Walk', type: 'travel', query: 'Elizabeth Quay, Perth WA' },
    { time: '18:30–19:45', title: 'Elizabeth Quay + Swan River waterfront', note: 'Promenade, river views and public spaces.', transport: 'Walk', type: 'activity', location: 'elizabeth' },
    { time: '7:45–8:45 PM', title: 'Dinner around the quay', note: 'Arrival-night timing remains as originally planned; planned restaurant is optional. Verify current opening hours.', transport: 'Walk', type: 'food' },
    { time: '~20:30–21:00', title: 'Walk back to the hotel', note: 'Aim for an early night.', transport: 'Walk', type: 'travel', query: 'Parmelia Hilton Perth, 14 Mill Street, Perth WA 6000' }
  ],
  days: [
    { date: '2026-10-10', kind: 'flight', base: 'In transit', title: 'Outbound · Bengaluru → Singapore', tag: 'FLIGHT', activity: 'Depart Bengaluru on SQ511; connect in Singapore for SQ223 to Perth.', transport: 'Singapore Airlines', destination: 'BLR → SIN → PER', events: 'flights' },
    { date: '2026-10-11', kind: 'arrival', base: 'Parmelia Hilton', title: 'Arrival + the river', tag: 'ARRIVAL', activity: 'Arrive Perth at 14:40, transfer to Parmelia Hilton, rest, then an easy waterfront evening.', transport: 'Uber · walk', destination: 'Perth', events: 'arrival' },
    { date: '2026-10-12', kind: 'work-evening', base: 'Parmelia Hilton', title: 'Kings Park + Perth skyline', tag: 'WORK / EVENING', activityTime: '4:15 PM', activity: 'Leave Woodside at 4:15 PM; explore Kings Park 4:30–6:30, then dinner and a flexible return.', transport: 'Walk or Uber, depending on energy and weather.', destination: 'Kings Park', note: 'Try the Fraser Avenue lookout and a relaxed garden walk. Check sunset time closer to the date.', location: 'kingsPark', events: [{ time: '4:15 PM', title: 'Leave Woodside / head to Kings Park', type: 'travel', transport: 'Walk or Uber' }, { time: '4:30–6:30 PM', title: 'Kings Park gardens and skyline lookout', type: 'activity', transport: 'Walking', optional: true, location: 'kingsPark' }, plannedDinner, flexibleEvening] },
    { date: '2026-10-13', kind: 'work-evening', base: 'Parmelia Hilton', title: 'A CBD walk, one block at a time', tag: 'WORK / EVENING', activityTime: '4:15 PM', activity: 'Walk via Hay Street Mall, Brookfield Place and Elizabeth Quay; shopping is optional.', transport: 'Walking', destination: 'Perth CBD', stops: ['Woodside Perth Office', 'St Georges Terrace, Perth WA', 'Brookfield Place, Perth WA', 'Elizabeth Quay, Perth WA'], events: [{ time: '4:15 PM', title: 'Leave Woodside and walk into the CBD', type: 'travel', transport: 'Walking' }, mallShopping('Hay Street Mall', 'hayMall'), { time: '5:45–7:00 PM', title: 'Continue toward Brookfield Place and Elizabeth Quay', type: 'activity', transport: 'Walking', location: 'brookfield' }, plannedDinner, flexibleEvening] },
    { date: '2026-10-14', kind: 'work-evening', base: 'Parmelia Hilton', title: 'Cottesloe at golden hour', tag: 'WORK / EVENING', activityTime: '4:15 PM', activity: 'Train to Cottesloe, beach and sunset time, dinner 7:00–8:30 PM, then return at your pace.', transport: 'Train + walking', destination: 'Cottesloe Beach', note: 'Check Transperth journey planner and sunset time closer to the date.', location: 'cottesloe', links: ['transperth'], events: [{ time: '4:15 PM', title: 'Head to Cottesloe', type: 'travel', transport: 'Train + walking', query: 'Cottesloe Beach train station' }, { time: '5:00–7:00 PM', title: 'Beach and sunset time', type: 'activity', transport: 'Walking', optional: true, location: 'cottesloe' }, { ...plannedDinner, note: 'Planned restaurant: optional. Choose somewhere near the beach or change plans.' }, { ...flexibleEvening, title: 'Flexible return to the hotel' }] },
    { date: '2026-10-15', kind: 'work-evening', base: 'Parmelia Hilton', title: 'Thursday evening', tag: 'WORK / EVENING', activityTime: '4:00 PM', activity: 'Your evening depends on the weekend plan.', transport: 'See weekend choice', destination: 'Perth', variants: { option1: { title: 'A relaxed Perth evening', activity: 'Optional Murray Street Mall browse, then a flexible dinner. Fremantle is saved for Sunday, when the markets are open.', transport: 'Walk / train / Uber', destination: 'Perth', events: [mallShopping('Murray Street Mall', 'murrayMall'), { time: '5:45–7:00 PM', title: 'Free time / return to the hotel', type: 'free', transport: 'Walk' }, plannedDinner, flexibleEvening] }, option2: { ...southwestPreparation, events: [{ time: '4:30–5:30 PM', title: 'Pack an overnight bag; confirm pickup and luggage storage', type: 'hotel', transport: 'At hotel' }, { time: '5:30–7:00 PM', title: 'Flexible tour preparation / downtime', type: 'free', transport: 'At hotel' }, { ...plannedDinner, note: 'Planned restaurant: optional. Keep the evening easy before the early tour.' }, { ...flexibleEvening, title: 'Early night before the tour' }] }, option3: { ...southwestPreparation, events: [{ time: '4:30–5:30 PM', title: 'Pack an overnight bag; confirm pickup and luggage storage', type: 'hotel', transport: 'At hotel' }, { time: '5:30–7:00 PM', title: 'Flexible tour preparation / downtime', type: 'free', transport: 'At hotel' }, { ...plannedDinner, note: 'Planned restaurant: optional. Keep the evening easy before the early tour.' }, { ...flexibleEvening, title: 'Early night before the tour' }] } } },
    { date: '2026-10-16', kind: 'transition', base: 'Parmelia → DoubleTree', title: 'Friday / hotel change', tag: 'HOTEL CHANGE', activity: 'Choose a weekend plan to confirm whether today is a normal workday or Friday leave.', transport: 'Plan-dependent', destination: 'Perth', variants: { option1: { title: 'Work, then change hotels', activity: 'After work, Uber from Parmelia Hilton to DoubleTree with luggage; optional street food or a flexible Perth dinner.', transport: 'Uber · walk', destination: 'Perth', events: [{ time: '4:15 PM', title: 'Uber from Parmelia Hilton to DoubleTree with luggage', type: 'travel', transport: 'Uber', note: 'Uber is recommended for the hotel move.' }, { time: '4:30–9:30 PM (market hours)', title: 'Optional street food — Twilight Food Market, Forrest Place', type: 'food', transport: 'Walk / Uber', optional: true, query: 'Forrest Place, Perth WA', note: 'Friday summer-season market information; verify it is operating on 16 October. Can replace the planned dinner.' }, { ...plannedDinner, note: 'Planned restaurant: optional. The Twilight Food Market is an alternative, not a booking.' }, { ...flexibleEvening, title: 'Flexible evening / return to DoubleTree' }] }, option2: southwestDayOne, option3: southwestDayOne } },
    { date: '2026-10-17', kind: 'weekend', base: 'DoubleTree Waterfront', title: 'Saturday', tag: 'WEEKEND', activity: 'Your Saturday depends on the weekend plan.', transport: 'See weekend choice', destination: 'Perth', variants: { option1: { title: 'Rottnest Island', activity: 'Ferry from Barrack Street Jetty; quokkas, beaches and an unhurried island day.', transport: 'Walk · ferry', destination: 'Rottnest Island', schedule: 'rottnestPlan' }, option2: southwestDayTwo, option3: southwestDayTwo } },
    { date: '2026-10-18', kind: 'weekend', base: 'DoubleTree Waterfront', title: 'Sunday', tag: 'WEEKEND', activity: 'Your Sunday depends on the weekend plan.', transport: 'See weekend choice', destination: 'Perth', variants: { option1: { title: 'Fremantle Sunday', activity: 'Markets, Fremantle town, Cappuccino Strip and the waterfront. Return to Perth in the afternoon/evening.', transport: 'Train · walking', destination: 'Fremantle', schedule: 'fremantlePlan' }, option2: { title: 'Rottnest Island', activity: 'Ferry from Barrack Street Jetty; quokkas, beaches and an unhurried island day.', transport: 'Walk · ferry', destination: 'Rottnest Island', schedule: 'rottnestPlan' }, option3: { title: 'Swan Valley day trip', activity: 'Prefer an organized tour focused on food, local produce, scenery and chocolate/coffee; wine optional. Return late afternoon.', transport: 'Organized tour', destination: 'Swan Valley', activityTime: 'Day trip · verify pickup', events: [{ time: 'Daytime · verify tour schedule', title: 'Optional food-first Swan Valley tour', type: 'activity', transport: 'Organized tour', optional: true, location: 'swan', note: 'Operator, pickup and current availability: verify closer to trip.' }, plannedDinner, flexibleEvening] } } },
    { date: '2026-10-19', kind: 'work-evening', base: 'DoubleTree Waterfront', title: 'Elizabeth Quay + the Swan River', tag: 'WORK / EVENING', activityTime: '4:30 PM', activity: 'Walk the waterfront, then dinner and a flexible return.', transport: 'Walking', destination: 'Elizabeth Quay', location: 'elizabeth', events: [{ time: '4:30–6:30 PM', title: 'Elizabeth Quay and Swan River walk', type: 'activity', transport: 'Walking', optional: true, location: 'elizabeth' }, plannedDinner, flexibleEvening] },
    { date: '2026-10-20', kind: 'work-evening', base: 'DoubleTree Waterfront', title: 'Northbridge after work', tag: 'WORK / EVENING', activityTime: '4:30 PM', activity: 'Food and culture in Northbridge, then dinner and a flexible return.', transport: 'Walk / public transport', destination: 'Northbridge', location: 'northbridge', events: [{ time: '4:30–6:30 PM', title: 'Northbridge food and culture', type: 'activity', transport: 'Walk / public transport', optional: true, location: 'northbridge' }, plannedDinner, flexibleEvening] },
    { date: '2026-10-21', kind: 'work-evening', base: 'DoubleTree Waterfront', title: 'Gardens, river + optional shopping', tag: 'WORK / EVENING', activityTime: '4:30 PM', activity: 'Supreme Court Gardens, optional Murray Street Mall browse, dinner, then flexible return.', transport: 'Walking', destination: 'Perth CBD', location: 'supreme', events: [{ time: '4:30–5:30 PM', title: 'Supreme Court Gardens and river', type: 'activity', transport: 'Walking', optional: true, location: 'supreme' }, { ...mallShopping('Murray Street Mall', 'murrayMall'), time: '5:30–7:00 PM (optional)' }, plannedDinner, flexibleEvening] },
    { date: '2026-10-22', kind: 'work-evening', base: 'DoubleTree Waterfront', title: 'A flexible final evening', tag: 'WORK / EVENING', activityTime: '4:30 PM', activity: 'Optional shopping or favourite revisit, dinner, then free time.', transport: 'Walk / public transport / Uber', destination: 'Perth', events: [{ ...mallShopping('Hay Street Mall or Murray Street Mall', 'hayMall'), title: 'Optional shopping / favourite revisit', time: '4:30–6:00 PM (optional)', note: 'Allow 60–90 minutes; choose one mall or skip for a relaxed evening.' }, { time: '6:00–7:00 PM', title: 'Free time / return to the waterfront', type: 'free', transport: 'At your pace' }, plannedDinner, flexibleEvening] },
      { date: '2026-10-23', kind: 'departure', base: 'DoubleTree Waterfront', title: 'Final workday + late flight', tag: 'DEPARTURE', activityTime: 'After work', activity: 'Finish the Perth workweek, keep the evening flexible, then travel to Perth Airport late Friday for the after-midnight return journey.', transport: 'Uber · adjustable departure time', destination: 'Perth', events: [{ time: '16:00 onward', title: 'Flexible final Perth evening begins', type: 'free', transport: 'Walk / public transport / Uber', optional: true, note: 'Work ends at 16:00; keep the evening flexible.' }, plannedDinner, { time: 'After dinner', title: 'Return to hotel / collect luggage', type: 'hotel', transport: 'Walk / Uber' }, { time: 'Late evening · adjustable', title: 'Late-night Uber to Perth Airport', type: 'travel', transport: 'Uber', query: 'Perth Airport Terminal 1, Western Australia', flightRef: 'SQ216', note: 'Flight is after midnight; choose the airport departure time to suit your plan.' }] },
      { date: '2026-10-24', kind: 'flight', base: 'In transit', title: 'Return · Perth → Singapore → Bengaluru', tag: 'FLIGHT', activity: 'Fly from Perth to Singapore and connect onward to Bengaluru.', transport: 'Singapore Airlines', destination: 'PER → SIN → BLR', events: 'flights' }
  ],
  options: [
    { id: 'option1', number: '01', title: 'Perth + Rottnest + Fremantle', subtitle: 'The easy city-and-island mix', leave: 'No Friday leave', effort: 'Most relaxed · low logistics', highlight: 'Rottnest Saturday; Fremantle Markets and waterfront Sunday.', dependency: 'Book Rottnest ferry; Uber between hotels with luggage after work.', dates: ['2026-10-16', '2026-10-17', '2026-10-18'] },
    { id: 'option2', number: '02', title: 'Southwest + Rottnest', subtitle: 'Natural wonders, then the island', leave: 'Friday leave required', effort: 'Full weekend · highest variety', highlight: 'Two-day Southwest scenery followed by quokkas and beaches.', dependency: 'Leave approval; confirm DoubleTree luggage hold, tour pickup and ferry booking.', dates: ['2026-10-16', '2026-10-17', '2026-10-18'] },
    { id: 'option3', number: '03', title: 'Southwest + Swan Valley', subtitle: 'Big landscapes, local flavours', leave: 'Friday leave required', effort: 'More relaxed than Option 2', highlight: 'Southwest landscapes, then a food-first Swan Valley day.', dependency: 'Leave approval; confirm DoubleTree luggage hold and select an organized Swan Valley tour.', dates: ['2026-10-16', '2026-10-17', '2026-10-18'] }
  ],
  southwest: {
    recommended: { name: 'Australian Pinnacle Tours', price: 'A$840 twin/double · A$900 single', tour: '2 Day Margaret River Wine Tour and Food Lovers Experience', url: 'https://www.australianpinnacletours.com.au/western-australian-tours/margaret-river-wine-tour-food-lovers-experience', why: 'Best-value overlap with this trip’s scenery priorities: Busselton Jetty, Mammoth Cave, Canal Rocks, Cape Leeuwin and Boranup Forest, alongside local produce and winery/brewery visits. The itinerary is still food-and-wine-led.', nameNote: 'The official listing uses this title, rather than the trip brief’s “Food, Wine & Natural Wonders Experience.” Confirm it is the intended package, its inclusions, and the quoted A$900 single price before booking.', linkLabel: 'Official 2-day itinerary' },
    alternative: { name: 'Aussie Perth Tours', price: 'Around A$1,290 twin share + single supplement', url: 'https://www.aussieperthtours.com.au/tour/2-days-margaret-river-augusta/', why: 'Consider for its sightseeing emphasis: Busselton Jetty train, Underwater Observatory, Yallingup Beach, Canal Rocks, Ngilgi Cave and Cape Leeuwin.', linkLabel: 'Official 2-day tour' },
    reminder: 'CONFIRM WITH DOUBLETREE THAT THEY CAN HOLD YOUR MAIN LUGGAGE BEFORE CHECK-IN.'
  },
  rottnestPlan: [
    { time: '~7:45 AM', title: 'Walk DoubleTree → Barrack Street Jetty', transport: 'Walk', type: 'travel' },
    { time: '~8:30 AM', title: 'Ferry departure', transport: 'Ferry · verify timetable and booking', type: 'travel' },
    { time: '~10:00 AM', title: 'Arrive Rottnest Island', transport: 'Walk / cycle / e-bike', type: 'travel' },
    { time: '10:00 AM–4:30 PM', title: 'Quokkas, The Basin, Longreach or Geordie Bay, lunch and beach time', transport: 'Walking / cycle / e-bike', type: 'activity', note: 'Keep the day flexible; check weather and island conditions.' },
    { time: '~5:00 PM', title: 'Ferry back to Perth', transport: 'Ferry · verify timetable', type: 'travel' },
    plannedDinner,
    flexibleEvening
  ],
  fremantlePlan: [
    { time: '~9:30 AM', title: 'Train Perth → Fremantle', transport: 'Train · verify journey planner', type: 'travel' },
    { time: '~10:15 AM', title: 'Fremantle Markets', transport: 'Walk', type: 'activity', location: 'fremantle' },
    { time: '~12:30 PM', title: 'Fremantle town + Cappuccino Strip', transport: 'Walk', type: 'activity' },
    { time: '1:30–3:00 PM', title: 'Lunch', transport: 'Walk', type: 'food' },
    { time: '3:00–4:30 PM', title: 'Fishing Boat Harbour + waterfront', transport: 'Walk', type: 'activity', query: 'Fishing Boat Harbour, Fremantle WA' },
    { time: '~4:00–5:00 PM', title: 'Train back to Perth', transport: 'Train · verify journey planner', type: 'travel' },
    plannedDinner,
    flexibleEvening
  ],
  checklists: [
    { id: 'before-perth', title: 'Before Perth', items: ['Confirm flight details', 'Confirm both hotel bookings', 'Confirm Southwest tour if selected', 'Book Rottnest ferry if selected', 'Confirm airport transfer plan', 'Request Friday leave for Options 2 or 3', 'Confirm DoubleTree can hold luggage before check-in'] },
    { id: 'before-southwest', title: 'Before Southwest', items: ['Pack overnight bag', 'Confirm main luggage storage at DoubleTree', 'Confirm tour pickup location and time', 'Confirm tour inclusions and current pricing'] },
    { id: 'during-perth', title: 'During Perth', items: ['Check the day-by-day itinerary', 'Recheck ferry and tour confirmations', 'Check weather before outdoor plans'] }
  ],
  budgetCategories: [
    { name: 'Hotels', status: 'To be confirmed' },
    { name: 'Southwest tour', status: 'Indicative' },
    { name: 'Rottnest ferry', status: 'To be confirmed' },
    { name: 'Swan Valley tour', status: 'To be confirmed' },
    { name: 'Fremantle', status: 'To be confirmed' },
    { name: 'Food', status: 'To be confirmed' },
    { name: 'Uber', status: 'To be confirmed' },
    { name: 'Public transport', status: 'To be confirmed' },
    { name: 'Other', status: 'To be confirmed' }
  ]
};