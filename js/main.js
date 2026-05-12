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

function openModal() {
  document.getElementById('modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  document.getElementById('modal').classList.remove('open');
  document.body.style.overflow = '';
}
function submitForm() {
  document.getElementById('mform').style.display = 'none';
  document.getElementById('mok').style.display = 'block';
}

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
      <div class="ci-row"><span>24\u201348 hours</span><span class="ci-tag ci-tag-amber">50% of fee</span></div>
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

const jData = {
  individual: {
    lbl:'One-on-one', ttl:'Individual Counselling',
    body:'<p>A dedicated hour just for you \u2014 no agenda, no judgement. Together we\u2019ll explore what\u2019s happening and find approaches that suit your life and your pace.</p>',
    acts:'<button class="btn btn-solid" onclick="openModal()">Book a Session</button><button class="btn btn-outline" onclick="openModal()">Ask a Question</button>',
    rows:[['Session Length','50 minutes'],['Format','In person (Karalee, QLD) or Online'],['Frequency','Weekly or fortnightly'],['Investment','$195 / hour \u00b7 Medicare rebates may apply']]
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
