/* ============================================================
   Cheree McGarry — main.js
   ============================================================ */

const nav = document.getElementById('nav');
const page = document.body.dataset.page;

function updateNav() {
  if (page !== 'home') { nav.classList.add('visible'); return; }
  nav.classList.toggle('visible', window.scrollY > window.innerHeight * 0.85);
}
window.addEventListener('scroll', updateNav, { passive: true });
updateNav();

function goHome() { location.href = 'index.html'; }

/* ── REACH OUT MODAL ── */
let _submitBtnHTML = null;

/* ── INLINE REACH OUT (home page) ──────────────────────────
   All three "Reach Out" buttons on index.html scroll to the
   existing "Ready when you are" footer CTA section and expand
   the form inline within the practice card — no popup. */
function openReachOut() {
  const card = document.getElementById('ft-cta-practice');
  if (!card) return;
  card.classList.add('ft-open');

  const section = document.getElementById('reach-out');
  if (section) {
    const navH = (document.getElementById('nav') || {}).offsetHeight || 68;
    const top  = section.getBoundingClientRect().top + window.scrollY - navH - 24;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }
  // Auto-focus first field after scroll + transition
  setTimeout(() => {
    const first = document.getElementById('ro-fname');
    if (first) first.focus();
  }, 680);
}

function closeReachOut() {
  const card = document.getElementById('ft-cta-practice');
  if (card) card.classList.remove('ft-open');
  // Reset form
  const form = document.getElementById('ro-form');
  const ok   = document.getElementById('ro-ok');
  const btn  = document.getElementById('ro-submit');
  const err  = document.getElementById('ro-error');
  if (form) {
    form.querySelectorAll('input, select, textarea').forEach(el => { el.value = ''; });
    form.style.display = '';
  }
  if (ok)  ok.style.display  = 'none';
  if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="12" height="9" rx="1.5"/><path d="M1 4l6 5 6-5"/></svg> Send Message'; }
  if (err) err.textContent = '';
}

async function submitReachOutForm() {
  const fname = document.querySelector('input[name="ro-fname"]').value.trim();
  const email = document.querySelector('input[name="ro-email"]').value.trim();
  const btn   = document.getElementById('ro-submit');

  // Basic validation
  if (!fname) { _roError('Please enter your first name.'); return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    _roError('Please enter a valid email address.');
    return;
  }

  const lname   = document.querySelector('input[name="ro-lname"]').value.trim();
  const reason  = document.querySelector('select[name="ro-reason"]').value;
  const message = document.querySelector('textarea[name="ro-message"]').value.trim();

  btn.disabled    = true;
  btn.textContent = 'Sending…';

  try {
    const resp = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:    [fname, lname].filter(Boolean).join(' '),
        email,
        reason,
        message,
        _source: 'home-page-inline',
      }),
    });
    if (resp.ok) {
      document.getElementById('ro-form').style.display = 'none';
      const ok = document.getElementById('ro-ok');
      ok.style.display = 'block';
    } else {
      throw new Error('server');
    }
  } catch {
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="12" height="9" rx="1.5"/><path d="M1 4l6 5 6-5"/></svg> Send Message';
    _roError('Something went wrong — please email reachout@chereemcgarry.com directly.');
  }
}

function _roError(msg) {
  let el = document.getElementById('ro-error');
  if (!el) {
    el = document.createElement('p');
    el.id = 'ro-error';
    el.style.cssText = 'color:#b02828;font-size:13px;margin-top:10px;';
    document.getElementById('ro-submit').insertAdjacentElement('afterend', el);
  }
  el.textContent = msg;
}

