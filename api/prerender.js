const puppeteer = require('puppeteer-core');
const chrome = require('chrome-aws-lambda');

async function launchBrowser(attempt = 1, maxAttempts = 3) {
  try {
    console.log(`Attempting to launch browser (Attempt ${attempt}/${maxAttempts})`);
    const browser = await puppeteer.launch({
      args: chrome.args,
      executablePath: await chrome.executablePath,
      headless: true,
      timeout: 30000,
    });
    console.log('Browser launched successfully');
    return browser;
  } catch (error) {
    console.error(`Browser launch failed: ${error.message}`);
    if (attempt < maxAttempts) {
      console.log(`Retrying browser launch...`);
      return launchBrowser(attempt + 1, maxAttempts);
    }
    throw error;
  }
}

module.exports = async (req, res) => {
  const url = req.query.url;
  if (!url) {
    console.error('No URL provided');
    return res.status(400).send('URL is required');
  }

  let browser = null;
  try {
    console.log(`Processing URL: ${url}`);
    browser = await launchBrowser();
    const page = await browser.newPage();
    console.log(`Navigating to URL: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('Waiting for prerenderReady signal...');
    await page.evaluate(() => {
      return new Promise((resolve) => {
        const checkReady = () => {
          if (window.prerenderReady || (window.PrERENDER && window.PrERENDER.ready)) {
            resolve();
          } else {
            setTimeout(checkReady, 100);
          }
        };
        checkReady();
      });
    });
    console.log('PrerenderReady signal received, capturing HTML');
    const html = await page.content();
    console.log('Browser closing...');
    await browser.close();
    console.log('Browser closed, sending HTML response');
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error(`Error rendering page: ${error.message}`, error.stack);
    res.status(500).send(`Error rendering page: ${error.message}`);
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log('Browser closed in finally block');
      } catch (closeError) {
        console.error(`Error closing browser: ${closeError.message}`);
      }
    }
  }
};