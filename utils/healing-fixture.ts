import { test as base, Page, Locator } from '@playwright/test';
import { OpenAIService } from './openai-service';
import { HealingHTMLGenerator } from './healing-html-generator';
import * as fs from 'fs';
import * as path from 'path';

export interface HealingChange {
  timestamp: string;
  testName: string;
  originalLocator: string;
  healedLocator: string;
  errorMessage: string;
  success: boolean;
  attemptedLocators: string[];
  healingTimeMs: number;
}

export class HealingContext {
  private changes: HealingChange[] = [];
  private openAIService!: OpenAIService;
  private enabled: boolean;
  private healingCache: Map<string, string> = new Map(); // originalLocator -> healedLocator
  private cacheFilePath: string;

  constructor(apiKey?: string) {
    this.enabled = !!apiKey;
    this.cacheFilePath = path.join(process.cwd(), 'healing-reports', 'summary.json');
    this.loadCache();
    
    if (this.enabled) {
      console.log('✓ OpenAI connection enabled');
      this.openAIService = new OpenAIService(apiKey!);
    } else {
      console.log('⚠ OpenAI API key not found - healing disabled');
    }
  }

  private loadCache() {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const content = fs.readFileSync(this.cacheFilePath, 'utf-8');
        const summary = JSON.parse(content);
        
        if (summary.changes && Array.isArray(summary.changes)) {
          summary.changes
            .filter((c: HealingChange) => c.success)
            .forEach((c: HealingChange) => {
              this.healingCache.set(c.originalLocator, c.healedLocator);
            });
          console.log(`✓ Loaded ${this.healingCache.size} cached healings from previous runs`);
        }
      }
    } catch (e) {
      console.log('⚠ Could not load healing cache, starting fresh');
    }
  }

  async healLocator(
    page: Page,
    originalAction: string,
    originalLocator: string,
    error: Error,
    testName: string
  ): Promise<{ locator: Locator | null; healed: boolean }> {
    if (!this.enabled) {
      return { locator: null, healed: false };
    }

    console.log(`\n🔧 Self-healing initiated for: ${originalLocator}`);
    console.log(`   Error: ${error.message}`);
    console.log(`   Test: ${testName}`);

    // Check cache first
    if (this.healingCache.has(originalLocator)) {
      const cachedLocator = this.healingCache.get(originalLocator)!;
      console.log(`   💾 Found in cache: ${cachedLocator}`);
      
      try {
        const locator = this.evaluateLocator(page, cachedLocator);
        await locator.waitFor({ state: 'visible', timeout: 2000 });
        console.log(`   ✓ Cache hit successful! Using: ${cachedLocator}`);
        return { locator, healed: true };
      } catch (e) {
        console.log(`   ⚠ Cache entry failed, will query OpenAI`);
        this.healingCache.delete(originalLocator); // Remove stale cache
      }
    }

    const healingStartTime = Date.now();

    let pageHTML: string;
    try {
      console.log('   📄 Extracting page HTML...');
      pageHTML = await page.content();
      console.log(`   📄 Page HTML extracted (${pageHTML.length} characters)`);
    } catch (e) {
      console.log('   ✗ Cannot access page content (page may be closed)');
      return { locator: null, healed: false };
    }
    
    const attemptedLocators: string[] = [];

    // Get AI suggestions
    console.log('   🤖 Sending request to OpenAI...');
    const suggestions = await this.openAIService.suggestLocator(
      pageHTML,
      originalLocator,
      error.message
    );
    console.log(`   🤖 OpenAI responded successfully`);

    console.log(`   AI suggested ${suggestions.length} alternatives`);

    // Try each suggestion
    for (const suggestion of suggestions) {
      attemptedLocators.push(suggestion);
      try {
        console.log(`   Trying: ${suggestion}`);
        
        // Dynamically evaluate the locator
        const locator = this.evaluateLocator(page, suggestion);
        
        // Check if element exists
        await locator.waitFor({ state: 'visible', timeout: 2000 });
        
        console.log(`   ✓ Success! Healed with: ${suggestion}`);
        console.log(`   📝 Recording healing event...`);
        
        const healingTimeMs = Date.now() - healingStartTime;
        console.log(`   ⏱️  Healing took: ${healingTimeMs}ms (${(healingTimeMs / 1000).toFixed(2)}s)`);
        
        // Add to cache for future use
        this.healingCache.set(originalLocator, suggestion);
        console.log(`   💾 Added to cache for future tests`);
        
        // Record the successful healing
        this.recordChange({
          timestamp: new Date().toISOString(),
          testName,
          originalLocator,
          healedLocator: suggestion,
          errorMessage: error.message,
          success: true,
          attemptedLocators,
          healingTimeMs,
        });

        return { locator, healed: true };
      } catch (e) {
        console.log(`   ✗ Failed: ${suggestion}`);
        continue;
      }
    }

    // If all suggestions fail, try screenshot analysis
    console.log('   Attempting screenshot analysis...');
    const screenshotPath = path.join(process.cwd(), 'test-results', `healing-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const visionSuggestions = await this.openAIService.analyzeScreenshotForLocator(
      screenshotPath,
      originalLocator,
      error.message
    );

    for (const suggestion of visionSuggestions) {
      if (attemptedLocators.includes(suggestion)) continue;
      
      attemptedLocators.push(suggestion);
      try {
        console.log(`   Trying (from vision): ${suggestion}`);
        const locator = this.evaluateLocator(page, suggestion);
        await locator.waitFor({ state: 'visible', timeout: 2000 });
        
        console.log(`   ✓ Success with vision! Healed with: ${suggestion}`);
        
        const healingTimeMs = Date.now() - healingStartTime;
        console.log(`   ⏱️  Healing took: ${healingTimeMs}ms (${(healingTimeMs / 1000).toFixed(2)}s)`);
        
        // Add to cache for future use
        this.healingCache.set(originalLocator, suggestion);
        console.log(`   💾 Added to cache for future tests`);
        
        this.recordChange({
          timestamp: new Date().toISOString(),
          testName,
          originalLocator,
          healedLocator: suggestion,
          errorMessage: error.message,
          success: true,
          attemptedLocators,
          healingTimeMs,
        });

        return { locator, healed: true };
      } catch (e) {
        continue;
      }
    }

    // Record failed healing attempt
    const healingTimeMs = Date.now() - healingStartTime;
    console.log(`   ⏱️  Healing attempts took: ${healingTimeMs}ms (${(healingTimeMs / 1000).toFixed(2)}s)`);
    
    this.recordChange({
      timestamp: new Date().toISOString(),
      testName,
      originalLocator,
      healedLocator: '',
      errorMessage: error.message,
      success: false,
      attemptedLocators,
      healingTimeMs,
    });

    console.log('   ✗ All healing attempts failed');
    return { locator: null, healed: false };
  }

  private evaluateLocator(page: Page, locatorString: string): Locator {
    // Remove "page." prefix if present
    locatorString = locatorString.replace(/^page\./, '');
    
    // Use Function constructor to evaluate the locator string safely
    const locatorFn = new Function('page', `return page.${locatorString}`);
    return locatorFn(page);
  }

  private recordChange(change: HealingChange) {
    this.changes.push(change);
  }

  getChanges(): HealingChange[] {
    return this.changes;
  }

  saveChangesToFile(outputPath: string) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Load existing summary if it exists
    let existingChanges: HealingChange[] = [];
    if (fs.existsSync(outputPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
        if (existing.changes && Array.isArray(existing.changes)) {
          existingChanges = existing.changes;
        }
      } catch (e) {
        console.log('⚠ Could not read existing summary, will create new');
      }
    }

    // Merge new changes with existing (avoid duplicates based on timestamp)
    const allChanges = [...existingChanges];
    for (const change of this.changes) {
      const duplicate = allChanges.find(c => 
        c.timestamp === change.timestamp && 
        c.originalLocator === change.originalLocator
      );
      if (!duplicate) {
        allChanges.push(change);
      }
    }

    // Save only JSON (temporary file for reporter to aggregate)
    // Reporter will generate the final HTML
    fs.writeFileSync(outputPath, JSON.stringify(this.changes, null, 2));
    console.log(`\n📄 Healing data saved (will be aggregated to summary)`);
  }
}

// Custom Playwright page with self-healing capabilities
export class HealingPage {
  constructor(
    private page: Page,
    private healingContext: HealingContext,
    private testName: string
  ) {}

  // Wrap common Playwright actions with healing
  async click(locatorString: string, options?: any) {
    try {
      const locator = this.evaluateLocator(locatorString);
      // Use shorter timeout for initial attempt to fail fast
      await locator.click({ ...options, timeout: 5000 });
    } catch (error) {
      const result = await this.healingContext.healLocator(
        this.page,
        'click',
        locatorString,
        error as Error,
        this.testName
      );

      if (result.healed && result.locator) {
        await result.locator.click(options);
      } else {
        throw error;
      }
    }
  }

  async fill(locatorString: string, value: string, options?: any) {
    try {
      const locator = this.evaluateLocator(locatorString);
      // Use shorter timeout for initial attempt to fail fast
      await locator.fill(value, { ...options, timeout: 5000 });
    } catch (error) {
      const result = await this.healingContext.healLocator(
        this.page,
        'fill',
        locatorString,
        error as Error,
        this.testName
      );

      if (result.healed && result.locator) {
        await result.locator.fill(value, options);
      } else {
        throw error;
      }
    }
  }

  async waitForSelector(locatorString: string, options?: any) {
    try {
      const locator = this.evaluateLocator(locatorString);
      await locator.waitFor(options);
    } catch (error) {
      const result = await this.healingContext.healLocator(
        this.page,
        'waitFor',
        locatorString,
        error as Error,
        this.testName
      );

      if (result.healed && result.locator) {
        await result.locator.waitFor(options);
      } else {
        throw error;
      }
    }
  }

  async isVisible(locatorString: string): Promise<boolean> {
    try {
      const locator = this.evaluateLocator(locatorString);
      return await locator.isVisible();
    } catch (error) {
      const result = await this.healingContext.healLocator(
        this.page,
        'isVisible',
        locatorString,
        error as Error,
        this.testName
      );

      if (result.healed && result.locator) {
        return await result.locator.isVisible();
      } else {
        throw error;
      }
    }
  }

  private evaluateLocator(locatorString: string): Locator {
    locatorString = locatorString.replace(/^page\./, '');
    const locatorFn = new Function('page', `return page.${locatorString}`);
    return locatorFn(this.page);
  }

  // Proxy common page methods for convenience
  async goto(url: string, options?: any) {
    return await this.page.goto(url, options);
  }

  getByRole(role: any, options?: any) {
    return this.page.getByRole(role, options);
  }

  getByText(text: string | RegExp, options?: any) {
    return this.page.getByText(text, options);
  }

  getByLabel(text: string | RegExp, options?: any) {
    return this.page.getByLabel(text, options);
  }

  getByTestId(testId: string) {
    return this.page.getByTestId(testId);
  }

  locator(selector: string) {
    return this.page.locator(selector);
  }

  // Provide access to original page for other operations
  get originalPage(): Page {
    return this.page;
  }
}

// Export custom test fixture with healing context
type HealingFixtures = {
  healingContext: HealingContext;
  healingPage: HealingPage;
};

export const test = base.extend<HealingFixtures>({
  healingContext: async ({}, use, testInfo) => {
    const apiKey = process.env.OPENAI_API_KEY;
    const context = new HealingContext(apiKey);
    
    await use(context);
    
    // Save healing report after test
    const outputPath = path.join(process.cwd(), 'healing-reports', `healing-${Date.now()}.json`);
    if (context.getChanges().length > 0) {
      context.saveChangesToFile(outputPath);
    }
  },

  healingPage: async ({ page, healingContext }, use, testInfo) => {
    const testName = testInfo.title;
    const healingPage = new HealingPage(page, healingContext, testName);
    await use(healingPage);
  },
});

export { expect } from '@playwright/test';