function openModal() {
  document.getElementById('modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  if (!_submitBtnHTML) _submitBtnHTML = document.querySelector('.fsub').innerHTML;
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  document.body.style.overflow = '';
  const mform = document.getElementById('mform');
  const mok   = document.getElementById('mok');
  const btn   = document.querySelector('.fsub');
  const err   = document.getElementById('form-error');
  mform.querySelectorAll('input, select, textarea').forEach(el => { el.value = ''; });
  mform.style.display = '';
  mok.style.display   = 'none';
  if (btn && _submitBtnHTML) { btn.innerHTML = _submitBtnHTML; btn.disabled = false; }
  if (err) err.textContent = '';
}

/* ── FORM SUBMISSION ─────────────────────────────────────────
   Powered by Resend via Vercel serverless functions.
   Handler: api/contact.js
   Env var required: RESEND_API_KEY (set via `vercel env add RESEND_API_KEY`)
─────────────────────────────────────────────────────────────── */

function showFormError(msg) {
  let el = document.getElementById('form-error');
  if (!el) {
    el = document.createElement('p');
    el.id = 'form-error';
    el.style.cssText = 'color:#b02828;font-size:13px;margin-top:10px;';
    document.querySelector('.fsub').insertAdjacentElement('afterend', el);
  }
  el.textContent = msg;
}

async function submitForm() {
  const fname = document.querySelector('input[name="fname"]').value.trim();
  const email = document.querySelector('input[name="email"]').value.trim();

  if (!fname) { showFormError('Please enter your first name.'); return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFormError('Please enter a valid email address.');
    return;
  }

  const lname   = document.querySelector('input[name="lname"]').value.trim();
  const reason  = document.querySelector('select[name="reason"]').value;
  const message = document.querySelector('textarea[name="message"]').value.trim();
  const btn     = document.querySelector('.fsub');

  btn.disabled  = true;
  btn.textContent = 'Sending…';

  try {
    const resp = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:    [fname, lname].filter(Boolean).join(' '),
        email,
        reason,
        message,
        _source: 'modal',
      }),
    });
    if (resp.ok) {
      document.getElementById('mform').style.display = 'none';
      document.getElementById('mok').style.display   = 'block';
    } else {
      throw new Error('server');
    }
  } catch {
    btn.disabled = false;
    if (_submitBtnHTML) btn.innerHTML = _submitBtnHTML;
    showFormError('Something went wrong — please email reachout@chereemcgarry.com directly.');
  }
}

/* ── INFO MODAL ── */
const infoContent = {
  privacy: {
    lbl: 'Your Privacy', title: 'Privacy Policy',
    body: `<p class="ci-lead" style="font-size:14px;margin-bottom:20px">Your personal information is kept private and confidential.</p>
    <h3 class="ci-sub">What we collect</h3>
    <ul class="ci-list"><li>Personal details and contact information for scheduling and billing</li><li>Session notes for planning and continuity of care</li></ul>
    <h3 class="ci-sub">When confidentiality may be limited</h3>
    <ul class="ci-list"><li>A court subpoena requires disclosure</li><li>There is serious risk to life, health or safety</li><li>You have given prior approval to share with another professional</li><li>There is a legal requirement for disclosure</li></ul>
    <p style="margin-top:20px;font-size:13px;color:#7A948F">Full details on the <a href="info.html#ci-privacy">Client Information page</a>.</p>`
  },
  cancellation: {
    lbl: 'Appointments', title: 'Cancellation Policy',
    body: `<p class="ci-lead" style="font-size:14px;margin-bottom:20px">Appointments are best made in advance via Halaxy.</p>
    <div class="ci-table">
      <div class="ci-row ci-row-head"><span>Notice given</span><span>Fee applicable</span></div>
      <div class="ci-row"><span>48 hours or more</span><span class="ci-tag ci-tag-green">No fee</span></div>
      <div class="ci-row"><span>24–48 hours</span><span class="ci-tag ci-tag-amber">50% of fee</span></div>
      <div class="ci-row"><span>Less than 24 hours</span><span class="ci-tag ci-tag-red">Full fee</span></div>
    </div>
    <p style="margin-top:20px;font-size:13px;color:#7A948F">Full details on the <a href="info.html#ci-appointments">Client Information page</a>.</p>`
  },
  fees: {
    lbl: 'Fees & Rebates', title: 'Session Fees',
    body: `<div class="ci-table">
      <div class="ci-row ci-row-head"><span>Session type</span><span>Fee</span></div>
      <div class="ci-row"><span>Individual counselling</span><span class="ci-fee">$195 <span class="ci-per">/ hr</span></span></div>
      <div class="ci-row"><span>Family counselling</span><span class="ci-fee">$200 <span class="ci-per">/ hr</span></span></div>
      <div class="ci-row"><span>Intake (per person)</span><span class="ci-fee">$195 <span class="ci-per">/ hr</span></span></div>
      <div class="ci-row"><span>Travel &amp; reports</span><span class="ci-fee-note">By negotiation</span></div>
    </div>
    <h3 class="ci-sub">Medicare</h3>
    <p style="font-size:14px;color:#3E5C56;margin-bottom:8px">Current rebate: <strong>$82.30</strong> for sessions over 50 min (as at 7 Jan 2024). Requires a Mental Health Care Plan from your GP.</p>
    <p style="font-size:13px;color:#7A948F">Full details on the <a href="info.html#ci-fees">Client Information page</a>.</p>`
  },
  feedback: {
    lbl: 'Feedback', title: 'Feedback & Complaints',
    body: `<p style="font-size:14px;color:#3E5C56;margin-bottom:16px">Your experience matters. Please feel comfortable raising any concern directly with Cheree, or contact the AASW.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-solid" onclick="closeInfoModal();openModal()">Reach Out to Cheree</button>
      <a class="btn btn-outline" href="https://www.aasw.asn.au" target="_blank" rel="noopener">AASW Website</a>
    </div>`
  }
};

