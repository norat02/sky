const COUNTRY_TO_LOCALE = new Map([
  ['VN', 'vi'],
  ['JP', 'ja'],
]);

export default function handler(req, res) {
  const country = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  const locale = COUNTRY_TO_LOCALE.get(country) || 'en';
  res.status(200).setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600').json({ country: country || null, locale });
}
