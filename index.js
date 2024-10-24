const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TIMEOUT = 120000; // 120 seconds timeout

// Main function to scrape ZAP projects and download associated documents
(async () => {
    try {
        console.log('Launching browser...');
        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();

        // Navigate to the main projects page
        console.log('Navigating to ZAP projects page...');
        await page.goto('https://zap.planning.nyc.gov/projects/', { waitUntil: 'networkidle0', timeout: TIMEOUT });

        // Extract all project links from the main page
        console.log('Extracting project links...');
        const projectLinks = await page.evaluate(() => {
            const resultsList = document.querySelector('.results > .results-list');
            const linkElements = resultsList.querySelectorAll('.ember-view > li > .cell.auto > h3 > a');
            return Array.from(linkElements).map(element => element.href);
        });

        console.log(`Found ${projectLinks.length} project links`);

        // Process each project
        for (const link of projectLinks) {
            console.log(`Processing project: ${link}`);
            await page.goto(link, { waitUntil: 'networkidle0', timeout: TIMEOUT });

            // Extract project title, brief, applicant team, and milestones
            const projectData = await page.evaluate(() => {
                const title = document.querySelector('.cell.large-7 h1')?.textContent.trim();
                const brief = document.querySelector('.project-brief')?.textContent.trim() || "No brief available.";
                
                // Update the selector for applicant team and clean up extra spaces
                let applicantTeam = document.querySelector('.cell.medium-auto p.lead')?.textContent.trim().replace(/\s+/g, ' ') || null;
                
                const milestones = Array.from(document.querySelectorAll('.milestone-item'))
                    .map(item => ({
                        title: item.querySelector('.milestone-title')?.textContent.trim() || "Untitled milestone",
                        brief: item.querySelector('.milestone-brief')?.textContent.trim() || "No brief available",
                        date: item.querySelector('.milestone-date')?.textContent.trim() || "Date not available",
                        completed: item.querySelector('.milestone-status')?.textContent.includes('Completed')
                    }));

                return { title, brief, applicantTeam, milestones };
            });

            console.log(`Project title: ${projectData.title}`);
            console.log(`Applicant Team: ${projectData.applicantTeam}`);

            // Create a folder for the project
            const projectFolder = path.join(__dirname, 'projects', projectData.title.replace(/[^a-z0-9]/gi, '_'));
            console.log(`Creating project folder: ${projectFolder}`);
            fs.mkdirSync(projectFolder, { recursive: true });

            // Format the project info for info.json
            const projectInfo = {
                title: projectData.title,
                brief: projectData.brief,
                applicant_team_name: projectData.applicantTeam ? projectData.applicantTeam.replace(/\s{2,}/g, ' ') : null,  // Replace multiple spaces with a single space
                milestone: projectData.milestones.length > 0 ? projectData.milestones[0].title : "No milestones available"
            };

            // Save project info to info.json in the project folder
            fs.writeFileSync(path.join(projectFolder, 'info.json'), JSON.stringify(projectInfo, null, 2));
            console.log(`Project information saved to ${path.join(projectFolder, 'info.json')}`);
            console.log(`info.json has been created successfully for project: ${projectData.title}`);

            // Process milestones if any
            if (projectData.milestones.length > 0) {
                console.log(`Found ${projectData.milestones.length} milestones for project: ${projectData.title}`);
                projectData.milestones.forEach((milestone, index) => {
                    console.log(`Milestone ${index + 1}:`);
                    console.log(`  Title: ${milestone.title}`);
                    console.log(`  Brief: ${milestone.brief}`);
                    console.log(`  Date: ${milestone.date}`);
                    console.log(`  Completed: ${milestone.completed ? 'Yes' : 'No'}`);
                });
            } else {
                console.log('No milestones found for this project.');
            }

            // Check for document sections
            const documentSections = await page.$$('.public-documents-list > li');

            if (documentSections.length === 0) {
                console.log('No document sections found for this project.');
            } else {
                console.log(`Found ${documentSections.length} document sections`);

                // Expand all clickable headers to reveal document sections
                await page.evaluate(() => {
                    document.querySelectorAll('.clickable-header').forEach(header => header.click());
                });

                for (const section of documentSections) {
                    const headerElement = await section.$('h5.clickable-header');
                    const headerText = await headerElement.evaluate(el => el.textContent.trim());
                    console.log(`Processing section: ${headerText}`);

                    // Click on the header to reveal the document list
                    await headerElement.click();
                    
                    // Wait for the document list to be visible
                    await page.waitForSelector('ul.public-documents-list-item', { timeout: TIMEOUT });

                    // Create a folder for the section
                    const sectionFolder = path.join(projectFolder, headerText.replace(/[^a-z0-9]/gi, '_'));
                    console.log(`Creating section folder: ${sectionFolder}`);
                    fs.mkdirSync(sectionFolder, { recursive: true });

                    // Get all files in the section
                    const files = await section.$$('ul.public-documents-list-item > li > a');
                    console.log(`Found ${files.length} files in section`);

                    // Download each file in the section
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
        }

        console.log('Closing browser...');
        await browser.close();
        console.log('Process completed successfully');
    } catch (error) {
        console.error('An error occurred:', error);
    }
})();

// Function to download file
async function downloadFile(url, filePath) {
    const response = await axios({
        method: 'GET',
        url,
        responseType: 'stream'
    });
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}
