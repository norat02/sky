# OG and PageSpeed findings

Repository audit on 2026-08-29:

- `index.html` has `og:type`, `og:title`, `og:description`, and `og:url`, plus Twitter `summary` card.
- It does not currently define `og:image`, `og:image:secure_url`, `og:image:type`, `og:image:width`, `og:image:height`, or `og:image:alt`.
- There is no thumbnail asset in the repository, so Facebook/X cannot show a guaranteed custom game thumbnail. They may fall back to another page image or no image.
- Canonical/OG URL defaults to the old GitHub Pages URL and is updated at runtime from `PUBLIC_SITE_URL`; static crawlers/social scrapers may still see the initial HTML before JavaScript runs. The build generates robots/sitemap from `PUBLIC_SITE_URL`.
- Google Search Central states good Core Web Vitals targets are LCP <= 2.5s, INP < 200ms, and CLS < 0.1.
- Current page loads AdSense, Google Fonts, dynamic Supabase module from esm.sh, and a large inline game script. These are likely optimization targets; the canvas itself is not an image LCP by default.

Sources:
- https://ogp.me/
- https://developers.google.com/search/docs/appearance/core-web-vitals
