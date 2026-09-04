import { describe, it, expect } from 'vitest';
import { TA_VIEWS, viewArg, viewResponse } from '../src/view.js';

/** The one thing every assertion here reads: the serialized tool-result text. */
const textOf = (r: ReturnType<typeof viewResponse>): string => (r.content[0] as { text: string }).text;

/** A Terra search envelope — `{data:[{location}]}`, the `compactList` shape. */
const searchEnvelope = {
  data: [
    {
      location: {
        id: 104675,
        names: [{ language: 'en', value: 'Golden Gate Bridge', primary: true }],
        addresses: [{ city: 'San Francisco', state: 'California' }],
        urls: { tripadvisor: { main: 'https://www.tripadvisor.com/Attraction_Review-g1-d104675-Reviews-x.html' } },
        traveler_ratings: { overall: { rating: 4.7, count: 49969, icon_url: 'https://x/bubble.png' } },
      },
      matched_value: { language: 'en', value: 'Golden Gate' },
    },
  ],
  pagination: { page: 1, size: 20, total_elements: 1 },
};

/** The multi-get envelope — `{data:[<Location>]}`, the `compactLocationList` shape. */
const batchEnvelope = {
  data: [{ id: 1, names: [{ value: 'A', primary: true }], traveler_ratings: { overall: { rating: 4, count: 2 } } }],
};

describe('viewArg', () => {
  // The schema is the only place a caller learns a cheap rung exists, so it has
  // to advertise both rungs AND the default. `viewParam` puts the description on
  // the OPTIONAL wrapper (not the inner enum) precisely so a host can read it;
  // asserting on `.description` here is what catches a regression back to a
  // parameter documented to nobody.
  it('offers exactly the rungs this server honours, and says compact is the default', () => {
    const arg = viewArg();
    expect(TA_VIEWS).toEqual(['compact', 'full']);
    expect(arg.description).toContain('"compact" (default)');
    expect(arg.description).toContain('"full"');
    // No `raw` rung: `full` already returns the untouched upstream payload, and
    // advertising a value that silently aliases to another is worse than not
    // offering it.
    expect(arg.description).not.toContain('"raw"');
  });
});

describe('viewResponse', () => {
  // The whole point of the rollout: an efficiency that has to be REQUESTED is
  // one that usually is not. `undefined` — what a caller who never passed the
  // param sends — must land on compact, not on the raw payload.
  it('projects to compact when no view is passed at all', () => {
    const text = textOf(viewResponse(undefined, searchEnvelope, 'list'));
    expect(text).toContain('"name":"Golden Gate Bridge"');
    expect(text).toContain('"rating":4.7');
    // The verbose upstream nesting the projection replaces is gone.
    expect(text).not.toContain('traveler_ratings');
    expect(text).not.toContain('matched_value');
  });

  it('routes each named projector to its own shape', () => {
    // `list` unwraps `{location}` rows and keeps `pagination`…
    const list = JSON.parse(textOf(viewResponse('compact', searchEnvelope, 'list')));
    expect(list.data[0].id).toBe(104675);
    expect(list.pagination).toEqual(searchEnvelope.pagination);
    // …while `locationList` treats the rows AS locations. Passing one envelope
    // to the other projector hits the drift-fallback and returns raw, so the
    // two are not interchangeable and each needs its own assertion.
    const batch = JSON.parse(textOf(viewResponse('compact', batchEnvelope, 'locationList')));
    expect(batch.data).toEqual([{ id: 1, name: 'A', rating: 4, review_count: 2 }]);
  });

  // The `stripMediaUrls` fallback — the rung for a payload with no projection to
  // speak for it, which in this server is the reviews endpoint. This case exists
  // because the fallback was unreachable dead code for the whole of PR #75: both
  // projection-free tools (reviews, photos) shipped without a `view` param, so
  // nothing ever called `viewResponse` with no projector.
  it('media-strips a payload that has no projector', () => {
    const reviews = {
      data: [
        {
          id: 9,
          title: 'Worth the walk',
          text: 'Windy but spectacular.',
          rating: 5,
          user: { username: 'traveler42', avatar: { large: 'https://x/a.jpg' }, user_location: { name: 'Boston' } },
          photo: 'https://x/review.jpg',
        },
      ],
      pagination: { page: 1 },
    };
    const out = JSON.parse(textOf(viewResponse('compact', reviews)));
    // The review — the thing the caller actually asked for — survives whole.
    expect(out.data[0].text).toBe('Windy but spectacular.');
    expect(out.data[0].rating).toBe(5);
    expect(out.data[0].user.username).toBe('traveler42');
    expect(out.pagination).toEqual({ page: 1 });
    // The incidental image URLs a model can neither see nor fetch do not.
    expect(out.data[0].user).not.toHaveProperty('avatar');
    expect(out.data[0]).not.toHaveProperty('photo');
    // A nested non-media field under a kept key is untouched, so stripping is a
    // subtraction and not a reshaping.
    expect(out.data[0].user.user_location).toEqual({ name: 'Boston' });
  });

  it('returns the untouched upstream payload on "full", projector or not', () => {
    // `full` must mean full on BOTH paths — the projected one…
    expect(JSON.parse(textOf(viewResponse('full', searchEnvelope, 'list')))).toEqual(searchEnvelope);
    // …and the media-stripped one, which is the rung a caller reaches for when
    // they DO want the image URLs back.
    const photos = { data: [{ id: 1, photo: { original_size_url: 'https://x/p.jpg' } }] };
    expect(JSON.parse(textOf(viewResponse('full', photos)))).toEqual(photos);
  });

  // Fails toward the CHEAP answer rather than throwing: the zod enum has already
  // rejected anything unhonoured, so reaching here at all means something odd,
  // and a small correct response beats an error.
  it('falls back to compact when handed a rung this server does not honour', () => {
    expect(textOf(viewResponse('raw', batchEnvelope, 'locationList'))).toBe(
      textOf(viewResponse('compact', batchEnvelope, 'locationList')),
    );
  });

  // Whitespace is a TRANSPORT concern; it is not the caller's data. Minifying
  // the envelope must never reach inside a value — a review body's paragraph
  // breaks are part of what the reviewer wrote, and a response that silently
  // reflowed them would misquote a source.
  it('minifies the envelope while leaving whitespace INSIDE a value byte-identical', () => {
    const body = 'First paragraph.\n\n  Second, indented.\n\tTabbed.';
    const raw = { data: [{ id: 1, text: body }] };
    const text = textOf(viewResponse('compact', raw));
    // Round-trips to the exact same bytes — no trimming, no collapsing.
    expect(JSON.parse(text).data[0].text).toBe(body);
    // And the wire form is a single physical line: those newlines are escaped
    // as `\n` INSIDE the string literal, never emitted raw. A tool result that
    // spans lines is one a lossy reader can truncate mid-record.
    expect(text).not.toMatch(/[\n\r]/);
    expect(text).toContain(String.raw`\n\n  Second, indented.`);
  });

  it('emits no pretty-printing whitespace between keys on either rung', () => {
    for (const rung of TA_VIEWS) {
      const text = textOf(viewResponse(rung, batchEnvelope, 'locationList'));
      expect(text).not.toContain(', ');
      expect(text).not.toContain('": ');
      expect(text.split('\n')).toHaveLength(1);
    }
  });
});
