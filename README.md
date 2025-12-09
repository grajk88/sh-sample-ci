# Self-Healing AI Test Framework 🏥

A Playwright test framework integrated with OpenAI that automatically fixes broken locators during test execution.

## Features

- **AI-Powered Locator Healing**: When a test fails due to a locator error, OpenAI analyzes the page and suggests alternative locators
- **Vision Analysis**: Uses GPT-4 Vision to analyze screenshots for additional context
- **Automatic Retry**: Attempts multiple AI-suggested locators until one succeeds
- **Detailed JSON Reports**: Tracks all healing attempts and successes in JSON format
- **Zero Test Modification**: Works with existing Playwright tests using custom fixtures

## Setup

1. Install dependencies:
```bash
npm install
```

2. Add your OpenAI API key to `.env`:
```
OPENAI_API_KEY=sk-your-key-here
```

3. Install Playwright browsers:
```bash
npx playwright install
```

## How It Works

### 1. **OpenAI Service** (`utils/openai-service.ts`)
   - Connects to OpenAI's GPT-4 API
   - Analyzes page HTML and error messages
   - Suggests alternative Playwright locators
   - Can use vision API to analyze screenshots

### 2. **Healing Fixture** (`utils/healing-fixture.ts`)
   - Custom Playwright test fixture that wraps page actions
   - Intercepts locator failures
   - Calls OpenAI service to get suggestions
   - Tries each suggestion until one works
   - Records all changes for reporting

### 3. **Healing Reporter** (`utils/healing-reporter.ts`)
   - Custom Playwright reporter
   - Aggregates all healing events
   - Generates JSON summary report
   - Shows statistics in console

### 4. **Configuration** (`playwright.config.ts`)
   - Configured to use the healing reporter
   - Loads environment variables
   - Standard Playwright settings

## Usage

### Option 1: Use the HealingPage Fixture (Recommended for self-healing)

```typescript
import { test, expect } from '../utils/healing-fixture';

test('my test', async ({ healingPage }) => {
  const page = healingPage.originalPage;
  await page.goto('https://example.com');
  
  // This will auto-heal if the locator breaks
  await healingPage.click("getByRole('button', { name: 'Submit' })");
});
```

### Option 2: Use Standard Playwright (with healing reporter)

```typescript
import { test, expect } from '../utils/healing-fixture';

test('my test', async ({ page }) => {
  await page.goto('https://example.com');
  // Standard Playwright - no auto-healing, but healing context available
});
```

## Running Tests

```bash
# Run all tests
npx playwright test

# Run specific test
npx playwright test tests/example.spec.ts

# Run with UI
npx playwright test --ui
```

## Reports

After running tests, check:

- **HTML Report**: `healing-reports/healing-*.html` - Beautiful visual report with statistics and details
- **JSON Report**: `healing-reports/summary.json` - Contains all healing attempts and successes
- **Individual Reports**: `healing-reports/healing-*.json` - Individual test healing data
- **Playwright Report**: `playwright-report/index.html` - Standard Playwright report

### Healing HTML Report Features

The HTML report includes:
- **Summary statistics** with success rates
- **Visual cards** for each healing event
- **Color-coded** success/failure indicators
- **Detailed locator comparisons** (before/after)
- **All attempted locators** with success markers
- **Error messages** and timestamps
- **Responsive design** for mobile and desktop

### Example Healing Report

```json
{
  "totalTests": 1,
  "totalHealing": 2,
  "successfulHealing": 1,
  "failedHealing": 1,
  "timestamp": "2025-12-06T10:30:00.000Z",
  "changes": [
    {
      "timestamp": "2025-12-06T10:30:00.000Z",
      "testName": "self-healing demo",
      "originalLocator": "getByRole('button', { name: 'Submitt' })",
      "healedLocator": "getByRole('button', { name: 'Submit' })",
      "errorMessage": "locator.click: Error: strict mode violation",
      "success": true,
      "attemptedLocators": [
        "getByRole('button', { name: 'Submit' })",
        "getByTestId('submit-btn')"
      ]
    }
  ]
}
```

## How Healing Works

1. **Test runs** with a locator that fails (e.g., element not found)
2. **Healing intercepts** the error
3. **Page HTML is extracted** and sent to OpenAI
4. **OpenAI analyzes** the HTML and suggests 3-5 alternative locators
5. **Each suggestion is tried** sequentially
6. **If all fail**, screenshot is taken and analyzed by GPT-4 Vision
7. **First successful locator** is used to continue the test
8. **All attempts are recorded** in JSON for review

## Benefits

- **Reduces test maintenance**: Tests self-heal when UI changes
- **Faster feedback**: No need to manually fix tests immediately
- **Learning from changes**: JSON reports show what locators changed
- **Easy migration**: Review healing reports to update your tests properly

## Configuration Options

Edit `playwright.config.ts` to customize:
- Output directory for healing reports
- Enable/disable vision analysis
- Retry attempts
- AI model selection (in `openai-service.ts`)

## Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key (required for healing)

## Notes

- Healing only activates when `OPENAI_API_KEY` is set
- Without the API key, tests run normally without healing
- Each healing attempt uses OpenAI API credits
- Vision analysis is a fallback and uses more credits

## Example Output

```
✓ OpenAI connection enabled
   🔌 Initializing OpenAI client...
   ✓ OpenAI client initialized

🔧 Self-healing initiated for: locator('[id="customer.firstNae"]')
   Error: locator.click: Timeout 5000ms exceeded
   Test: registration test
   📄 Extracting page HTML...
   📄 Page HTML extracted (6258 characters)
   🤖 Sending request to OpenAI...
   📡 Calling OpenAI API (GPT-4)...
   ✓ OpenAI API responded
   🤖 OpenAI responded successfully
   AI suggested 5 alternatives
   Trying: getByLabel('First Name:')
   ✗ Failed: getByLabel('First Name:')
   Trying: locator('input[name="customer.firstName"]')
   ✓ Success! Healed with: locator('input[name="customer.firstName"]')
   📝 Recording healing event...

📄 Healing report saved to: healing-reports/healing-1765050112132.json
📊 HTML report generated: healing-reports/healing-1765050112132.html

==================================================
🏥 Self-Healing Summary
==================================================
Total Healing Attempts: 1
✓ Successful: 1
✗ Failed: 0

📊 JSON Report: healing-reports/summary.json
📊 HTML Report: healing-reports/summary.html
==================================================

Successful Healings:

1. registration test
   Original: locator('[id="customer.firstNae"]')
   Healed:   locator('input[name="customer.firstName"]')
```

**Console Logging Features:**
- ✓ OpenAI connection status on startup
- 📄 Page HTML extraction progress
- 🤖 Real-time API call tracking
- 📡 GPT-4 response confirmation
- ✓/✗ Success/failure for each attempted locator
- 📝 Report generation notifications
