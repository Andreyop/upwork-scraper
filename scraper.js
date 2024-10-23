/**
 * Author: Andrey Anishchenko <andrey.anishchenko.dev@gmail.com>
 * Date: 23/10/2024
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

// Используем Stealth Plugin для обхода защит
puppeteer.use(StealthPlugin());

// Функция для ожидания указанного времени
function waitFor(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Функция для парсинга вакансий внутри категории
async function scrapeCategoryJobs(page, categoryUrl) {
    await page.goto(categoryUrl, { waitUntil: 'networkidle2' });

    let jobs = [];

    // Функция для сбора вакансий с текущей страницы
    const collectJobs = async () => {
        const newJobs = await page.$$eval('section[data-qa="job-tile"]', (jobCards) => {
            return jobCards.map((jobCard) => {
                const jobTitle = jobCard.querySelector('a[data-qa="job-title"]')?.innerText.trim() || '';
                const jobLink = 'https://www.upwork.com' + jobCard.querySelector('a[data-qa="job-title"]')?.getAttribute('href');
                const jobDescription = jobCard.querySelector('p[data-qa="job-description"]')?.innerText.trim() || '';
                const jobHourlyRate = jobCard.querySelector('small')?.innerText.trim() || '';
                const jobHoursNeeded = jobCard.querySelector('p[data-qa="hours-needed"] strong')?.innerText.trim() || '';
                const jobDuration = jobCard.querySelector('p[data-qa="duration"] strong')?.innerText.trim() || '';
                const jobExpertLevel = jobCard.querySelector('p[data-qa="expert-level"] strong')?.innerText.trim() || '';

                // Список навыков
                const jobSkills = Array.from(jobCard.querySelectorAll('span[data-qa="legacy-skill"]'))
                    .map(skill => skill.innerText.trim());

                return {
                    title: jobTitle,
                    link: jobLink,
                    description: jobDescription,
                    hourlyRate: jobHourlyRate,
                    hoursNeeded: jobHoursNeeded,
                    duration: jobDuration,
                    expertLevel: jobExpertLevel,
                    skills: jobSkills,
                };
            });
        });
        jobs = [...jobs, ...newJobs];
    };

    // Собираем вакансии с первой загрузки
    await collectJobs();

    // Проверяем наличие кнопки "Load more jobs" и нажимаем на нее
    let loadMoreExists = true;
    while (loadMoreExists) {
        loadMoreExists = await page.$('a[data-qa="load-more"]') !== null;

        if (loadMoreExists) {
            const loadMoreButton = await page.$('a[data-qa="load-more"]');
            await loadMoreButton.click();

            // Используем waitFor для ожидания загрузки новых вакансий
            await page.waitForSelector('section[data-qa="job-tile"]', { timeout: 10000 }); // ждем загрузки новых вакансий
            await waitFor(2000); // Ждем 2 секунды для стабилизации после загрузки
            await collectJobs(); // Собираем новые вакансии
        }
    }

    return jobs;
}

// Функция для парсинга главной страницы категорий
async function scrapeUpworkCategories() {
    const browser = await puppeteer.launch({
        headless: false, // Установите true, если хотите скрыть браузер
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    // Переходим на страницу с категориями вакансий
    await page.goto('https://www.upwork.com/freelance-jobs/', { waitUntil: 'networkidle2' });

    // Собираем ссылки на категории вакансий
    const categoryLinks = await page.$$eval('a[data-qa="link"]', links =>
        links.map(link => ({
            title: link.innerText.trim(),
            url: 'https://www.upwork.com' + link.getAttribute('href')
        }))
    );

    console.log("Собрано категорий:", categoryLinks.length);

    let allCategoriesJobs = [];

    // Ограничиваем количество категорий до 5
    const categoriesToScrape = categoryLinks.slice(0, 5);

    // Проходим по каждой категории и парсим вакансии
    for (const category of categoriesToScrape) {
        console.log(`Парсим категорию: ${category.title}`);
        const categoryJobs = await scrapeCategoryJobs(page, category.url);
        allCategoriesJobs.push({
            category: category.title,
            jobs: categoryJobs,
        });
    }

    await browser.close();

    console.log("Парсинг завершён.");

    // Записываем данные в файл categories_jobs.json
    fs.writeFileSync('categories_jobs.json', JSON.stringify(allCategoriesJobs, null, 2), 'utf-8');
    console.log("Данные записаны в файл categories_jobs.json");
}

scrapeUpworkCategories();

