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

      // Extract project title, applicant team, and milestones
      const projectData = await page.evaluate(() => {
        const title = document.querySelector('.cell.large-7 h1')?.textContent.trim();

        // Extract applicant team name from the specified structure
        const applicantTeamElement = document.querySelector('.cell.medium-auto p.lead');
        let applicantTeam = '';
        if (applicantTeamElement) {
          // Extract all text within the element, trimming extra spaces
          applicantTeam = applicantTeamElement.innerText.replace(/^\s*Applicant Team:\s*/, '').trim();
        }

        // Extract milestones
        const milestones = {};
        const milestoneSections = document.querySelectorAll('.cell.medium-6 > div');
        milestoneSections.forEach(section => {
          const header = section.querySelector('li.milestone-header h4')?.textContent.trim();
          if (header) {
            milestones[header] = [];
            const milestoneItems = section.querySelectorAll('li:not(.milestone-header)');
            milestoneItems.forEach(item => {
              const milestone = item.querySelector('h4.no-margin')?.textContent.trim();
              if (milestone) {
                milestones[header].push(milestone);
              }
            });
          }
        });

        return { 
          title,
          applicant_team_name: applicantTeam,
          milestones
        };
      });

      // Log the entire projectData object
      console.log('Project data:', JSON.stringify(projectData, null, 2));

      const projectFolder = path.join(__dirname, 'projects', projectData.title.replace(/[^a-z0-9]/gi, '_'));
      console.log(`Creating project folder: ${projectFolder}`);
      fs.mkdirSync(projectFolder, { recursive: true });

      // Save project info to info.json
      const infoPath = path.join(projectFolder, 'info.json');
      fs.writeFileSync(infoPath, JSON.stringify(projectData, null, 2));

      // Log applicant team name
      if (projectData.applicant_team_name) {
        console.log(`Applicant Team: ${projectData.applicant_team_name}`);
      } else {
        console.log('No applicant team found for this project.');
      }

      // Log milestone details if any
      if (Object.keys(projectData.milestones).length > 0) {
        console.log(`Found ${Object.keys(projectData.milestones).length} milestones for project: ${projectData.title}`);
        for (const milestone in projectData.milestones) {
          console.log(`Milestone ${milestone}:`);
          console.log(`  Titles: ${projectData.milestones[milestone].join(', ')}`);
        }
      } else {
        console.log('No milestones found for this project.');
      }

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
