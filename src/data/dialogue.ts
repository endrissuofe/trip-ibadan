// Passenger and conductor lines (change spec §14). Data, not code: add lines here freely.
//
// Tokens: {dest} {fare} {amount} {change} {short} {claim} {name} {stop} {from}
// lang: 'pcm' Nigerian Pidgin, 'en' English, 'yo' Yoruba (Yoruba lines should be checked by a
// native speaker before release). Lines are picked at random with a no-repeat memory.
export type Intent =
  | 'conductor_call' | 'greet' | 'destination' | 'ask_fare' | 'pay' | 'change_given' | 'exact_money'
  | 'owe_change' | 'owe_paid' | 'thanks'
  | 'dispute_claim' | 'dispute_reply' | 'dispute_conductor_wrong' | 'dispute_pax_wrong' | 'dispute_paid_out'
  | 'request_stop' | 'announce_stop' | 'alight' | 'missed_stop' | 'missed_refund'
  | 'bumpy' | 'happy' | 'long_stop' | 'manual_wait';

export interface Line { text: string; lang: 'pcm' | 'en' | 'yo'; w?: number }

export const LINES: Record<Intent, Line[]> = {
  conductor_call: [
    { text: '{dest}! {dest}! Enter with your change o!', lang: 'pcm' },
    { text: '{dest}, one chance! Oya, enter!', lang: 'pcm' },
    { text: '{dest} straight! Wọlé, wọlé!', lang: 'yo' },
    { text: '{dest}! {dest}! Make we dey go!', lang: 'pcm' },
  ],
  greet: [
    { text: 'Good morning o. Where you dey go?', lang: 'pcm' },
    { text: 'Ẹ káàbọ̀. Where you dey drop?', lang: 'yo' },
    { text: 'Welcome ma. Which bus stop?', lang: 'en' },
    { text: 'Oga, you dey go where?', lang: 'pcm' },
  ],
  destination: [
    { text: '{dest}.', lang: 'en', w: 2 },
    { text: 'I dey go {dest}.', lang: 'pcm' },
    { text: '{dest}, abeg.', lang: 'pcm' },
    { text: 'Drop me for {dest}.', lang: 'pcm' },
    { text: 'I dey drop for {dest}.', lang: 'pcm' },
    { text: '{dest}. Ẹ jọ̀ọ́, remind me.', lang: 'yo' },
  ],
  ask_fare: [
    { text: '{dest} na {fare}. Your money?', lang: 'pcm' },
    { text: 'Oya, {fare} for {dest}.', lang: 'pcm' },
    { text: 'Your fare, {fare}.', lang: 'en' },
    { text: 'Pay as you enter o. {fare}.', lang: 'pcm' },
  ],
  pay: [
    { text: 'Oga, take {amount}.', lang: 'pcm' },
    { text: 'Here, {amount}.', lang: 'en' },
    { text: 'Take am, {amount}. Give me my change.', lang: 'pcm' },
    { text: 'Na {amount} I get.', lang: 'pcm' },
  ],
  exact_money: [
    { text: 'Na exact money be this.', lang: 'pcm' },
    { text: 'Correct {fare}, count am.', lang: 'pcm' },
    { text: 'Thank you, exact change.', lang: 'en' },
  ],
  change_given: [
    { text: 'Your change na {change}.', lang: 'pcm' },
    { text: 'Take your {change}.', lang: 'pcm' },
    { text: '{change}, count am.', lang: 'pcm' },
    { text: 'Here, {change} change.', lang: 'en' },
  ],
  owe_change: [
    { text: 'I no get change now. I go give you your {change} for road.', lang: 'pcm' },
    { text: 'Hold on for your change o, make other people pay first.', lang: 'pcm' },
    { text: 'Change never reach. I go settle you before {dest}.', lang: 'pcm' },
  ],
  owe_paid: [
    { text: 'Take your {change} change, I no forget you.', lang: 'pcm' },
    { text: 'See your {change}. We dey square.', lang: 'pcm' },
  ],
  thanks: [
    { text: 'Ẹ ṣé o.', lang: 'yo' },
    { text: 'Thank you.', lang: 'en' },
    { text: 'Okay, thank you o.', lang: 'pcm' },
  ],
  dispute_claim: [
    { text: 'Oga, my change na {claim}! You give me {short}.', lang: 'pcm' },
    { text: 'Conductor, you short-change me o!', lang: 'pcm' },
    { text: 'Ah ah! Na {claim} be my change, no be {short}!', lang: 'pcm' },
    { text: 'I give you {amount}, where the rest of my money?', lang: 'pcm' },
  ],
  dispute_reply: [
    { text: 'Abeg wait, make I check am.', lang: 'pcm' },
    { text: 'Calm down, I dey count am now.', lang: 'pcm' },
    { text: 'Madam, na {amount} you give me. Wait make I check.', lang: 'pcm' },
    { text: 'No shout for my head, make I check.', lang: 'pcm' },
  ],
  dispute_conductor_wrong: [
    { text: 'Ehen, na my mistake. Take your {short}. No vex.', lang: 'pcm' },
    { text: 'Sorry o, see the remaining {short}.', lang: 'pcm' },
    { text: 'You correct. Na {short} remain. Sorry.', lang: 'pcm' },
  ],
  dispute_pax_wrong: [
    { text: 'See am: you give me {amount}. Your change complete.', lang: 'pcm' },
    { text: 'Na {amount} you give me o, count am yourself.', lang: 'pcm' },
    { text: 'Oh, sorry. Na my mistake.', lang: 'pcm' },
  ],
  dispute_paid_out: [
    { text: 'Driver don settle am. Make peace reign.', lang: 'pcm' },
    { text: 'Okay, take {short}. Make we dey go.', lang: 'pcm' },
  ],
  request_stop: [
    { text: 'Owa o! {dest}!', lang: 'yo', w: 2 },
    { text: '{dest} bus stop, I dey drop o!', lang: 'pcm' },
    { text: 'Driver, {dest}! Stop for front!', lang: 'pcm' },
    { text: 'Conductor, tell am say I dey drop for {dest}.', lang: 'pcm' },
  ],
  announce_stop: [
    { text: '{stop}! Who dey drop for {stop}?', lang: 'pcm' },
    { text: '{stop}, anybody?', lang: 'pcm' },
    { text: '{stop} don reach!', lang: 'pcm' },
  ],
  alight: [
    { text: 'Thank you driver. Ó dàbọ̀!', lang: 'yo' },
    { text: 'God bless you. Safe journey.', lang: 'en' },
    { text: 'Correct driver! Na so!', lang: 'pcm' },
    { text: 'Thank you o. See you next time.', lang: 'pcm' },
  ],
  missed_stop: [
    { text: 'Driver! You don pass my stop!', lang: 'pcm' },
    { text: 'Ehn! Where you dey carry me go?', lang: 'pcm' },
    { text: 'Oga driver, I said {dest}! You no hear?', lang: 'pcm' },
    { text: 'Abeg stop! My stop don pass o!', lang: 'pcm' },
  ],
  missed_refund: [
    { text: 'Give me back half my money, I go trek back.', lang: 'pcm' },
    { text: 'Na you go pay my bike back to {dest}.', lang: 'pcm' },
  ],
  bumpy: [
    { text: 'Driver, calm down! My back!', lang: 'pcm' },
    { text: 'Is it rally you dey drive?', lang: 'pcm' },
    { text: 'Ah ah! Take am easy!', lang: 'pcm' },
    { text: 'We no dey inside race o!', lang: 'pcm' },
  ],
  happy: [
    { text: 'This driver sabi drive o.', lang: 'pcm' },
    { text: 'Smooth ride. I fit sleep.', lang: 'pcm' },
  ],
  long_stop: [
    { text: 'Driver, we no fit wait here all day!', lang: 'pcm' },
    { text: 'Oya now, make we move!', lang: 'pcm' },
  ],
  manual_wait: [
    { text: 'Oga, collect your money now.', lang: 'pcm' },
    { text: 'Who I go pay?', lang: 'pcm' },
  ],
};
