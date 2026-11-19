import puppeteer from 'puppeteer-core';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const PORT = 5892;
const PUBLIC_DIR = path.resolve('public');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.resolve('.');
const VID_DIR = path.resolve('public/assets/videos');

fs.mkdirSync(VID_DIR, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2'
};

function startServer() {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) {
      const options = {
        hostname: 'demo.ninja.ng',
        port: 443,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: 'demo.ninja.ng',
          origin: 'https://demo.ninja.ng',
          referer: 'https://demo.ninja.ng/'
        }
      };
      const proxyReq = https.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', (err) => {
        console.error('Proxy error:', err);
        res.writeHead(502);
        res.end('Proxy Error');
      });
      req.pipe(proxyReq);
      return;
    }

    let filePath = path.join(PUBLIC_DIR, req.url.split('?')[0]);
    if (filePath.endsWith('/') || !path.extname(filePath)) {
      filePath = path.join(filePath, 'index.html');
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`Local test server running on http://127.0.0.1:${PORT}`);
      resolve(server);
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function captureSequence(page, frameDir, actions) {
  fs.mkdirSync(frameDir, { recursive: true });
  for (const f of fs.readdirSync(frameDir)) {
    fs.unlinkSync(path.join(frameDir, f));
  }

  let frameIdx = 0;
  async function snap(count = 1) {
    for (let i = 0; i < count; i++) {
      const p = path.join(frameDir, `frame_${String(frameIdx++).padStart(5, '0')}.png`);
      await page.screenshot({ path: p });
      await sleep(150);
    }
  }

  for (const act of actions) {
    if (act.type === 'wait') {
      await snap(act.frames || 4);
    } else if (act.type === 'click') {
      await snap(2);
      await page.waitForSelector(act.selector, { visible: true, timeout: 12000 });
      await page.click(act.selector);
      await snap(act.frames || 4);
    } else if (act.type === 'scroll') {
      await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), act.y);
      await snap(act.frames || 4);
    }
  }

  return frameIdx;
}

function encodeVideo(frameDir, outPath) {
  console.log(`Encoding video to ${outPath}...`);
  const ffmpegCmd = `/Users/bou/.local/bin/ffmpeg -y -framerate 4 -i "${frameDir}/frame_%05d.png" -c:v libx264 -pix_fmt yuv420p -vf "scale=1280:-2" -movflags +faststart "${outPath}"`;
  execSync(ffmpegCmd, { stdio: 'inherit' });
  console.log(`Generated: ${outPath}`);
}

async function run() {
  const server = await startServer();
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1.5 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-device-scale-factor=1.5']
  });

  try {
    // 1. SPORTSBOOK RECORDING
    console.log('\n--- Recording Sportsbook Identity & Anti-Fraud Flow ---');
    const page1 = await browser.newPage();
    await page1.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle0' });

    const sbFrames = path.resolve('tmp_frames_sportsbook');
    await captureSequence(page1, sbFrames, [
      { type: 'wait', frames: 5 }, // initial hero
      { type: 'click', selector: '#btn-preset-underage', frames: 3 }, // select Tobi 16 yrs
      { type: 'click', selector: '#btn-submit-step1', frames: 6 }, // age rejection compliance block
      { type: 'click', selector: '#btn-preset-adult', frames: 3 }, // select James Bond 49 yrs
      { type: 'click', selector: '#btn-submit-step1', frames: 4 }, // triggers code slideout drawer
      { type: 'click', selector: '#btn-drawer-proceed', frames: 8 }, // executes live API verification
      { type: 'click', selector: '#btn-next-step2', frames: 4 }, // proceed to Step 2
      { type: 'click', selector: '#btn-preset-bvn-mismatch', frames: 3 }, // mule account Emeka Ugo
      { type: 'click', selector: '#btn-submit-step2', frames: 4 }, // code slideout
      { type: 'click', selector: '#btn-drawer-proceed', frames: 8 }, // executes check, flags mule account
      { type: 'click', selector: '#btn-preset-bvn-match', frames: 3 }, // owner account James Bond
      { type: 'click', selector: '#btn-submit-step2', frames: 4 }, // code slideout
      { type: 'click', selector: '#btn-drawer-proceed', frames: 8 }, // executes check, approves owner account
      { type: 'click', selector: '#btn-next-step3', frames: 4 }, // proceed to Step 3
      { type: 'scroll', y: 320, frames: 3 },
      { type: 'click', selector: '#btn-create-flow', frames: 4 }, // code slideout
      { type: 'click', selector: '#btn-drawer-proceed', frames: 8 }, // creates flow
      { type: 'click', selector: '#btn-generate-flow-link', frames: 4 }, // code slideout
      { type: 'click', selector: '#btn-drawer-proceed', frames: 8 }, // generates link
      { type: 'scroll', y: -320, frames: 3 },
      { type: 'wait', frames: 6 } // highlight WhatsApp CTA in nav
    ]);
    await page1.close();

    const sbOut1 = path.join(OUT_DIR, 'ninja-sportsbook-demo.mp4');
    const sbOut2 = path.join(VID_DIR, 'ninja-sportsbook-demo.mp4');
    encodeVideo(sbFrames, sbOut1);
    fs.copyFileSync(sbOut1, sbOut2);

    // 2. CREDIT & LENDING RECORDING
    console.log('\n--- Recording Credit Bureau & Loan Underwriting Flow ---');
    const page2 = await browser.newPage();
    await page2.goto(`http://127.0.0.1:${PORT}/credit.html`, { waitUntil: 'networkidle0' });

    const crFrames = path.resolve('tmp_frames_credit');
    await captureSequence(page2, crFrames, [
      { type: 'wait', frames: 5 }, // initial hero
      { type: 'click', selector: '#btn-credit-preset-mismatch', frames: 3 }, // select mule
      { type: 'click', selector: '#btn-submit-credit-step1', frames: 8 }, // reject mismatch
      { type: 'click', selector: '#btn-credit-preset-prime', frames: 3 }, // select prime borrower
      { type: 'click', selector: '#btn-submit-credit-step1', frames: 8 }, // approve borrower KYC
      { type: 'click', selector: '#btn-goto-credit-step2', frames: 4 }, // proceed to Step 2
      { type: 'click', selector: '#btn-credit-clean', frames: 3 }, // select clean bureau profile
      { type: 'click', selector: '#btn-run-credit-check', frames: 10 }, // run sub-2s bureau check & score
      { type: 'click', selector: '#btn-goto-step-3', frames: 4 }, // proceed to Step 3
      { type: 'scroll', y: 250, frames: 3 },
      { type: 'click', selector: '#btn-pull-credit-history', frames: 10 }, // underwrite and view loan decision
      { type: 'wait', frames: 6 }
    ]);
    await page2.close();

    const crOut1 = path.join(OUT_DIR, 'ninja-lending-demo.mp4');
    const crOut2 = path.join(VID_DIR, 'ninja-lending-demo.mp4');
    encodeVideo(crFrames, crOut1);
    fs.copyFileSync(crOut1, crOut2);

    console.log('\n--- Video Recordings Completed Successfully! ---');
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(path.resolve('tmp_frames_sportsbook'), { recursive: true, force: true });
    fs.rmSync(path.resolve('tmp_frames_credit'), { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
