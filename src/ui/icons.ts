// Side-view vehicle silhouettes for thumbnails and garage cards.
const wheel = (x: number) => `<circle cx="${x}" cy="46" r="7" fill="#111"/><circle cx="${x}" cy="46" r="3" fill="#9aa0a4"/>`;
export const VEHICLE_SVG: Record<string, string> = {
  sienna: `<svg viewBox="0 0 120 56"><path d="M6 44 L6 34 Q8 28 16 26 L36 12 Q40 9 48 9 L104 10 Q112 11 114 22 L115 44 Z" fill="#9aa0a6"/><path d="M40 14 L104 14 L110 25 L28 26 Z" fill="#1a2630"/><rect x="62" y="14" width="3" height="12" fill="#9aa0a6"/><rect x="86" y="14" width="3" height="12" fill="#9aa0a6"/>${wheel(28)}${wheel(96)}</svg>`,
  bus: `<svg viewBox="0 0 120 56"><path d="M4 44 L4 30 Q6 24 12 22 L22 6 Q24 4 30 4 L114 4 Q117 4 117 8 L117 44 Z" fill="#f2f2ee" stroke="#8f8a80"/><path d="M24 8 L112 8 L112 20 L16 22 Z" fill="#1a2630"/><rect x="4" y="27" width="113" height="2" fill="#1d5fa8"/>${wheel(24)}${wheel(98)}</svg>`,
  hiace: `<svg viewBox="0 0 120 56"><path d="M8 44 L8 14 Q8 8 14 8 L108 8 Q114 8 114 14 L114 44 Z" fill="#e9e9e4" stroke="#8f8a80"/><rect x="14" y="12" width="96" height="12" fill="#1a2630"/>${wheel(28)}${wheel(94)}</svg>`,
  coaster: `<svg viewBox="0 0 120 56"><path d="M3 44 L3 12 Q3 5 12 5 L112 5 Q117 5 117 12 L117 44 Z" fill="#f0efe8" stroke="#8f8a80"/><rect x="8" y="10" width="106" height="13" fill="#1a2630"/><rect x="3" y="30" width="114" height="3" fill="#1d5fa8"/>${wheel(22)}${wheel(98)}</svg>`,
  luxury: `<svg viewBox="0 0 120 56"><path d="M2 44 L2 8 Q2 3 8 3 L112 3 Q118 3 118 12 L118 44 Z" fill="#f4f4f4" stroke="#8f8a80"/><rect x="6" y="8" width="110" height="16" fill="#1a2630"/><rect x="2" y="30" width="116" height="4" fill="#1d5fa8"/>${wheel(20)}${wheel(88)}${wheel(102)}</svg>`,
};
