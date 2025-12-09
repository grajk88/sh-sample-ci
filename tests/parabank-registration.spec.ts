import { test, expect } from '../utils/healing-fixture';

test('test', async ({ healingPage }) => {
  await healingPage.goto('https://parabank.parasoft.com/parabank/register.htm');
  
  // Using healing methods - these will trigger AI healing for broken locators
  await healingPage.click("locator('[id=\"customer.firstNasssme\"]')");
  await healingPage.fill("locator('[id=\"customer.firstName\"]')", 'Test');
  await healingPage.fill("locator('[id=\"cussstomer.lastName\"]')", 'Test');
  await healingPage.fill("locator('[id=\"customer.address.street\"]')", 'Test');
  await healingPage.fill("locator('[id=\"customer.address.city\"]')", 'Test');
  await healingPage.fill("locator('[id=\"customer.address.state\"]')", 'Test');
  await healingPage.fill("locator('[id=\"customer.address.zipCode\"]')", 'Test');
  await healingPage.fill("locator('[id=\"customer.phoneNumber\"]')", 'Test');
  await healingPage.fill("locator('[id=\"customer.ssn\"]')", 'Test');
  await healingPage.fill("locator('[id=\"customer.username\"]')", 'Test002');
  await healingPage.fill("locator('[id=\"customer.password\"]')", 'Test');
  await healingPage.fill("locator('#repeatedPassword')", 'Test');
  
  await healingPage.getByRole('button', { name: 'Register' }).click();
  await expect(healingPage.getByText('Your account was created')).toBeVisible();
  await healingPage.getByRole('link', { name: 'Log Out' }).click();
});