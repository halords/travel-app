export type DestinationPhoto = {
  src: string;
  region: string;
  alt: string;
  source: string;
};

// Country inspiration is bundled so existing trips also get covers, even offline.
// Match whole destination names; an unknown destination keeps its chosen color.
const photos: { match: RegExp; photo: DestinationPhoto }[] = [
  {
    match:
      /\b(japan|kyoto|tokyo|osaka|nara|sapporo|fukuoka|okinawa|hiroshima|nagoya|yokohama)\b|日本/i,
    photo: {
      src: '/images/kyoto.jpg',
      region: 'Japan',
      alt: 'Japanese streets and Yasaka Pagoda in Kyoto',
      source: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e',
    },
  },
  {
    match:
      /\b(philippines|cebu|siargao|palawan|elnido|el nido|coron|bohol|boracay|manila|davao|baguio|batangas|iloilo|batanes)\b/i,
    photo: {
      src: '/images/philippines.jpg',
      region: 'Philippines',
      alt: 'Turquoise water and limestone islands in the Philippines',
      source: 'https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86',
    },
  },
  {
    match: /\b(france|paris|lyon|marseille|bordeaux|provence)\b/i,
    photo: {
      src: '/images/france.jpg',
      region: 'France',
      alt: 'The Eiffel Tower and the Seine in Paris',
      source: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34',
    },
  },
  {
    match:
      /\b(italy|rome|roma|venice|venezia|florence|firenze|milan|milano|naples|amalfi|tuscany)\b/i,
    photo: {
      src: '/images/italy.jpg',
      region: 'Italy',
      alt: 'The Colosseum in Rome under a blue evening sky',
      source: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5',
    },
  },
  {
    match: /\b(south korea|seoul|busan|jeju|incheon)\b|대한민국|서울/i,
    photo: {
      src: '/images/korea.jpg',
      region: 'South Korea',
      alt: 'A lively shopping street in South Korea',
      source: 'https://images.unsplash.com/photo-1517154421773-0529f29ea451',
    },
  },
  {
    match: /\b(singapore|sentosa)\b/i,
    photo: {
      src: '/images/singapore.jpg',
      region: 'Singapore',
      alt: 'Marina Bay Sands and the Singapore waterfront',
      source: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd',
    },
  },
  {
    match: /\b(thailand|bangkok|phuket|chiang mai|krabi|pattaya|koh samui)\b/i,
    photo: {
      src: '/images/thailand.jpg',
      region: 'Thailand',
      alt: 'Bright market signs and a tuk-tuk in Bangkok',
      source: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365',
    },
  },
];

export function destinationPhoto(destination: string): DestinationPhoto | null {
  return photos.find(({ match }) => match.test(destination))?.photo ?? null;
}
