export const SALON_TIME_ZONE = 'Asia/Kolkata';

export const DEMO_SERVICES = Object.freeze([
  Object.freeze({
    id: 'classic-haircut',
    name: 'Classic haircut',
    durationMinutes: 30,
    bufferMinutes: 10,
    priceInr: 350,
  }),
  Object.freeze({
    id: 'beard-trim',
    name: 'Beard trim',
    durationMinutes: 20,
    bufferMinutes: 5,
    priceInr: 200,
  }),
  Object.freeze({
    id: 'cut-wash-style',
    name: 'Cut, wash & style',
    durationMinutes: 45,
    bufferMinutes: 10,
    priceInr: 600,
  }),
]);

export const DEMO_BARBERS = Object.freeze([
  Object.freeze({ id: 'stylist-a', name: 'Stylist A' }),
  Object.freeze({ id: 'stylist-b', name: 'Stylist B' }),
]);