function openInfoModal(key) {
  const d = infoContent[key];
  if (!d) return;
  document.getElementById('im-lbl').textContent = d.lbl;
  document.getElementById('im-title').textContent = d.title;
  document.getElementById('im-body').innerHTML = d.body;
  document.getElementById('info-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeInfoModal() {
  document.getElementById('info-modal').classList.remove('open');
  document.body.style.overflow = '';
}

/* ── SESSION CARDS ── */
const jData = {
  individual: {
    lbl:'One-on-one', ttl:'Individual Counselling',
    body:'<p>A dedicated hour just for you — no agenda, no judgement. Together we’ll explore what’s happening and find approaches that suit your life and your pace.</p>',
    acts:'<button class="btn btn-solid" onclick="openModal()">Book a Session</button><button class="btn btn-outline" onclick="openModal()">Ask a Question</button>',
    rows:[['Session Length','50 minutes'],['Format','In person (Karalee, QLD) or Online'],['Frequency','Weekly or fortnightly'],['Investment','$195 / hour · Medicare rebates may apply']]
  },
  couples: {
    lbl:'Together', ttl:'Couples Counselling',
    body:'<p>For couples who want to communicate better, navigate conflict with more care, or simply feel closer again.</p>',
    acts:'<button class="btn btn-solid" onclick="openModal()">Book a Session</button><button class="btn btn-outline" onclick="openModal()">Ask a Question</button>',
    rows:[['Session Length','80 minutes'],['Format','In person (Karalee, QLD) or Online'],['Frequency','Weekly or fortnightly'],['Investment','$200 / hour']]
  },
  wellness: {
    lbl:'Holistic', ttl:'Wellness & Wellbeing',
    body:'<p>Holistic sessions that bridge mind and body. Cheree weaves together mindfulness, somatic awareness, and evidence-based techniques.</p>',
    acts:'<button class="btn btn-solid" onclick="openModal()">Book a Session</button><button class="btn btn-outline" onclick="openModal()">Ask a Question</button>',
    rows:[['Session Length','60 minutes'],['Format','In person (Karalee, QLD)'],['Frequency','Flexible'],['Investment','$195 / hour']]
  },
  notsure: {
    lbl:'Starting out', ttl:'Free 15-Minute Consultation',
    body:'<p>Not knowing where to start is completely normal. This brief call is a no-obligation conversation to see if working with Cheree might be a good fit.</p>',
    acts:'<button class="btn btn-solid" onclick="openModal()">Book Free Call</button>',
    rows:[['Session Length','15 minutes'],['Format','Phone or Video'],['Investment','Complimentary']]
  }
};

let activeCard = null;
function selectJ(card, key) {
  if (activeCard === card) { closeJ(); return; }
  document.querySelectorAll('.jcard').forEach(c => c.classList.remove('sel'));
  card.classList.add('sel'); activeCard = card;
  const d = jData[key];
  document.getElementById('d-lbl').textContent = d.lbl;
  document.getElementById('d-ttl').textContent = d.ttl;
  document.getElementById('d-body').innerHTML = d.body;
  document.getElementById('d-acts').innerHTML = d.acts;
  document.getElementById('d-rows').innerHTML = d.rows.map(([l,v]) =>
    `<div class="drow"><p class="drow-l">${l}</p><p class="drow-v">${v}</p></div>`).join('');
  const det = document.getElementById('jdetail');
  if (det) { det.classList.add('open'); setTimeout(() => det.scrollIntoView({behavior:'smooth',block:'nearest'}), 60); }
}
function closeJ() {
  document.querySelectorAll('.jcard').forEach(c => c.classList.remove('sel'));
  const det = document.getElementById('jdetail');
  if (det) det.classList.remove('open');
  activeCard = null;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeInfoModal(); }
});
