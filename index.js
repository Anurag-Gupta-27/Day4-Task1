const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TIMEOUT = 120000; // 120 seconds timeout

async function downloadFile(url, filePath) {
  console.log(`Attempting to download file from ${url}`);
  const response = await axios({
    method: 'GET',
    url: url,
    responseType: 'stream'
  });

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);
    writer.on('finish', () => {
      console.log(`File downloaded successfully: ${filePath}`);
      resolve();
    });
    writer.on('error', (error) => {
      console.error(`Error writing file: ${filePath}`, error);
      reject(error);
    });
  });
}

(async () => {
  try {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    console.log('Navigating to ZAP projects page...');
    await page.goto('https://zap.planning.nyc.gov/projects/', { waitUntil: 'networkidle0', timeout: TIMEOUT });

    console.log('Extracting project links...');
    const projectLinks = await page.evaluate(() => {
      const resultsList = document.querySelector('.results > .results-list');
      const linkElements = resultsList.querySelectorAll('.ember-view > li > .cell.auto > h3 > a');
      return Array.from(linkElements).map(element => element.href);
    });

    console.log(`Found ${projectLinks.length} project links`);

    for (const link of projectLinks) {
      console.log(`Processing project: ${link}`);
      await page.goto(link, { waitUntil: 'networkidle0', timeout: TIMEOUT });

      const projectData = await page.evaluate(() => {
        const title = document.querySelector('.cell.large-7 h1')?.textContent.trim();
        return { title };
      });

      console.log(`Project title: ${projectData.title}`);

      const projectFolder = path.join(__dirname, 'projects', projectData.title.replace(/[^a-z0-9]/gi, '_'));
      console.log(`Creating project folder: ${projectFolder}`);
      fs.mkdirSync(projectFolder, { recursive: true });

      // Expand all clickable headers to reveal sections
      await page.evaluate(() => {
        document.querySelectorAll('.clickable-header').forEach(header => header.click());
      });

      const documentSections = await page.$$('.public-documents-list > li');
      console.log(`Found ${documentSections.length} document sections`);

      for (const section of documentSections) {
        const headerElement = await section.$('h5.clickable-header');
        const headerText = await headerElement.evaluate(el => el.textContent.trim());
        console.log(`Processing section: ${headerText}`);

        // Click on the header to reveal the document list
        await headerElement.click();
        
        // Wait for the unordered list with class name public-documents-list-item to be visible
        await page.waitForSelector('ul.public-documents-list-item', { timeout: TIMEOUT });

        // Use a delay to ensure the list has fully loaded (if needed)
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Create section folder
        const sectionFolder = path.join(projectFolder, headerText.replace(/[^a-z0-9]/gi, '_'));
        console.log(`Creating section folder: ${sectionFolder}`);
        fs.mkdirSync(sectionFolder, { recursive: true });

        // Get all files in the section after clicking the header
        const files = await section.$$('ul.public-documents-list-item > li > a');
        console.log(`Found ${files.length} files in section`);

        for (const file of files) {
          const fileUrl = await file.evaluate(el => el.href);
          const fileName = await file.evaluate(el => el.textContent.trim());
          const filePath = path.join(sectionFolder, fileName.replace(/[^a-z0-9.]/gi, '_'));

          console.log(`Downloading file: ${fileName}`);
          try {
            await downloadFile(fileUrl, filePath);
          } catch (error) {
            console.error(`Error downloading ${fileName}: ${error.message}`);
          }
        }
      }
    }

    console.log('Closing browser...');
    await browser.close();
    console.log('Process completed successfully');
  } catch (error) {
    console.error('An error occurred:', error);
  }
})();
