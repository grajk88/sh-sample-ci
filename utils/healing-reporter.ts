import {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';
import { HealingHTMLGenerator } from './healing-html-generator';

interface HealingSummary {
  totalTests: number;
  totalHealing: number;
  successfulHealing: number;
  failedHealing: number;
  timestamp: string;
  changes: any[];
}

export default class HealingReporter implements Reporter {
  private healingChanges: any[] = [];
  private outputPath: string;

  constructor(options: { outputFile?: string } = {}) {
    this.outputPath = options.outputFile || path.join(process.cwd(), 'healing-reports', 'summary.json');
  }

  onBegin(config: FullConfig, suite: Suite) {
    console.log('\n🏥 Self-Healing Test Framework Active');
    console.log('=' .repeat(50));
  }

  onTestEnd(test: TestCase, result: TestResult) {
    // Collect healing data from test results
    // The healing context saves individual files, we'll aggregate them
  }

  async onEnd(result: FullResult) {
    // Clean up temporary healing-*.json files and aggregate to summary
    const healingReportsDir = path.join(process.cwd(), 'healing-reports');
    
    if (fs.existsSync(healingReportsDir)) {
      // Process JSON files
      const jsonFiles = fs.readdirSync(healingReportsDir).filter(f => f.startsWith('healing-') && f.endsWith('.json'));
      
      for (const file of jsonFiles) {
        try {
          const filePath = path.join(healingReportsDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const changes = JSON.parse(content);
          this.healingChanges.push(...changes);
          
          // Delete the temporary file
          fs.unlinkSync(filePath);
        } catch (e) {
          // Skip invalid files
        }
      }

      // Clean up temporary HTML files
      const htmlFiles = fs.readdirSync(healingReportsDir).filter(f => f.startsWith('healing-') && f.endsWith('.html'));
      for (const file of htmlFiles) {
        try {
          fs.unlinkSync(path.join(healingReportsDir, file));
        } catch (e) {
          // Skip
        }
      }
    }

    // Always read existing summary and merge
    let existingSummary: HealingSummary | null = null;
    if (fs.existsSync(this.outputPath)) {
      try {
        existingSummary = JSON.parse(fs.readFileSync(this.outputPath, 'utf-8'));
      } catch (e) {
        // Will create new
      }
    }

    // Merge changes
    const allChanges = existingSummary?.changes || [];
    for (const change of this.healingChanges) {
      const duplicate = allChanges.find(c => 
        c.timestamp === change.timestamp && 
        c.originalLocator === change.originalLocator
      );
      if (!duplicate) {
        allChanges.push(change);
      }
    }

    const summary: HealingSummary = {
      totalTests: result.status === 'passed' ? 1 : 0,
      totalHealing: allChanges.length,
      successfulHealing: allChanges.filter(c => c.success).length,
      failedHealing: allChanges.filter(c => !c.success).length,
      timestamp: new Date().toISOString(),
      changes: allChanges,
    };

    const dir = path.dirname(this.outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.outputPath, JSON.stringify(summary, null, 2));

    // Generate HTML report
    const htmlPath = this.outputPath.replace('.json', '.html');
    HealingHTMLGenerator.generateHTML(summary, htmlPath);

    console.log('\n' + '='.repeat(50));
    console.log('🏥 Self-Healing Summary');
    console.log('='.repeat(50));
    console.log(`Total Healing Attempts: ${summary.totalHealing}`);
    console.log(`✓ Successful: ${summary.successfulHealing}`);
    console.log(`✗ Failed: ${summary.failedHealing}`);
    console.log(`\n📊 JSON Report: ${this.outputPath}`);
    console.log(`📊 HTML Report: ${htmlPath}`);
    console.log('='.repeat(50) + '\n');

    // Print detailed changes from this run only
    if (this.healingChanges.length > 0) {
      console.log('Healings in this run:');
      this.healingChanges
        .filter(c => c.success)
        .forEach((change, index) => {
          console.log(`\n${index + 1}. ${change.testName}`);
          console.log(`   Original: ${change.originalLocator}`);
          console.log(`   Healed:   ${change.healedLocator}`);
        });
    }
  }

  printsToStdio() {
    return true;
  }
}
