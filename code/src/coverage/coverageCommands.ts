import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { StatusBarManager } from '../core/statusBar';
import { logger } from '../utils/logger';
import { ScenarioGenerator } from '../testGeneration/scenario/scenarioGenerator';
import { CoverageFlow, CoverageFlowResult } from './coverageFlow';

/**
 * Register commands for the enhanced coverage analysis
 * @param context Extension context
 */
export function registerCoverageCommands(context: vscode.ExtensionContext): void {
    logger.info('Registering Coverage Analysis commands');
    
    // Enhanced Coverage Analysis command
    const analyzeCoverageCommand = vscode.commands.registerCommand(
        'testautomationagent.analyzeCoverageEnhanced',
        async () => {
            const statusBar = StatusBarManager.getInstance();
            
            try {
                statusBar.showBusy('Analyzing test coverage...');
                
                // Sample paths to files in the analyse folder
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || process.cwd();
                
                // Paths for analysis files
                const jacocoXmlPath = path.join(workspaceRoot, 'analyse/jacoco.xml');
                const karateJsonPath = path.join(workspaceRoot, 'analyse/testautomationagentplugin.testcases.TS-001.karate-json.txt');
                const openApiPath = path.join(workspaceRoot, 'analyse/openapi.json');
                const productSpecPath = path.join(workspaceRoot, 'analyse/product_specification.txt');
                
                // Verify all required files exist
                if (!fs.existsSync(jacocoXmlPath)) {
                    vscode.window.showErrorMessage(`JaCoCo XML report not found: ${jacocoXmlPath}`);
                    statusBar.showError('JaCoCo XML report file not found');
                    return;
                }
                
                if (!fs.existsSync(karateJsonPath)) {
                    vscode.window.showErrorMessage(`Karate JSON report not found: ${karateJsonPath}`);
                    statusBar.showError('Karate JSON report not found');
                    return;
                }
                
                if (!fs.existsSync(openApiPath)) {
                    vscode.window.showErrorMessage(`OpenAPI spec not found: ${openApiPath}`);
                    statusBar.showError('OpenAPI spec not found');
                    return;
                }
                
                if (!fs.existsSync(productSpecPath)) {
                    vscode.window.showErrorMessage(`Product specification not found: ${productSpecPath}`);
                    statusBar.showError('Product specification not found');
                    return;
                }
                
                // Initialize CoverageFlow and analyze coverage
                statusBar.showBusy('Processing coverage data...');
                
                const coverageFlow = new CoverageFlow();
                const coverageResults = await coverageFlow.analyzeCoverage(
                    karateJsonPath,
                    jacocoXmlPath,
                    openApiPath,
                    productSpecPath
                );
                
                // Show coverage summary
                const lineCoverage = coverageResults.lineCoverage;
                const branchCoverage = coverageResults.branchCoverage;
                const methodCoverage = coverageResults.methodCoverage;
                
                statusBar.showSuccess(`Coverage: Lines ${lineCoverage.toFixed(2)}%, Branches ${branchCoverage.toFixed(2)}%`);
                
                // Show coverage details in a webview panel
                showCoverageWebview(context, coverageResults);
                
                // Refresh any coverage views
                vscode.commands.executeCommand('testautomationagent.coverageView.refresh');
                
            } catch (error) {
                statusBar.showError(`Error analyzing coverage: ${(error as Error).message}`);
                vscode.window.showErrorMessage(`Failed to analyze coverage: ${(error as Error).message}`);
            }
        }
    );
    
    // Add the command to the context subscriptions
    context.subscriptions.push(analyzeCoverageCommand);
}

/**
 * Shows coverage analysis results in a webview panel
 * @param context Extension context
 * @param results Coverage analysis results
 */
