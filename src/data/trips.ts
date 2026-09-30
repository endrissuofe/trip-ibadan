// Trips are slices of one real route file (public/data/ojota-mowe.json).
// Stop ids match route landmarks. Events are fixed to real sections of the road
// (km measured from the Ojota start), per spec 09 §16.
export interface RouteEvent {
  kind: 'jam' | 'breakdown' | 'construction' | 'checkpoint' | 'truck';
  km: number;
  lengthM: number;
  label: string;
  speedLimit?: number;
}

export interface TripDef {
  id: string;
  from: string; to: string;
  fromId: string; toId: string;
  blurb: string;
  unlock: { stars: number } | null;
}

export const ROUTE_ID = 'ojota-mowe';

export const ROUTE_EVENTS: RouteEvent[] = [
  { kind: 'jam', km: 5.75, lengthM: 450, label: 'Go-slow at Berger' },
  { kind: 'jam', km: 8.25, lengthM: 420, label: 'Heavy traffic at Kara' },
  { kind: 'truck', km: 9.5, lengthM: 3000, label: 'Heavy trucks ahead' },
  { kind: 'breakdown', km: 11.2, lengthM: 60, label: 'Broken-down truck on the shoulder' },
  { kind: 'construction', km: 13.2, lengthM: 450, label: 'Road works: right lane closed', speedLimit: 50 },
  { kind: 'jam', km: 18.75, lengthM: 450, label: 'Arepo gridlock' },
  { kind: 'checkpoint', km: 21.8, lengthM: 250, label: 'Police checkpoint: slow down', speedLimit: 30 },
];

export const TRIPS: TripDef[] = [
  { id: 'ojota-berger', from: 'Ojota', to: 'Berger', fromId: 'ojota', toId: 'berger', blurb: 'Lagos run: Ojota park to Berger. Watch the Berger go-slow.', unlock: null },
  { id: 'berger-mowe', from: 'Berger', to: 'Mowe', fromId: 'berger', toId: 'mowe', blurb: 'Into Ogun State over the Ogun River bridge to Mowe.', unlock: null },
  { id: 'ojota-mowe', from: 'Ojota', to: 'Mowe', fromId: 'ojota', toId: 'mowe', blurb: 'The full run: Lagos to Mowe with every stop.', unlock: { stars: 3 } },
];

/** Game fares (₦) by distance, tuned for gameplay rather than real park prices. */
export const fareFor = (km: number) => Math.round((500 + km * 115) / 50) * 50;

export const NAMES = ['Mama Nkechi', 'Alhaji Musa', 'Tunde', 'Aunty Bisi', 'Chinedu', 'Baba Femi', 'Kemi', 'Ifeanyi', 'Hauwa', 'Segun', 'Ngozi', 'Emeka', 'Funmi', 'Uche', 'Yusuf', 'Aisha', 'Bola', 'Obinna', 'Ronke', 'Sadiq', 'Damilola', 'Chiamaka', 'Kunle', 'Blessing', 'Gbenga', 'Zainab', 'Tobi', 'Amaka', 'Sola', 'Ibrahim'];

export const MISSED_STOP_LINES = [
  'Driver! You don pass my stop!',
  'Ehn! Where you dey carry me go?',
  'Oga driver, I said {stop}! You no hear?',
  'Abeg stop! My stop don pass o!',
];
export const HAPPY_LINES = ['Thank you driver, God bless you!', 'Correct driver! Smooth ride.', 'Na so! See you next time.', 'You try well well.'];
export const BUMPY_LINES = ['Driver, calm down! My back!', 'Is it rally you dey drive?', 'Ah ah! Take am easy!'];
