import * as vscode from 'vscode';
import * as path from 'path';
import { WebviewProvider } from './webviewProvider';
import { TestExecutor, TestResult, TestResultStatus } from '../testExecution/executor';
import { EnvironmentManager, TestEnvironment } from '../testExecution/environmentManager';
import { TestCaseGenerator } from '../testGeneration/testCase/testCaseGenerator';
import { ResultCollector } from '../testExecution/resultCollector';
import { Commands } from '../core/commands';
import { StatusBarManager } from '../core/statusBar';
import { FileManager } from '../fileSystem/fileManager';

/**
 * WebView provider for the Test Execution UI
 */
export class TestExecutionView extends WebviewProvider {
    private testExecutor: TestExecutor;
    private environmentManager: EnvironmentManager;
    private testCaseGenerator: TestCaseGenerator;
    private resultCollector: ResultCollector;
    private statusBarManager: StatusBarManager;
    private fileManager: FileManager;

    constructor(context: vscode.ExtensionContext) {
        super('testautomationagent.testExecutionView', context);
        this.testExecutor = TestExecutor.getInstance();
        this.environmentManager = EnvironmentManager.getInstance();
        this.testCaseGenerator = TestCaseGenerator.getInstance();
        this.resultCollector = ResultCollector.getInstance();
        // Use the existing status bar instance without creating a new one
        this.statusBarManager = StatusBarManager.getInstance();
        this.fileManager = FileManager.getInstance();
    }

    /**
     * Gets the title of the webview
     * @returns The webview title
     */
    protected getTitle(): string {
        return 'Test Execution';
    }

