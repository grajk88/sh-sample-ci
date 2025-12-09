import OpenAI from 'openai';
import * as fs from 'fs';

export class OpenAIService {
  private client: OpenAI;

  constructor(apiKey: string) {
    console.log('   🔌 Initializing OpenAI client...');
    this.client = new OpenAI({ apiKey });
    console.log('   ✓ OpenAI client initialized');
  }

  /**
   * Suggests alternative locators based on the page HTML and error context
   */
  async suggestLocator(
    pageHTML: string,
    failedLocator: string,
    errorMessage: string,
    elementContext?: string
  ): Promise<string[]> {
    const prompt = this.buildLocatorPrompt(pageHTML, failedLocator, errorMessage, elementContext);

    try {
      console.log('   📡 Calling OpenAI API (GPT-4)...');
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a Playwright test automation expert. Your task is to suggest alternative locators when a test fails.
Always provide valid Playwright locator strategies. Return ONLY a JSON array of alternative locator strings, nothing else.
Examples: ["getByRole('button', { name: 'Submit' })", "getByTestId('submit-btn')", "locator('button:has-text(\"Submit\")')]"`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });
      console.log('   ✓ OpenAI API responded');

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      // Parse the JSON array response, handling markdown code blocks
      const cleanedContent = this.cleanJsonResponse(content);
      const suggestions = JSON.parse(cleanedContent);
      return Array.isArray(suggestions) ? suggestions : [];
    } catch (error) {
      console.error('   ✗ OpenAI API error:', error instanceof Error ? error.message : error);
      return [];
    }
  }

  private buildLocatorPrompt(
    pageHTML: string,
    failedLocator: string,
    errorMessage: string,
    elementContext?: string
  ): string {
    // Truncate HTML if too long (keep it under 10000 chars)
    const truncatedHTML = pageHTML.length > 10000 
      ? pageHTML.substring(0, 10000) + '\n... [HTML truncated]'
      : pageHTML;

    return `
A Playwright test failed with a locator error.

Failed Locator: ${failedLocator}
Error: ${errorMessage}
${elementContext ? `Element Context: ${elementContext}` : ''}

Page HTML:
${truncatedHTML}

Analyze the HTML and suggest 3-5 alternative Playwright locators that might work.
Consider:
1. More robust selectors (role-based, test-ids, text content)
2. The element's context and nearby elements
3. Playwright best practices (prefer getByRole, getByLabel, getByTestId)

Return ONLY a JSON array of locator strings. Example format:
["getByRole('button', { name: 'Click me' })", "getByTestId('submit-button')", "locator('button.submit')"]
`;
  }

  private cleanJsonResponse(content: string): string {
    // Remove markdown code blocks if present
    let cleaned = content.trim();
    
    // Remove ```json and ``` markers
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/^```\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/i, '');
    
    return cleaned.trim();
  }

  /**
   * Takes a screenshot and uses vision API to help identify elements
   */
  async analyzeScreenshotForLocator(
    screenshotPath: string,
    failedLocator: string,
    errorMessage: string
  ): Promise<string[]> {
    if (!fs.existsSync(screenshotPath)) {
      console.error('Screenshot not found:', screenshotPath);
      return [];
    }

    const imageBuffer = fs.readFileSync(screenshotPath);
    const base64Image = imageBuffer.toString('base64');

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a Playwright test automation expert. Analyze screenshots to suggest alternative locators.
Return ONLY a JSON array of alternative locator strings.`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `This screenshot shows a page where the locator "${failedLocator}" failed with error: "${errorMessage}".
Suggest 3-5 alternative Playwright locators based on what you see in the screenshot.
Return ONLY a JSON array of locator strings.`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const cleanedContent = this.cleanJsonResponse(content);
      const suggestions = JSON.parse(cleanedContent);
      return Array.isArray(suggestions) ? suggestions : [];
    } catch (error) {
      console.error('OpenAI Vision API error:', error);
      return [];
    }
  }
}
