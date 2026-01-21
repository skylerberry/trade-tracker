const { test, expect } = require('@playwright/test');

test.describe('Trade Tracker App', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8080');
        // Clear localStorage before each test
        await page.evaluate(() => localStorage.clear());
        await page.reload();
    });

    test('should load the page with correct title', async ({ page }) => {
        await expect(page).toHaveTitle('Trade Tracker');
        await expect(page.locator('h1')).toContainText('Trade Management Dashboard');
    });

    test('should show "No trades" message when empty', async ({ page }) => {
        await expect(page.locator('#noTrades')).toBeVisible();
        await expect(page.locator('#noTrades')).toContainText('No trades logged yet');
    });

    test('should toggle form visibility when clicking Add button', async ({ page }) => {
        const toggleBtn = page.locator('#toggleFormBtn');
        const form = page.locator('#tradeForm');

        // Form should be hidden initially
        await expect(form).toBeHidden();

        // Click to show form
        await toggleBtn.click();
        await expect(form).toBeVisible();
        await expect(toggleBtn).toContainText('- Hide Form');

        // Click to hide form
        await toggleBtn.click();
        await expect(form).toBeHidden();
        await expect(toggleBtn).toContainText('+ Add New Trade');
    });

    test('should add a new trade', async ({ page }) => {
        // Open form
        await page.click('#toggleFormBtn');

        // Fill in trade details
        await page.fill('#ticker', 'AAPL');
        await page.fill('#entryPrice', '150.50');
        await page.fill('#initialSL', '145.00');
        await page.fill('#currentSL', '145.00');

        // Submit form
        await page.click('button[type="submit"]');

        // Verify trade appears in table
        await expect(page.locator('#tradesTable')).toBeVisible();
        await expect(page.locator('td strong')).toContainText('AAPL');
        await expect(page.locator('#noTrades')).toBeHidden();
    });

    test('should copy initial SL to current SL', async ({ page }) => {
        // Open form
        await page.click('#toggleFormBtn');

        // Fill in initial SL
        await page.fill('#initialSL', '99.99');

        // Click copy button
        await page.click('#copyInitialSL');

        // Verify current SL has the same value
        const currentSL = await page.inputValue('#currentSL');
        expect(currentSL).toBe('99.99');
    });

    test('should edit an existing trade', async ({ page }) => {
        // First add a trade
        await page.click('#toggleFormBtn');
        await page.fill('#ticker', 'TSLA');
        await page.fill('#entryPrice', '200.00');
        await page.fill('#initialSL', '190.00');
        await page.fill('#currentSL', '190.00');
        await page.click('button[type="submit"]');

        // Click edit button
        await page.click('.btn-edit');

        // Verify form is populated
        const ticker = await page.inputValue('#ticker');
        expect(ticker).toBe('TSLA');

        // Change the ticker
        await page.fill('#ticker', 'GOOG');
        await page.click('button[type="submit"]');

        // Verify update
        await expect(page.locator('td strong')).toContainText('GOOG');
    });

    test('should delete a trade', async ({ page }) => {
        // Add a trade first
        await page.click('#toggleFormBtn');
        await page.fill('#ticker', 'MSFT');
        await page.fill('#entryPrice', '300.00');
        await page.fill('#initialSL', '290.00');
        await page.fill('#currentSL', '290.00');
        await page.click('button[type="submit"]');

        // Confirm trade exists
        await expect(page.locator('td strong')).toContainText('MSFT');

        // Handle dialog
        page.on('dialog', dialog => dialog.accept());

        // Click delete (on the trade row, not the modal)
        await page.click('.actions-cell .btn-delete');

        // Verify trade is removed
        await expect(page.locator('#noTrades')).toBeVisible();
    });

    test('should filter trades by status', async ({ page }) => {
        // Add an open trade
        await page.click('#toggleFormBtn');
        await page.fill('#ticker', 'OPEN1');
        await page.fill('#entryPrice', '100.00');
        await page.fill('#initialSL', '95.00');
        await page.fill('#currentSL', '95.00');
        await page.selectOption('#status', 'open');
        await page.click('button[type="submit"]');

        // Add a closed trade
        await page.click('#toggleFormBtn');
        await page.fill('#ticker', 'CLOSED1');
        await page.fill('#entryPrice', '100.00');
        await page.fill('#initialSL', '95.00');
        await page.fill('#currentSL', '95.00');
        await page.selectOption('#status', 'closed');
        await page.click('button[type="submit"]');

        // Filter by open
        await page.selectOption('#statusFilter', 'open');
        await expect(page.locator('td strong')).toContainText('OPEN1');
        await expect(page.locator('td strong')).not.toContainText('CLOSED1');

        // Filter by closed
        await page.selectOption('#statusFilter', 'closed');
        await expect(page.locator('td strong')).toContainText('CLOSED1');
        await expect(page.locator('td strong')).not.toContainText('OPEN1');

        // Show all
        await page.selectOption('#statusFilter', 'all');
        await expect(page.locator('tbody tr')).toHaveCount(2);
    });

    test('should persist trades in localStorage', async ({ page }) => {
        // Add a trade
        await page.click('#toggleFormBtn');
        await page.fill('#ticker', 'PERSIST');
        await page.fill('#entryPrice', '50.00');
        await page.fill('#initialSL', '48.00');
        await page.fill('#currentSL', '48.00');
        await page.click('button[type="submit"]');

        // Reload page
        await page.reload();

        // Verify trade still exists
        await expect(page.locator('td strong')).toContainText('PERSIST');
    });

    test('should have working date picker', async ({ page }) => {
        await page.click('#toggleFormBtn');

        // Click on the entry date field (flatpickr altInput)
        const dateInput = page.locator('#entryDate + input');
        await dateInput.click();

        // Verify flatpickr calendar opens
        await expect(page.locator('.flatpickr-calendar.open')).toBeVisible();
    });

    test('should show export button', async ({ page }) => {
        const exportBtn = page.locator('#exportPdfBtn');
        await expect(exportBtn).toBeVisible();
        await expect(exportBtn).toContainText('Export Open Trades to PDF');
    });
});
