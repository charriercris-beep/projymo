// Faux client Supabase pour les tests : reproduit le sous-ensemble de l'API supabase-js v2
// utilisé par l'application (auth.getSession / signInWithPassword / signOut, from().select/insert/
// upsert/update/delete + eq). Les requêtes partent vers /__db et s'exécutent sur PostgreSQL avec RLS.
(function () {
  const USERS = JSON.parse(sessionStorage.getItem('__users') || '{}'); // email → { id, password, nom, profil }
  let session = JSON.parse(sessionStorage.getItem('__session') || 'null');
  const persist = () => sessionStorage.setItem('__session', JSON.stringify(session));
  function builder(table) {
    const q = { table, filters: [] };
    const api = {
      select(cols) { if (!q.op) q.op = 'select'; return api; },
      insert(rows) { q.op = 'insert'; q.rows = rows; return api; },
      upsert(rows, opts) { q.op = 'upsert'; q.rows = rows; q.onConflict = opts && opts.onConflict; return api; },
      update(patch) { q.op = 'update'; q.patch = patch; return api; },
      delete() { q.op = 'delete'; return api; },
      eq(col, val) { q.filters.push([col, val]); return api; },
      order() { return api; }, limit() { return api; },
      then(ok, ko) {
        q.uid = session ? session.user.id : null;
        window.__dbLog = (window.__dbLog || []).concat([{ op: q.op, table: q.table }]);
        return fetch('/__db', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q) }).then(r => r.json()).then(ok, ko);
      }
    };
    return api;
  }
  window.supabase = {
    createClient() {
      return {
        from: builder,
        auth: {
          async getSession() { return { data: { session }, error: null }; },
          async signInWithPassword({ email, password }) {
            const u = USERS[email];
            if (!u || u.password !== password) return { data: {}, error: { message: 'Invalid login credentials' } };
            session = { access_token: 'test', user: { id: u.id, email, user_metadata: { nom: u.nom, profil: u.profil } } }; persist();
            return { data: { user: session.user, session }, error: null };
          },
          async signUp() { return { data: {}, error: { message: 'signUp non simulé' } }; },
          async signOut() { session = null; persist(); return { error: null }; }
        }
      };
    }
  };
})();
