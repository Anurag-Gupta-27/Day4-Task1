const puppeteer = require('puppeteer');
const fs = require('fs');

const TIMEOUT = 60000; // 60 seconds timeout

(async () => {
  try {
    // Launch the browser
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    // Navigate to the ZAP projects page
    await page.goto('https://zap.planning.nyc.gov/projects/', { waitUntil: 'networkidle0', timeout: TIMEOUT });

    // Extract project links
    const projectLinks = await page.evaluate(() => {
      const resultsList = document.querySelector('.results > .results-list');
      const linkElements = resultsList.querySelectorAll('.ember-view > li > .cell.auto > h3 > a');
      return Array.from(linkElements).map(element => element.href);
    });

    console.log(`Found ${projectLinks.length} project links`);

    // Array to store project data
    const projectsData = [];

    // Visit each project page and extract information
    for (const link of projectLinks) {
      await page.goto(link, { waitUntil: 'networkidle0', timeout: TIMEOUT });
      
      const projectData = await page.evaluate(() => {
        const title = document.querySelector('.cell.large-7 h1')?.textContent.trim();
        return { title };
      });

      projectsData.push({ url: link, ...projectData });
      console.log(`Processed: ${projectData.title}`);
    }

    // Save the data to a JSON file
    fs.writeFileSync('projects_data.json', JSON.stringify(projectsData, null, 2));
    console.log('Data saved to projects_data.json');

    // Close the browser
    await browser.close();
  } catch (error) {
    console.error('An error occurred:', error);
  }
})();
