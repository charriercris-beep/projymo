export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  });
}
