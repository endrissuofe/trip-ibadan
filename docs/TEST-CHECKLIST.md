# Test checklist (change spec §25)

✅ = checked automatically in a headless browser (scripted drive with screenshots) or by `npm test`.
👀 = needs a person to play and judge (feel, look).

## Driving
| Criterion | How checked | Result |
|---|---|---|
| Vehicle drives forward | Scripted drive | ✅ |
| Reverse works correctly | Stop, R, accelerate: moves backwards along its heading, capped at ~16 km/h | ✅ |
| Can't select R while moving | Scripted | ✅ |
| Brake stops the vehicle and doesn't reverse it | Scripted (old bug) | ✅ |
| Brake works while reversing | Scripted | ✅ |
| Steering both directions, forward and reverse | Steer right forward → turns right; in reverse → nose swings left (real-car behaviour) | ✅ |
| Reverse lamps, brake lamps, indicators | Close-up render | ✅ |
| Reverse camera / visibility usable | Screenshots of chase-reverse and driver reversing camera | ✅ render · 👀 feel |
| Vehicle physics stable | Autopilot cruise at 1.5×, 3×, 5× pace stays in lane | ✅ · 👀 feel |

## Passengers
| Criterion | How checked | Result |
|---|---|---|
| Passenger walks to the vehicle | Walkers visible in park screenshots | ✅ |
| Passenger enters | Boards to a seat (6/6 Sienna, 14/14 Hiace) | ✅ |
| Passenger sits naturally | Cabin-view screenshot | ✅ render · 👀 look |
| Passenger has a destination | Every row in the passenger list has one | ✅ |
| Passenger requests a drop-off | "Owa o! Berger!" as the stop approaches | ✅ |
| Passenger exits at destination | Full Ojota → Mowe run, all 18 passengers served at their stops | ✅ |
| Human-looking passengers | Procedural stand-ins | 👀 interim until real models |

## Conductor
| Criterion | Result |
|---|---|
| Conductor is a visible character | ✅ (front passenger seat, cabin view) |
| Receives payment | ✅ |
| Fare calculated | ✅ |
| Change calculated (e.g. fare ₦1,200, pays ₦2,000 → ₦800) | ✅ unit test |
| Change can be returned | ✅ (conductor mode and manual RETURN CHANGE) |
| Payment recorded | ✅ trip summary |

## Social interaction
| Criterion | Result |
|---|---|
| Passenger/conductor dialogue exists | ✅ |
| Change disputes can occur occasionally | ✅ ~3–10% of payments with change, never back-to-back (unit test) |
| Dialogue varies | ✅ no back-to-back repeats (unit test) |

## Camera
| Criterion | Result |
|---|---|
| Switch Driver / Third-person / Passenger-cabin (C or 🎥) | ✅ |

## Game pacing
| Criterion | Result |
|---|---|
| Real route stays geographically accurate | ✅ no geometry changes |
| Game time independent of real time | ✅ 10 real seconds = 15 / 30 / 50 game seconds at 1.5× / 3× / 5× |
| Default ≈ 3× | ✅ Normal |
| Player-facing distance in Trip Units | ✅ |

## Still to test by hand
- Real phones (mid-range Android, iPhone Safari): frame rate with a full Hiace, touch layout.
- How Normal (3×) pace feels at cruising speed; Relaxed may suit new players better.
- Whether the dispute rate feels right over several trips.
