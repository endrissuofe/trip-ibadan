// Labels and short descriptions for real places along the route (names come from OSM).
export const CATEGORY_LABEL: Record<string, string> = {
  church: 'Church', mosque: 'Mosque', market: 'Market', fuel: 'Filling station', bank: 'Bank', school: 'School',
  police: 'Police', park: 'Park', themepark: 'Theme park', mall: 'Shopping', government: 'Government',
  estate: 'Estate', business: 'Business', leisure: 'Leisure', place: 'Landmark',
};
export const CATEGORY_ICON: Record<string, string> = {
  church: '⛪', mosque: '🕌', market: '🛒', fuel: '⛽', bank: '🏦', school: '🎓', police: '👮', park: '🌳',
  themepark: '🎡', mall: '🛍️', government: '🏛️', estate: '🏘️', business: '🏢', leisure: '🐎', place: '📍',
};

/** Hand-written lines for headline landmarks (kept to well-established facts). */
export const HERO: Record<string, { blurb: string; bonus: number }> = {
  'Gani Fawehinmi Park': { blurb: "Ojota's freedom park, named after the human-rights lawyer Gani Fawehinmi.", bonus: 500 },
  'Ketu Market': { blurb: 'Busy market beside the Ojota–Ketu stretch.', bonus: 300 },
  'Kara Market': { blurb: 'The famous Kara cattle market by the Ogun River bridge.', bonus: 500 },
  'Hi-Impact Planet': { blurb: 'Amusement park on the Lagos–Ibadan Expressway.', bonus: 500 },
  'Mountain Top University': { blurb: 'University owned by the Mountain of Fire and Miracles Ministries.', bonus: 400 },
  'Ikeja Saddle Club': { blurb: 'Horse-riding club near Berger.', bonus: 300 },
};

export const PLACE_BONUS = 150;
