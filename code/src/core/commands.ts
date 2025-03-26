import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { StatusBarManager } from './statusBar';
import { logger } from '../utils/logger';

/**
 * Helper function to format diff output with HTML highlighting
 * @param diff The diff text to format
 * @returns Formatted HTML string
 */
function formatDiff(diff: string): string {
    return diff
        .replace(/^-.*$/gm, match => `<span class="diff-removed">${match}</span>`)
        .replace(/^\+.*$/gm, match => `<span class="diff-added">${match}</span>`);
}

import { AIController } from '../ai/controller';
import { FileManager } from '../fileSystem/fileManager';
import { CommandExecutor } from '../terminal/commandExecutor';
import { ScenarioGenerator, TestScenario } from '../testGeneration/scenario/scenarioGenerator';
import { TestCaseGenerator, TestCaseTemplate } from '../testGeneration/testCase/testCaseGenerator';
import { TestExecutor } from '../testExecution/executor';
import { ResultCollector } from '../testExecution/resultCollector';
import { CoverageAnalyzer } from '../coverage/analyzer';
import { CodeRemediator } from '../remediation/remediator';

/**
 * Command IDs as defined in package.json
 */
export const Commands = {
    IMPORT_REQUIREMENTS: 'testautomationagent.importRequirements',
    GENERATE_SCENARIOS: 'testautomationagent.generateScenarios',
    GENERATE_TEST_CASES: 'testautomationagent.generateTestCases',
    EXECUTE_TESTS: 'testautomationagent.executeTests',
    ANALYZE_COVERAGE: 'testautomationagent.analyzeCoverage',
    SUGGEST_REMEDIATION: 'testautomationagent.suggestRemediation',
    APPLY_REMEDIATION: 'testautomationagent.applyRemediation',
    TOGGLE_PLAN_ACT_MODE: 'testautomationagent.togglePlanActMode',
    CREATE_FILE: 'testautomationagent.createFile',
    EXECUTE_COMMAND: 'testautomationagent.executeCommand',
};

/**
 * Registers all commands for the extension
 * @param context Extension context
 */
