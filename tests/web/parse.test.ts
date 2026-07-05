import { describe, it, expect } from 'vitest';
import { parseLocationDetail, locationDetailPath } from '../../src/web/parse.js';

// Minimal fixtures mirroring the real captured ld+json (values from live recon,
// see docs/TRIPADVISOR-WEB-API.md). The business node is the one carrying both
// `name` and `aggregateRating`; other blocks (BreadcrumbList, @graph) are noise.
const page = (businessJson: string) => `
<html><head>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization' }] })}</script>
<script type="application/ld+json">${JSON.stringify({ '@type': 'BreadcrumbList', itemListElement: [] })}</script>
<script type="application/ld+json">${businessJson}</script>
</head><body>ReviewList</body></html>`;

const attraction = {
  '@type': 'LocalBusiness',
  name: 'Golden Gate Bridge',
  url: 'https://www.tripadvisor.com/Attraction_Review-g60713-d104675-Reviews-Golden_Gate_Bridge-San_Francisco_California.html',
  address: { '@type': 'PostalAddress', addressLocality: 'San Francisco', addressRegion: 'California', addressCountry: 'US', postalCode: '94129' },
  aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.7', reviewCount: 49969, bestRating: 5 },
  image: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/x/golden-gate-bridge.jpg?w=1200',
  telephone: '+1 415-921-5858',
  geo: { '@type': 'GeoCoordinates', latitude: 37.820026, longitude: -122.47859 },
  sameAs: 'https://www.goldengate.org/',
};

describe('locationDetailPath', () => {
  it('builds a single canonical-by-d-id URL regardless of category', () => {
    expect(locationDetailPath(104675)).toBe('/Attraction_Review-g1-d104675-Reviews-a-a.html');
  });
});

describe('parseLocationDetail', () => {
  it('extracts the business node (attraction / LocalBusiness)', () => {
    const d = parseLocationDetail(page(JSON.stringify(attraction)));
    expect(d).toMatchObject({
      type: 'LocalBusiness',
      name: 'Golden Gate Bridge',
      rating: 4.7,
      review_count: 49969,
      telephone: '+1 415-921-5858',
      latitude: 37.820026,
      longitude: -122.47859,
    });
    expect(d!.address).toMatchObject({ addressLocality: 'San Francisco', postalCode: '94129' });
    expect(d!.url).toContain('d104675');
  });

  it('handles a hotel (LodgingBusiness) node', () => {
    const hotel = { ...attraction, '@type': 'LodgingBusiness', name: 'Park Central Hotel New York', aggregateRating: { ratingValue: '3.9', reviewCount: 9690 } };
    const d = parseLocationDetail(page(JSON.stringify(hotel)));
    expect(d).toMatchObject({ type: 'LodgingBusiness', name: 'Park Central Hotel New York', rating: 3.9, review_count: 9690 });
  });

  it('handles a restaurant (FoodEstablishment) node', () => {
    const resto = { ...attraction, '@type': 'FoodEstablishment', name: "Alice's Tea Cup Chapter 2", aggregateRating: { ratingValue: '4.1', reviewCount: 368 } };
    const d = parseLocationDetail(page(JSON.stringify(resto)));
    expect(d).toMatchObject({ type: 'FoodEstablishment', name: "Alice's Tea Cup Chapter 2", rating: 4.1, review_count: 368 });
  });

  it('returns null when no business node is present', () => {
    const shell = '<html><head><script type="application/ld+json">{"@type":"BreadcrumbList"}</script></head></html>';
    expect(parseLocationDetail(shell)).toBeNull();
  });

  it('tolerates a malformed ld+json block and finds the next valid one', () => {
    const html = `<script type="application/ld+json">{ not json }</script>${page(JSON.stringify(attraction))}`;
    expect(parseLocationDetail(html)?.name).toBe('Golden Gate Bridge');
  });

  it('omits optional fields that are absent rather than emitting nulls', () => {
    const bare = { '@type': 'LocalBusiness', name: 'X', aggregateRating: { ratingValue: '5', reviewCount: 1 } };
    const d = parseLocationDetail(page(JSON.stringify(bare)))!;
    expect(d.name).toBe('X');
    expect(d).not.toHaveProperty('telephone');
    expect(d).not.toHaveProperty('latitude');
  });
});
