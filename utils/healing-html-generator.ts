import * as fs from 'fs';
import * as path from 'path';
import { HealingChange } from './healing-fixture';

interface HealingSummary {
  totalTests: number;
  totalHealing: number;
  successfulHealing: number;
  failedHealing: number;
  timestamp: string;
  changes: HealingChange[];
}

export class HealingHTMLGenerator {
  static generateHTML(summary: HealingSummary, outputPath: string): void {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Self-Healing Test Report</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 1000px;
            margin: 20px auto;
            padding: 20px;
            background: #fff;
        }
        h1 {
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
        }
        .summary {
            background: #f5f5f5;
            padding: 15px;
            margin: 20px 0;
            border: 1px solid #ddd;
        }
        .summary table {
            width: 100%;
            border-collapse: collapse;
        }
        .summary td {
            padding: 8px;
            border-bottom: 1px solid #ddd;
        }
        .summary td:first-child {
            font-weight: bold;
            width: 200px;
        }
        .healing-item {
            border: 1px solid #ddd;
            padding: 15px;
            margin: 15px 0;
            background: #fafafa;
        }
        .healing-item.success {
            border-left: 4px solid green;
        }
        .healing-item.failed {
            border-left: 4px solid red;
        }
        .test-name {
            font-size: 1.1em;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .status {
            display: inline-block;
            padding: 3px 8px;
            margin-left: 10px;
            font-size: 0.85em;
            font-weight: bold;
        }
        .status.success {
            background: #d4edda;
            color: #155724;
        }
        .status.failed {
            background: #f8d7da;
            color: #721c24;
        }
        .locator {
            margin: 10px 0;
        }
        .locator-label {
            font-weight: bold;
            margin-bottom: 3px;
        }
        .locator-code {
            background: white;
            padding: 8px;
            border: 1px solid #ddd;
            font-family: monospace;
            font-size: 0.9em;
            word-break: break-all;
        }
        .error {
            background: #fff3cd;
            padding: 8px;
            margin: 10px 0;
            border: 1px solid #ffc107;
            font-size: 0.9em;
        }
        .attempts {
            margin-top: 10px;
        }
        .attempts ul {
            list-style: none;
            padding: 0;
        }
        .attempts li {
            padding: 5px;
            margin: 3px 0;
            background: white;
            border: 1px solid #ddd;
            font-family: monospace;
            font-size: 0.85em;
        }
        .timestamp {
            color: #666;
            font-size: 0.85em;
            margin-top: 10px;
        }
        footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            text-align: center;
            color: #666;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <h1>Self-Healing Test Report</h1>

    <div class="summary">
        <h2>Summary</h2>
        <table>
            <tr>
                <td>Total Healing Attempts:</td>
                <td>${summary.totalHealing}</td>
            </tr>
            <tr>
                <td>Successfully Healed:</td>
                <td>${summary.successfulHealing}</td>
            </tr>
            <tr>
                <td>Failed to Heal:</td>
                <td>${summary.failedHealing}</td>
            </tr>
            <tr>
                <td>Success Rate:</td>
                <td>${summary.totalHealing > 0 ? Math.round(summary.successfulHealing / summary.totalHealing * 100) : 0}%</td>
            </tr>
        </table>
    </div>

    <h2>Healing Details</h2>
    
    ${summary.changes.length === 0 ? `
        <p>No healing events recorded.</p>
    ` : summary.changes.map((change, index) => `
        <div class="healing-item ${change.success ? 'success' : 'failed'}">
            <div class="test-name">
                ${index + 1}. ${change.testName}
                <span class="status ${change.success ? 'success' : 'failed'}">
                    ${change.success ? 'SUCCESS' : 'FAILED'}
                </span>
            </div>

            <div class="locator">
                <div class="locator-label">Original Locator (Failed):</div>
                <div class="locator-code">${this.escapeHtml(change.originalLocator)}</div>
            </div>

            ${change.success ? `
                <div class="locator">
                    <div class="locator-label">Healed Locator (Working):</div>
                    <div class="locator-code">${this.escapeHtml(change.healedLocator)}</div>
                </div>
            ` : ''}

            <div class="error">
                <strong>Error:</strong> ${this.escapeHtml(change.errorMessage.split('\\n')[0])}
            </div>

            ${change.attemptedLocators.length > 0 ? `
                <div class="attempts">
                    <strong>Attempted Locators (${change.attemptedLocators.length}):</strong>
                    <ul>
                        ${change.attemptedLocators.map((loc, i) => `
                            <li>${this.escapeHtml(loc)} ${i === change.attemptedLocators.indexOf(change.healedLocator) ? '✓' : '✗'}</li>
                        `).join('')}
                    </ul>
                </div>
            ` : ''}

            <div class="timestamp">
                ${new Date(change.timestamp).toLocaleString()}
                ${change.healingTimeMs ? ` | Healing time: ${change.healingTimeMs}ms (${(change.healingTimeMs / 1000).toFixed(2)}s)` : ''}
            </div>
        </div>
    `).join('')}

    <footer>
        <p>Generated on ${new Date(summary.timestamp).toLocaleString()}</p>
        <p>Self-Healing Test Framework powered by OpenAI GPT-4</p>
    </footer>
</body>
</html>`;

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, html);
    console.log(`\n📊 HTML report generated: ${outputPath}`);
  }

  private static escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
