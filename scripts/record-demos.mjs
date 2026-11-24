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
  const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/api/kyb/')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      let body = {};
      try { body = JSON.parse(raw); } catch {}
      const rc = String(body.rc_number || '').replace(/[^0-9]/g, '');

      if (req.url === '/api/kyb/check') {
        if (rc === '9999999') {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: 'Not found in CAC' }));
          return;
        }
        if (rc === '2000002') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'success',
            data: {
              rc_number: 'RC-2000002',
              company_name: 'PRIME AGRO ALLIED FOODS LIMITED',
              company_type: 'PRIVATE_COMPANY_LIMITED_BY_SHARES',
              status: 'INACTIVE',
              registration_date: '2014-08-20',
              registered_address: 'KM 14, Old Ibadan-Lagos Expressway',
              city: 'Ibadan',
              nature_of_business: 'Wholesale agricultural processing',
              annual_returns_up_to_date: false,
              last_annual_return_year: 2017
            }
          }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'success',
          data: {
            rc_number: 'RC-1000001',
            company_name: 'NINJA TECH LOGISTICS LIMITED',
            company_type: 'PRIVATE_COMPANY_LIMITED_BY_SHARES',
            status: 'ACTIVE',
            registration_date: '2019-04-12',
            registered_address: 'Plot 14, Commercial Avenue, Victoria Island',
            city: 'Lagos',
            nature_of_business: 'Freight forwarding, logistics and haulage services',
            annual_returns_up_to_date: true,
            last_annual_return_year: 2025
          }
        }));
        return;
      }

      if (req.url === '/api/kyb/directors') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'success',
          company_name: 'NINJA TECH LOGISTICS LIMITED',
          directors_count: 2,
          data: [
            {
              id: 501,
              name: 'James Babatunde Okafor',
              role: 'MANAGING_DIRECTOR',
              nationality: 'Nigerian',
              address: '12 Admiralty Way, Lekki Phase 1, Lagos',
              status: 'ACTIVE',
              id_type: 'NIN',
              id_number: '77777777777',
              shares_allotted: 600000,
              share_percentage: 60,
              aml_flag: false
            },
            {
              id: 502,
              name: 'Fatima Amina Bello',
              role: 'DIRECTOR',
              nationality: 'Nigerian',
              address: '8 Gana Street, Maitama, Abuja',
              status: 'ACTIVE',
              id_type: 'NIN',
              id_number: '88888888888',
              shares_allotted: 400000,
              share_percentage: 40,
              aml_flag: false
            }
          ]
        }));
        return;
      }
    }

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
        if (!res.headersSent) {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
        }
        proxyRes.pipe(res);
      });
      proxyReq.on('error', (err) => {
        if (!res.headersSent) {
          res.writeHead(502);
          res.end('Proxy Error');
        }
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
        if (!res.headersSent) {
          res.writeHead(404);
          res.end('Not Found');
        }
        return;
      }
      const ext = path.extname(filePath);
      if (!res.headersSent) {
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      }
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
  console.log(`Encoding full-screen HD video to ${outPath}...`);
  // 1440px wide full screen video matching MacBook Pro Retina
  const ffmpegCmd = `/Users/bou/.local/bin/ffmpeg -y -framerate 4 -i "${frameDir}/frame_%05d.png" -c:v libx264 -pix_fmt yuv420p -vf "scale=1440:-2" -movflags +faststart "${outPath}"`;
  execSync(ffmpegCmd, { stdio: 'inherit' });
  console.log(`Generated: ${outPath}`);
}

