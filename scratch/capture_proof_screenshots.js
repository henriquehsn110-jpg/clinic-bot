const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function capture() {
    // Start local server
    console.log('Starting local Express server...');
    const serverProcess = spawn('node', ['server.js'], { cwd: __dirname + '/..' });

    await new Promise(r => setTimeout(r, 2500));

    const artifactDir = 'C:\\Users\\letic\\.gemini\\antigravity\\brain\\7e30a766-ab3b-4a5d-b15b-00f3c9d55a93';
    
    // Find Chrome
    const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    let executablePath = possiblePaths.find(p => fs.existsSync(p));

    console.log('Using browser executable:', executablePath);
    const browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const targetUrl = 'http://localhost:3000';
    console.log('Navigating to:', targetUrl);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    // 1. Screenshot Hero Section
    await page.screenshot({
        path: path.join(artifactDir, 'proof_hero.png'),
        clip: { x: 0, y: 0, width: 1440, height: 850 }
    });
    console.log('Hero screenshot saved.');

    // 2. Screenshot Footer Section
    const footerHandle = await page.$('footer');
    if (footerHandle) {
        await footerHandle.screenshot({
            path: path.join(artifactDir, 'proof_footer.png')
        });
        console.log('Footer screenshot saved.');
    }

    // 3. Open Modal Simulator and Screenshot
    await page.click('#btn-header-demo');
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({
        path: path.join(artifactDir, 'proof_modal.png')
    });
    console.log('Modal screenshot saved.');

    await browser.close();
    serverProcess.kill();
    console.log('Done!');
}

capture().catch(err => {
    console.error('Error capturing screenshots:', err);
    process.exit(1);
});
