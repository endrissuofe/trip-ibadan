// Food-delivery rider liveries seen on Lagos roads.
// NOTE: these are real trademarks. Before a public release, get permission from each
// company (this could become a sponsorship slot) or swap in fictional brands here.
// Colours are approximations; confirm against each brand's guidelines.
export interface DeliveryBrand { name: string; box: string; jacket: string; text: string }

export const DELIVERY_BRANDS: DeliveryBrand[] = [
  { name: 'Chowdeck', box: '#1b4dff', jacket: '#1b4dff', text: '#ffffff' },
  { name: 'Glovo', box: '#ffc244', jacket: '#00a082', text: '#00a082' },
];
