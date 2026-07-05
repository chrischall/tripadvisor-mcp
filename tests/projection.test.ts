import { describe, it, expect, vi } from 'vitest';
import { compactLocation, compactList, compactLocationList } from '../src/projection.js';

const gg = {
  id: 104675,
  geo: 'San Francisco, California',
  names: [
    { language: 'es', value: 'Puente Golden Gate', primary: false },
    { language: 'en', value: 'Golden Gate Bridge', primary: true },
  ],
  addresses: [{ city: 'San Francisco', state: 'California', country_code: 'US' }],
  urls: { tripadvisor: { main: 'https://www.tripadvisor.com/Attraction_Review-g60713-d104675-Reviews-x.html' } },
  traveler_ratings: { overall: { rating: 4.7, count: 49969 } },
};

describe('compactLocation', () => {
  it('projects the primary name, city, rating, url, and derives category from the url', () => {
    expect(compactLocation(gg)).toEqual({
      id: 104675,
      name: 'Golden Gate Bridge',
      category: 'ATTRACTION',
      geo: 'San Francisco, California',
      city: 'San Francisco',
      state: 'California',
      rating: 4.7,
      review_count: 49969,
      url: 'https://www.tripadvisor.com/Attraction_Review-g60713-d104675-Reviews-x.html',
    });
  });

  it('falls back to the first name when none is marked primary', () => {
    const noPrimary = { ...gg, names: [{ language: 'fr', value: 'Pont', primary: false }] };
    expect(compactLocation(noPrimary).name).toBe('Pont');
  });

  it('derives HOTEL and RESTAURANT categories from the url prefix', () => {
    const hotel = { ...gg, urls: { tripadvisor: { main: 'https://x/Hotel_Review-g1-d2-y.html' } } };
    const resto = { ...gg, urls: { tripadvisor: { main: 'https://x/Restaurant_Review-g1-d2-y.html' } } };
    expect(compactLocation(hotel).category).toBe('HOTEL');
    expect(compactLocation(resto).category).toBe('RESTAURANT');
  });

  it('omits fields that are absent instead of emitting nulls', () => {
    const bare = { id: 5, names: [{ value: 'X', primary: true }] };
    const c = compactLocation(bare);
    expect(c).toEqual({ id: 5, name: 'X' });
    expect(c).not.toHaveProperty('rating');
    expect(c).not.toHaveProperty('category');
  });
});

describe('compactList', () => {
  it('projects a search envelope, keeping pagination', () => {
    const raw = {
      data: [{ location: gg, matched_value: { value: 'Golden Gate' } }],
      pagination: { page: 1, size: 20, total_elements: 1 },
    };
    const out = compactList(raw);
    expect(out.pagination).toEqual(raw.pagination);
    expect(out.data).toEqual([compactLocation(gg)]);
  });

  it('carries distance fields through on a nearby envelope', () => {
    const raw = { data: [{ location: gg, distance_miles: 0.5, distance_kilometers: 0.8 }] };
    const out = compactList(raw);
    expect(out.data[0]).toMatchObject({ id: 104675, distance_miles: 0.5, distance_kilometers: 0.8 });
  });

  it('drift-fallback: returns the raw payload (and warns) when data is not an array', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const raw = { message: 'unexpected' };
    expect(compactList(raw)).toBe(raw);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('drift-fallback: returns raw when items lack a location', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const raw = { data: [{ id: 1, names: [] }] };
    expect(compactList(raw)).toBe(raw);
    warn.mockRestore();
  });
});

describe('compactLocationList (multi-get envelope)', () => {
  it('projects a {data:[Location]} envelope where items are locations directly', () => {
    const raw = { data: [gg] };
    expect(compactLocationList(raw).data).toEqual([compactLocation(gg)]);
  });

  it('drift-fallback: returns raw when items are not locations', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const raw = { message: 'nope' };
    expect(compactLocationList(raw)).toBe(raw);
    warn.mockRestore();
  });
});
