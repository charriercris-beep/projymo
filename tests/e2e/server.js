// Serveur de test : fichiers statiques du projet + /api/config + /__db (requêtes exécutées sur
// PostgreSQL local sous l'identité de l'utilisateur, avec les politiques RLS réelles).
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '../..'), PGHOST = process.argv[2], PORT = 8125;
const TABLES = new Set(['records', 'professionnels', 'options_annonce', 'abonnements', 'parametres', 'evenements']);
const IDENT = /^[a-z_]+$/;
const lit = v => v === null || v === undefined ? 'null' : "'" + (typeof v === 'object' ? JSON.stringify(v) : String(v)).replace(/'/g, "''") + "'";

function sqlFor(q) {
  // Appel de fonction (supabase.rpc) : fonctions du back office et lecture des paramètres uniquement
  if (q.op === 'rpc') {
    if (!/^(admin_[a-z_]+|presence_ping)$/.test(q.fn || '')) throw new Error('fonction non autorisée');
    const args = Object.entries(q.args || {}).map(([k, v]) => { if (!IDENT.test(k)) throw new Error('argument'); return `${k} => ${lit(v)}`; }).join(', ');
    return `select coalesce(public.${q.fn}(${args})::text, 'null');`;
  }
  if (!TABLES.has(q.table)) throw new Error('table inconnue');
  const t = 'public.' + q.table;
  const where = (q.filters || []).map(([c, v]) => { if (!IDENT.test(c)) throw new Error('colonne'); return `${c} = ${lit(v)}`; }).join(' and ') || 'true';
  if (q.op === 'select') return `select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select * from ${t} where ${where}) x;`;
  if (q.op === 'delete') return `delete from ${t} where ${where}; select '[]';`;
  if (q.op === 'update') {
    const cols = Object.keys(q.patch); cols.forEach(c => { if (!IDENT.test(c)) throw new Error('colonne'); });
    return `update ${t} set ${cols.map(c => `${c} = (jsonb_populate_record(null::${t}, ${lit(JSON.stringify(q.patch))}::jsonb)).${c}`).join(', ')} where ${where}; select '[]';`;
  }
  if (q.op === 'upsert' || q.op === 'insert') {
    const rows = Array.isArray(q.rows) ? q.rows : [q.rows];
    const cols = [...new Set(rows.flatMap(Object.keys))]; cols.forEach(c => { if (!IDENT.test(c)) throw new Error('colonne'); });
    let s = `insert into ${t} (${cols.join(',')}) select ${cols.join(',')} from jsonb_populate_recordset(null::${t}, ${lit(JSON.stringify(rows))}::jsonb)`;
    if (q.op === 'upsert') {
      const conflict = (q.onConflict || '').split(',').map(x => x.trim()).filter(Boolean); conflict.forEach(c => { if (!IDENT.test(c)) throw new Error('colonne'); });
      const upd = cols.filter(c => !conflict.includes(c));
      s += ` on conflict (${conflict.join(',')}) do ${upd.length ? 'update set ' + upd.map(c => `${c} = excluded.${c}`).join(', ') : 'nothing'}`;
    }
    return s + `; select '[]';`;
  }
  throw new Error('opération inconnue');
}
function run(q) {
  const uid = q.uid && /^[0-9a-f-]{36}$/.test(q.uid) ? q.uid : null;
  const pre = uid ? `set local role authenticated; select set_config('request.jwt.claim.sub', ${lit(uid)}, true), set_config('request.jwt.claim.role', 'authenticated', true);` : `set local role anon;`;
  const sql = `begin; ${pre} ${sqlFor(q)} commit;`;
  try {
    const out = execFileSync('psql', ['-h', PGHOST, '-p', '54329', '-U', 'postgres', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = out.trim().split('\n').filter(l => l && !/^\d+\|/.test(l) && l !== '|authenticated' && !l.startsWith(uid || '§'));
    return { data: JSON.parse(lines[lines.length - 1] || '[]'), error: null };
  } catch (e) { return { data: null, error: { message: String(e.stderr || e.message).replace(/^psql:[^:]*:\d+: /gm, '').trim().split('\n')[0] } }; }
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };
http.createServer((req, res) => {
  if (req.url === '/api/config') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ supabaseUrl: 'http://localhost:' + PORT, supabaseKey: 'cle-anon-de-test' })); }
  if (req.url === '/__db' && req.method === 'POST') {
    let b = ''; req.on('data', c => b += c); req.on('end', () => { let r; try { r = run(JSON.parse(b)); } catch (e) { r = { data: null, error: { message: e.message } }; } res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(r)); });
    return;
  }
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log('serveur de test sur', PORT));
