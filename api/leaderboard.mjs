import { getLeaderboard } from './_db.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  try {
    const rows = await getLeaderboard();
    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
    return res.status(200).json({ rows });
  } catch (error) {
    console.error('leaderboard error', error);
    return res.status(error.status || 500).json({ error: 'server_not_configured' });
  }
}
