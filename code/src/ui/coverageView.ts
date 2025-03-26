import * as vscode from 'vscode';
import * as path from 'path';
import { WebviewProvider } from './webviewProvider';
import { CoverageAnalyzer } from '../coverage/analyzer';
import { XmlParser } from '../coverage/xmlParser';
import { ResultCollector } from '../testExecution/resultCollector';
import { TestResult } from '../testExecution/executor';
import { ScenarioGenerator, TestScenario } from '../testGeneration/scenario/scenarioGenerator';
import { Commands } from '../core/commands';
import { StatusBarManager } from '../core/statusBar';
import { FileManager } from '../fileSystem/fileManager';
import { AIController } from '../ai/controller';

// Import types from analyzer
import { CoverageGap as AnalyzerCoverageGap, CoverageType } from '../coverage/analyzer';

/**
 * UI representation of a coverage gap
 */
interface UICoverageGap {
    type: CoverageType;
    location: string;
    coverage: number;
    suggestion: string;
}

/**
 * WebView provider for the Coverage Analysis UI
 */
export class CoverageView extends WebviewProvider {
    private coverageAnalyzer: CoverageAnalyzer;
    private xmlParser: XmlParser;
    private resultCollector: ResultCollector;
    private scenarioGenerator: ScenarioGenerator;
    private aiController: AIController;
    private statusBarManager: StatusBarManager;
    private fileManager: FileManager;

    /**
     * Gets additional stylesheets for the webview
     * @param webview The webview
     * @returns The HTML string for additional stylesheet links
     */
    protected getAdditionalStylesheets(webview: vscode.Webview): string {
        const enhancedCssUri = this.getWebviewUri(webview, ['media', 'css', 'enhanced-coverage-analysis.css']);
        return enhancedCssUri ? `<link href="${enhancedCssUri}" rel="stylesheet" />` : '';
    }
    
    // Coverage data
    private coverageData: any;
    private gaps: UICoverageGap[] = [];
    private suggestedScenarios: TestScenario[] = [];

    constructor(context: vscode.ExtensionContext) {
        super('testautomationagent.coverageView', context);
        this.coverageAnalyzer = CoverageAnalyzer.getInstance();
        this.xmlParser = new XmlParser();
        this.resultCollector = ResultCollector.getInstance();
        this.scenarioGenerator = ScenarioGenerator.getInstance();
        this.aiController = AIController.getInstance();
        // Use the existing status bar instance without creating a new one
        this.statusBarManager = StatusBarManager.getInstance();
        this.fileManager = FileManager.getInstance();
    }

    /**
     * Gets the title of the webview
     * @returns The webview title
     */
    protected getTitle(): string {
        return 'Coverage Analysis';
    }

