// Curated fallback for workers/companies without (or who decline) browser geolocation.
// Avoids depending on an external geocoding provider in the MVP (see TECH_ARCHITECTURE.md).
export const ITALIAN_CITIES = [
  { label: "Roma", lat: 41.9028, lng: 12.4964 },
  { label: "Milano", lat: 45.4642, lng: 9.19 },
  { label: "Napoli", lat: 40.8518, lng: 14.2681 },
  { label: "Torino", lat: 45.0703, lng: 7.6869 },
  { label: "Palermo", lat: 38.1157, lng: 13.3613 },
  { label: "Genova", lat: 44.4056, lng: 8.9463 },
  { label: "Bologna", lat: 44.4949, lng: 11.3426 },
  { label: "Firenze", lat: 43.7696, lng: 11.2558 },
  { label: "Bari", lat: 41.1171, lng: 16.8719 },
  { label: "Catania", lat: 37.5079, lng: 15.083 },
  { label: "Venezia", lat: 45.4408, lng: 12.3155 },
  { label: "Verona", lat: 45.4384, lng: 10.9916 },
  { label: "Padova", lat: 45.4064, lng: 11.8768 },
  { label: "Bergamo", lat: 45.695, lng: 9.67 },
  { label: "Brescia", lat: 45.5416, lng: 10.2118 },
  { label: "Bolzano", lat: 46.4983, lng: 11.3548 },
  { label: "Trento", lat: 46.0748, lng: 11.1217 },
  { label: "Perugia", lat: 43.1122, lng: 12.3888 },
  { label: "Cagliari", lat: 39.2238, lng: 9.1217 },
  { label: "Reggio Calabria", lat: 38.1147, lng: 15.6501 },
] as const;
