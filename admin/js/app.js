(function () {
  const { el, api, toast, modal, confirm, field, badge, fmtDate, table, empty, spinner, yesNo } = VT;
  const PLANS = ['STARTER', 'BUSINESS', 'ENTERPRISE'];
  const NAV = [['dashboard', '\u25A6', 'Dashboard'], ['clients', '\uD83D\uDC65', 'Clients'], ['licenses', '\uD83D\uDD11', 'API Keys'], ['domains', '\uD83C\uDF10', 'Domains'], ['settings', '\u2699', 'Settings']];
  let me = null;

  const content = el('main', { class: 'main' });
  const side = el('aside', { class: 'side' });

  function shell() {
    const app = document.getElementById('app');
    app.replaceChildren(el('div', { class: 'shell' }, side, content));
    renderSide();
  }
  function renderSide() {
    const cur = (location.hash.replace(/^#\//, '').split('/')[0]) || 'dashboard';
    side.replaceChildren(
      el('div', { class: 'brand' }, el('div', { class: 'logo' }, '\uD83D\uDC55'), 'Try-On Admin'),
      ...NAV.map(([id, ic, label]) => el('a', { class: 'nav' + (cur === id ? ' on' : ''), href: '#/' + id, onclick: () => side.classList.remove('open') }, el('span', null, ic), label)),
      el('div', { class: 'grow' }),
      el('div', { class: 'small', style: { padding: '0 12px', color: '#8e93b8' } }, me.email),
      el('button', { class: 'nav', onclick: VT.logout }, el('span', null, '\u21AA'), 'Logout'));
  }
  const topbar = (title) => el('div', { class: 'topbar' }, el('button', { class: 'burger', 'aria-label': 'Menu', onclick: () => side.classList.toggle('open') }, '\u2630'), el('strong', null, title));
  const head = (title, ...actions) => [topbar(title), el('div', { class: 'page-head' }, el('h1', null, title), el('div', { class: 'actions' }, actions))];

  // ---- license actions (shared by Clients, Licenses and Client detail) ----
  async function extendDialog(l) {
    const run = (days) => async () => { await api('POST', `/admin/licenses/${l.id}/extend`, { days }); toast(`Extended by ${days} days`, 'ok'); };
    const body = el('div', null, el('p', { class: 'muted' }, `Current expiry: ${fmtDate(l.expiry_date)}`),
      el('div', { class: 'actions' }, [[30, '+30 DAYS'], [90, '+90 DAYS'], [365, '+1 YEAR']].map(([d, t]) => el('button', { class: 'btn primary', onclick: async (e) => { e.target.disabled = true; try { await run(d)(); e.target.closest('.overlay').remove(); route(); } catch (x) { toast(x.message, 'err'); e.target.disabled = false; } } }, t))));
    await modal('Extend access', body, [{ label: 'Close', value: false }], l.license_key);
  }
  async function licenseAction(l, action) {
    if (action === 'disable' && !(await confirm('Disable API key?', `Virtual Try-On will stop working for ${l.company_name || 'this client'} on all their websites until you enable it again.`, { confirmText: 'Disable', danger: true }))) return;
    if (action === 'suspend' && !(await confirm('Suspend Try-On?', 'Try-On stops working until the license is reactivated.', { confirmText: 'Suspend', danger: true }))) return;
    try { await api('POST', `/admin/licenses/${l.id}/${action}`); toast(action === 'enable' ? 'API key enabled' : 'API key disabled', 'ok'); route(); } catch (e) { toast(e.message, 'err'); }
  }
  function statusButtons(l, withExtend = true) {
    const s = l.effective_status, out = [];
    if (s === 'ACTIVE' || s === 'EXPIRED') out.push(el('button', { class: 'btn danger sm', onclick: () => licenseAction(l, 'disable') }, 'Disable'));
    else out.push(el('button', { class: 'btn good sm', onclick: () => licenseAction(l, 'enable') }, 'Enable'));
    if (withExtend) out.push(el('button', { class: 'btn sm', onclick: () => extendDialog(l) }, 'Extend'));
    return out;
  }

  // ---- API key helpers ----
  let sdkUrl = null;
  async function getSdkUrl() { if (!sdkUrl) sdkUrl = (await api('GET', '/admin/config')).sdkUrl; return sdkUrl; }
  const snippetFor = (url, key) => `<script src="${url}" data-api-key="${key}" defer></script>`;
  const keyBox = (key) => el('div', { class: 'keybox' }, el('code', { class: 'mono' }, key), el('button', { class: 'btn sm', type: 'button', onclick: () => VT.copy(key) }, 'Copy key'));
  async function showKeyDialog(title, key) {
    const url = await getSdkUrl(), snip = snippetFor(url, key);
    await modal(title, el('div', null,
      el('p', { class: 'muted' }, 'API key'), keyBox(key),
      el('p', { class: 'muted', style: { marginTop: '14px' } }, 'Give the client this one line. They paste it before </body> on their site; a Virtual Try-On button then appears on every product page automatically.'),
      el('pre', { class: 'snippet' }, snip),
      el('button', { class: 'btn primary sm', type: 'button', onclick: () => VT.copy(snip) }, 'Copy embed code')), [{ label: 'Done', kind: 'primary', value: true }]);
  }
  async function regenerateKey(l) {
    if (!(await confirm('Regenerate API key?', 'The current key stops working immediately. The client must replace it on their website with the new one.', { confirmText: 'Regenerate', danger: true }))) return;
    try { const r = await api('POST', `/admin/licenses/${l.id}/regenerate-key`); await showKeyDialog('New API key', r.license.license_key); route(); } catch (e) { toast(e.message, 'err'); }
  }

  // ---- dashboard ----
  async function dashboard() {
    content.replaceChildren(...head('Dashboard'), spinner());
    const s = await api('GET', '/admin/stats');
    const card = (label, n) => el('div', { class: 'card stat' }, el('div', { class: 'muted small' }, label), el('div', { class: 'n' }, n));
    content.replaceChildren(...head('Dashboard'),
      el('div', { class: 'grid stats' }, card('Total Clients', s.clients), card('Active API Keys', s.active), card('Disabled API Keys', s.disabled + s.suspended), card('Expired API Keys', s.expired)),
      el('div', { class: 'card' }, el('h2', { style: { marginBottom: '10px' } }, 'API keys expiring within 30 days'),
        s.expiringSoon.length ? table(['Client', 'API key', 'Plan', 'Expiry', ''], s.expiringSoon.map((l) => [l.company_name, el('span', { class: 'mono' }, l.license_key), l.plan, fmtDate(l.expiry_date), el('button', { class: 'btn sm', onclick: () => extendDialog(l) }, 'Extend')])) : empty('\u2705', 'No licenses expiring soon.')));
  }

  // ---- clients ----
  async function newClientDialog() {
    const i = {
      name: el('input', { required: true, maxlength: 100 }), email: el('input', { type: 'email', required: true }), company: el('input', { required: true, maxlength: 150 }),
      phone: el('input', { maxlength: 30 }),
      plan: el('select', { value: 'BUSINESS' }, PLANS.map((p) => el('option', { value: p }, p))), expiry: el('input', { type: 'date', value: VT.todayPlus(30) }), domain: el('input', { placeholder: 'abcfashion.com' }),
    };
    const body = el('div', null, field('Contact name', i.name), field('Email', i.email), field('Company', i.company), field('Phone (optional)', i.phone),
      el('div', { class: 'row2' }, field('Plan', i.plan), field('Expiry', i.expiry)), field('Client website domain', i.domain));
    let newKey = null;
    const done = await modal('New client', body, [{ label: 'Cancel', value: false }, { label: 'Create client + API key', kind: 'primary', action: async () => {
      const c = await api('POST', '/admin/clients', { name: i.name.value, email: i.email.value, company_name: i.company.value, phone: i.phone.value });
      const lr = await api('POST', '/admin/licenses', { client_id: c.client_id, plan: i.plan.value, expiry_date: i.expiry.value });
      newKey = lr.license.license_key;
      if (i.domain.value.trim()) await api('POST', `/admin/clients/${c.client_id}/domains`, { domain: i.domain.value });
      toast('Client created', 'ok');
    } }]);
    if (done && newKey) await showKeyDialog('API key generated', newKey);
    if (done) route();
  }
  async function clients() {
    content.replaceChildren(...head('Clients'), spinner());
    const { clients: list } = await api('GET', '/admin/clients');
    const rows = list.map((c) => {
      const l = c.license;
      return [
        el('div', null, el('strong', null, c.company_name), el('div', { class: 'muted small' }, c.email)),
        c.domains.length ? c.domains.map((d) => el('div', { class: 'small' }, d.domain)) : '-',
        l ? l.plan : '-', l ? el('span', { class: 'mono small' }, l.license_key) : '-',
        l ? badge(l.effective_status) : el('span', { class: 'muted' }, 'No API key'), l ? fmtDate(l.expiry_date) : '-',
        el('div', { class: 'actions' }, el('a', { class: 'btn sm', href: '#/clients/' + c.id }, 'View'), l ? statusButtons({ ...l, company_name: c.company_name }) : null),
      ];
    });
    content.replaceChildren(...head('Clients', el('button', { class: 'btn primary', onclick: newClientDialog }, '+ New client')),
      el('div', { class: 'card' }, rows.length ? table(['Client', 'Domain', 'Plan', 'API key', 'Status', 'Expiry', 'Actions'], rows) : empty('\uD83D\uDC65', 'No clients yet. Create your first client.')));
  }

  async function createLicenseDialog(clientId) {
    const plan = el('select', null, PLANS.map((p) => el('option', { value: p }, p))), exp = el('input', { type: 'date', value: VT.todayPlus(30) });
    const ok = await modal('Generate API key', el('div', null, field('Plan', plan), field('Expiry date', exp)), [{ label: 'Cancel', value: false }, { label: 'Create', kind: 'primary', action: async () => { await api('POST', '/admin/licenses', { client_id: clientId, plan: plan.value, expiry_date: exp.value }); toast('API key generated', 'ok'); } }]);
    if (ok) route();
  }
  async function addDomainDialog(clientId) {
    const d = el('input', { placeholder: 'shop.example.com' });
    const ok = await modal('Add allowed domain', field('Domain', d), [{ label: 'Cancel', value: false }, { label: 'Add', kind: 'primary', action: async () => { await api('POST', `/admin/clients/${clientId}/domains`, { domain: d.value }); toast('Domain added', 'ok'); } }]);
    if (ok) route();
  }
  async function domainRow(d, withClient) {
    return [withClient ? d.company_name : null, d.domain, yesNo(d.verified, 'Verified', 'Pending'),
      el('div', { class: 'actions' },
        el('button', { class: 'btn sm', onclick: async () => { try { await api('PATCH', '/admin/domains/' + d.id, { verified: !d.verified }); route(); } catch (e) { toast(e.message, 'err'); } } }, d.verified ? 'Unverify' : 'Verify'),
        el('button', { class: 'btn sm danger', onclick: async () => { if (await confirm('Remove domain?', d.domain, { confirmText: 'Remove', danger: true })) { try { await api('DELETE', '/admin/domains/' + d.id); route(); } catch (e) { toast(e.message, 'err'); } } } }, 'Remove'))].filter((x) => x !== null);
  }
  
  async function clientDetail(id) {
    content.replaceChildren(...head('Client'), spinner());
    const d = await api('GET', '/admin/clients/' + id);
    const c = d.client, l = d.licenses[0] ? { ...d.licenses[0], company_name: c.company_name } : null;
    const info = el('div', { class: 'card' }, el('h2', { style: { marginBottom: '12px' } }, c.company_name),
      el('dl', { class: 'kv', style: { margin: 0 } }, el('dt', null, 'Contact'), el('dd', null, c.name), el('dt', null, 'Email'), el('dd', null, c.email), el('dt', null, 'Phone'), el('dd', null, c.phone || '-')));
    let licCard;
    if (!l) licCard = el('div', { class: 'card' }, el('h2', null, 'API key'), empty('\uD83D\uDD11', 'No API key yet.'), el('div', { class: 'actions', style: { justifyContent: 'center' } }, el('button', { class: 'btn primary', onclick: () => createLicenseDialog(c.id) }, 'Generate API key')));
    else {
      const s = l.effective_status;
      const plan = el('select', { value: l.plan }, PLANS.map((p) => el('option', { value: p }, p)));
      const start = el('input', { type: 'date', value: l.start_date }), exp = el('input', { type: 'date', value: l.expiry_date });
      const big = (label, kind, a) => el('button', { class: 'btn ' + kind, onclick: () => licenseAction(l, a) }, label);
      const ext = (label, days) => el('button', { class: 'btn', onclick: async () => { try { await api('POST', `/admin/licenses/${l.id}/extend`, { days }); toast('Extended', 'ok'); route(); } catch (e) { toast(e.message, 'err'); } } }, label);
      const snip = snippetFor(await getSdkUrl(), l.license_key);
      licCard = el('div', { class: 'card' }, el('h2', { style: { marginBottom: '12px' } }, 'API key'),
        el('div', { class: 'bigstatus' }, badge(s), el('span', { class: 'muted' }, `Expires ${fmtDate(l.expiry_date)}`)),
        keyBox(l.license_key),
        el('div', { class: 'actions', style: { marginTop: '12px' } },
          (s === 'ACTIVE' || s === 'EXPIRED') ? big('DISABLE', 'danger', 'disable') : big('ENABLE', 'good', 'enable'),
          el('button', { class: 'btn', onclick: () => regenerateKey(l) }, 'Regenerate key'),
          ext('+30 DAYS', 30), ext('+90 DAYS', 90), ext('+1 YEAR', 365)),
        el('p', { class: 'muted small', style: { marginBottom: '4px' } }, 'Embed code for the client website'),
        el('pre', { class: 'snippet' }, snip),
        el('button', { class: 'btn sm', onclick: () => VT.copy(snip) }, 'Copy embed code'),
        el('div', { class: 'row2', style: { marginTop: '12px' } }, field('Plan', plan), field('Start date', start)), field('Expiry date', exp),
        el('button', { class: 'btn primary', style: { marginTop: '12px' }, onclick: async () => { try { await api('PATCH', '/admin/licenses/' + l.id, { plan: plan.value, start_date: start.value, expiry_date: exp.value }); toast('Saved', 'ok'); route(); } catch (e) { toast(e.message, 'err'); } } }, 'Save changes'));
    }
    const doms = await Promise.all(d.domains.map((x) => domainRow(x, false)));
    content.replaceChildren(...head(c.company_name, el('a', { class: 'btn', href: '#/clients' }, '\u2190 Back')), el('div', { class: 'grid two' }, info, licCard),
      el('div', { class: 'card' }, el('div', { class: 'page-head', style: { marginBottom: '8px' } }, el('h2', null, 'Allowed domains'), el('button', { class: 'btn sm primary', onclick: () => addDomainDialog(c.id) }, '+ Add domain')),
        doms.length ? table(['Domain', 'Status', 'Actions'], doms) : empty('\uD83C\uDF10', 'No domains. Try-On will not work until a verified domain is added.')),
      el('div', { class: 'card' }, el('h2', null, 'Danger zone'), el('p', { class: 'muted small' }, 'Deleting a client removes the API key and domains permanently.'),
        el('button', { class: 'btn danger', onclick: async () => { if (await confirm('Delete client?', c.company_name + ' will be removed permanently and Try-On stops working on their site.', { confirmText: 'Delete', danger: true })) { try { await api('DELETE', '/admin/clients/' + c.id); location.hash = '#/clients'; } catch (e) { toast(e.message, 'err'); } } } }, 'Delete client')));
  }

  // ---- licenses / domains / products ----
  async function licenses() {
    content.replaceChildren(...head('API Keys'), spinner());
    const { licenses: list } = await api('GET', '/admin/licenses');
    content.replaceChildren(...head('API Keys'), el('div', { class: 'card' }, list.length ? table(['Client', 'API key', 'Plan', 'Status', 'Start', 'Expiry', 'Domains', 'Actions'],
      list.map((l) => [l.company_name, el('span', { class: 'mono small' }, l.license_key), l.plan, badge(l.effective_status), fmtDate(l.start_date), fmtDate(l.expiry_date), l.domains.map((d) => d.domain).join(', ') || '-', el('div', { class: 'actions' }, el('a', { class: 'btn sm', href: '#/clients/' + l.client_id }, 'View'), statusButtons(l))])) : empty('\uD83D\uDD11', 'No API keys yet.')));
  }
  async function domains() {
    content.replaceChildren(...head('Domains'), spinner());
    const [{ domains: list }, { clients: cl }] = await Promise.all([api('GET', '/admin/domains'), api('GET', '/admin/clients')]);
    const add = async () => {
      const sel = el('select', null, cl.map((c) => el('option', { value: c.id }, c.company_name))), dom = el('input', { placeholder: 'shop.example.com' });
      const ok = await modal('Add allowed domain', el('div', null, field('Client', sel), field('Domain', dom)), [{ label: 'Cancel', value: false }, { label: 'Add', kind: 'primary', action: async () => { await api('POST', `/admin/clients/${sel.value}/domains`, { domain: dom.value }); toast('Domain added', 'ok'); } }]);
      if (ok) route();
    };
    const rows = await Promise.all(list.map((d) => domainRow(d, true)));
    content.replaceChildren(...head('Domains', cl.length ? el('button', { class: 'btn primary', onclick: add }, '+ Add domain') : null),
      el('div', { class: 'card' }, el('p', { class: 'muted small', style: { marginTop: 0 } }, 'Try-On only works on the websites listed here for each client.'), rows.length ? table(['Client', 'Domain', 'Status', 'Actions'], rows) : empty('\uD83C\uDF10', 'No domains yet.')));
  }
  async function settings() {
    const cur = el('input', { type: 'password', autocomplete: 'current-password' }), nw = el('input', { type: 'password', autocomplete: 'new-password' });
    content.replaceChildren(...head('Settings'), el('div', { class: 'card', style: { maxWidth: '460px' } }, el('h2', null, 'Account'), el('p', { class: 'muted' }, me.email),
      field('Current password', cur), field('New password (8+ characters)', nw),
      el('button', { class: 'btn primary', style: { marginTop: '14px' }, onclick: async () => { try { await api('POST', '/auth/change-password', { current_password: cur.value, new_password: nw.value }); toast('Password changed', 'ok'); cur.value = nw.value = ''; } catch (e) { toast(e.message, 'err'); } } }, 'Change password')));
  }

  const routes = { dashboard, clients, licenses, domains, settings };
  async function route() {
    renderSide();
    const [name, arg] = (location.hash.replace(/^#\//, '') || 'dashboard').split('/');
    try {
      if (name === 'clients' && arg) await clientDetail(Number(arg));
      else await (routes[name] || dashboard)();
    } catch (e) { content.replaceChildren(el('div', { class: 'card' }, empty('\u26A0\uFE0F', e.message))); }
  }

  (async function boot() {
    try {
      me = (await api('GET', '/auth/me')).user;
      if (me.role !== 'ADMIN') throw new Error('not admin');
    } catch (e) { location.href = 'login.html'; return; }
    shell();
    window.addEventListener('hashchange', route);
    route();
  })();
})();
