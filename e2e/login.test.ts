/*global page*/

import { host } from './config';
import { adminLogin, logout } from './helpers/login';
import proxyMock from './helpers/proxyMock';

describe('Login', () => {
  beforeAll(async () => {
    await proxyMock();
  });

  it('Should login as admin', async () => {
    await adminLogin();
    await expect(page).toMatchElement('span', { text: 'Account' });
  });

  it('Should not redirect to login when reloading an authorized route', async () => {
    await page.goto(`${host}/library`);
    await page.goto(`${host}/settings/account`);
    await expect(page).toMatchElement('span', { text: 'Account' });
  });

  it('Should logout', async () => {
    await logout();
    await page.goto(`${host}/settings/account`);
    await expect(page.content()).resolves.toMatch('Unauthorized');
  });
});
