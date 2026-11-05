import type { AppData, Category, Place } from './model';
import { addDays, today } from './model';

export function demoData(): AppData {
  const startDate = addDays(today(), 14);
  const tripId = crypto.randomUUID();
  const updatedAt = Date.now();
  const spots: {
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    day: number;
    time: string;
    duration: number;
    category: Category;
    notes: string;
  }[] = [
    {
      name: 'Fushimi Inari Taisha',
      address: '68 Fukakusa Yabunouchicho, Fushimi Ward, Kyoto, Japan',
      latitude: 34.9671,
      longitude: 135.7727,
      day: 0,
      time: '08:00',
      duration: 120,
      category: 'sightseeing',
      notes: 'An early start for a quieter walk through the torii gates.',
    },
    {
      name: 'Nishiki Market',
      address: 'Nishikikoji-dori, Nakagyo Ward, Kyoto, Japan',
      latitude: 35.005,
      longitude: 135.7649,
      day: 0,
      time: '12:00',
      duration: 90,
      category: 'food',
      notes: 'Leave a little room for something you haven’t tried before.',
    },
    {
      name: 'Kiyomizu-dera',
      address: '1-294 Kiyomizu, Higashiyama Ward, Kyoto, Japan',
      latitude: 34.9948,
      longitude: 135.785,
      day: 0,
      time: '15:00',
      duration: 90,
      category: 'sightseeing',
      notes: 'Take the scenic walk up through Sannenzaka.',
    },
    {
      name: 'Arashiyama Bamboo Grove',
      address: 'Sagaogurayama Tabuchiyamacho, Ukyo Ward, Kyoto, Japan',
      latitude: 35.0167419,
      longitude: 135.6711482,
      day: 1,
      time: '09:00',
      duration: 90,
      category: 'outdoors',
      notes: 'A slow morning among the bamboo.',
    },
    {
      name: 'Kinkaku-ji',
      address: '1 Kinkakujicho, Kita Ward, Kyoto, Japan',
      latitude: 35.0394,
      longitude: 135.7292,
      day: 2,
      time: '10:00',
      duration: 90,
      category: 'sightseeing',
      notes: '',
    },
    {
      name: 'Gion',
      address: 'Gionmachi, Higashiyama Ward, Kyoto, Japan',
      latitude: 35.003,
      longitude: 135.775,
      day: 3,
      time: '16:00',
      duration: 120,
      category: 'sightseeing',
      notes: 'Save some time to wander, and respect private streets.',
    },
  ];
  const places: Place[] = spots.map(({ day, ...spot }, index) => ({
    ...spot,
    id: crypto.randomUUID(),
    tripId,
    date: addDays(startDate, day),
    order: (index + 1) * 1000,
    visited: false,
    updatedAt,
    deletedAt: null,
  }));
  return {
    version: 1,
    trips: [
      {
        id: tripId,
        title: 'A little Kyoto getaway',
        destination: 'Kyoto, Japan',
        startDate,
        endDate: addDays(startDate, 3),
        cover: 'lavender',
        notes: 'Slow mornings, little discoveries, and plenty of good food.',
        isDemo: true,
        updatedAt,
        deletedAt: null,
      },
    ],
    places,
  };
}
