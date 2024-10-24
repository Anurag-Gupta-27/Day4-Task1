const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');

const TIMEOUT = 60000; // 30 seconds timeout

(async () => {
  try {
    // Launch the browser
    const browser = await puppeteer.launch({ headless: "true" }).catch(e => {
      console.error('Failed to launch browser:', e);
      throw e;
    });
    console.log('Browser launched successfully');

    const page = await browser.newPage().catch(e => {
      console.error('Failed to create new page:', e);
      throw e;
    });
    console.log('New page created');

    // Navigate to the ZAP projects page
    const url = 'https://zap.planning.nyc.gov/projects/';
    await page.goto(url, { waitUntil: 'networkidle0', timeout: TIMEOUT }).catch(e => {
      console.error(`Failed to navigate to ${url}:`, e);
      throw e;
    });
    console.log('Successfully navigated to the ZAP projects page');

    // Optional: Take a screenshot of the page
    await page.screenshot({ path: 'zap_projects.png', timeout: TIMEOUT }).catch(e => {
      console.error('Failed to take screenshot:', e);
      throw e;
    });
    console.log('Screenshot taken and saved as zap_projects.png');

    // Close the browser
    await browser.close().catch(e => {
      console.error('Failed to close browser:', e);
      throw e;
    });
    console.log('Browser closed successfully');
  } catch (error) {
    console.error('An error occurred:', error);
  }
})();
