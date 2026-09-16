// Progressive enhancement only. Every page is readable with this file missing.
(() => {
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ── Theme ──────────────────────────────────────────────────────────
  const root = document.documentElement;
  $$('[data-theme-toggle]').forEach((btn) => btn.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try { localStorage.setItem('or-theme', next); } catch { /* private mode */ }
  }));

  // ── Copy ───────────────────────────────────────────────────────────
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    try { await navigator.clipboard.writeText(btn.dataset.copy); } catch { return; }
    const was = btn.textContent;
    btn.textContent = btn.classList.contains('m-id') ? 'copied' : 'Copied';
    btn.classList.add('done');
    setTimeout(() => { btn.textContent = was; btn.classList.remove('done'); }, 1300);
  });

  // ── Code tabs ──────────────────────────────────────────────────────
  $$('[data-tabs]').forEach((box) => {
    const tabs = $$('.tab', box), panes = $$('pre', box), copy = box.querySelector('.copy');
    tabs.forEach((tab) => tab.addEventListener('click', () => {
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      panes.forEach((p) => { p.hidden = p.dataset.i !== tab.dataset.i; });
      const active = panes.find((p) => !p.hidden);
      if (copy && active) copy.dataset.copy = active.textContent;
    }));
  });

  // ── Mobile rail ────────────────────────────────────────────────────
  $$('[data-rail]').forEach((btn) => btn.addEventListener('click', () => {
    document.body.classList.toggle('rail-open');
  }));
  $$('.rail a').forEach((a) => a.addEventListener('click', () => {
    document.body.classList.remove('rail-open');
  }));

  // ── TOC scrollspy ──────────────────────────────────────────────────
  const links = $$('.toc a');
  if (links.length) {
    const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const seen = new Set();
    const mark = () => {
      // The topmost heading that has been scrolled past wins; falling back to the
      // first link keeps something highlighted at the top of the page.
      let current = links[0];
      for (const [id, a] of byId) if (seen.has(id)) current = a;
      links.forEach((a) => a.toggleAttribute('aria-current', a === current));
    };
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) seen.add(en.target.id); else if (en.boundingClientRect.top > 0) seen.delete(en.target.id);
      }
      mark();
    }, { rootMargin: '-78px 0px -70% 0px', threshold: 0 });
    byId.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    mark();
  }

  // ── Catalog browser: search, filter, sort, paginate ────────────────
  const table = document.getElementById('model-table');
  if (table) {
    const body = table.tBodies[0];
    const all = [...body.rows];
    const search = document.getElementById('model-search');
    const sort = document.getElementById('model-sort');
    const count = document.getElementById('model-count');
    const none = document.getElementById('model-none');
    const label = document.getElementById('page-label');
    const prev = document.getElementById('page-prev');
    const next = document.getElementById('page-next');
    const chips = [...document.querySelectorAll('#catalog .chip')];
    const PER_PAGE = 25;
    let modality = '', freeOnly = false, page = 1;

    const num = (row, key) => parseFloat(row.dataset[key]);
    const matches = () => {
      const q = (search.value || '').trim().toLowerCase();
      return all.filter((row) => {
        if (q && !row.dataset.search.includes(q)) return false;
        if (freeOnly && row.dataset.free !== '1') return false;
        if (modality && !row.dataset.mods.split(' ').includes(modality)) return false;
        return true;
      });
    };
    const ordered = (rows) => {
      const by = sort.value;
      const copy = [...rows];
      if (by === 'in') copy.sort((a, b) => num(a, 'in') - num(b, 'in'));
      else if (by === 'out') copy.sort((a, b) => num(a, 'out') - num(b, 'out'));
      else if (by === 'ctx') copy.sort((a, b) => num(b, 'ctx') - num(a, 'ctx'));
      else if (by === 'max') copy.sort((a, b) => num(b, 'max') - num(a, 'max'));
      else if (by === 'name') copy.sort((a, b) =>
        a.dataset.search.localeCompare(b.dataset.search));
      else copy.sort((a, b) => num(a, 'order') - num(b, 'order'));
      return copy;
    };

    const apply = () => {
      const rows = ordered(matches());
      const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
      page = Math.min(Math.max(1, page), pages);
      const slice = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);
      body.replaceChildren(...slice);
      count.textContent = rows.length;
      none.hidden = rows.length > 0;
      label.textContent = `Page ${page} of ${pages}`;
      prev.disabled = page <= 1;
      next.disabled = page >= pages;
    };
    const reset = () => { page = 1; apply(); };

    search.addEventListener('input', reset);
    sort.addEventListener('change', reset);
    prev.addEventListener('click', () => { page -= 1; apply(); table.scrollIntoView({ block: 'start' }); });
    next.addEventListener('click', () => { page += 1; apply(); table.scrollIntoView({ block: 'start' }); });
    chips.forEach((chip) => chip.addEventListener('click', () => {
      if (chip.dataset.filter === 'free') {
        freeOnly = !freeOnly;
        chip.setAttribute('aria-pressed', String(freeOnly));
      } else {
        modality = chip.dataset.mod || '';
        chips.filter((c) => c.dataset.mod !== undefined)
             .forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      }
      reset();
    }));
    apply();
  }

  // ── Pricing calculator ─────────────────────────────────────────────
  const calc = document.getElementById('calc');
  if (calc) {
    const model = document.getElementById('calc-model');
    const inTok = document.getElementById('calc-in');
    const outTok = document.getElementById('calc-out');
    const total = document.getElementById('calc-total');
    const split = document.getElementById('calc-split');
    const usd = (v) => '$' + v.toFixed(v < 1 ? 6 : 2).replace(/(\.\d*?[1-9])0+$/, '$1');

    const run = () => {
      const opt = model.selectedOptions[0];
      const ri = parseFloat(opt.dataset.in) / 1e6, ro = parseFloat(opt.dataset.out) / 1e6;
      const ci = (+inTok.value || 0) * ri, co = (+outTok.value || 0) * ro;
      total.textContent = usd(ci + co);
      split.textContent = `${usd(ci)} input · ${usd(co)} output`;
    };
    [model, inTok, outTok].forEach((el) => el.addEventListener('input', run));
    $$('.preset .chip', calc).forEach((chip) => chip.addEventListener('click', () => {
      const [i, o] = chip.dataset.preset.split(',');
      inTok.value = i; outTok.value = o;
      $$('.preset .chip', calc).forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      run();
    }));
    run();
  }

  // ── Chat ───────────────────────────────────────────────────────────
  // The browser calls the gateway itself with a key held on this device. Conversations
  // are kept in localStorage and never leave the machine.
  const chat = document.getElementById('chat');
  if (chat) {
    const api = chat.dataset.api;
    const models = JSON.parse(document.getElementById('chat-models').textContent);
    const el = (id) => document.getElementById(id);
    const log = el('chat-log'), input = el('chat-input'), form = el('chat-form');
    const send = el('chat-send'), pick = el('chat-pick'), picker = el('chat-picker');
    const list = el('chat-picker-list'), search = el('chat-search'), spend = el('spend');
    const usd = (v) => (v === 0 ? 'Free'
      : '$' + (v < 1 ? v.toFixed(4).replace(/0+$/, '') : v.toFixed(2)));
    const store = {
      get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
      set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} },
    };
    const freeModel = models.find((m) => m.free);

    let current = models.find((m) => m.id === chat.dataset.model) || models[0];
    let convos = [];
    let active = null;          // the conversation on screen
    let running = null;

    try { convos = JSON.parse(store.get('or-convos') || '[]'); } catch { convos = []; }
    const saveConvos = () => store.set('or-convos', JSON.stringify(convos.slice(0, 60)));

    // ── Model choice ────────────────────────────────────────────────
    const effective = () => (spend.checked ? current : freeModel || current);
    const renderRate = () => {
      const m = effective();
      el('chat-pick-name').textContent = current.name;
      el('chat-rate').textContent = m.free
        ? 'Free · Open Tier' : `${usd(m.in)} in · ${usd(m.out)} out / 1M`;
      el('mode').textContent = m.free ? 'Free chat' : 'Paid chat';
    };
    const renderList = () => {
      const q = (search.value || '').trim().toLowerCase();
      const hits = models.filter((m) => (m.id + ' ' + m.name).toLowerCase().includes(q));
      list.replaceChildren();
      if (!hits.length) {
        const none = document.createElement('p');
        none.className = 'chat-none';
        none.textContent = 'No model matches that.';
        list.append(none);
        return;
      }
      let group = null;
      for (const m of hits) {
        if (m.author !== group) {
          group = m.author;
          const h = document.createElement('div');
          h.className = 'chat-group';
          h.textContent = group;
          list.append(h);
        }
        const opt = document.createElement('button');
        opt.type = 'button';
        opt.className = 'chat-opt';
        opt.setAttribute('role', 'option');
        opt.setAttribute('aria-selected', String(m.id === current.id));
        const txt = document.createElement('span');
        txt.className = 'chat-opt-txt';
        const b = document.createElement('b');
        b.textContent = m.name;
        const code = document.createElement('code');
        code.textContent = m.id;
        txt.append(b, code);
        const tag = document.createElement('span');
        tag.className = 'tag ' + (m.free ? 't-free' : 't-cheap');
        tag.textContent = m.free ? 'free' : usd(m.in);
        opt.append(txt, tag);
        opt.addEventListener('click', () => {
          current = m;
          store.set('or-model', m.id);
          renderRate();
          togglePicker(false);
        });
        list.append(opt);
      }
    };
    const togglePicker = (open) => {
      picker.hidden = !open;
      pick.setAttribute('aria-expanded', String(open));
      if (open) { renderList(); search.focus(); search.select(); }
    };
    pick.addEventListener('click', () => togglePicker(picker.hidden));
    search.addEventListener('input', renderList);
    document.addEventListener('click', (e) => {
      if (!picker.hidden && !picker.contains(e.target) && !pick.contains(e.target)) {
        togglePicker(false);
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !picker.hidden) togglePicker(false);
    });
    spend.addEventListener('change', renderRate);

    // ── Conversations ───────────────────────────────────────────────
    const title = (text) => text.trim().slice(0, 44) || 'New chat';
    const renderConvos = () => {
      const box = el('convos');
      box.replaceChildren();
      el('convo-empty').hidden = convos.length > 0;
      for (const convo of convos) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'convo';
        if (active && convo.id === active.id) row.setAttribute('aria-current', 'true');
        const name = document.createElement('span');
        name.className = 'convo-name';
        name.textContent = convo.title;
        const x = document.createElement('button');
        x.className = 'convo-x';
        x.type = 'button';
        x.textContent = '×';
        x.setAttribute('aria-label', `Delete ${convo.title}`);
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          convos = convos.filter((c) => c.id !== convo.id);
          saveConvos();
          if (active && active.id === convo.id) newChat();
          else renderConvos();
        });
        row.append(name, x);
        row.addEventListener('click', () => open(convo));
        box.append(row);
      }
    };
    const newChat = () => {
      running?.abort();
      active = null;
      log.replaceChildren(hero());
      renderConvos();
      input.value = '';
      grow();
      input.focus();
    };
    const open = (convo) => {
      running?.abort();
      active = convo;
      log.replaceChildren();
      for (const turn of convo.turns) {
        const body = bubble(turn.role === 'user' ? 'me' : 'ai', turn.content, turn.model);
        if (turn.meta) {
          const line = document.createElement('span');
          line.className = 'meta';
          line.textContent = turn.meta;
          body.parentElement.append(line);
        }
      }
      renderConvos();
      log.scrollTop = log.scrollHeight;
    };

    let heroNode = el('chat-empty');
    const hero = () => heroNode;

    // ── Turns ───────────────────────────────────────────────────────
    const bubble = (kind, text, who) => {
      if (log.contains(heroNode)) heroNode.remove();
      const wrap = document.createElement('div');
      wrap.className = 'turn ' + kind;
      const label = document.createElement('span');
      label.className = 'who';
      label.textContent = kind === 'me' ? 'You' : kind === 'err' ? 'Not sent'
        : who || effective().name;
      const body = document.createElement('div');
      body.className = 'bubble';
      body.textContent = text;
      wrap.append(label, body);
      log.append(wrap);
      log.scrollTop = log.scrollHeight;
      return body;
    };
    const fail = (text, href, label) => {
      const body = bubble('err', text);
      if (href) {
        const a = document.createElement('a');
        a.href = href;
        a.textContent = label;
        body.append(' ', a);
      }
      log.scrollTop = log.scrollHeight;
    };
    const setBusy = (on) => {
      send.textContent = on ? '■' : '↑';
      send.classList.toggle('stop', on);
      send.setAttribute('aria-label', on ? 'Stop generating' : 'Send message');
    };
    const meter = (info, usage) => {
      const cost = Number(info.cost_usd);
      const text = `${info.provider} · ${info.ttft_ms}ms to first token · ` +
        `${usage ? usage.total_tokens + ' tokens · ' : ''}` +
        `${cost ? '$' + cost.toFixed(6) : 'free'} · ${info.receipt}`;
      const line = document.createElement('span');
      line.className = 'meta';
      line.textContent = text;
      log.lastElementChild?.append(line);
      el('balance').textContent = '$' + Number(info.balance_usd).toFixed(4);
      return text;
    };

    const stream = async (res, body) => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const caret = document.createElement('span');
      caret.className = 'caretblink';
      body.append(caret);
      let buf = '', text = '', metaLine = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') continue;
            try {
              const frame = JSON.parse(data);
              const delta = frame.choices?.[0]?.delta?.content;
              if (delta) { text += delta; body.textContent = text; body.append(caret); }
              if (frame.x_onerouter) metaLine = meter(frame.x_onerouter, frame.usage);
            } catch { /* keep-alive or a split frame; the next read completes it */ }
          }
        }
        log.scrollTop = log.scrollHeight;
      }
      caret.remove();
      if (!text) body.textContent = '(the model returned nothing)';
      return { text, metaLine };
    };

    const ask = async (text) => {
      const key = store.get('or-key');
      if (!key) { el('keygate').hidden = false; return; }
      const model = effective();
      if (!active) {
        active = { id: 'c' + Date.now(), title: title(text), turns: [] };
        convos.unshift(active);
      }
      bubble('me', text);
      active.turns.push({ role: 'user', content: text });
      renderConvos();

      const body = bubble('ai', '', model.name);
      setBusy(true);
      running = new AbortController();
      try {
        const res = await fetch(api + '/chat/completions', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model.id, stream: true,
            messages: active.turns.map(({ role, content }) => ({ role, content })),
          }),
          signal: running.signal,
        });
        if (!res.ok) {
          let detail = '';
          try { detail = (await res.json())?.error?.message || ''; } catch {}
          body.closest('.turn').remove();
          active.turns.pop();
          const known = {
            401: ['That key was refused.', '/docs/authentication', 'authentication →'],
            402: ['This key has no credit left.', '/pay', 'add credit →'],
            429: ['Rate limited — wait a moment and send it again.',
                  '/docs/errors#rate_limited', 'rate limits →'],
            503: ['No host could serve that model right now.', '/docs/failover', 'failover →'],
          }[res.status];
          const [msg, href, label] = known ||
            [`The gateway answered ${res.status}.`, '/docs/errors', 'error catalog →'];
          fail(detail || msg, href, label);
          return;
        }
        const { text: reply, metaLine } = await stream(res, body);
        if (reply) {
          active.turns.push({ role: 'assistant', content: reply,
                              model: model.name, meta: metaLine });
        }
        saveConvos();
      } catch (err) {
        body.closest('.turn').remove();
        active.turns.pop();
        if (err.name === 'AbortError') fail('Stopped before the reply finished.');
        else fail(`Could not reach ${api}. The gateway is unreachable from this ` +
                  'browser, or it refused the cross-origin request.', '/status',
                  'check status →');
      } finally {
        setBusy(false);
        running = null;
        input.focus();
      }
    };

    // ── Composer ────────────────────────────────────────────────────
    const grow = () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 190) + 'px';
      input.style.overflowY = input.scrollHeight > 190 ? 'auto' : 'hidden';
    };
    input.addEventListener('input', grow);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (running) { running.abort(); return; }
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      grow();
      ask(text);
    });
    document.addEventListener('click', (e) => {
      const askBtn = e.target.closest('.ask');
      if (!askBtn) return;
      input.value = askBtn.dataset.fill;
      grow();
      form.requestSubmit();
    });
    el('new-chat').addEventListener('click', newChat);

    // ── Key gate ────────────────────────────────────────────────────
    el('keygate-paste').addEventListener('click', () => {
      el('keygate-form').hidden = false;
      el('chat-key').focus();
    });
    const saveKey = () => {
      const value = el('chat-key').value.trim();
      if (!value) return;
      store.set('or-key', value);
      el('keygate').hidden = true;
      refreshAccount();
      input.focus();
    };
    el('chat-key-save').addEventListener('click', saveKey);
    el('chat-key').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveKey(); }
    });

    // ── Account state ───────────────────────────────────────────────
    const refreshAccount = async () => {
      const key = store.get('or-key');
      const state = el('key-state');
      if (!key) {
        state.textContent = 'No key';
        state.classList.remove('on');
        el('balance').textContent = '—';
        el('keygate').hidden = false;
        return;
      }
      state.textContent = 'Key set';
      state.classList.add('on');
      el('keygate').hidden = true;
      try {
        const me = await fetch(api + '/me',
                               { headers: { Authorization: 'Bearer ' + key } });
        if (me.ok) {
          const data = await me.json();
          el('balance').textContent = '$' + Number(data.balance_usd).toFixed(4);
          el('account').textContent = data.account.replace('acct_', '').slice(0, 6);
        } else if (me.status === 401) {
          state.textContent = 'Key refused';
          state.classList.remove('on');
        }
      } catch { el('balance').textContent = '—'; }
    };

    // ── Sidebar on small screens ────────────────────────────────────
    el('side-open').addEventListener('click', () => chat.classList.add('side-open'));
    el('side-close').addEventListener('click', () => chat.classList.remove('side-open'));

    const remembered = models.find((m) => m.id === store.get('or-model'));
    if (remembered) current = remembered;
    renderRate();
    renderConvos();
    refreshAccount();
    grow();
  }

  // ── Sign in ────────────────────────────────────────────────────────
  // Every method is verified by the gateway. Nothing here decides who you are; it
  // collects a proof and hands it over. The session it gets back is kept in this
  // browser, alongside the key, and sent to the gateway alone.
  const signin = document.getElementById('signin');
  if (signin) {
    const api = signin.dataset.api;
    const panel = document.getElementById('auth-panel');
    const status = document.getElementById('auth-status');
    const say = (text, kind = '') => {
      status.textContent = text;
      status.className = 'auth-status ' + kind;
    };
    const post = async (path, body, token) => {
      const res = await fetch(api + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
                   ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || `gateway answered ${res.status}`);
      return data;
    };
    const remember = (key, value) => { try { localStorage.setItem(key, value); } catch {} };

    // What the gateway will actually accept — a method it cannot serve is disabled
    // with its reason rather than left to fail when clicked.
    // A method the gateway cannot serve is disabled with its reason, rather than
    // left to fail when clicked.
    fetch(api + '/auth/methods').then((r) => r.json()).then(({ methods }) => {
      for (const btn of document.querySelectorAll('[data-method]')) {
        const spec = methods[btn.dataset.method];
        if (spec && !spec.ready) {
          btn.disabled = true;
          btn.title = spec.note;
        }
      }
    }).catch(() => say('Could not reach the gateway. Is it running?', 'bad'));

    // ── Landing an account ────────────────────────────────────────────
    const landed = (data, how) => {
      remember('or-last-method', how);
      remember('or-session', data.session);
      if (data.key) remember('or-key', data.key);
      panel.hidden = false;
      const bits = [`<h2>${data.new_account ? 'Account created' : 'Signed in'}</h2>`];
      if (data.key) {
        bits.push('<p>This is the only time the key and recovery link are shown. ' +
                  'Copy both — losing both loses the balance, because there is no ' +
                  'identity attached to recover to.</p>');
        bits.push(secretRow('API key', data.key), secretRow('Recovery secret', data.recovery));
      } else {
        bits.push(`<p>Welcome back. Account <code>${data.account}</code>, ` +
                  `balance $${Number(data.balance_usd).toFixed(2)}.</p>`);
      }
      bits.push('<div class="auth-actions">' +
                '<a class="btn primary" href="/pay">Add credit →</a>' +
                '<a class="btn" href="/chat">Open the playground</a></div>');
      panel.innerHTML = bits.join('');
      say(data.new_account ? 'Account created.' : 'Signed in.', 'ok');
    };
    const secretRow = (label, value) => `<dl class="secret"><dt>${label}</dt>
      <dd><button class="m-id" data-copy="${value}">${value}</button></dd></dl>`;

    // ── Email: a password, or a one-time code ─────────────────────────
    const emailFlow = () => {
      panel.hidden = false;
      panel.innerHTML = `<h2>Continue with email</h2>
        <p>Log in with your password, or have a one-time code sent instead.</p>
        <label for="auth-email">Email address</label>
        <input id="auth-email" type="email" autocomplete="email" placeholder="you@example.com">
        <label for="auth-pass">Password</label>
        <input id="auth-pass" type="password" autocomplete="current-password"
          placeholder="Leave empty to get a code instead">
        <div class="auth-actions">
          <button class="btn primary" id="auth-login">Log in</button>
          <button class="btn" id="auth-code-btn">Email me a code</button>
        </div>
        <p style="margin:14px 0 0">New here?
          <button type="button" class="linkish" id="auth-register">Create an account
            with a password</button></p>`;
      const email = document.getElementById('auth-email');
      const pass = document.getElementById('auth-pass');
      email.focus();

      const sendCode = async () => {
        say('Sending…');
        try { codeFlow(await post('/auth/email/start', { email: email.value.trim() }),
                       email.value.trim()); }
        catch (err) { say(err.message, 'bad'); }
      };
      const login = async () => {
        if (!pass.value) return sendCode();   // no password typed: they want a code
        say('Checking…');
        try {
          landed(await post('/auth/password/login',
                            { email: email.value.trim(), password: pass.value }), 'email');
        } catch (err) { say(err.message, 'bad'); }
      };
      const register = async () => {
        say('Creating…');
        try {
          landed(await post('/auth/password/register',
                            { email: email.value.trim(), password: pass.value }), 'email');
        } catch (err) { say(err.message, 'bad'); }
      };

      document.getElementById('auth-login').addEventListener('click', login);
      document.getElementById('auth-code-btn').addEventListener('click', sendCode);
      document.getElementById('auth-register').addEventListener('click', register);
      pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
      email.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); pass.focus(); }
      });
    };

    // Arc's own parameters, so a wallet that has never seen the chain can add it.
    const ARC = {
      chainId: '0x13b2',                        // 5042
      chainName: 'Arc',
      nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
      rpcUrls: ['https://rpc.mainnet.arc.io'],
      blockExplorerUrls: ['https://explorer.arc.io'],
    };
    const onArc = async (evm) => {
      try {
        await evm.request({ method: 'wallet_switchEthereumChain',
                            params: [{ chainId: ARC.chainId }] });
      } catch (err) {
        // 4902 is "unrecognised chain" — offer to add it, then switch.
        if (err?.code === 4902 || /unrecognized|not been added/i.test(err?.message || '')) {
          await evm.request({ method: 'wallet_addEthereumChain', params: [ARC] });
        } else if (err?.code !== 4001) {
          throw err;                            // 4001 is the user declining
        }
      }
    };

    // ── Wallet (Arc / EVM, or Solana) ─────────────────────────────────
    const walletFlow = async () => {
      const evm = window.ethereum;
      const solana = window.solana;
      if (!evm && !solana?.isPhantom) {
        panel.hidden = false;
        panel.innerHTML = `<h2>No wallet found</h2>
          <p>This needs a browser wallet. Arc is EVM-compatible, so any injected
            EVM wallet works; a Solana wallet works too. Install one and reload,
            or use another method above.</p>`;
        return;
      }
      say('Check your wallet…');
      try {
        let chain, address, signature;
        if (evm) {
          chain = 'arc';
          [address] = await evm.request({ method: 'eth_requestAccounts' });
          await onArc(evm);
          const { ref, message } = await post('/auth/wallet/challenge', { chain, address });
          signature = await evm.request({ method: 'personal_sign', params: [message, address] });
          landed(await post('/auth/wallet/verify', { ref, signature }), 'wallet');
        } else {
          chain = 'solana';
          const resp = await solana.connect();
          address = resp.publicKey.toString();
          const { ref, message } = await post('/auth/wallet/challenge', { chain, address });
          const signed = await solana.signMessage(new TextEncoder().encode(message), 'utf8');
          signature = btoa(String.fromCharCode(...signed.signature))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
          landed(await post('/auth/wallet/verify', { ref, signature }), 'wallet');
        }
      } catch (err) {
        say(err.message?.includes('User rejected') ? 'Signature declined.' : err.message, 'bad');
      }
    };

    // ── Dispatch ──────────────────────────────────────────────────────
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-method]');
      if (!btn || btn.disabled) return;
      const how = btn.dataset.method;
      panel.hidden = how === 'wallet';
      say('');
      try {
        if (how === 'email') emailFlow();
        else if (how === 'wallet') await walletFlow();
      } catch (err) { say(err.message, 'bad'); }
    });
  }

  // ── Add credit: choose an amount, then the deposit page ────────────
  // Two steps, because a live payment address does not belong on screen before
  // anyone has chosen anything — and it needs the room to be read and copied.
  const pay = document.getElementById('pay');
  if (pay) {
    const api = pay.dataset.api;
    const el = (id) => document.getElementById(id);
    const steps = [...pay.querySelectorAll('.step')];
    const marks = [...pay.querySelectorAll('#pay-flow li')];
    const chips = [...pay.querySelectorAll('#pay-amounts .chip')];
    const custom = el('pay-custom');
    const note = el('pay-note');
    let amount = 20, rail = null, deposit = null, poll = null;

    const key = () => { try { return localStorage.getItem('or-key') || ''; } catch { return ''; } };
    const session = () => { try { return localStorage.getItem('or-session') || ''; } catch { return ''; } };
    const show = (n) => {
      steps.forEach((sec) => { sec.hidden = Number(sec.dataset.step) !== n; });
      marks.forEach((m) => m.classList.toggle('on', Number(m.dataset.step) <= n));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    pay.querySelectorAll('[data-back]').forEach((b) =>
      b.addEventListener('click', () => { clearInterval(poll); show(Number(b.dataset.back)); }));

    chips.forEach((chip) => chip.addEventListener('click', () => {
      amount = Number(chip.dataset.amount);
      custom.value = '';
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    }));
    custom.addEventListener('input', () => {
      amount = Number(custom.value) || 0;
      chips.forEach((c) => c.setAttribute('aria-pressed', 'false'));
    });

    const liveWarning = (arc) => {
      const text = `<b>Live network.</b> Arc mainnet (chain ${arc.chain_id}). USDC sent ` +
        'to this address is real money and the transfer cannot be reversed.';
      for (const id of ['pay-livewarn', 'pay-livewarn2']) {
        const box = el(id);
        if (box && arc.mainnet) { box.hidden = false; box.innerHTML = text; }
      }
    };

    // What the gateway will actually accept, before anyone commits to a step.
    fetch(api + '/pay/methods').then((r) => r.json()).then(({ arc }) => {
      rail = arc;
      el('pay-confirms').textContent = arc.confirmations;
      el('pay-sub').textContent = `${arc.network} · $${arc.minimum_usd} minimum`;
      el('pay-addr-label').textContent = `Your ${arc.network} deposit address`;
      const label = el('pay-rail-note');
      if (!arc.ready) {
        label.textContent = `Unavailable — ${arc.reason}`;
        pay.querySelector('.rail-opt input').disabled = true;
        el('pay-start').disabled = true;
        note.innerHTML = '<b>Deposits are not configured on this gateway.</b> There is ' +
          'no address to show, and this page will not invent one.';
        note.className = 'step-note bad';
        return;
      }
      label.textContent = `Native USDC on ${arc.network} · chain ${arc.chain_id}`;
      liveWarning(arc);
    }).catch(() => { note.textContent = 'Could not reach the gateway.'; });

    // ── 01 -> 02 ────────────────────────────────────────────────────
    el('pay-start').addEventListener('click', async () => {
      const token = session() || key();
      if (!token) {
        note.innerHTML = 'You need a key first. <a href="/signin">Get one →</a> ' +
          'It takes one click and no account.';
        note.className = 'step-note bad';
        return;
      }
      if (!amount || amount < (rail?.minimum_usd || 0.5)) {
        note.textContent = `The minimum deposit is $${rail?.minimum_usd || 0.5}.`;
        note.className = 'step-note bad';
        return;
      }
      const btn = el('pay-start');
      btn.disabled = true;
      btn.textContent = 'Opening…';
      try {
        const res = await fetch(api + '/pay/deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ amount_usd: amount }),
        });
        deposit = await res.json();
        if (!res.ok) throw new Error(deposit?.error?.message || `answered ${res.status}`);
        el('pay-address').textContent = deposit.address;
        el('pay-copy').dataset.copy = deposit.address;
        el('pay-amount').textContent = `${Number(deposit.suggested_usd).toFixed(2)} USDC`;
        // The QR is rendered by the gateway, which checks it decodes back to this
        // exact address before serving it.
        el('pay-qr').src = `${api}/pay/deposit/${deposit.reference}/qr.svg`;
        show(1);
        watch(token);
      } catch (err) {
        note.textContent = err.message;
        note.className = 'step-note bad';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Continue';
      }
    });

    // ── 02: watch the chain ─────────────────────────────────────────
    const label = { waiting: 'Waiting', pending: 'Seen — confirming',
                    credited: 'Credited', expired: 'Expired' };
    const render = (now) => {
      el('pay-state').textContent = now.status === 'pending'
        ? `Seen — ${now.confirmations_seen || 0}/${now.confirmations} confirmations`
        : (label[now.status] || now.status);
      const seen = now.seen || [];
      el('pay-received').hidden = seen.length === 0;
      el('pay-rows').replaceChildren(...seen.slice().reverse().map((t) => {
        const tr = document.createElement('tr');
        const when = document.createElement('td');
        when.textContent = `block ${t.block}`;
        const amt = document.createElement('td');
        amt.className = 'num';
        amt.textContent = (t.units / 1e6).toFixed(6) + ' USDC';
        const tx = document.createElement('td');
        if (t.explorer_url) {
          const a = document.createElement('a');
          a.href = t.explorer_url;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = t.tx.slice(0, 18) + '…';
          tx.append(a);
        } else {
          tx.textContent = t.tx.slice(0, 18) + '…';
        }
        tr.append(when, amt, tx);
        return tr;
      }));
      const last = seen[seen.length - 1];
      const explorer = el('pay-explorer');
      if (last?.explorer_url) { explorer.hidden = false; explorer.href = last.explorer_url; }
      if (now.received_usd) {
        el('pay-balance').textContent =
          `Received ${Number(now.received_usd).toFixed(6)} USDC · balance ` +
          `$${Number(now.balance_usd || 0).toFixed(4)}`;
      }
      if (now.chain_error) {
        el('pay-balance').textContent = now.chain_error;
      }
      if (now.status === 'expired') clearInterval(poll);
    };
    const watch = (token) => {
      clearInterval(poll);
      const tick = async () => {
        try {
          const res = await fetch(`${api}/pay/deposit/${deposit.reference}`,
                                  { headers: { Authorization: 'Bearer ' + token } });
          if (res.ok) render(await res.json());
        } catch { /* a polling blip is not worth surfacing; the next tick retries */ }
      };
      poll = setInterval(tick, 5000);
      tick();
    };
  }

})();
