(function () {
  'use strict';

  const FIT_COLOR = { good: '#22c55e', tight: '#ef4444', loose: '#3b82f6' };
  const FIT_LABEL = { good: 'Good fit', tight: 'Too tight', loose: 'Too loose' };
  const CONFIDENCE_LABEL = {
    exact: 'Great fit',
    size_up: 'Consider sizing up',
    size_down: 'Consider sizing down',
    between_sizes: 'Between sizes',
  };

  // Photo → measurements via backend (avoids CSP issues with client-side ML)
  async function measureFromPhoto(file, heightIn, unit, apiUrl) {
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('height_in', String(heightIn));
    fd.append('unit', unit);
    const res = await fetch(`${apiUrl}/measure-photo`, { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Could not estimate measurements.');
    }
    return res.json();
  }

  function parseNum(s) { const n = parseFloat(s); return isNaN(n) || n === 0 ? undefined : n; }
  function toIn(v, unit) { return unit === 'cm' ? v / 2.54 : v; }

  function renderResult(el, rec) {
    el.innerHTML = `
      <div class="mf-rec">
        <span class="mf-rec-size">${rec.recommended_size}</span>
        <span class="mf-rec-conf">${CONFIDENCE_LABEL[rec.confidence] || rec.confidence}</span>
      </div>
      <div class="mf-zones">
        ${rec.fit_zones.map(z => `
          <div class="mf-zone">
            <span class="mf-dot" style="background:${FIT_COLOR[z.status]}"></span>
            <span class="mf-zone-name">${z.zone}</span>
            <span class="mf-zone-status" style="color:${FIT_COLOR[z.status]}">${FIT_LABEL[z.status]}</span>
            <span class="mf-zone-delta">${z.delta_in > 0 ? '+' : ''}${z.delta_in.toFixed(1)}"</span>
          </div>`).join('')}
      </div>
      ${rec.notes ? `<p class="mf-notes">${rec.notes}</p>` : ''}
    `;
  }

  function initWidget(container) {
    const d = container.dataset;
    const apiUrl = (d.apiUrl || '').replace(/\/$/, '');
    if (!apiUrl) {
      container.innerHTML = '<p class="mf-error">MIXFIT: API URL not configured in theme editor.</p>';
      return;
    }

    const garment = {
      name: d.product || undefined, size_label: d.sizeLabel || undefined,
      chest_in: parseNum(d.chest), waist_in: parseNum(d.waist), hip_in: parseNum(d.hip),
      shoulder_in: parseNum(d.shoulder), sleeve_in: parseNum(d.sleeve),
      neck_in: parseNum(d.neck), inseam_in: parseNum(d.inseam), thigh_in: parseNum(d.thigh),
    };
    Object.keys(garment).forEach(k => garment[k] === undefined && delete garment[k]);
    const hasDims = ['chest_in','waist_in','hip_in','shoulder_in','sleeve_in','neck_in','inseam_in','thigh_in']
      .some(k => garment[k] !== undefined);

    container.innerHTML = `
      <div class="mf-panel">
        <button class="mf-toggle" type="button">Find My Size</button>

        <div class="mf-body" hidden>

          <!-- Step 1 -->
          <div class="mf-step" data-step="1">
            <div class="mf-field">
              <label>Gender</label>
              <select class="mf-gender">
                <option value="mens">Men's</option>
                <option value="womens">Women's</option>
              </select>
            </div>
            <div class="mf-field">
              <label>Height</label>
              <div class="mf-height-row">
                <input class="mf-height-input" type="number" step="0.5" placeholder="70">
                <div class="mf-inline-units">
                  <button class="mf-u-btn active" data-unit="in" type="button">in</button>
                  <button class="mf-u-btn" data-unit="cm" type="button">cm</button>
                </div>
              </div>
            </div>
            <div class="mf-options">
              <button class="mf-camera-cta" type="button">Measure with Camera</button>
              <button class="mf-manual-link" type="button">Enter manually</button>
            </div>
          </div>

          <!-- Step 2 -->
          <div class="mf-step" data-step="2" hidden>
            <div class="mf-photo-row" hidden>
              <label class="mf-upload-label">
                <span class="mf-upload-text">Choose a full-body photo</span>
                <input class="mf-photo-input" type="file" accept="image/*">
              </label>
              <p class="mf-cam-status"></p>
            </div>
            <form class="mf-form" novalidate>
              <div class="mf-field"><label>Chest&nbsp;<span class="mf-u">in</span></label><input type="number" name="chest_in"  step="0.5" min="20" max="80"  placeholder="—"></div>
              <div class="mf-field"><label>Waist&nbsp;<span class="mf-u">in</span></label><input type="number" name="waist_in"  step="0.5" min="18" max="70"  placeholder="—"></div>
              <div class="mf-field"><label>Hip&nbsp;<span class="mf-u">in</span></label><input type="number" name="hip_in"    step="0.5" min="20" max="80"  placeholder="—"></div>
              <div class="mf-field"><label>Inseam&nbsp;<span class="mf-u">in</span></label><input type="number" name="inseam_in" step="0.5" min="20" max="50"  placeholder="—"></div>
              <div class="mf-field"><label>Sleeve&nbsp;<span class="mf-u">in</span></label><input type="number" name="sleeve_in" step="0.5" min="18" max="40"  placeholder="—"></div>
              <div class="mf-field"><label>Thigh&nbsp;<span class="mf-u">in</span></label><input type="number" name="thigh_in"  step="0.5" min="12" max="40"  placeholder="—"></div>
              <button class="mf-submit" type="submit">Check My Fit</button>
            </form>
            ${!hasDims ? '<p class="mf-warn">No garment fit data for this product yet.</p>' : ''}
          </div>

          <!-- Step 3 -->
          <div class="mf-step" data-step="3" hidden>
            <div class="mf-result"></div>
            <button class="mf-back" type="button">← Start over</button>
          </div>

        </div>
      </div>
    `;

    let unit = 'in';

    const body       = container.querySelector('.mf-body');
    const toggleBtn  = container.querySelector('.mf-toggle');
    const steps      = container.querySelectorAll('.mf-step');
    const genderSel  = container.querySelector('.mf-gender');
    const heightInp  = container.querySelector('.mf-height-input');
    const uBtns      = container.querySelectorAll('.mf-u-btn');
    const uLabels    = container.querySelectorAll('.mf-u');
    const cameraCta  = container.querySelector('.mf-camera-cta');
    const manualLink = container.querySelector('.mf-manual-link');
    const photoRow   = container.querySelector('.mf-photo-row');
    const photoInput = container.querySelector('.mf-photo-input');
    const uploadText = container.querySelector('.mf-upload-text');
    const camStatus  = container.querySelector('.mf-cam-status');
    const form       = container.querySelector('.mf-form');
    const formInputs = container.querySelectorAll('.mf-form input[type="number"]');
    const resultEl   = container.querySelector('.mf-result');
    const backBtn    = container.querySelector('.mf-back');

    function showStep(n) {
      steps.forEach(s => s.hidden = parseInt(s.dataset.step) !== n);
    }

    toggleBtn.addEventListener('click', () => {
      body.hidden = !body.hidden;
      if (!body.hidden) showStep(1);
    });

    uBtns.forEach(btn => btn.addEventListener('click', () => {
      const next = btn.dataset.unit;
      if (next === unit) return;
      const factor = next === 'cm' ? 2.54 : 1 / 2.54;
      formInputs.forEach(inp => {
        const v = parseFloat(inp.value);
        if (!isNaN(v) && v > 0) inp.value = (v * factor).toFixed(1);
      });
      const hv = parseFloat(heightInp.value);
      if (!isNaN(hv) && hv > 0) heightInp.value = (hv * factor).toFixed(1);
      uBtns.forEach(b => b.classList.toggle('active', b.dataset.unit === next));
      uLabels.forEach(l => l.textContent = next);
      unit = next;
    }));

    function getHeightIn() {
      const hv = parseFloat(heightInp.value);
      if (!hv || hv <= 0) return null;
      const hin = unit === 'cm' ? hv / 2.54 : hv;
      return (hin >= 48 && hin <= 96) ? hin : null;
    }

    cameraCta.addEventListener('click', () => {
      photoRow.hidden = false;
      showStep(2);
    });

    manualLink.addEventListener('click', () => {
      photoRow.hidden = true;
      showStep(2);
    });

    photoInput.addEventListener('change', async () => {
      const file = photoInput.files[0];
      if (!file) return;

      const heightIn = getHeightIn();
      if (!heightIn) {
        camStatus.textContent = 'Go back and enter your height first.';
        camStatus.className = 'mf-cam-status mf-error';
        return;
      }

      uploadText.textContent = 'Analyzing…';
      camStatus.textContent = 'Detecting pose…';
      camStatus.className = 'mf-cam-status';

      try {
        const meas = await measureFromPhoto(file, heightIn, unit, apiUrl);
        for (const [name, val] of Object.entries(meas)) {
          const inp = form.querySelector(`[name="${name}"]`);
          if (inp && val !== null && val !== undefined) inp.value = val;
        }
        camStatus.textContent = 'Measurements estimated — adjust any field if needed.';
        camStatus.className = 'mf-cam-status mf-cam-ok';
        uploadText.textContent = 'Change photo';
      } catch (err) {
        camStatus.textContent = err.message || 'Could not estimate — enter measurements manually.';
        camStatus.className = 'mf-cam-status mf-error';
        uploadText.textContent = 'Try another photo';
      }
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!hasDims) return;

      resultEl.innerHTML = '<p class="mf-loading">Analyzing fit…</p>';
      showStep(3);

      const fd = new FormData(form);
      const getIn    = name => { const v = parseFloat(fd.get(name)); return (!isNaN(v) && v > 0) ? toIn(v, unit) : 0; };
      const getOptIn = name => { const v = parseFloat(fd.get(name)); return (!isNaN(v) && v > 0) ? toIn(v, unit) : undefined; };

      const profile = {
        user_id: 'shopify-guest', gender: genderSel.value,
        height_in: 0, weight_lbs: 0,
        chest_in:  getIn('chest_in'),  waist_in:  getIn('waist_in'),
        hip_in:    getIn('hip_in'),    inseam_in: getIn('inseam_in'),
        sleeve_in: getOptIn('sleeve_in'), thigh_in: getOptIn('thigh_in'),
      };
      if (profile.sleeve_in === undefined) delete profile.sleeve_in;
      if (profile.thigh_in  === undefined) delete profile.thigh_in;

      try {
        const res = await fetch(`${apiUrl}/recommend/garment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile, garment }),
        });
        if (!res.ok) throw new Error(`${res.status}`);
        renderResult(resultEl, await res.json());
      } catch {
        resultEl.innerHTML = '<p class="mf-error">Could not reach MIXFIT. Check the API URL in theme settings.</p>';
      }
    });

    backBtn.addEventListener('click', () => {
      form.reset();
      camStatus.textContent = '';
      uploadText.textContent = 'Choose a full-body photo';
      showStep(1);
    });
  }

  document.querySelectorAll('.mixfit-widget:not([data-mf-ready])').forEach(container => {
    container.setAttribute('data-mf-ready', '1');
    initWidget(container);
  });
})();