    /**
     * Gets the HTML body content
     * @returns The HTML body content
     */
    protected getBodyHtml(): string {
        return `
        <div class="container">
            <h1>Test Execution</h1>
            
            <div class="panel">
                <div class="panel-header">
                    <h2>Test Selection</h2>
                    <div class="environment-selector">
                        <label for="environment-select">Environment:</label>
                        <select id="environment-select" class="select-input">
                            <option value="default">Default</option>
                        </select>
                    </div>
                </div>
                
                <div id="test-selection" class="test-selection">
                    <div id="no-tests" class="message-box">
                        <i class="codicon codicon-info"></i>
                        <p>No test cases available. Go to the Test Case Generation view to create test cases.</p>
                    </div>
                </div>
                
                <div class="action-bar">
                    <button id="refresh-tests-btn" class="btn secondary">
                        <i class="codicon codicon-refresh"></i> Refresh Tests
                    </button>
                    <button id="execute-btn" class="btn primary">
                        <i class="codicon codicon-play"></i> Execute Tests
                    </button>
                </div>
            </div>
            
            <div class="panel">
                <h2>Execution Results</h2>
                <div id="loading-results" class="loading hidden">
                    <i class="codicon codicon-loading spin"></i> Executing tests...
                </div>
                
                <div id="execution-summary" class="execution-summary hidden">
                    <div class="summary-item">
                        <span class="label">Total:</span>
                        <span id="total-count" class="value">0</span>
                    </div>
                    <div class="summary-item success">
                        <span class="label">Passed:</span>
                        <span id="passed-count" class="value">0</span>
                    </div>
                    <div class="summary-item error">
                        <span class="label">Failed:</span>
                        <span id="failed-count" class="value">0</span>
                    </div>
                    <div class="summary-item warning">
                        <span class="label">Skipped:</span>
                        <span id="skipped-count" class="value">0</span>
                    </div>
                    <div class="summary-item info">
                        <span class="label">Duration:</span>
                        <span id="duration" class="value">0s</span>
                    </div>
                </div>
                
                <div id="results-list" class="results-container">
                    <div id="no-results" class="message-box">
                        <i class="codicon codicon-info"></i>
                        <p>No test results yet. Select tests and click "Execute Tests" to start.</p>
                    </div>
                </div>
                
                <div class="action-bar hidden" id="result-actions">
                    <button id="view-report-btn" class="btn secondary">
                        <i class="codicon codicon-file"></i> View Report
                    </button>
                    <button id="analyze-coverage-btn" class="btn primary">
                        <i class="codicon codicon-graph"></i> Analyze Coverage
                    </button>
                    <button id="remediate-btn" class="btn primary">
                        <i class="codicon codicon-gear"></i> Remediate Failures
                    </button>
                </div>
            </div>
            
            <div class="panel">
                <h2>Execution Logs</h2>
                <div id="execution-logs" class="execution-logs">
                    <pre id="logs-content"></pre>
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
            
            // State
            let testCases = [];
            let environments = [];
            let results = [];
            let logs = [];
            
            // UI Elements
            const environmentSelect = document.getElementById('environment-select');
            const testSelection = document.getElementById('test-selection');
            const noTests = document.getElementById('no-tests');
            const refreshTestsBtn = document.getElementById('refresh-tests-btn');
            const executeBtn = document.getElementById('execute-btn');
            const loadingResults = document.getElementById('loading-results');
            const executionSummary = document.getElementById('execution-summary');
            const totalCount = document.getElementById('total-count');
            const passedCount = document.getElementById('passed-count');
            const failedCount = document.getElementById('failed-count');
            const skippedCount = document.getElementById('skipped-count');
            const duration = document.getElementById('duration');
            const resultsList = document.getElementById('results-list');
            const noResults = document.getElementById('no-results');
            const resultActions = document.getElementById('result-actions');
            const viewReportBtn = document.getElementById('view-report-btn');
            const analyzeCoverageBtn = document.getElementById('analyze-coverage-btn');
            const remediateBtn = document.getElementById('remediate-btn');
            const logsContent = document.getElementById('logs-content');
            
            // Event Listeners
            refreshTestsBtn.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'refreshTests'
                });
                
                vscode.postMessage({
                    command: 'refreshEnvironments'
                });
            });
            
            executeBtn.addEventListener('click', () => {
                const selectedTestIds = getSelectedTestIds();
                if (selectedTestIds.length === 0) {
                    vscode.postMessage({
                        command: 'showError',
                        message: 'Please select at least one test case'
                    });
                    return;
                }
                
                const environmentId = environmentSelect.value;
                
                loadingResults.classList.remove('hidden');
                noResults.classList.add('hidden');
                executionSummary.classList.add('hidden');
                resultActions.classList.add('hidden');
                
                vscode.postMessage({
                    command: 'executeTests',
                    testIds: selectedTestIds,
                    environmentId
                });
            });
            
            viewReportBtn.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'viewReport'
                });
            });
            
            analyzeCoverageBtn.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'analyzeCoverage'
                });
            });
            
            remediateBtn.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'remediateFailures'
                });
            });
            
            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch(message.command) {
                    case 'testCases':
                        testCases = message.testCases;
                        displayTestCases(testCases);
                        break;
                        
                    case 'environments':
                        environments = message.environments;
                        displayEnvironments(environments);
                        break;
                        
                    case 'executionStarted':
                        logs = [];
                        updateLogs('Execution started...');
                        break;
                        
                    case 'testStarted':
                        updateLogs(\`Running test: \${message.testName}...\`);
                        break;
                        
                    case 'testFinished':
                        updateLogs(\`Test \${message.testName} completed with status: \${message.status}\`);
                        if (message.output) {
                            updateLogs(message.output);
                        }
                        break;
                        
                    case 'executionProgress':
                        updateExecutionProgress(message.progress);
                        break;
                        
                    case 'executionResults':
                        results = message.results;
                        displayResults(results);
                        updateSummary(message.summary);
                        loadingResults.classList.add('hidden');
                        executionSummary.classList.remove('hidden');
                        resultActions.classList.remove('hidden');
                        break;
                        
                    case 'log':
                        updateLogs(message.text);
                        break;
                        
                    case 'error':
                        loadingResults.classList.add('hidden');
                        updateLogs(\`ERROR: \${message.message}\`);
                        break;
                }
            });
            
            // Helper functions
            function getSelectedTestIds() {
                const checkboxes = document.querySelectorAll('.test-checkbox:checked');
                return Array.from(checkboxes).map(checkbox => checkbox.getAttribute('data-id'));
            }
            
            function displayTestCases(testCases) {
                testSelection.innerHTML = '';
                
                if (!testCases || testCases.length === 0) {
                    noTests.classList.remove('hidden');
                    return;
                }
                
                noTests.classList.add('hidden');
                
                testCases.forEach((testCase, index) => {
                    const testEl = document.createElement('div');
                    testEl.className = 'test-item';
                    
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'test-checkbox';
                    checkbox.id = \`test-\${index}\`;
                    checkbox.checked = true;
                    checkbox.setAttribute('data-id', testCase.id);
                    
                    const label = document.createElement('label');
                    label.htmlFor = \`test-\${index}\`;
                    label.textContent = testCase.name || \`Test Case \${index + 1}\`;
                    
                    testEl.appendChild(checkbox);
                    testEl.appendChild(label);
                    testSelection.appendChild(testEl);
                });
            }
            
            function displayEnvironments(environments) {
                environmentSelect.innerHTML = '';
                
                if (!environments || environments.length === 0) {
                    const option = document.createElement('option');
                    option.value = 'default';
                    option.textContent = 'Default';
                    environmentSelect.appendChild(option);
                    return;
                }
                
                environments.forEach(env => {
                    const option = document.createElement('option');
                    option.value = env.id;
                    option.textContent = env.name;
                    environmentSelect.appendChild(option);
                });
            }
            
            function displayResults(results) {
                resultsList.innerHTML = '';
                
                if (!results || results.length === 0) {
                    noResults.classList.remove('hidden');
                    return;
                }
                
                noResults.classList.add('hidden');
                
                results.forEach(result => {
                    const resultEl = document.createElement('div');
                    resultEl.className = \`result-item \${getStatusClass(result.status)}\`;
                    
                    const header = document.createElement('div');
                    header.className = 'result-header';
                    
                    const title = document.createElement('h3');
                    title.textContent = result.testCaseId;
                    
                    const status = document.createElement('span');
                    status.className = 'result-status';
                    status.textContent = result.status;
                    
                    header.appendChild(title);
                    header.appendChild(status);
                    
                    const content = document.createElement('div');
                    content.className = 'result-content';
                    
                    if (result.errorMessage) {
                        const errorMessage = document.createElement('div');
                        errorMessage.className = 'error-message';
                        errorMessage.textContent = result.errorMessage;
                        content.appendChild(errorMessage);
                    }
                    
                    if (result.stackTrace) {
                        const stackTrace = document.createElement('pre');
                        stackTrace.className = 'stack-trace';
                        stackTrace.textContent = result.stackTrace;
                        content.appendChild(stackTrace);
                    }
                    
                    const details = document.createElement('div');
                    details.className = 'result-details';
                    details.innerHTML = \`
                        <div><span class="label">Duration:</span> <span>\${result.duration}ms</span></div>
                        <div><span class="label">Started:</span> <span>\${new Date(result.startTime).toLocaleTimeString()}</span></div>
                    \`;
                    
                    content.appendChild(details);
                    
                    resultEl.appendChild(header);
                    resultEl.appendChild(content);
                    resultsList.appendChild(resultEl);
                    
                    // Add toggle functionality
                    header.addEventListener('click', () => {
                        resultEl.classList.toggle('expanded');
                    });
                });
            }
            
            function updateSummary(summary) {
                if (!summary) return;
                
                totalCount.textContent = summary.total || 0;
                passedCount.textContent = summary.passed || 0;
                failedCount.textContent = summary.failed || 0;
                skippedCount.textContent = summary.skipped || 0;
                
                // Format duration
                const durationMs = summary.duration || 0;
                let formattedDuration = '';
                
                if (durationMs < 1000) {
                    formattedDuration = \`\${durationMs}ms\`;
                } else if (durationMs < 60000) {
                    formattedDuration = \`\${(durationMs / 1000).toFixed(2)}s\`;
                } else {
                    const minutes = Math.floor(durationMs / 60000);
                    const seconds = ((durationMs % 60000) / 1000).toFixed(2);
                    formattedDuration = \`\${minutes}m \${seconds}s\`;
                }
                
                duration.textContent = formattedDuration;
            }
            
            function updateExecutionProgress(progress) {
                // Could update a progress bar here
            }
            
            function updateLogs(text) {
                if (typeof text !== 'string') {
                    text = JSON.stringify(text, null, 2);
                }
                
                logs.push(text);
                logsContent.textContent = logs.join('\\n');
                
                // Auto-scroll to bottom
                logsContent.scrollTop = logsContent.scrollHeight;
            }
            
            function getStatusClass(status) {
                switch(status) {
                    case 'PASSED':
                        return 'success';
                    case 'FAILED':
                        return 'error';
                    case 'SKIPPED':
                        return 'warning';
                    case 'ERROR':
                        return 'error';
                    default:
                        return '';
                }
            }
            
            // Initialize by requesting data
            vscode.postMessage({
                command: 'refreshTests'
            });
            
            vscode.postMessage({
                command: 'refreshEnvironments'
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
                    case 'refreshTests':
                        await this.refreshTests();
                        break;
                        
                    case 'refreshEnvironments':
                        await this.refreshEnvironments();
                        break;
                        
                    case 'executeTests':
                        await this.executeTests(message.testIds, message.environmentId);
                        break;
                        
                    case 'viewReport':
                        await this.viewReport();
                        break;
                        
                    case 'analyzeCoverage':
                        await this.analyzeCoverage();
                        break;
                        
                    case 'remediateFailures':
                        await this.remediateFailures();
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
     * Refreshes the test cases list
     */
    private async refreshTests(): Promise<void> {
        try {
            const testCases = this.testCaseGenerator.getTestCases();
            
            // Transform test cases for the UI
            const uiTestCases = testCases.map((testCase, index) => ({
                id: testCase.id,
                name: `Test Case ${index + 1}: ${testCase.scenarioId}`,
                path: testCase.path
            }));
            
            this.sendMessage({
                command: 'testCases',
                testCases: uiTestCases
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error refreshing test cases: ${(error as Error).message}`);
            