function showCoverageWebview(context: vscode.ExtensionContext, results: CoverageFlowResult): void {
    // Create webview panel
    const panel = vscode.window.createWebviewPanel(
        'enhancedCoverageAnalysis',
        'Enhanced Coverage Analysis',
        vscode.ViewColumn.One,
        {
            enableScripts: true
        }
    );
    
    // Helper function to format diff output with HTML highlighting
    function formatDiff(diff: string): string {
        return diff
            .replace(/^-.*$/gm, match => `<span class="diff-removed">${match}</span>`)
            .replace(/^\+.*$/gm, match => `<span class="diff-added">${match}</span>`);
    }
    
    // Generate HTML content for the webview
    panel.webview.html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Enhanced Coverage Analysis</title>
            <style>
                :root {
                    --primary-color: #3CB371; /* Medium Sea Green */
                    --primary-light: #4DD286; /* Lighter shade for hover/active states */
                    --primary-dark: #35A366; /* Darker shade for borders/accents */
                    --primary-darkest: #2D8A56; /* Darkest shade for pressed states */
                    --text-on-primary: #FFFFFF; /* Text color on primary color backgrounds */
                }
                body { font-family: Arial, sans-serif; padding: 20px; }
                .coverage-metric { margin-bottom: 20px; }
                .progress-bar { 
                    background-color: #f0f0f0; 
                    height: 20px; 
                    border-radius: 5px; 
                    margin-top: 5px;
                }
                .progress-value {
                    background-color: var(--primary-color);
                    height: 20px;
                    border-radius: 5px;
                }
                .coverage-gaps { margin-top: 30px; }
                .gap-section { margin-top: 30px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
                th { 
                    background-color: var(--primary-color);
                    color: var(--text-on-primary);
                    border: 1px solid var(--primary-dark);
                }
                .tabs { display: flex; margin-bottom: 20px; }
                .tab { 
                    padding: 10px 20px; 
                    cursor: pointer; 
                    background-color: #f0f0f0; 
                    margin-right: 5px;
                    border-radius: 5px 5px 0 0;
                    color: #333333; /* Dark gray text for better contrast */
                    font-weight: 500; /* Slightly bolder text */
                }
                .tab.active { 
                    background-color: var(--primary-color); 
                    color: var(--text-on-primary); 
                }
                .tab:hover {
                    background-color: var(--primary-light);
                }
                .tab-content { display: none; }
                .tab-content.active { display: block; }
            </style>
        </head>
        <body>
            <h1>Enhanced Coverage Analysis</h1>
            <p>Analysis using JaCoCo, Karate tests, OpenAPI specs and Product specifications</p>
            
            <div class="coverage-metrics">
                <div class="coverage-metric">
                    <h3>Line Coverage: ${results.lineCoverage.toFixed(2)}%</h3>
                    <div class="progress-bar">
                        <div class="progress-value" style="width: ${results.lineCoverage}%"></div>
                    </div>
                </div>
                
                <div class="coverage-metric">
                    <h3>Branch Coverage: ${results.branchCoverage.toFixed(2)}%</h3>
                    <div class="progress-bar">
                        <div class="progress-value" style="width: ${results.branchCoverage}%"></div>
                    </div>
                </div>
                
                <div class="coverage-metric">
                    <h3>Method Coverage: ${results.methodCoverage.toFixed(2)}%</h3>
                    <div class="progress-bar">
                        <div class="progress-value" style="width: ${results.methodCoverage}%"></div>
                    </div>
                </div>
            </div>
            
            <div class="tabs">
                <div class="tab active" data-tab="code-gaps">Code Gaps</div>
                <div class="tab" data-tab="api-gaps">API Gaps</div>
                <div class="tab" data-tab="rule-gaps">Business Rule Gaps</div>
                <div class="tab" data-tab="scenarios">Suggested Scenarios</div>
            </div>
            
            <div id="code-gaps" class="tab-content active">
                <h2>Code Coverage Gaps</h2>
                <p>Found ${results.codeGaps.length} code coverage gaps</p>
                <table>
                    <tr>
                        <th>Class</th>
                        <th>Method</th>
                        <th>Type</th>
                        <th>Coverage</th>
                        <th>Suggestion</th>
                    </tr>
                    ${results.codeGaps.map(gap => `
                        <tr>
                            <td>${gap.className}</td>
                            <td>${gap.methodName || 'N/A'}</td>
                            <td>${gap.type}</td>
                            <td>${gap.coverage}%</td>
                            <td>${gap.suggestion || 'N/A'}</td>
                        </tr>
                    `).join('')}
                </table>
            </div>
            
            <div id="api-gaps" class="tab-content">
                <h2>API Endpoint Coverage Gaps</h2>
                <p>Found ${results.apiGaps.length} API endpoint coverage gaps</p>
                <table>
                    <tr>
                        <th>Method</th>
                        <th>Path</th>
                        <th>Covered</th>
                        <th>Suggestion</th>
                    </tr>
                    ${results.apiGaps.map(gap => `
                        <tr>
                            <td>${gap.method}</td>
                            <td>${gap.path}</td>
                            <td>${gap.covered ? 'Yes' : 'No'}</td>
                            <td>${gap.suggestion || 'N/A'}</td>
                        </tr>
                    `).join('')}
                </table>
            </div>
            
            <div id="rule-gaps" class="tab-content">
                <h2>Business Rule Coverage Gaps</h2>
                <p>Found ${results.businessRuleGaps.length} business rule coverage gaps</p>
                <table>
                    <tr>
                        <th>Rule ID</th>
                        <th>Description</th>
                        <th>Category</th>
                        <th>Priority</th>
                        <th>Covered</th>
                    </tr>
                    ${results.businessRuleGaps.map(gap => `
                        <tr>
                            <td>${gap.ruleId}</td>
                            <td>${gap.description.substring(0, 100)}${gap.description.length > 100 ? '...' : ''}</td>
                            <td>${gap.category}</td>
                            <td>${gap.priority}</td>
                            <td>${gap.covered ? 'Yes' : 'No'}</td>
                        </tr>
                    `).join('')}
                </table>
            </div>
            
            <div id="scenarios" class="tab-content">
                <h2>Suggested Test Scenarios</h2>
                <p>Generated ${results.suggestedScenarios.length} test scenarios to address gaps</p>
                <div class="scenarios-list">
                    ${results.suggestedScenarios.map(scenario => `
                        <div class="scenario-item">
                            <h3>${scenario.id}: ${scenario.title}</h3>
                            <p><strong>Description:</strong> ${scenario.description}</p>
                            <p><strong>Priority:</strong> ${scenario.priority}</p>
                            <p><strong>Source Requirements:</strong> ${scenario.sourceRequirements.join(', ')}</p>
                            <h4>Steps:</h4>
                            <ol>
                                ${scenario.steps.map(step => `<li>${step}</li>`).join('')}
                            </ol>
                            <h4>Expected Results:</h4>
                            <ul>
                                ${scenario.expectedResults.map(result => `<li>${result}</li>`).join('')}
                            </ul>
                        </div>
                    `).join('')}
                </div>
                <button id="generateTestCasesBtn" style="background-color: var(--primary-color); color: var(--text-on-primary); border: 1px solid var(--primary-dark); padding: 8px 16px; border-radius: 4px; cursor: pointer;">Generate Test Cases from Suggestions</button>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                // Tab switching functionality
                document.querySelectorAll('.tab').forEach(tab => {
                    tab.addEventListener('click', () => {
                        // Hide all tab contents
                        document.querySelectorAll('.tab-content').forEach(content => {
                            content.classList.remove('active');
                        });
                        
                        // Deactivate all tabs
                        document.querySelectorAll('.tab').forEach(t => {
                            t.classList.remove('active');
                        });
                        
                        // Activate the clicked tab
                        tab.classList.add('active');
                        
                        // Show the corresponding content
                        const tabId = tab.getAttribute('data-tab');
                        document.getElementById(tabId).classList.add('active');
                    });
                });
                
                // Button to generate test cases
                document.getElementById('generateTestCasesBtn').addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'generateTestCases'
                    });
                });
            </script>
        </body>
        </html>
    `;
    
    // Handle webview messages
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'generateTestCases':
                    // Add suggested scenarios to the scenario generator
                    const scenarioGenerator = ScenarioGenerator.getInstance();
                    scenarioGenerator.addScenarios(results.suggestedScenarios);
                    vscode.commands.executeCommand('testautomationagent.generateTestCases');
                    return;
            }
        },
        undefined,
        context.subscriptions
    );
}