export function registerCommands(context: vscode.ExtensionContext): void {
    logger.info('Registering TestAutomationAgent commands');
    
    // Import Requirements command
    const importRequirementsCommand = vscode.commands.registerCommand(
        Commands.IMPORT_REQUIREMENTS,
        async () => {
            const statusBar = StatusBarManager.getInstance();
            
            try {
                logger.info('Executing command: Import Requirements');
                statusBar.showBusy('Importing requirements...');
                
                // Show file picker for PDF or text files
                const fileUris = await vscode.window.showOpenDialog({
                    canSelectMany: false,
                    filters: {
                        'Requirements Files': ['pdf', 'txt', 'md', 'json']
                    },
                    title: 'Select Requirements File'
                });
                
                if (!fileUris || fileUris.length === 0) {
                    logger.info('Import cancelled by user - no file selected');
                    statusBar.showInfo('Import cancelled');
                    return;
                }
                
                const filePath = fileUris[0].fsPath;
                const fileExt = path.extname(filePath).toLowerCase();
                
                logger.info(`Selected requirements file: ${filePath}`);
                
                // Process based on file type
                const scenarioGenerator = ScenarioGenerator.getInstance();
                await scenarioGenerator.importRequirementsFromFile(filePath);
                
                logger.info('Requirements imported successfully');
                statusBar.showSuccess('Requirements imported successfully');
                vscode.window.showInformationMessage(`Requirements imported from ${path.basename(filePath)}`);
                
                // Refresh the scenarios view
                vscode.commands.executeCommand('testautomationagent.scenarioView.refresh');
            } catch (error) {
                logger.error(`Error importing requirements`, error);
                statusBar.showError(`Error importing requirements: ${(error as Error).message}`);
                vscode.window.showErrorMessage(`Failed to import requirements: ${(error as Error).message}`);
            }
        }
    );

    // Generate Scenarios command
    const generateScenariosCommand = vscode.commands.registerCommand(
        Commands.GENERATE_SCENARIOS,
        async () => {
            const statusBar = StatusBarManager.getInstance();
            
            try {
                statusBar.showBusy('Preparing to generate test scenarios...');
                
                // Show input options
                const inputOption = await vscode.window.showQuickPick(
                    [
                        { label: 'Import from file', description: 'Import requirements from an existing file' }
                    ],
                    { placeHolder: 'Select input method for test scenario generation' }
                );
                
                if (!inputOption) {
                    statusBar.showInfo('Operation cancelled');
                    return;
                }
                
                const scenarioGenerator = ScenarioGenerator.getInstance();
                let scenarios: TestScenario[] = [];
                
                // Since we only have 'Import from file' option now
                const fileUris = await vscode.window.showOpenDialog({
                    canSelectMany: false,
                    filters: {
                        'Text files': ['txt', 'md', 'json'],
                        'All files': ['*']
                    },
                    title: 'Select requirements file'
                });
                
                if (!fileUris || fileUris.length === 0) {
                    statusBar.showInfo('Operation cancelled');
                    return;
                }
                
                scenarios = await scenarioGenerator.generateFromFile(fileUris[0].fsPath);
                
                if (scenarios.length > 0) {
                    // Ask user if they want to save scenarios to a file
                    const saveOption = await vscode.window.showQuickPick(
                        ['Yes', 'No'],
                        { placeHolder: 'Do you want to save the generated scenarios to a file?' }
                    );
                    
                    if (saveOption === 'Yes') {
                        const saveUri = await vscode.window.showSaveDialog({
                            defaultUri: vscode.Uri.file('test-scenarios.json'),
                            filters: {
                                'JSON files': ['json']
                            },
                            title: 'Save test scenarios'
                        });
                        
                        if (saveUri) {
                            await scenarioGenerator.saveToFile(saveUri.fsPath);
                        }
                    }
                    
                    // Refresh the scenarios view
                    vscode.commands.executeCommand('testautomationagent.scenarioView.refresh');
                    
                    statusBar.showSuccess(`${scenarios.length} test scenarios generated`);
                    vscode.window.showInformationMessage(`Generated ${scenarios.length} test scenarios`);
                }
            } catch (error) {
                statusBar.showError(`Error generating scenarios: ${(error as Error).message}`);
                vscode.window.showErrorMessage(`Failed to generate scenarios: ${(error as Error).message}`);
            }
        }
    );

    // Generate Test Cases command
    const generateTestCasesCommand = vscode.commands.registerCommand(
        Commands.GENERATE_TEST_CASES,
        async () => {
            const statusBar = StatusBarManager.getInstance();
            
            try {
                statusBar.showBusy('Preparing to generate test cases...');
                
                // Get scenarios from the scenario generator
                const scenarioGenerator = ScenarioGenerator.getInstance();
                const scenarios = scenarioGenerator.getScenarios();
                
                if (scenarios.length === 0) {
                    vscode.window.showWarningMessage('No scenarios available. Generate scenarios first.');
                    statusBar.showInfo('No scenarios available');
                    return;
                }
                
                // Let user select which scenarios to generate test cases for
                const scenarioItems = scenarios.map(s => ({
                    label: s.title,
                    description: s.id,
                    detail: s.description,
                    picked: true,
                    scenario: s
                }));
                
                const selectedItems = await vscode.window.showQuickPick(
                    scenarioItems, 
                    {
                        canPickMany: true,
                        placeHolder: 'Select scenarios for test case generation',
                        title: 'Select Test Scenarios'
                    }
                );
                
                if (!selectedItems || selectedItems.length === 0) {
                    statusBar.showInfo('No scenarios selected');
                    return;
                }
                
                // Ask if user wants to include OpenAPI spec for generation
                const includeOpenApiSpec = await vscode.window.showQuickPick(
                    ['Yes', 'No'],
                    {
                        placeHolder: 'Include OpenAPI specification for test generation?',
                        title: 'Include OpenAPI Spec'
                    }
                );
                
                let openApiSpecPath: string | undefined;
                
                if (includeOpenApiSpec === 'Yes') {
                    // Show file picker for OpenAPI spec
                    const fileUris = await vscode.window.showOpenDialog({
                        canSelectMany: false,
                        filters: {
                            'JSON Files': ['json'],
                            'YAML Files': ['yaml', 'yml'],
                            'All Files': ['*']
                        },
                        title: 'Select OpenAPI Specification File'
                    });
                    
                    if (fileUris && fileUris.length > 0) {
                        openApiSpecPath = fileUris[0].fsPath;
                        logger.info(`Selected OpenAPI spec: ${openApiSpecPath}`);
                    }
                }
                
                // Generate test cases
                statusBar.showBusy(`Generating test cases for ${selectedItems.length} scenarios...`);
                
                const testCaseGenerator = TestCaseGenerator.getInstance();
                const selectedScenarios = selectedItems.map(item => item.scenario);
                const testCases = await testCaseGenerator.generateTestCases(
                    selectedScenarios, 
                    TestCaseTemplate.KARATE_BDD, 
                    openApiSpecPath
                );
                
                // Ask for output directory
                const folderUri = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: 'Select Output Directory',
                    title: 'Select directory to save test cases'
                });
                
                if (folderUri && folderUri.length > 0) {
                    // Save test cases
                    await testCaseGenerator.saveAllTestCases(folderUri[0].fsPath);
                    
                    // Show generated files in explorer
                    vscode.commands.executeCommand('revealFileInOS', folderUri[0]);
                }
                
                statusBar.showSuccess(`Generated ${testCases.length} test cases`);
                vscode.window.showInformationMessage(`Successfully generated ${testCases.length} test cases` + 
                    (openApiSpecPath ? ' using OpenAPI spec' : ''));
                
                // Refresh the test case view
                vscode.commands.executeCommand('testautomationagent.testCaseView.refresh');
            } catch (error) {
                statusBar.showError(`Error generating test cases: ${(error as Error).message}`);
                vscode.window.showErrorMessage(`Failed to generate test cases: ${(error as Error).message}`);
            }
        }
    );

    // Execute Tests command
    const executeTestsCommand = vscode.commands.registerCommand(
        Commands.EXECUTE_TESTS,
        async () => {
            const statusBar = StatusBarManager.getInstance();
            
            try {
                statusBar.showBusy('Preparing to execute tests...');
                
                // Get available environments
                const executor = TestExecutor.getInstance();
                const environments = await executor.getAvailableEnvironments();
                
                if (environments.length === 0) {
                    vscode.window.showWarningMessage('No test environments configured. Please configure environments first.');
                    statusBar.showInfo('No environments available');
                    return;
                }
                
                // Let user select environment
                const environmentItems = environments.map(env => ({
                    label: env.name,
                    description: env.baseUrl,
                    detail: `Timeout: ${env.timeoutMs}ms`,
                    environment: env
                }));
                
                const selectedEnvironment = await vscode.window.showQuickPick(
                    environmentItems,
                    {
                        placeHolder: 'Select test environment',
                        title: 'Select Test Environment'
                    }
                );
                
                if (!selectedEnvironment) {
                    statusBar.showInfo('No environment selected');
                    return;
                }
                
                // Get test files
                const testCaseGenerator = TestCaseGenerator.getInstance();
                const testFiles = await testCaseGenerator.getAvailableTestFiles();
                
                if (testFiles.length === 0) {
                    vscode.window.showWarningMessage('No test files found. Generate test cases first.');
                    statusBar.showInfo('No test files found');
                    return;
                }
                
                // Let user select test files - filter to only show .feature files
                const testFileItems = testFiles
                    .filter(file => file.toLowerCase().endsWith('.feature'))
                    .map(file => ({
                        label: path.basename(file),
                        description: path.dirname(file),
                        picked: true,
                        file: file
                    }));
                
                const selectedTestFiles = await vscode.window.showQuickPick(
                    testFileItems,
                    {
                        canPickMany: true,
                        placeHolder: 'Select test files to execute',
                        title: 'Select Test Files'
                    }
                );
                
                if (!selectedTestFiles || selectedTestFiles.length === 0) {
                    statusBar.showInfo('No test files selected');
                    return;
                }
                
                // Ask if user wants to enable JaCoCo coverage
                const enableCoverage = await vscode.window.showQuickPick(
                    ['Yes', 'No'],
                    {
                        placeHolder: 'Enable JaCoCo code coverage?',
                        title: 'Enable Coverage'
                    }
                );
                
                // Ask if user wants to start microservice with Gradle
                const startMicroservice = await vscode.window.showQuickPick(
                    ['Yes', 'No'],
                    {
                        placeHolder: 'Start microservice with Gradle before running tests?',
                        title: 'Start Microservice'
                    }
                );
                
                // Prepare execution options - use environment ID instead of the entire object
                const executionOptions = {
                    environment: selectedEnvironment.environment.id, // Use just the ID string
                    withCoverage: enableCoverage === 'Yes',
                    startMicroservice: startMicroservice === 'Yes'
                };
                
                // Execute tests
                statusBar.showBusy(`Executing ${selectedTestFiles.length} test files on ${selectedEnvironment.label}...`);
                
                // Note: Using any type here to avoid TestCase[] type mismatch
                const testResults = await (executor as any).executeTests(
                    selectedTestFiles.map(tf => tf.file),
                    executionOptions
                );
                
                // Collect results
                const resultCollector = ResultCollector.getInstance();
                await resultCollector.collectResults(testResults);
                
                // Show results summary
                const passedCount = testResults.filter((r: any) => r.status === 'passed').length;
                const failedCount = testResults.filter((r: any) => r.status === 'failed').length;
                
                statusBar.showSuccess(`Test execution completed: ${passedCount} passed, ${failedCount} failed`);
                vscode.window.showInformationMessage(
                    `Test execution completed: ${passedCount} passed, ${failedCount} failed`
                );
                
                // If there are failures, ask if user wants to suggest remediation
                if (failedCount > 0) {
                    const suggestRemediation = await vscode.window.showInformationMessage(
                        `${failedCount} tests failed. Would you like to suggest remediation?`,
                        'Yes', 'No'
                    );
                    
                    if (suggestRemediation === 'Yes') {
                        vscode.commands.executeCommand(Commands.SUGGEST_REMEDIATION);
                    }
                }
                
                // Refresh the execution view
                vscode.commands.executeCommand('testautomationagent.executionView.refresh');
                
            } catch (error) {
                statusBar.showError(`Error executing tests: ${(error as Error).message}`);
                vscode.window.showErrorMessage(`Failed to execute tests: ${(error as Error).message}`);
            }
        }
    );

    // Analyze Coverage command
    const analyzeCoverageCommand = vscode.commands.registerCommand(
        Commands.ANALYZE_COVERAGE,
        async () => {
            const statusBar = StatusBarManager.getInstance();
            
            try {
                statusBar.showBusy('Analyzing test coverage...');
                
                // Get coverage analyzer
                const analyzer = CoverageAnalyzer.getInstance();
                
                // Analyze coverage
                statusBar.showBusy('Analyzing coverage reports...');
                
                // Use hardcoded paths to point directly to the final report files
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || process.cwd();
                
                // Path to JaCoCo report directory and file - correctly separated
                const jacocoReportDir = path.join(workspaceRoot, 'testautomationagentplugin/jacoco/reports');
                const jacocoXmlPath = path.join(jacocoReportDir, 'jacoco.xml');
                
                // Path to Karate results directory
                const karateResultsPath = path.join(workspaceRoot, 'testautomationagentplugin/karate/karate-reports');
                
                // Verify JaCoCo report directory exists
                if (!fs.existsSync(jacocoReportDir)) {
                    vscode.window.showErrorMessage(
                        `JaCoCo report directory not found: ${jacocoReportDir}`
                    );
                    statusBar.showError('JaCoCo report directory not found');
                    return;
                }
                
                // Verify JaCoCo XML file exists
                if (!fs.existsSync(jacocoXmlPath)) {
                    vscode.window.showErrorMessage(
                        `JaCoCo XML report not found: ${jacocoXmlPath}`
                    );
                    statusBar.showError('JaCoCo XML report file not found');
                    logger.debug(`Looking for jacoco.xml at: ${jacocoXmlPath}`);
                    return;
                }
                
                if (!fs.existsSync(karateResultsPath)) {
                    vscode.window.showErrorMessage(
                        'Karate test results not found at path: ' + karateResultsPath
                    );
                    statusBar.showError('Karate test results not found');
                    return;
                }
                
                // Process the reports
                statusBar.showBusy('Processing coverage reports...');
                
                const coverageResults = await analyzer.analyzeCoverage(karateResultsPath, jacocoXmlPath);
                
                // Show coverage summary
                const lineCoverage = coverageResults.lineCoverage;
                const branchCoverage = coverageResults.branchCoverage;
                const methodCoverage = coverageResults.methodCoverage;
                
                statusBar.showSuccess(`Coverage: Lines ${lineCoverage.toFixed(2)}%, Branches ${branchCoverage.toFixed(2)}%`);
                
                // Show coverage details in a webview panel
                const panel = vscode.window.createWebviewPanel(
                    'coverageAnalysis',
                    'Coverage Analysis',
                    vscode.ViewColumn.One,
                    {
                        enableScripts: true
                    }
                );
                
                // Define a helper function to format the diff
                function formatDiff(diff: string): string {
                    return diff
                        .replace(/^-.*$/gm, match => `<span class="diff-removed">${match}</span>`)
                        .replace(/^\+.*$/gm, match => `<span class="diff-added">${match}</span>`);
                }
                
                // Use the formatDiff function we defined earlier
                const formatDiffFunc = formatDiff;
                
                // Generate HTML content for the webview
                panel.webview.html = `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Coverage Analysis</title>
                        <style>
                            body { font-family: Arial, sans-serif; padding: 20px; }
                            .coverage-metric { margin-bottom: 20px; }
                            .progress-bar { 
                                background-color: #f0f0f0; 
                                height: 20px; 
                                border-radius: 5px; 
                                margin-top: 5px;
                            }
                            .progress-value {
                                background-color: #0078D7;
                                height: 20px;
                                border-radius: 5px;
                            }
                            .coverage-gaps { margin-top: 30px; }
                            table { width: 100%; border-collapse: collapse; }
                            th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
                            th { background-color: #f2f2f2; }
                        </style>
                    </head>
                    <body>
                        <h1>Coverage Analysis</h1>
                        
                        <div class="coverage-metric">
                            <h3>Line Coverage: ${lineCoverage.toFixed(2)}%</h3>
                            <div class="progress-bar">
                                <div class="progress-value" style="width: ${lineCoverage}%"></div>
                            </div>
                        </div>
                        
                        <div class="coverage-metric">
                            <h3>Branch Coverage: ${branchCoverage.toFixed(2)}%</h3>
                            <div class="progress-bar">
                                <div class="progress-value" style="width: ${branchCoverage}%"></div>
                            </div>
                        </div>
                        
                        <div class="coverage-metric">
                            <h3>Method Coverage: ${methodCoverage.toFixed(2)}%</h3>
                            <div class="progress-bar">
                                <div class="progress-value" style="width: ${methodCoverage}%"></div>
                            </div>
                        </div>
                        
                        <div class="coverage-gaps">
                            <h2>Coverage Gaps</h2>
                            <table>
                                <tr>
                                    <th>Class</th>
                                    <th>Method</th>
                                    <th>Line Coverage</th>
                                    <th>Branch Coverage</th>
                                </tr>
                                ${coverageResults.gaps.map(gap => `
                                    <tr>
                                        <td>${gap.className}</td>
                                        <td>${gap.methodName || 'N/A'}</td>
                                        <td>${(gap.lineCoverage ?? 0).toFixed(2)}%</td>
                                        <td>${(gap.branchCoverage ?? 0).toFixed(2)}%</td>
                                    </tr>
                                `).join('')}
                            </table>
                        </div>
                        
                        <div class="coverage-suggestions">
                            <h2>Suggested Test Scenarios</h2>
                            <ul>
                                ${coverageResults.suggestedScenarios.map(scenario => `
                                    <li>
                                        <h3>${scenario.title}</h3>
                                        <p>${scenario.description}</p>
                                    </li>
                                `).join('')}
                            </ul>
                            
                            <button id="generateScenariosBtn">Generate Test Cases for Suggestions</button>
                        </div>
                        
                        <script>
                            const vscode = acquireVsCodeApi();
                            document.getElementById('generateScenariosBtn').addEventListener('click', () => {
                                vscode.postMessage({
                                    command: 'generateSuggestions'
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
                            case 'generateSuggestions':
                                // Add suggested scenarios to the scenario generator
                                const scenarioGenerator = ScenarioGenerator.getInstance();
                                scenarioGenerator.addScenarios(coverageResults.suggestedScenarios);
                                vscode.commands.executeCommand(Commands.GENERATE_TEST_CASES);
                                return;
                        }
                    },
                    undefined,
                    context.subscriptions
                );
                
                // Refresh the coverage view
                vscode.commands.executeCommand('testautomationagent.coverageView.refresh');
                
            } catch (error) {
                statusBar.showError(`Error analyzing coverage: ${(error as Error).message}`);
                vscode.window.showErrorMessage(`Failed to analyze coverage: ${(error as Error).message}`);
            }
        }
    );

    // Suggest Remediation command
    const suggestRemediationCommand = vscode.commands.registerCommand(
        Commands.SUGGEST_REMEDIATION,
        async () => {
            const statusBar = StatusBarManager.getInstance();
            
            try {
                statusBar.showBusy('Analyzing failed tests...');
                
                // Get result collector
                const resultCollector = ResultCollector.getInstance();
                const failedTests = await resultCollector.getFailedTests();
                
                if (failedTests.length === 0) {
                    vscode.window.showWarningMessage('No failed tests found. Run tests first.');
                    statusBar.showInfo('No failed tests found');
                    return;
                }
                
                // Let user select which failed tests to analyze
                const failedTestItems = failedTests.map(test => ({
                    label: test.name,
                    description: test.feature,
                    detail: `Error: ${test.errorMessage}`,
                    picked: true,
                    test: test
                }));
                
                const selectedTests = await vscode.window.showQuickPick(
                    failedTestItems,
                    {
                        canPickMany: true,
                        placeHolder: 'Select failed tests to remediate',
                        title: 'Select Failed Tests'
                    }
                );
                
                if (!selectedTests || selectedTests.length === 0) {
                    statusBar.showInfo('No tests selected');
                    return;
                }
                
                // Generate remediation suggestions
                statusBar.showBusy(`Generating remediation for ${selectedTests.length} tests...`);
                
                const remediator = CodeRemediator.getInstance();
                const remediationSuggestions = await remediator.generateRemediation(
                    selectedTests.map(t => t.test)
                );
                
                if (remediationSuggestions.length === 0) {
                    vscode.window.showInformationMessage('No remediation suggestions could be generated.');
                    statusBar.showInfo('No suggestions generated');
                    return;
                }
                
                // Show remediation suggestions in a webview panel
                const panel = vscode.window.createWebviewPanel(
                    'remediationSuggestions',
                    'Remediation Suggestions',
                    vscode.ViewColumn.One,
                    {
                        enableScripts: true
                    }
                );
                
                // Generate HTML content for the webview
                panel.webview.html = `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Remediation Suggestions</title>
                        <style>
                            body { font-family: Arial, sans-serif; padding: 20px; }
                            .remediation-item { 
                                margin-bottom: 30px; 
                                border: 1px solid #ddd;
                                border-radius: 5px;
                                padding: 15px;
                            }
                            .remediation-header { 
                                display: flex; 
                                justify-content: space-between; 
                                align-items: center;
                                margin-bottom: 10px;
                            }
                            .test-name { font-weight: bold; }
                            .diff-view { 
                                background-color: #f5f5f5; 
                                padding: 10px; 
                                border-radius: 5px; 
                                font-family: monospace;
                                white-space: pre-wrap;
                            }
                            .diff-removed { color: #a00; background-color: #fee; }
                            .diff-added { color: #0a0; background-color: #efe; }
                            .explanation { margin-top: 10px; }
                            .buttons { margin-top: 15px; }
                            button { 
                                margin-right: 10px; 
                                padding: 8px 15px; 
                                background-color: #0078D7; 
                                color: white; 
                                border: none; 
                                border-radius: 2px; 
                                cursor: pointer; 
                            }
                            button:hover { background-color: #00629f; }
                            .apply-all-btn { 
                                display: block; 
                                margin: 20px auto; 
                                padding: 10px 20px; 
                                font-weight: bold; 
                            }
                        </style>
                    </head>
                    <body>
                        <h1>Remediation Suggestions</h1>
                        
                        <div class="remediation-container">
                            ${remediationSuggestions.map((suggestion, index) => `
                                <div class="remediation-item" id="suggestion-${index}">
                                    <div class="remediation-header">
                                        <span class="test-name">${suggestion.testName}</span>
                                        <span class="file-path">${suggestion.filePath}</span>
                                    </div>
                                    
                                    <div class="diff-view">${formatDiff(suggestion.diff)}</div>
                                    
                                    <div class="explanation">
                                        <h3>Explanation</h3>
                                        <p>${suggestion.explanation}</p>
                                    </div>
                                    
                                    <div class="buttons">
                                        <button class="apply-btn" data-index="${index}">Apply This Fix</button>
                                        <button class="apply-run-btn" data-index="${index}">Apply & Run Test</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        
                        <button class="apply-all-btn">Apply All Fixes</button>
                        
                        <script>
                            const vscode = acquireVsCodeApi();
                            
                            // Format diff for display
                            function formatDiff(diff) {
                                // This function would be implemented to properly format the diff
                                return diff
                                    .replace(/^-.*$/gm, match => \`<span class="diff-removed">\${match}</span>\`)
                                    .replace(/^\\+.*$/gm, match => \`<span class="diff-added">\${match}</span>\`);
                            }
                            
                            // Set up event listeners
                            document.querySelectorAll('.apply-btn').forEach(button => {
                                button.addEventListener('click', () => {
                                    const index = parseInt(button.dataset.index);
                                    vscode.postMessage({
                                        command: 'apply',
                                        suggestionIndex: index
                                    });
                                });
                            });
                            
                            document.querySelectorAll('.apply-run-btn').forEach(button => {
                                button.addEventListener('click', () => {
                                    const index = parseInt(button.dataset.index);
                                    vscode.postMessage({
                                        command: 'applyAndRun',
                                        suggestionIndex: index
                                    });
                                });
                            });
                            
                            document.querySelector('.apply-all-btn').addEventListener('click', () => {
                                vscode.postMessage({
                                    command: 'applyAll'
                                });
                            });
                        </script>
                    </body>
                    </html>
                `.replace('function formatDiff(diff) {', `function formatDiff(diff) {
                    return diff
                        .replace(/^-.*$/gm, match => '<span class="diff-removed">' + match + '</span>')
                        .replace(/^\\+.*$/gm, match => '<span class="diff-added">' + match + '</span>');
                `);
                
                // Store remediation suggestions in context
                context.workspaceState.update('remediationSuggestions', remediationSuggestions);
                
                // Handle webview messages
                panel.webview.onDidReceiveMessage(
                    async message => {
                        switch (message.command) {
                            case 'apply':
                                await remediator.applyRemediation(remediationSuggestions[message.suggestionIndex]);
                                vscode.window.showInformationMessage(`Applied fix for ${remediationSuggestions[message.suggestionIndex].testName}`);
                                return;
                                
                            case 'applyAndRun':
                                await remediator.applyRemediation(remediationSuggestions[message.suggestionIndex]);
                                vscode.commands.executeCommand(Commands.EXECUTE_TESTS);
                                return;
                                
                            case 'applyAll':
                                for (const suggestion of remediationSuggestions) {
                                    await remediator.applyRemediation(suggestion);
                                }
                                vscode.window.showInformationMessage(`Applied all ${remediationSuggestions.length} fixes`);
                                return;
                        }
                    },
                    undefined,
                    context.subscriptions
                );
                
                statusBar.showSuccess(`Generated ${remediationSuggestions.length} remediation suggestions`);
                
            } catch (error) {
                statusBar.showError(`Error suggesting remediation: ${(error as Error).message}`);
                vscode.window.showErrorMessage(`Failed to suggest remediation: ${(error as Error).message}`);
            }
        }
    );

    // Apply Remediation command
    const applyRemediationCommand = vscode.commands.registerCommand(
        Commands.APPLY_REMEDIATION,
        async () => {
            const statusBar = StatusBarManager.getInstance();
            
            try {
                statusBar.showBusy('Loading remediation suggestions...');
                
                // Get stored remediation suggestions (cast to array)
                const remediationSuggestions = context.workspaceState.get('remediationSuggestions') as any[];
                
                if (!remediationSuggestions || remediationSuggestions.length === 0) {
                    vscode.window.showWarningMessage('No remediation suggestions available. Generate suggestions first.');
                    statusBar.showInfo('No suggestions available');
                    return;
                }
                
                // Let user select which remediation to apply
                const remediationItems = remediationSuggestions.map((suggestion: any) => ({
                    label: suggestion.testName,
                    description: suggestion.filePath,
                    detail: suggestion.explanation.substring(0, 100) + '...',
                    picked: true,
                    suggestion: suggestion
                }));
                
                const selectedItems = await vscode.window.showQuickPick(
                    remediationItems,
                    {
                        canPickMany: true,
                        placeHolder: 'Select remediation suggestions to apply',
                        title: 'Select Remediation Suggestions'
                    }
                );
                
                if (!selectedItems || selectedItems.length === 0) {
                    statusBar.showInfo('No remediation selected');
                    return;
                }
                
                // Apply selected remediations
                statusBar.showBusy(`Applying ${selectedItems.length} remediations...`);
                
                const remediator = CodeRemediator.getInstance();
                
                for (const item of selectedItems) {
                    await remediator.applyRemediation(item.suggestion);
                }
                
                statusBar.showSuccess(`Applied ${selectedItems.length} remediations`);
                vscode.window.showInformationMessage(`Successfully applied ${selectedItems.length} remediations`);
                
                // Ask if user wants to run tests again
                const runTests = await vscode.window.showInformationMessage(
                    'Would you like to run tests to verify the fixes?',
                    'Yes', 'No'
                );
                
                if (runTests === 'Yes') {
                    vscode.commands.executeCommand(Commands.EXECUTE_TESTS);
                }
                
            } catch (error) {
                statusBar.showError(`Error applying remediation: ${(error as Error).message}`);
                vscode.window.showErrorMessage(`Failed to apply remediation: ${(error as Error).message}`);
            }
        }
    );

    // Toggle Plan/Act Mode command
    const togglePlanActModeCommand = vscode.commands.registerCommand(
        Commands.TOGGLE_PLAN_ACT_MODE,
        async () => {
            const statusBar = StatusBarManager.getInstance();
            
            try {
                // Toggle the mode
                statusBar.toggleMode();
                
                // Get the current mode after toggling
                const isPlanMode = statusBar.isPlanningMode();
                
                // Update AI controller with the new mode
                const aiController = AIController.getInstance();
                await aiController.setPlanningMode(isPlanMode);
                
                // Show notification
                vscode.window.showInformationMessage(
                    `TestAutomationAgent: Switched to ${isPlanMode ? 'Plan' : 'Act'} Mode`
                );
            } catch (error) {
                vscode.window.showErrorMessage(`Error toggling mode: ${(error as Error).message}`);
            }
        }
    );

    // Create File command
    const createFileCommand = vscode.commands.registerCommand(
        Commands.CREATE_FILE,
        async () => {
            const statusBar = StatusBarManager.getInstance();
            
            try {
                statusBar.showBusy('Preparing to create file...');
                
                // Ask for file path and name
                const fileName = await vscode.window.showInputBox({
                    prompt: 'Enter file name with extension',
                    placeHolder: 'example.js',
                    validateInput: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'File name is required';
                        }
                        return null;
                    }
                });
                
                if (!fileName) {
                    statusBar.showInfo('Operation cancelled');
                    return;
                }
                
                // Ask for directory
                const folderUri = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: 'Select Directory',
                    title: 'Select directory to create file'
                });
                
                if (!folderUri || folderUri.length === 0) {
                    statusBar.showInfo('Operation cancelled');
                    return;
                }
                
                const directoryPath = folderUri[0].fsPath;
                const fullPath = path.join(directoryPath, fileName);
                
                // Check if file already exists
                if (fs.existsSync(fullPath)) {
                    const overwrite = await vscode.window.showWarningMessage(
                        `File ${fileName} already exists. Overwrite?`,
                        'Yes', 'No'
                    );
                    
                    if (overwrite !== 'Yes') {
                        statusBar.showInfo('Operation cancelled');
                        return;
                    }
                }
                
                // Create file
                statusBar.showBusy(`Creating file ${fileName}...`);
                
                // Use file manager to create the file
                const fileManager = FileManager.getInstance();
                const content = await getInitialContent(fileName);
                await fileManager.writeFile(fullPath, content);
                
                // Open the file in the editor
                const document = await vscode.workspace.openTextDocument(fullPath);
                await vscode.window.showTextDocument(document);
                
                statusBar.showSuccess(`File ${fileName} created successfully`);
                vscode.window.showInformationMessage(`File ${fileName} created successfully`);
                
            } catch (error) {
                statusBar.showError(`Error creating file: ${(error as Error).message}`);
                vscode.window.showErrorMessage(`Failed to create file: ${(error as Error).message}`);
            }
        }
    );
    
    // Helper function to generate initial content based on file extension
    async function getInitialContent(fileName: string): Promise<string> {
        const extension = path.extname(fileName).toLowerCase();
        
        switch (extension) {
            case '.js':
                return '// JavaScript file\n\n';
                
            case '.ts':
                return '// TypeScript file\n\n';
                
            case '.java':
                const className = path.basename(fileName, '.java');
                return `
public class ${className} {
    public static void main(String[] args) {
        // TODO: Implement
    }
}`;
                
            case '.feature':
                return `Feature: 

Background:
  * url baseUrl
  
Scenario: 
  Given 
  When 
  Then 
`;
                
            case '.html':
                return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
</head>
<body>
    
</body>
</html>`;
                
            case '.css':
                return `/* CSS Styles */\n\n`;
                
            case '.json':
                return `{\n  \n}`;
                
            case '.md':
                return `# ${path.basename(fileName, '.md')}\n\n`;
                
            default:
                return '';
        }
    }

    // Execute Command command
    const executeCommandCommand = vscode.commands.registerCommand(
        Commands.EXECUTE_COMMAND,
        async () => {
            const statusBar = StatusBarManager.getInstance();
            
            try {
                statusBar.showBusy('Preparing to execute command...');
                
                // Ask for command
                const command = await vscode.window.showInputBox({
                    prompt: 'Enter command to execute',
                    placeHolder: 'npm install, mvn test, etc.',
                    validateInput: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'Command is required';
                        }
                        return null;
                    }
                });
                
                if (!command) {
                    statusBar.showInfo('Operation cancelled');
                    return;
                }
                
                // Check if command is potentially harmful
                const commandExecutor = CommandExecutor.getInstance();
                const isSafe = await commandExecutor.isSafeCommand(command);
                
                if (!isSafe) {
                    const confirmExecution = await vscode.window.showWarningMessage(
                        `The command "${command}" might be potentially harmful. Do you want to continue?`,
                        'Yes', 'No'
                    );
                    
                    if (confirmExecution !== 'Yes') {
                        statusBar.showInfo('Command execution cancelled');
                        return;
                    }
                }
                
                // Ask for working directory (optional)
                const selectWorkingDir = await vscode.window.showQuickPick(
                    ['Current directory', 'Select different directory'],
                    { placeHolder: 'Select working directory' }
                );
                
                let workingDir = process.cwd();
                
                if (selectWorkingDir === 'Select different directory') {
                    const folderUri = await vscode.window.showOpenDialog({
                        canSelectFiles: false,
                        canSelectFolders: true,
                        canSelectMany: false,
                        openLabel: 'Select Directory',
                        title: 'Select working directory'
                    });
                    
                    if (!folderUri || folderUri.length === 0) {
                        statusBar.showInfo('Operation cancelled');
                        return;
                    }
                    
                    workingDir = folderUri[0].fsPath;
                }
                
                // Execute command
                statusBar.showBusy(`Executing: ${command}`);
                
                // Create terminal
                const terminal = vscode.window.createTerminal('TestAutomationAgent Command');
                terminal.show();
                
                // If working directory is different from current directory, we need to cd into it first
                if (workingDir !== process.cwd()) {
                    terminal.sendText(`cd "${workingDir}" && ${command}`);
                } else {
                    terminal.sendText(command);
                }
                
                // We don't await for terminal command to complete as it might be long-running
                // Instead, let the user see the output and interact with it directly
                
                statusBar.showSuccess(`Command executed: ${command}`);
                
                // Monitor output analyzer to capture results (if applicable)
                const outputAnalyzer = commandExecutor.getOutputAnalyzer();
                if (outputAnalyzer) {
                    // Register listener for terminal close event to analyze output
                    // This is simplified; in a real implementation more robust terminal output capturing would be used
                    const disposable = vscode.window.onDidCloseTerminal(closedTerminal => {
                        if (closedTerminal === terminal) {
                            outputAnalyzer.analyzeOutput(command, ''); // Output would be captured
                            disposable.dispose();
                        }
                    });
                    
                    context.subscriptions.push(disposable);
                }
                
            } catch (error) {
                statusBar.showError(`Error executing command: ${(error as Error).message}`);
                vscode.window.showErrorMessage(`Failed to execute command: ${(error as Error).message}`);
            }
        }
    );

    // Add all command disposables to the context subscriptions
    context.subscriptions.push(
        importRequirementsCommand,
        generateScenariosCommand,
        generateTestCasesCommand,
        executeTestsCommand,
        analyzeCoverageCommand,
        suggestRemediationCommand,
        applyRemediationCommand,
        togglePlanActModeCommand,
        createFileCommand,
        executeCommandCommand
    );
}
