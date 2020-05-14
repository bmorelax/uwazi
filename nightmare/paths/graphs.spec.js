/* eslint max-len: ["error", 500] */
import { catchErrors } from 'api/utils/jasmineHelpers';
import { toMatchImageSnapshot } from 'jest-image-snapshot';
import createNightmare from '../helpers/nightmare';
import insertFixtures from '../helpers/insertFixtures';
import { loginAsAdminAndGoToSettings } from '../helpers/commonTests';
import { element } from 'prop-types';

expect.extend({ toMatchImageSnapshot });

const localSelectors = {
  pagesButton:
    '#app > div.content > div > div > div.settings-navigation > div > div:nth-child(1) > div.list-group > a:nth-child(5)',
  createNewPageButton:
    '#app > div.content > div > div > div.settings-content > div > div.settings-footer > a',
  savePageButton:
    '#app > div.content > div > div > div.settings-content > div > form > div.settings-footer > button.save-template',
  pageTitleInput:
    '#app > div.content > div > div > div.settings-content > div > form > div.panel.panel-default > div.metadataTemplate-heading.panel-heading > div > div > input',
  pageContentsInput:
    '#app > div.content > div > div > div.settings-content > div > form > div.panel.panel-default > div.panel-body.page-viewer.document-viewer > div > div.tab-content.tab-content-visible > textarea',
  createdPageLink: '.document-viewer > div.alert-info a',
};

const nightmare = createNightmare();

const graphs = {
  barChart: '<BarChart property="super_powers" context="58ad7d240d44252fee4e6208" />',
  pieChart: '<PieChart property="super_powers" context="58ad7d240d44252fee4e6208" />',
  listChart:
    '<ListChart property="super_powers" context="58ad7d240d44252fee4e6208" excludeZero="true" />',
};

describe('pages path', () => {
  beforeAll(async () => insertFixtures());
  afterAll(async () => nightmare.end());

  describe('login', () => {
    it('should log in as admin then click the settings nav button', done => {
      loginAsAdminAndGoToSettings(nightmare, catchErrors, done);
    });
  });

  describe('Graphs in Page', () => {
    it('should create a basic page', async () => {
      await nightmare
        .goto('http://localhost:3000/en/settings')
        .clickLink('Pages')
        .clickLink('Add page')
        .wait('.page-creator')
        .write(localSelectors.pageTitleInput, 'Page data viz')
        .write(localSelectors.pageContentsInput, '</p><Dataset />')
        .clickLink('Save')
        .waitToClick('.alert.alert-success');

      const text = await nightmare.getInnerText(localSelectors.createdPageLink);
      expect(text).toContain('(view page)');
    });

    it('should insert Bar chart graph in created page', async () => {
      const pageContentsInput = await nightmare.evaluate(
        selector => document.querySelector(selector).value,
        localSelectors.pageContentsInput
      );

      expect(pageContentsInput).toContain('<Dataset />');

      await nightmare
        .write(localSelectors.pageContentsInput, graphs.barChart)
        .click(localSelectors.savePageButton)
        .waitToClick('.alert.alert-success');
    });

    it('should display Bar chart graph in page with no more than a 1% difference', async () => {
      const chartsContainerHTML = await nightmare
        .clickLink('(view page)')
        .wait('div.markdown-viewer')
        .waitForGraphsAnimation()
        .getInnerHtml('div.markdown-viewer');

      expect(chartsContainerHTML).toContain('class="recharts-responsive-container"');

      await nightmare.evaluate(() => document.querySelector('header').remove());
      await nightmare.evaluate(() => document.querySelector('.footer-nav').remove());
      await nightmare.evaluate(() => document.querySelector('footer').remove());
      await nightmare.evaluate(() => document.querySelector('#app').style.padding = '0');
      await nightmare.evaluate(() => document.querySelector('.page-viewer').style.padding = '0');
      await nightmare.evaluate(() => document.querySelector('.main-wrapper').style.padding = '0');

      const pageScreenshot = await nightmare.screenshot();
      expect(pageScreenshot).toMatchImageSnapshot({
        failureThreshold: 0.01,
        failureThresholdType: 'percent',
        allowSizeMismatch: true,
      });
    });

    it('should navigate back to the edit page and insert Pie+List chart graphs', async () => {
      await nightmare
        .back()
        .wait('.page-creator')
        .clearInput(localSelectors.pageContentsInput);

      const pageContentsInput = await nightmare.evaluate(
        selector => document.querySelector(selector).value,
        localSelectors.pageContentsInput
      );

      expect(pageContentsInput).toBe('');
      expect(pageContentsInput.length).toEqual(0);

      await nightmare
        .write(localSelectors.pageContentsInput, '</p><Dataset />')
        .write(localSelectors.pageContentsInput, graphs.pieChart)
        .write(localSelectors.pageContentsInput, graphs.listChart)
        .click(localSelectors.savePageButton);
    });

    it('should display Pie-List chart graphs in page with no more than a 1% difference', async () => {
      const chartsContainerHTML = await nightmare
        .clickLink('(view page)')
        .wait('div.markdown-viewer')
        .waitForGraphsAnimation()
        .getInnerHtml('div.markdown-viewer');

      expect(chartsContainerHTML).toContain('class="recharts-responsive-container"');

      await nightmare.evaluate(() => document.querySelector('header').remove());
      await nightmare.evaluate(() => document.querySelector('.footer-nav').remove());
      await nightmare.evaluate(() => document.querySelector('footer').remove());
      await nightmare.evaluate(() => document.querySelector('#app').style.padding = '0');
      await nightmare.evaluate(() => document.querySelector('.page-viewer').style.padding = '0');
      await nightmare.evaluate(() => document.querySelector('.main-wrapper').style.padding = '0');

      const pageScreenshot = await nightmare.screenshot();
      expect(pageScreenshot).toMatchImageSnapshot({
        failureThreshold: 0.01,
        failureThresholdType: 'percent',
        allowSizeMismatch: true,
      });
    });
  });
});
