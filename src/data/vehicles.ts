// Vehicle definitions (spec 09 §4 data model). Speeds in km/h, accel/brake in m/s².
export type VehicleType = 'minivan' | 'minibus' | 'coach';
export type ModelKind = 'sienna' | 'minibus' | 'hiace' | 'coaster' | 'coach';
/** Garage prices in ₦ earned from trips (0 = owned from the start). */

export interface VehicleDef {
  id: string;
  name: string;
  type: VehicleType;
  tagline: string;
  model: ModelKind;
  bodyColor: string;
  maxSpeed: number;
  acceleration: number;
  braking: number;
  handling: number; // 1–10
  fuelCapacity: number; // litres (display)
  fuelConsumption: number; // litres / 100 km at cruise
  passengerCapacity: number;
  damageResistance: number; // multiplier, higher = tougher
  speedLimit: number; // FRSC expressway limit for this class
  length: number;
  width: number;
  status: 'owned' | 'locked';
  price: number; // ₦ to buy in the garage (0 = starter); coming-soon vehicles have status 'locked' and price 0
  // display ratings /10
  ratings: { speed: number; handling: number; fuel: number };
}

export const VEHICLES: VehicleDef[] = [
  {
    id: 'sienna', name: 'Toyota Sienna', type: 'minivan', model: 'sienna', bodyColor: '#b7bcc1',
    tagline: 'Comfortable and reliable for intercity travel.',
    maxSpeed: 165, acceleration: 3.4, braking: 8.5, handling: 8,
    fuelCapacity: 75, fuelConsumption: 11, passengerCapacity: 6, damageResistance: 1.0, // 8-seater: driver + conductor + 6 passengers
    speedLimit: 100, length: 5.1, width: 2.0, status: 'owned', price: 0,
    ratings: { speed: 7, handling: 8, fuel: 6 },
  },
  {
    id: 'bus', name: 'Intercity Bus', type: 'minibus', model: 'minibus', bodyColor: '#f2f2ee',
    tagline: 'Higher capacity, heavier handling.',
    maxSpeed: 125, acceleration: 2.1, braking: 6.5, handling: 5,
    fuelCapacity: 70, fuelConsumption: 14, passengerCapacity: 18, damageResistance: 1.5,
    speedLimit: 90, length: 5.4, width: 2.1, status: 'owned', price: 0,
    ratings: { speed: 6, handling: 5, fuel: 5 },
  },
  {
    id: 'hiace', name: 'Toyota Hiace', type: 'minibus', model: 'hiace', bodyColor: '#e9e9e4',
    tagline: 'Classic 14-seater park bus.', maxSpeed: 120, acceleration: 2.2, braking: 6.2, handling: 5,
    fuelCapacity: 70, fuelConsumption: 13, passengerCapacity: 14, damageResistance: 1.3,
    speedLimit: 90, length: 4.9, width: 1.9, status: 'owned', price: 60000, ratings: { speed: 5, handling: 5, fuel: 6 },
  },
  {
    id: 'coaster', name: 'Coaster', type: 'coach', model: 'coaster', bodyColor: '#f0efe8',
    tagline: '30-seat intercity coaster.', maxSpeed: 110, acceleration: 1.6, braking: 5.5, handling: 4,
    fuelCapacity: 100, fuelConsumption: 18, passengerCapacity: 30, damageResistance: 1.8,
    speedLimit: 90, length: 7.0, width: 2.1, status: 'locked', price: 0, ratings: { speed: 4, handling: 4, fuel: 4 },
  },
  {
    id: 'luxury', name: 'Luxury Bus', type: 'coach', model: 'coach', bodyColor: '#f4f4f4',
    tagline: '50-seat luxury coach.', maxSpeed: 110, acceleration: 1.3, braking: 5, handling: 3,
    fuelCapacity: 300, fuelConsumption: 30, passengerCapacity: 50, damageResistance: 2.5,
    speedLimit: 90, length: 12, width: 2.55, status: 'owned', price: 250000, ratings: { speed: 4, handling: 3, fuel: 3 },
  },
];

export const vehicleById = (id: string) => VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];
