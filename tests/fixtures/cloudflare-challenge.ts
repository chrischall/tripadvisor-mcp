/**
 * Real-shape Cloudflare JS-challenge interstitial ("Just a moment…"), as
 * Cloudflare serves it (403/503, sometimes 200) in place of the page asked
 * for — trimmed, but keeping the two definitive markers: the
 * `<title>Just a moment...</title>` element and the `_cf_chl_opt`
 * challenge-options bootstrap. Distinct from the "Attention Required!" block
 * page (fleet-audit #1182).
 */
export const CLOUDFLARE_JS_CHALLENGE_HTML = `<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}html{line-height:1.15}</style><meta http-equiv="refresh" content="390"></head><body class="no-js"><div class="main-wrapper" role="main"><div class="main-content"><noscript><div class="h2"><span id="challenge-error-text">Enable JavaScript and cookies to continue</span></div></noscript></div></div><script>(function(){window._cf_chl_opt={cvId: '3',cZone: "www.tripadvisor.com",cType: 'managed',cRay: '8c1f2a3b4d5e6f70',cH: 'dGhpcy1pcy1hLWZpeHR1cmU',cUPMDTk: "\\/Attraction_Review-g60713-d104675-Reviews.html?__cf_chl_tk=fixture",cFPWv: 'g',cITimeS: '1728460800',cTTimeMs: '1000',cMTimeMs: '390000',cTplC: 0,cTplV: 5,cTplB: 'cf',cK: "",fa: "\\/Attraction_Review-g60713-d104675-Reviews.html?__cf_chl_f_tk=fixture",md: "fixture",mdrd: "fixture"};var cpo = document.createElement('script');cpo.src = '/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1?ray=8c1f2a3b4d5e6f70';window._cf_chl_opt.cOgUHash = location.hash === '' && location.href.indexOf('#') !== -1 ? '#' : location.hash;document.getElementsByTagName('head')[0].appendChild(cpo);}());</script></body></html>`;

/**
 * A normal content page that merely MENTIONS Cloudflare's challenge host
 * (e.g. an embedded Turnstile widget on a form) — must not be classified as a
 * bot wall.
 */
export const PAGE_MENTIONING_CHALLENGE_HOST_HTML = `<!DOCTYPE html><html><head><title>Golden Gate Bridge - San Francisco - Tripadvisor</title><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script></head><body><h1>Golden Gate Bridge</h1><p>Just a moment of your time: write a review.</p><form><div class="cf-turnstile" data-sitekey="0x4AAAAAAAfixture"></div></form></body></html>`;