async function run() {
  const kybOnly = process.argv.includes('--kyb-only');
  const server = await startServer();
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    // Full screen 1440x900 viewport ensuring 100% of the 1360px workbench and logs are captured
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1.5 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900', '--force-device-scale-factor=1.5']
  });

  try {
    if (!kybOnly) {
      // 1. SPORTSBOOK RECORDING (Full Screen)
      console.log('\n--- Recording Full-Screen Sportsbook Identity & Anti-Fraud Flow ---');
      const page1 = await browser.newPage();
      await page1.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle0' });

      // Capture updated OG Preview card
      await page1.screenshot({ path: path.resolve('public/assets/images/og-preview.png'), clip: { x: 0, y: 0, width: 1200, height: 630 } });
      fs.copyFileSync(path.resolve('public/assets/images/og-preview.png'), path.resolve('src/assets/images/og-preview.png'));

      const sbFrames = path.resolve('tmp_frames_sportsbook');
      await captureSequence(page1, sbFrames, [
        { type: 'wait', frames: 5 }, // initial full screen view
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
        { type: 'wait', frames: 6 } // final state with live inspection drawer
      ]);
      await page1.close();

      const sbOut1 = path.join(OUT_DIR, 'ninja-sportsbook-demo.mp4');
      const sbOut2 = path.join(VID_DIR, 'ninja-sportsbook-demo.mp4');
      encodeVideo(sbFrames, sbOut1);
      fs.copyFileSync(sbOut1, sbOut2);

      // 2. CREDIT & LENDING RECORDING (Full Screen - History Audit)
      console.log('\n--- Recording Full-Screen Credit Bureau & History Audit Flow ---');
      const page2 = await browser.newPage();
      await page2.goto(`http://127.0.0.1:${PORT}/credit.html`, { waitUntil: 'networkidle0' });

      // Capture updated OG Preview card for credit
      await page2.screenshot({ path: path.resolve('public/assets/images/og-preview-credit.png'), clip: { x: 0, y: 0, width: 1200, height: 630 } });
      fs.copyFileSync(path.resolve('public/assets/images/og-preview-credit.png'), path.resolve('src/assets/images/og-preview-credit.png'));

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
        { type: 'click', selector: '#btn-goto-step-3', frames: 4 }, // proceed to Step 3: Perform Full Credit History Audit
        { type: 'scroll', y: 250, frames: 3 },
        { type: 'click', selector: '#btn-pull-credit-history', frames: 10 }, // perform full history audit
        { type: 'wait', frames: 6 } // final review / decision state
      ]);
      await page2.close();

      const crOut1 = path.join(OUT_DIR, 'ninja-lending-demo.mp4');
      const crOut2 = path.join(VID_DIR, 'ninja-lending-demo.mp4');
      encodeVideo(crFrames, crOut1);
      fs.copyFileSync(crOut1, crOut2);
    }

    // 3. BUSINESS KYB & CAC RECORDING (Full Screen - Company & Directors Audit)
    console.log('\n--- Recording Full-Screen Corporate Business KYB & CAC Flow ---');
    const page3 = await browser.newPage();
    await page3.goto(`http://127.0.0.1:${PORT}/kyb.html`, { waitUntil: 'networkidle0' });

    // Capture updated OG Preview card for kyb
    await page3.screenshot({ path: path.resolve('public/assets/images/og-preview-kyb.png'), clip: { x: 0, y: 0, width: 1200, height: 630 } });
    fs.copyFileSync(path.resolve('public/assets/images/og-preview-kyb.png'), path.resolve('src/assets/images/og-preview-kyb.png'));

    const kybFrames = path.resolve('tmp_frames_kyb');
    await captureSequence(page3, kybFrames, [
      { type: 'wait', frames: 5 }, // initial hero
      { type: 'click', selector: '#btn-kyb-preset-inactive', frames: 3 }, // select delinquent company
      { type: 'click', selector: '#btn-submit-kyb-step1', frames: 4 }, // code slideout
      { type: 'click', selector: '#btn-drawer-proceed', frames: 8 }, // checks CAC, flags delinquent annual returns
      { type: 'click', selector: '#btn-kyb-preset-active', frames: 3 }, // select active company
      { type: 'click', selector: '#btn-submit-kyb-step1', frames: 4 }, // code slideout
      { type: 'click', selector: '#btn-drawer-proceed', frames: 8 }, // checks CAC, confirms Active status
      { type: 'click', selector: '#btn-next-step2', frames: 4 }, // proceed to Step 2: Directors Audit
      { type: 'click', selector: '#btn-pull-kyb-directors', frames: 4 }, // code slideout
      { type: 'click', selector: '#btn-drawer-proceed', frames: 8 }, // pulls official directors & shares
      { type: 'click', selector: '#btn-next-step3', frames: 4 }, // proceed to Step 3: Single-Link KYB
      { type: 'scroll', y: 200, frames: 3 },
      { type: 'click', selector: '#btn-create-kyb-flow', frames: 4 }, // code slideout
      { type: 'click', selector: '#btn-drawer-proceed', frames: 8 }, // creates hosted KYB flow
      { type: 'click', selector: '#btn-generate-kyb-link', frames: 4 }, // code slideout
      { type: 'click', selector: '#btn-drawer-proceed', frames: 8 }, // mints single-use vendor link
      { type: 'click', selector: '#btn-simulate-vendor-action', frames: 4 }, // opens interactive vendor portal simulator modal
      { type: 'wait', frames: 5 }, // inspect vendor portal fields (CAC, NIN, Bank match)
      { type: 'click', selector: '#btn-submit-vendor-portal', frames: 8 }, // vendor submits verification
      { type: 'wait', frames: 5 }, // live webhook arrives in telemetry log and workbench updates
      { type: 'click', selector: '#btn-approve-vendor', frames: 6 }, // enterprise executes agreement
      { type: 'scroll', y: -200, frames: 3 },
      { type: 'wait', frames: 6 } // final review state
    ]);
    await page3.close();

    const kybOut1 = path.join(OUT_DIR, 'ninja-kyb-demo.mp4');
    const kybOut2 = path.join(VID_DIR, 'ninja-kyb-demo.mp4');
    encodeVideo(kybFrames, kybOut1);
    fs.copyFileSync(kybOut1, kybOut2);

    console.log('\n--- Full-Screen HD Video Recordings Completed Successfully! ---');
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(path.resolve('tmp_frames_sportsbook'), { recursive: true, force: true });
    fs.rmSync(path.resolve('tmp_frames_credit'), { recursive: true, force: true });
    fs.rmSync(path.resolve('tmp_frames_kyb'), { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
