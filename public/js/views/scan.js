// QR scanner (F3, R1, R7) with manual ID / name entry as the always-available fallback (R10).
// Uses the native BarcodeDetector when available, otherwise jsQR on canvas frames.
import { api } from '../api.js';
import { html, setHtml } from '../html.js';
import { go } from '../nav.js';
import { startTiming } from '../perf.js';
import { parseMaterialId } from '../status-text.js';
import { icon } from '../ui.js';

const SCAN_INTERVAL_MS = 120;
let jsQrPromise = null;

function loadJsQr() {
  jsQrPromise ??= new Promise((resolve, reject) => {
    if (window.jsQR) return resolve(window.jsQR);
    const s = document.createElement('script');
    s.src = '/vendor/jsQR.js';
    s.onload = () => resolve(window.jsQR);
    s.onerror = () => {
      jsQrPromise = null;
      reject(new Error('Could not load the QR decoder.'));
    };
    document.head.append(s);
  });
  return jsQrPromise;
}

async function createDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
      }
    } catch {
      // fall through to jsQR
    }
  }
  const jsQR = await loadJsQr();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
}

const TYPE_INSTEAD = 'Type the ID printed under the QR code instead.';

function cameraProblem(err) {
  if (!window.isSecureContext) {
    return `The camera only works over a secure connection. Open this app with an https:// address (for example https://${location.hostname}:3443), or ${TYPE_INSTEAD.toLowerCase()}`;
  }
  if (!navigator.mediaDevices?.getUserMedia) return `This browser cannot use the camera. ${TYPE_INSTEAD}`;
  if (err?.name === 'NotAllowedError') return `Camera permission was denied. Allow camera access in your browser settings, or ${TYPE_INSTEAD.toLowerCase()}`;
  if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') return `No camera was found on this device. ${TYPE_INSTEAD}`;
  if (err?.name === 'NotReadableError') return `The camera is being used by another app. Close it and try again, or ${TYPE_INSTEAD.toLowerCase()}`;
  return `The camera could not be started (${err?.message ?? 'unknown error'}). ${TYPE_INSTEAD}`;
}

export async function render(root, { signal }) {
  setHtml(
    root,
    html`<div class="page-header">
        <div>
          <h1>Scan QR label</h1>
          <p class="lede">Hold the container's QR label inside the frame. The material opens automatically.</p>
        </div>
      </div>
      <div class="grid-2">
        <section class="card scanner" aria-labelledby="camera-heading">
          <h2 id="camera-heading" class="visually-hidden">Camera</h2>
          <div class="scanner-viewport">
            <video id="video" playsinline muted autoplay aria-label="Camera preview"></video>
            <div class="scanner-frame" id="frame" hidden></div>
            <div class="scanner-idle" id="idle">
              ${icon('camera')}
              <p id="idle-text">Starting the camera…</p>
            </div>
          </div>
          <p class="scan-status" id="scan-status" role="status" aria-live="polite"></p>
          <div class="actions">
            <button type="button" class="btn btn-primary btn-lg" id="start" hidden>${icon('camera')}<span>Start camera</span></button>
            <button type="button" class="btn btn-secondary" id="stop" hidden>Stop camera</button>
          </div>
        </section>

        <section class="card" aria-labelledby="manual-heading">
          <h2 id="manual-heading">Type the ID or search</h2>
          <p class="muted">Use this when a label is damaged, wet or will not scan, or when the camera is unavailable.</p>
          <form id="manual-form" role="search" novalidate>
            <div class="field">
              <label for="manual">Material ID or name</label>
              <div class="input-row">
                <input id="manual" name="manual" type="text" inputmode="text" autocomplete="off" enterkeyhint="go"
                  placeholder="e.g. 0007" aria-describedby="manual-hint manual-error" />
                <button type="submit" class="btn btn-primary">${icon('search')}<span>Find</span></button>
              </div>
              <p class="hint" id="manual-hint">The 4-digit ID is printed under the QR code. Any other text searches by name.</p>
              <p class="field-error" id="manual-error" hidden></p>
            </div>
          </form>
          <p><a href="#/inventory">Browse the full inventory table</a></p>
        </section>
      </div>`,
  );

  const video = root.querySelector('#video');
  const idle = root.querySelector('#idle');
  const idleText = root.querySelector('#idle-text');
  const frame = root.querySelector('#frame');
  const status = root.querySelector('#scan-status');
  const startBtn = root.querySelector('#start');
  const stopBtn = root.querySelector('#stop');
  const manualForm = root.querySelector('#manual-form');
  const manualError = root.querySelector('#manual-error');

  let stream = null;
  let timer = null;
  let detect = null;
  let lastRejected = '';

  function stop() {
    clearTimeout(timer);
    timer = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
    frame.hidden = true;
    idle.hidden = false;
    idleText.textContent = 'Camera is off.';
    startBtn.hidden = false;
    stopBtn.hidden = true;
  }

  async function onDecoded(text) {
    const id = parseMaterialId(text);
    if (!id) {
      if (text !== lastRejected) {
        lastRejected = text;
        status.textContent = 'This QR code is not a lab inventory label. Try another label.';
      }
      return false;
    }
    startTiming('QR scan');
    navigator.vibrate?.(40);
    status.textContent = `Found label ${id}. Opening…`;
    stop();
    go(`#/materials/${id}`);
    return true;
  }

  async function tick() {
    if (!stream || signal.aborted) return;
    if (video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth) {
      try {
        const text = await detect(video);
        if (text && (await onDecoded(text))) return;
      } catch {
        // a single failed frame is not fatal
      }
    }
    timer = setTimeout(tick, SCAN_INTERVAL_MS);
  }

  async function start() {
    startBtn.hidden = true;
    idle.hidden = false;
    idleText.textContent = 'Starting the camera…';
    status.textContent = '';
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('insecure');
      detect ??= await createDetector();
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (signal.aborted) return stop();
      video.srcObject = stream;
      await video.play();
      idle.hidden = true;
      frame.hidden = false;
      stopBtn.hidden = false;
      status.textContent = 'Scanning… hold the label steady.';
      tick();
    } catch (err) {
      stop();
      idleText.textContent = 'Camera unavailable';
      status.textContent = cameraProblem(err);
      startBtn.hidden = !window.isSecureContext;
      root.querySelector('#manual').focus();
    }
  }

  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stop);

  manualForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = manualForm.manual;
    const text = input.value.trim();
    manualError.hidden = true;
    input.removeAttribute('aria-invalid');
    if (!text) {
      setHtml(manualError, html`${icon('crit')}<span>Enter the 4-digit ID printed under the QR code, or part of the material name.</span>`);
      manualError.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    const id = parseMaterialId(text);
    if (!id) {
      go(`#/inventory?q=${encodeURIComponent(text)}`);
      return;
    }
    startTiming('manual ID entry');
    try {
      await api(`/materials/${id}`, { signal });
      go(`#/materials/${id}`);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setHtml(manualError, html`${icon('crit')}<span>${err.status === 404 ? `No material has the ID ${id}. Check the printed ID, or search by name.` : err.message}</span>`);
      manualError.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    }
  });

  start();
  return stop;
}