            this.sendMessage({
                command: 'error',
                message: `Error refreshing test cases: ${(error as Error).message}`
            });
        }
    }

    /**
     * Refreshes the environments list
     */
    private async refreshEnvironments(): Promise<void> {
        try {
            const environments = this.environmentManager.getEnvironments();
            
            this.sendMessage({
                command: 'environments',
                environments
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error refreshing environments: ${(error as Error).message}`);
            
            this.sendMessage({
                command: 'error',
                message: `Error refreshing environments: ${(error as Error).message}`
            });
        }
    }

    /**
     * Executes test cases
     * @param testIds IDs of test cases to execute
     * @param environmentId ID of the environment to use
     */
    private async executeTests(testIds: string[], environmentId: string): Promise<void> {
        try {
            this.statusBarManager.showBusy('Executing tests...');
            
            // Notify webview of execution start
            this.sendMessage({
                command: 'executionStarted'
            });
            
            // Get test cases
            const allTestCases = this.testCaseGenerator.getTestCases();
            const selectedTestCases = allTestCases.filter(tc => testIds.includes(tc.id));
            
            if (selectedTestCases.length === 0) {
                throw new Error('No test cases selected');
            }
            
            // Get environment
            let environment: TestEnvironment | undefined;
            if (environmentId !== 'default') {
                environment = this.environmentManager.getEnvironment(environmentId);
                if (!environment) {
                    throw new Error(`Environment not found: ${environmentId}`);
                }
            }
            
            // Execute tests one by one
            const results: TestResult[] = [];
            const startTime = Date.now();
            
            for (const testCase of selectedTestCases) {
                // Notify webview of test start
                this.sendMessage({
                    command: 'testStarted',
                    testName: testCase.id
                });
                
                // Execute the test
                const result = await this.testExecutor.executeTest(testCase, environment);
                results.push(result);
                
                // Notify webview of test completion
                this.sendMessage({
                    command: 'testFinished',
                    testName: testCase.id,
                    status: result.status,
                    output: result.output
                });
                
                // Update execution progress
                this.sendMessage({
                    command: 'executionProgress',
                    progress: {
                        current: results.length,
                        total: selectedTestCases.length
                    }
                });
            }
            
            // Calculate summary
            const endTime = Date.now();
            const summary = {
                total: results.length,
                passed: results.filter(r => r.status === TestResultStatus.PASSED).length,
                failed: results.filter(r => r.status === TestResultStatus.FAILED).length,
                skipped: results.filter(r => r.status === TestResultStatus.SKIPPED).length,
                duration: endTime - startTime
            };
            
            // Store results
            this.resultCollector.collectResults(results);
            
            // Notify webview of execution completion
            this.sendMessage({
                command: 'executionResults',
                results,
                summary
            });
            
            this.statusBarManager.showSuccess('Test execution completed');
        } catch (error) {
            this.statusBarManager.showError(`Error executing tests: ${(error as Error).message}`);
            
            this.sendMessage({
                command: 'error',
                message: `Error executing tests: ${(error as Error).message}`
            });
        }
    }

    /**
     * Views the test report
     */
    private async viewReport(): Promise<void> {
        try {
            // Generate HTML report
            const reportPath = await this.resultCollector.generateReport(
                ResultCollector.HTML_FORMAT,
                path.join(vscode.workspace.rootPath || '', 'test-reports', `test-report-${Date.now()}.html`)
            );
            
            // Open the report
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(reportPath));
        } catch (error) {
            vscode.window.showErrorMessage(`Error viewing report: ${(error as Error).message}`);
        }
    }

    /**
     * Analyzes test coverage
     */
    private async analyzeCoverage(): Promise<void> {
        try {
            // Execute the command to analyze coverage
            await vscode.commands.executeCommand(Commands.ANALYZE_COVERAGE);
        } catch (error) {
            vscode.window.showErrorMessage(`Error analyzing coverage: ${(error as Error).message}`);
        }
    }

    /**
     * Remediates test failures
     */
    private async remediateFailures(): Promise<void> {
        try {
            // Execute the command to suggest remediation
            await vscode.commands.executeCommand(Commands.SUGGEST_REMEDIATION);
        } catch (error) {
            vscode.window.showErrorMessage(`Error remediating failures: ${(error as Error).message}`);
        }
    }
}
