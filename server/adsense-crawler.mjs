/**
 * Detection of the Google crawlers that must be able to read this site.
 *
 * Two families matter for AdSense:
 *
 *   - AdSense crawlers (`Mediapartners-Google`, `Google-Display-Ads-Bot`,
 *     `AdsBot-Google`, `AdsBot-Google-Mobile`) visit pages that carry ad tags
 *     so Google can match ads to the page content. If they cannot read the
 *     page, no ad is ever served for it.
 *   - `Googlebot` indexes the site for search. It is listed here so the same
 *     module can reason about both, and so the crawler-facing policy (robots
 *     rules, response headers) stays in one place.
 *
 * These crawlers are "special-case" crawlers: Google documents that they ignore
 * the global `User-agent: *` robots.txt group and only honour rules addressed to
 * their own token. robots.txt therefore keeps an explicit `Allow: /` group per
 * token so the intent survives a future `Disallow` added to the `*` group.
 *
 * Source: https://developers.google.com/crawling/docs/crawlers-fetchers/google-special-case-crawlers
 *         https://support.google.com/adsense/answer/99376
 */

/** robots.txt tokens for the ad crawlers, in match order. */
export const ADSENSE_CRAWLER_TOKENS = [
  'Mediapartners-Google',
  'Google-Display-Ads-Bot',
  'AdsBot-Google-Mobile',
  'AdsBot-Google'
];

/** robots.txt tokens for the search/inspection crawlers. */
export const GOOGLE_CRAWLER_TOKENS = [
  'Googlebot',
  'GoogleOther',
  'Google-InspectionTool',
  'Storebot-Google'
];

export const ALL_GOOGLE_CRAWLER_TOKENS = [...ADSENSE_CRAWLER_TOKENS, ...GOOGLE_CRAWLER_TOKENS];

/**
 * Tokens that get an explicit `Allow: /` group in robots.txt.
 *
 * Only automatic crawlers belong here. `Google-InspectionTool` and
 * `GoogleOther` are excluded on purpose: URL Inspection is triggered by a
 * human from Search Console, and GoogleOther is not a general crawler, so
 * neither needs a robots.txt group.
 */
export const ROBOTS_ALLOWED_TOKENS = [...ADSENSE_CRAWLER_TOKENS, 'Googlebot'];

/**
 * True when the user agent belongs to a Google ad crawler.
 * Substring matching is deliberate: the mobile agent is reported as
 * "AdsBot-Google-Mobile; +http://..." and the desktop agent as
 * "Mediapartners-Google/2.1; +http://...".
 */
export function isAdsenseCrawler(userAgent) {
  const ua = String(userAgent || '');
  return ADSENSE_CRAWLER_TOKENS.some((token) => ua.includes(token));
}

/** True when the user agent belongs to a Google search or inspection crawler. */
export function isGoogleCrawler(userAgent) {
  const ua = String(userAgent || '');
  if (isAdsenseCrawler(ua)) return false;
  return GOOGLE_CRAWLER_TOKENS.some((token) => ua.includes(token));
}

/**
 * Classify a user agent.
 * @returns {'adsense'|'google'|null}
 */
export function crawlerKind(userAgent) {
  if (isAdsenseCrawler(userAgent)) return 'adsense';
  if (isGoogleCrawler(userAgent)) return 'google';
  return null;
}

/**
 * Express middleware that marks Google crawler requests.
 *
 * It does not change the response body; it tags the request and adds a
 * response header so logs and downstream handlers can tell crawler traffic
 * apart from human traffic.
 */
export function adsenseCrawlerMiddleware(req, res, next) {
  const kind = crawlerKind(req.headers?.['user-agent']);
  if (kind) {
    req.skyCrawler = kind;
    res.setHeader('X-Sky-Crawler', kind);
  }
  next();
}