    /**
     * Gets the HTML body content
     * @returns The HTML body content
     */
    protected getBodyHtml(): string {
        return `
        <div class="container">
            <h1>Coverage Analysis</h1>
            
            <div class="panel">
                <h2>Coverage Reports</h2>
                <div class="input-groups">
                    <div class="input-group">
                        <label for="allure-path">Allure Report Path:</label>
                        <div class="input-with-button">
                            <input type="text" id="allure-path" placeholder="Path to Allure report directory">
                            <button id="browse-allure-btn" class="btn secondary">
                                <i class="codicon codicon-folder-opened"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="input-group">
                        <label for="jacoco-path">JaCoCo Report Path:</label>
                        <div class="input-with-button">
                            <input type="text" id="jacoco-path" placeholder="Path to JaCoCo XML report">
                            <button id="browse-jacoco-btn" class="btn secondary">
                                <i class="codicon codicon-folder-opened"></i>
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="action-bar">
                    <button id="analyze-btn" class="btn primary">
                        <i class="codicon codicon-graph"></i> Analyze Coverage
                    </button>
                    <button id="refresh-from-settings-btn" class="btn secondary">
                        <i class="codicon codicon-refresh"></i> Use Default Paths
                    </button>
                </div>
            </div>
            
            <div class="panel">
                <h2>Coverage Metrics</h2>
                <div id="loading-coverage" class="loading hidden">
                    <i class="codicon codicon-loading spin"></i> Analyzing coverage...
                </div>
                
                <div id="coverage-metrics" class="coverage-metrics hidden">
                    <div class="metric">
                        <label>Line Coverage:</label>
                        <div class="progress-container">
                            <div id="line-progress" class="progress-bar"></div>
                            <span id="line-percentage" class="percentage">0%</span>
                        </div>
                    </div>
                    
                    <div class="metric">
                        <label>Branch Coverage:</label>
                        <div class="progress-container">
                            <div id="branch-progress" class="progress-bar"></div>
                            <span id="branch-percentage" class="percentage">0%</span>
                        </div>
                    </div>
                    
                    <div class="metric">
                        <label>Method Coverage:</label>
                        <div class="progress-container">
                            <div id="method-progress" class="progress-bar"></div>
                            <span id="method-percentage" class="percentage">0%</span>
                        </div>
                    </div>
                    
                    <div class="metric">
                        <label>Class Coverage:</label>
                        <div class="progress-container">
                            <div id="class-progress" class="progress-bar"></div>
                            <span id="class-percentage" class="percentage">0%</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="panel">
                <h2>Coverage Gaps</h2>
                <div id="no-gaps" class="message-box">
                    <i class="codicon codicon-info"></i>
                    <p>No coverage data available. Click "Analyze Coverage" to start.</p>
                </div>
                
                <div id="gaps-list" class="gaps-container hidden">
                    <!-- Gaps will be inserted here -->
                </div>
            </div>
            
            <div class="panel">
                <h2>Suggested Test Scenarios</h2>
                <div id="loading-suggestions" class="loading hidden">
                    <i class="codicon codicon-loading spin"></i> Generating suggestions...
                </div>
                
                <div id="no-suggestions" class="message-box">
                    <i class="codicon codicon-info"></i>
                    <p>No suggestions available. Analyze coverage gaps to generate suggestions.</p>
                </div>
                
                <div id="suggestions-list" class="suggestions-container hidden">
                    <!-- Suggestions will be inserted here -->
                </div>
                
                <div class="action-bar hidden" id="suggestion-actions">
                    <button id="generate-tests-btn" class="btn primary">
                        <i class="codicon codicon-beaker"></i> Generate Test Cases
                    </button>
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Gets the inline script for the webview
     * @returns The inline script
     */
    protected getInlineScript(): string {
        return `
        (function() {
            const vscode = acquireVsCodeApi();
            
            // Elements
            const allurePathInput = document.getElementById('allure-path');
            const jacocoPathInput = document.getElementById('jacoco-path');
            const browseAllureBtn = document.getElementById('browse-allure-btn');
            const browseJacocoBtn = document.getElementById('browse-jacoco-btn');
            const analyzeBtn = document.getElementById('analyze-btn');
            const refreshFromSettingsBtn = document.getElementById('refresh-from-settings-btn');
            const loadingCoverage = document.getElementById('loading-coverage');
            const coverageMetrics = document.getElementById('coverage-metrics');
            const noGaps = document.getElementById('no-gaps');
            const gapsList = document.getElementById('gaps-list');
            const loadingSuggestions = document.getElementById('loading-suggestions');
            const noSuggestions = document.getElementById('no-suggestions');
            const suggestionsList = document.getElementById('suggestions-list');
            const suggestionActions = document.getElementById('suggestion-actions');
            const generateTestsBtn = document.getElementById('generate-tests-btn');
            
            // Progress bars
            const lineProgress = document.getElementById('line-progress');
            const linePercentage = document.getElementById('line-percentage');
            const branchProgress = document.getElementById('branch-progress');
            const branchPercentage = document.getElementById('branch-percentage');
            const methodProgress = document.getElementById('method-progress');
            const methodPercentage = document.getElementById('method-percentage');
            const classProgress = document.getElementById('class-progress');
            const classPercentage = document.getElementById('class-percentage');
            
            // Selected suggestions
            let selectedSuggestionIds = [];
            
            // Event Listeners
            browseAllureBtn.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'browseAllure'
                });
            });
            
            browseJacocoBtn.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'browseJacoco'
                });
            });
            
            analyzeBtn.addEventListener('click', () => {
                const allurePath = allurePathInput.value.trim();
                const jacocoPath = jacocoPathInput.value.trim();
                
                if (!allurePath && !jacocoPath) {
                    vscode.postMessage({
                        command: 'showError',
                        message: 'Please provide at least one report path'
                    });
                    return;
                }
                
                loadingCoverage.classList.remove('hidden');
                coverageMetrics.classList.add('hidden');
                noGaps.classList.remove('hidden');
                gapsList.classList.add('hidden');
                noSuggestions.classList.remove('hidden');
                suggestionsList.classList.add('hidden');
                suggestionActions.classList.add('hidden');
                
                vscode.postMessage({
                    command: 'analyzeCoverage',
                    allurePath,
                    jacocoPath
                });
            });
            
            refreshFromSettingsBtn.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'loadDefaultPaths'
                });
            });
            
            generateTestsBtn.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'generateTestCases',
                    suggestionIds: selectedSuggestionIds
                });
            });
            
            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch(message.command) {
                    case 'setAllurePath':
                        allurePathInput.value = message.path;
                        break;
                        
                    case 'setJacocoPath':
                        jacocoPathInput.value = message.path;
                        break;
                        
                    case 'coverageResults':
                        displayCoverageResults(message.coverage);
                        break;
                        
                    case 'coverageGaps':
                        displayCoverageGaps(message.gaps);
                        break;
                        
                    case 'suggestions':
                        displaySuggestions(message.suggestions);
                        loadingSuggestions.classList.add('hidden');
                        break;
                        
                    case 'error':
                        loadingCoverage.classList.add('hidden');
                        loadingSuggestions.classList.add('hidden');
                        // Show error message
                        break;
                }
            });
            
            // Helper functions
            function displayCoverageResults(coverage) {
                loadingCoverage.classList.add('hidden');
                coverageMetrics.classList.remove('hidden');
                
                // Update progress bars
                updateProgressBar(lineProgress, linePercentage, coverage.line || 0);
                updateProgressBar(branchProgress, branchPercentage, coverage.branch || 0);
                updateProgressBar(methodProgress, methodPercentage, coverage.method || 0);
                updateProgressBar(classProgress, classPercentage, coverage.class || 0);
            }
            
            function updateProgressBar(progressBar, percentageEl, value) {
                const percentage = Math.round(value * 100);
                progressBar.style.width = \`\${percentage}%\`;
                percentageEl.textContent = \`\${percentage}%\`;
                
                // Update color based on coverage
                if (percentage < 50) {
                    progressBar.className = 'progress-bar low';
                } else if (percentage < 80) {
                    progressBar.className = 'progress-bar medium';
                } else {
                    progressBar.className = 'progress-bar high';
                }
            }
            
            function displayCoverageGaps(gaps) {
                if (!gaps || gaps.length === 0) {
                    noGaps.classList.remove('hidden');
                    gapsList.classList.add('hidden');
                    return;
                }
                
                noGaps.classList.add('hidden');
                gapsList.classList.remove('hidden');
                gapsList.innerHTML = '';
                
                gaps.forEach(gap => {
                    const gapEl = document.createElement('div');
                    gapEl.className = 'gap-item';
                    
                    const header = document.createElement('div');
                    header.className = 'gap-header';
                    
                    const title = document.createElement('h3');
                    title.textContent = gap.location;
                    
                    const coverage = document.createElement('span');
                    coverage.className = 'gap-coverage';
                    coverage.textContent = \`\${Math.round(gap.coverage * 100)}%\`;
                    
                    header.appendChild(title);
                    header.appendChild(coverage);
                    
                    const content = document.createElement('div');
                    content.className = 'gap-content';
                    
                    const type = document.createElement('div');
                    type.className = 'gap-type';
                    type.textContent = \`Type: \${gap.type}\`;
                    
                    const suggestion = document.createElement('div');
                    suggestion.className = 'gap-suggestion';
                    suggestion.textContent = gap.suggestion;
                    
                    content.appendChild(type);
                    content.appendChild(suggestion);
                    
                    gapEl.appendChild(header);
                    gapEl.appendChild(content);
                    gapsList.appendChild(gapEl);
                    
                    // Add toggle functionality
                    header.addEventListener('click', () => {
                        gapEl.classList.toggle('expanded');
                    });
                });
                
                // Request suggestions if gaps are found
                vscode.postMessage({
                    command: 'generateSuggestions'
                });
                
                loadingSuggestions.classList.remove('hidden');
                noSuggestions.classList.add('hidden');
            }
            
            function displaySuggestions(suggestions) {
                if (!suggestions || suggestions.length === 0) {
                    noSuggestions.classList.remove('hidden');
                    suggestionsList.classList.add('hidden');
                    suggestionActions.classList.add('hidden');
                    return;
                }
                
                noSuggestions.classList.add('hidden');
                suggestionsList.classList.remove('hidden');
                suggestionActions.classList.remove('hidden');
                suggestionsList.innerHTML = '';
                
                // Reset selected suggestions
                selectedSuggestionIds = [];
                
                suggestions.forEach((suggestion, index) => {
                    const suggestionEl = document.createElement('div');
                    suggestionEl.className = 'suggestion-item';
                    
                    const header = document.createElement('div');
                    header.className = 'suggestion-header';
                    
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'suggestion-checkbox';
                    checkbox.id = \`suggestion-\${index}\`;
                    checkbox.checked = true;
                    checkbox.setAttribute('data-id', suggestion.id);
                    checkbox.addEventListener('change', () => {
                        if (checkbox.checked) {
                            selectedSuggestionIds.push(suggestion.id);
                        } else {
                            selectedSuggestionIds = selectedSuggestionIds.filter(id => id !== suggestion.id);
                        }
                    });
                    
                    // Initially add to selected
                    selectedSuggestionIds.push(suggestion.id);
                    
                    const title = document.createElement('label');
                    title.htmlFor = \`suggestion-\${index}\`;
                    title.textContent = suggestion.title;
                    
                    const toggle = document.createElement('button');
                    toggle.className = 'toggle-btn';
                    toggle.innerHTML = '<i class="codicon codicon-chevron-down"></i>';
                    toggle.addEventListener('click', () => {
                        suggestionEl.classList.toggle('expanded');
                        toggle.innerHTML = suggestionEl.classList.contains('expanded') 
                            ? '<i class="codicon codicon-chevron-up"></i>' 
                            : '<i class="codicon codicon-chevron-down"></i>';
                    });
                    
                    header.appendChild(checkbox);
                    header.appendChild(title);
                    header.appendChild(toggle);
                    
                    const content = document.createElement('div');
                    content.className = 'suggestion-content';
                    
                    // Description
                    const description = document.createElement('div');
                    description.className = 'suggestion-description';
                    description.textContent = suggestion.description;
                    content.appendChild(description);
                    
                    // Steps
                    if (suggestion.steps && suggestion.steps.length > 0) {
                        const stepsTitle = document.createElement('h4');
                        stepsTitle.textContent = 'Steps:';
                        content.appendChild(stepsTitle);
                        
                        const stepsList = document.createElement('ol');
                        stepsList.className = 'steps-list';
                        
                        suggestion.steps.forEach(step => {
                            const stepItem = document.createElement('li');
                            stepItem.textContent = step;
                            stepsList.appendChild(stepItem);
                        });
                        
                        content.appendChild(stepsList);
                    }
                    
                    // Expected Results
                    if (suggestion.expectedResults && suggestion.expectedResults.length > 0) {
                        const resultsTitle = document.createElement('h4');
                        resultsTitle.textContent = 'Expected Results:';
                        content.appendChild(resultsTitle);
                        
                        const resultsList = document.createElement('ul');
                        resultsList.className = 'results-list';
                        
                        suggestion.expectedResults.forEach(result => {
                            const resultItem = document.createElement('li');
                            resultItem.textContent = result;
                            resultsList.appendChild(resultItem);
                        });
                        
                        content.appendChild(resultsList);
                    }
                    
                    suggestionEl.appendChild(header);
                    suggestionEl.appendChild(content);
                    suggestionsList.appendChild(suggestionEl);
                });
            }
            
            // Initialize by loading default paths
            vscode.postMessage({
                command: 'loadDefaultPaths'
            });
        }());
        `;
    }

    /**
     * Sets up message handling
     * @param webview The webview
     */
    protected setupMessageHandling(webview: vscode.Webview): void {
        webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'browseAllure':
                        await this.browseAllurePath();
                        break;
                        
                    case 'browseJacoco':
                        await this.browseJacocoPath();
                        break;
                        
                    case 'analyzeCoverage':
                        await this.analyzeCoverage(message.allurePath, message.jacocoPath);
                        break;
                        
                    case 'loadDefaultPaths':
                        await this.loadDefaultPaths();
                        break;
                        
                    case 'generateSuggestions':
                        await this.generateSuggestions();
                        break;
                        
                    case 'generateTestCases':
                        await this.generateTestCases(message.suggestionIds);
                        break;
                        
                    case 'showError':
                        vscode.window.showErrorMessage(message.message);
                        break;
                }
            },
            undefined,
            this.disposables
        );
    }

    /**
     * Registers additional disposables
     */
    protected registerDisposables(): void {
        // No additional disposables needed
    }

    /**
     * Browses for Allure report path
     */
    private async browseAllurePath(): Promise<void> {
        try {
            const options: vscode.OpenDialogOptions = {
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Select Allure Report Directory'
            };
            
            const result = await vscode.window.showOpenDialog(options);
            
            if (result && result.length > 0) {
                const dirPath = result[0].fsPath;
                
                // Send path to webview
                this.sendMessage({
                    command: 'setAllurePath',
                    path: dirPath
                });
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error selecting Allure report directory: ${(error as Error).message}`);
        }
    }

    /**
     * Browses for JaCoCo report path
     */
    private async browseJacocoPath(): Promise<void> {
        try {
            const options: vscode.OpenDialogOptions = {
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'XML Files': ['xml']
                },
                openLabel: 'Select JaCoCo XML Report'
            };
            
            const result = await vscode.window.showOpenDialog(options);
            
            if (result && result.length > 0) {
                const filePath = result[0].fsPath;
                
                // Send path to webview
                this.sendMessage({
                    command: 'setJacocoPath',
                    path: filePath
                });
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error selecting JaCoCo report file: ${(error as Error).message}`);
        }
    }

    /**
     * Loads default report paths from settings
     */
    private async loadDefaultPaths(): Promise<void> {
        try {
            const allurePath = this.resultCollector.getAllureReportPath();
            const jacocoPath = this.resultCollector.getJacocoReportPath();
            
            // Send paths to webview
            this.sendMessage({
                command: 'setAllurePath',
                path: allurePath
            });
            
            this.sendMessage({
                command: 'setJacocoPath',
                path: jacocoPath
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error loading default paths: ${(error as Error).message}`);
        }
    }

    /**
     * Analyzes coverage from report files
     * @param allurePath Path to Allure report directory
     * @param jacocoPath Path to JaCoCo XML report
     */
    private async analyzeCoverage(allurePath: string, jacocoPath: string): Promise<void> {
        try {
            this.statusBarManager.showBusy('Analyzing coverage...');
            
            // Clear previous data
            this.coverageData = null;
            this.gaps = [];
            
            if (jacocoPath) {
                // Parse JaCoCo XML
                const jacocoXml = await this.fileManager.readFile(jacocoPath);
                
                // Parse XML to get coverage data
                this.coverageData = await this.xmlParser.parseJacocoXml(jacocoXml);
                
                // Get coverage summary
                const summary = this.coverageAnalyzer.getCoverageSummary();
                
                // Convert to metrics
                const metrics = {
                    line: 0,
                    branch: 0,
                    method: 0,
                    class: 0
                };
                
                // Map coverage types
                summary.forEach((data, type) => {
                    switch(type) {
                        case CoverageType.LINE:
                            metrics.line = data.percentage / 100;
                            break;
                        case CoverageType.BRANCH:
                            metrics.branch = data.percentage / 100;
                            break;
                        case CoverageType.METHOD:
                            metrics.method = data.percentage / 100;
                            break;
                        case CoverageType.CLASS:
                            metrics.class = data.percentage / 100;
                            break;
                    }
                });
                
                // Send metrics to webview
                this.sendMessage({
                    command: 'coverageResults',
                    coverage: metrics
                });
                
                // Get coverage gaps from analyzer
                const analyzerGaps = this.coverageAnalyzer.getCoverageGaps();
                
                // Convert to UI format
                this.gaps = analyzerGaps.map(gap => {
                    return {
                        type: gap.type,
                        location: `${gap.packageName}.${gap.className}${gap.methodName ? '.' + gap.methodName : ''}`,
                        coverage: gap.coverage / 100, // Convert percentage to decimal
                        suggestion: gap.suggestion || 'Improve test coverage for this area'
                    } as UICoverageGap;
                });
                
                // Send gaps to webview
                this.sendMessage({
                    command: 'coverageGaps',
                    gaps: this.gaps
                });
            }
            
            if (allurePath && this.resultCollector.getResults().length > 0) {
                // Analyze test results with Allure data if available
                // This would be implemented in a future version
            }
            
            this.statusBarManager.showSuccess('Coverage analysis completed');
        } catch (error) {
            this.statusBarManager.showError(`Error analyzing coverage: ${(error as Error).message}`);
            
            this.sendMessage({
                command: 'error',
                message: `Error analyzing coverage: ${(error as Error).message}`
            });
        }
    }

    /**
     * Generates test scenario suggestions for coverage gaps
     */
    private async generateSuggestions(): Promise<void> {
        try {
            this.statusBarManager.showBusy('Generating test suggestions...');
            
            // Check if we have gaps to analyze
            if (!this.gaps || this.gaps.length === 0) {
                this.sendMessage({
                    command: 'suggestions',
                    suggestions: []
                });
                return;
            }
            
            // Prepare prompt for AI to generate suggestions
            const prompt = this.constructSuggestionPrompt();
            
            // Get suggestions from AI
            const response = await this.aiController.sendPrompt(
                prompt,
                'You are TestAutomationAgent, a VSCode plugin assistant for test automation. Generate test scenario suggestions based on coverage gaps.'
            );
            
            // Parse response to extract scenarios
            this.suggestedScenarios = this.parseScenarioSuggestions(response.text);
            
            // Send suggestions to webview
            this.sendMessage({
                command: 'suggestions',
                suggestions: this.suggestedScenarios
            });
            
            this.statusBarManager.showSuccess('Test suggestions generated');
        } catch (error) {
            this.statusBarManager.showError(`Error generating suggestions: ${(error as Error).message}`);
            
            this.sendMessage({
                command: 'error',
                message: `Error generating suggestions: ${(error as Error).message}`
            });
        }
    }

    /**
     * Generates test cases from suggested scenarios
     * @param suggestionIds IDs of selected suggestions
     */
    private async generateTestCases(suggestionIds: string[]): Promise<void> {
        try {
            this.statusBarManager.showBusy('Generating test cases...');
            
            // Filter selected scenarios
            const selectedScenarios = this.suggestedScenarios.filter(
                scenario => suggestionIds.includes(scenario.id)
            );
            
            if (selectedScenarios.length === 0) {
                throw new Error('No scenarios selected');
            }
            
            // Store the selected scenarios
            // First, get the current scenarios
            const currentScenarios = this.scenarioGenerator.getScenarios();
            
            // Clear them
            this.scenarioGenerator.clearScenarios();
            
            // Now add all scenarios (current + new) using public API methods
            // Add back the existing ones
            for (const scenario of currentScenarios) {
                await this.scenarioGenerator.generateFromText(
                    JSON.stringify({
                        ...scenario
                    })
                );
            }
            
            // Then add the selected new ones
            for (const scenario of selectedScenarios) {
                await this.scenarioGenerator.generateFromText(
                    JSON.stringify({
                        ...scenario
                    })
                );
            }
            
            // Navigate to the Test Case Generation view
            await vscode.commands.executeCommand(Commands.GENERATE_TEST_CASES);
            
            this.statusBarManager.showSuccess('Test cases generation started');
        } catch (error) {
            this.statusBarManager.showError(`Error generating test cases: ${(error as Error).message}`);
            
            this.sendMessage({
                command: 'error',
                message: `Error generating test cases: ${(error as Error).message}`
            });
        }
    }

    /**
     * Constructs prompt for generating test suggestions
     * @returns The constructed prompt
     */
    private constructSuggestionPrompt(): string {
        // Get test results
        const testResults = this.resultCollector.getResults();
        
        // Format gap information
        const gapsInfo = this.gaps.map(gap => 
            `- ${gap.type.toUpperCase()} Coverage Gap: ${gap.location} (${Math.round(gap.coverage * 100)}%)`
        ).join('\n');
        
        return `
You are TestAutomationAgent MVP, a VSCode plugin assistant for test automation.

TASK:
Generate test scenario suggestions based on the following coverage gaps:

${gapsInfo}

CONTEXT:
Results from previous tests:
${this.formatTestResults(testResults)}

INSTRUCTIONS:
1. Create 3-5 test scenarios that would increase coverage in the identified gap areas
2. Each scenario should have:
   - A descriptive title
   - A clear description of what to test
   - 3-6 concrete steps to execute the test
   - 2-4 expected results to verify
3. Focus on areas with the lowest coverage first
4. Include both happy path and edge cases
5. Make scenarios specific and actionable

Format each scenario in JSON format with the following structure:
\`\`\`json
{
  "id": "TS-GAP-[number]",
  "title": "[Descriptive title]",
  "description": "[Detailed description]",
  "priority": "High/Medium/Low",
  "steps": [
    "Step 1",
    "Step 2",
    ...
  ],
  "expectedResults": [
    "Expected Result 1",
    "Expected Result 2",
    ...
  ]
}
\`\`\`

Return only the JSON objects with no additional text.
        `;
    }

    /**
     * Formats test results for inclusion in prompt
     * @param results The test results to format
     * @returns Formatted test results string
     */
    private formatTestResults(results: TestResult[]): string {
        if (!results || results.length === 0) {
            return 'No previous test results available.';
        }
        
        return results.map(result => 
            `- Test '${result.name}': ${result.status} (Duration: ${result.duration}ms)`
        ).join('\n');
    }

    /**
     * Parses AI response to extract scenario suggestions
     * @param responseText The AI response text
     * @returns Array of test scenarios
     */
    private parseScenarioSuggestions(responseText: string): TestScenario[] {
        try {
            // Extract JSON objects from the response
            const jsonObjects: TestScenario[] = [];
            const regex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```|(\{[\s\S]*?\})/g;
            
            let match;
            while ((match = regex.exec(responseText)) !== null) {
                const jsonStr = match[1] || match[2];
                try {
                    const scenario = JSON.parse(jsonStr) as TestScenario;
                    // Generate ID if not present or transform existing TS-XXX to TS-GAP-XXX
                    if (!scenario.id) {
                        scenario.id = `TS-GAP-${jsonObjects.length + 1}`;
                    } else if (scenario.id.match(/^TS-\d+$/)) {
                        // Convert TS-001 to TS-GAP-001
                        scenario.id = scenario.id.replace(/^TS-(\d+)$/, 'TS-GAP-$1');
                    }
                    // Set source requirements if not present
                    if (!scenario.sourceRequirements) {
                        scenario.sourceRequirements = ['Coverage-Gap'];
                    }
                    jsonObjects.push(scenario);
                } catch (e) {
                    console.error('Failed to parse scenario JSON:', e);
                }
            }
            
            // If no JSON objects found, try parsing the whole response
            if (jsonObjects.length === 0) {
                try {
                    const scenario = JSON.parse(responseText.trim()) as TestScenario;
                    // Generate ID if not present or transform existing TS-XXX to TS-GAP-XXX
                    if (!scenario.id) {
                        scenario.id = `TS-GAP-1`;
                    } else if (scenario.id.match(/^TS-\d+$/)) {
                        // Convert TS-001 to TS-GAP-001
                        scenario.id = scenario.id.replace(/^TS-(\d+)$/, 'TS-GAP-$1');
                    }
                    // Set source requirements if not present
                    if (!scenario.sourceRequirements) {
                        scenario.sourceRequirements = ['Coverage-Gap'];
                    }
                    jsonObjects.push(scenario);
                } catch (e) {
                    console.error('Failed to parse scenario from response:', e);
                }
            }
            
            return jsonObjects;
        } catch (error) {
            console.error('Error parsing AI suggestions:', error);
            return [];
        }
    }
}
