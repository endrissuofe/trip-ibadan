# 03 — Gameplay

## Fantasy

You are making a real trip from Lagos to Ibadan. You choose a vehicle, receive a destination, follow the route, manage the journey, and try to arrive safely and efficiently.

The trip has a clear beginning and a clear end.

## Session shape

1. Title / start screen
2. Choose vehicle
3. Choose or receive Ibadan destination
4. Review route
5. Start trip in Lagos
6. Drive the real mapped route
7. Handle traffic and road events
8. Reach destination
9. Trip result
10. Earn trip rewards / unlocks

## Destination system

Every trip must have a destination.

Example:

> **START:** Berger, Lagos  
> **DESTINATION:** Iwo Road, Ibadan

Future destinations can include other real places in Ibadan.

The destination should be visible through a route marker, distance indicator, or navigation line without turning the game into a GPS simulator.

## Cameras

- **Chase camera** — default mobile view.
- **Hood camera** — closer driving view.
- **Cabin camera** — optional immersive desktop view.

The camera should communicate vehicle movement and the actual road rather than making the vehicle look like it is floating on an endless track.

## Mobile vs desktop

| | Mobile | Desktop |
|---|---|---|
| Steer | Touch steering / swipe | A/D or arrows |
| Accelerate | Hold pedal | W / Up |
| Brake | Hold brake | S / Down |
| Horn | Large touch button | Space |
| Camera | Camera button | Camera key |
| Route | Compact destination HUD | Full compact route HUD |

## Trip scoring

Distance alone is not the score.

Suggested result calculation:

- Destination reached: major completion reward.
- Passenger delivery: reward.
- Safe driving: reward.
- Time: bonus for reasonable completion time.
- Vehicle damage: deduction.
- Traffic violations: deduction.
- Excessive collisions: major deduction.
- Fuel efficiency: optional bonus.

Example result:

> **TRIP COMPLETED**  
> Lagos → Iwo Road  
> Time: 1h 42m  
> Passengers delivered: 8/8  
> Vehicle damage: 12%  
> Safe-driving bonus: +1,200  
> **Trip score: 8,420**

## Route and navigation

The route is generated from real road geometry. The player is not simply placed on a repeating road texture.

Navigation should show enough information to answer:

- Where am I?
- Where am I going?
- How far is the destination?
- What major route section am I approaching?

## Road events — build order

1. Normal traffic.
2. Slower vehicles and lane changes.
3. Potholes / rough road sections.
4. Temporary traffic congestion.
5. Rain.
6. Night driving.
7. Checkpoints or enforcement events if they fit the final tone.

Do not spawn every event in the first playable build.

## Failure

A trip can fail.

Examples:

- Severe collision.
- Vehicle becomes unusable.
- Player abandons the route.

A minor collision should normally reduce the result rather than immediately ending the trip.

## Progression

The first progression system should be simple:

- Complete trips.
- Earn trip money / points.
- Unlock better vehicles.
- Unlock additional destinations.

The player should always understand what the next trip gives them.
