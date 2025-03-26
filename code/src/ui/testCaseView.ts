import * as vscode from 'vscode';
import { WebviewProvider } from './webviewProvider';
import { TestCaseGenerator, TestCaseTemplate } from '../testGeneration/testCase/testCaseGenerator';
import { ScenarioGenerator } from '../testGeneration/scenario/scenarioGenerator';
import { KarateBDDGenerator } from '../testGeneration/testCase/karateBDD';
import { Commands } from '../core/commands';
import { StatusBarManager } from '../core/statusBar';
import { FileManager } from '../fileSystem/fileManager';

/**
 * WebView provider for the BDD Test Case Generation UI
 */
export class TestCaseView extends WebviewProvider {
    private testCaseGenerator: TestCaseGenerator;
    private scenarioGenerator: ScenarioGenerator;
    private karateBDD: KarateBDDGenerator;
    private statusBarManager: StatusBarManager;
    private fileManager: FileManager;

    constructor(context: vscode.ExtensionContext) {
        super('testautomationagent.testCaseView', context);
        this.testCaseGenerator = TestCaseGenerator.getInstance();
        this.scenarioGenerator = ScenarioGenerator.getInstance();
        this.karateBDD = KarateBDDGenerator.getInstance();
        // Use the existing status bar instance without creating a new one
        this.statusBarManager = StatusBarManager.getInstance();
        this.fileManager = FileManager.getInstance();
    }

    /**
     * Gets the title of the webview
     * @returns The webview title
     */
    protected getTitle(): string {
        return 'BDD Test Case Generation';
    }

    /**
     * Gets the HTML body content
     * @returns The HTML body content
     */
    protected getBodyHtml(): string {
        return `
        <div class="container">
            <h1>BDD Test Case Generation</h1>
            
            <div class="panel">
                <h2>Selected Scenarios</h2>
                <div id="scenarios-list" class="scenarios-container">
                    <div id="no-scenarios" class="message-box">
                        <i class="codicon codicon-info"></i>
                        <p>No test scenarios selected. Go to the Test Scenario Generation view to select scenarios.</p>
                    </div>
                </div>
                
                <div class="action-bar">
                    <button id="refresh-scenarios-btn" class="btn secondary">
                        <i class="codicon codicon-refresh"></i> Refresh Scenarios
                    </button>
                </div>
            </div>
            
            <div class="panel">
                <h2>Generated Karate BDD Test Cases</h2>
                <div id="loading-testcases" class="loading hidden">
                    <i class="codicon codicon-loading spin"></i> Generating test cases...
                </div>
                
                <div id="test-case-preview" class="test-case-preview">
                    <div id="no-testcases" class="message-box">
                        <i class="codicon codicon-info"></i>
                        <p>No test cases generated yet. Select scenarios and click "Generate Test Cases" to start.</p>
                    </div>
                </div>
                
                <div class="test-case-options">
                    <div class="option-group">
                        <label for="test-framework">Test Framework:</label>
                        <select id="test-framework" class="select-input">
                            <option value="karate" selected>Karate BDD</option>
                        </select>
                    </div>
                    
                    <div class="option-group">
                        <label for="data-driven">Data-Driven Tests:</label>
                        <input type="checkbox" id="data-driven" checked>
                    </div>
                </div>
                
                <div class="action-bar">
                    <button id="generate-testcases-btn" class="btn primary">
                        <i class="codicon codicon-play"></i> Generate Test Cases
                    </button>
                    <button id="save-testcases-btn" class="btn primary hidden">
                        <i class="codicon codicon-save"></i> Save Test Cases
                    </button>
                </div>
            </div>
            
            <div class="panel hidden" id="test-case-editor-panel">
                <h2>Edit Test Case</h2>
                <div id="test-case-editor" class="code-editor">
                    <textarea id="test-case-code"></textarea>
                </div>
                
                <div class="action-bar">
                    <button id="apply-changes-btn" class="btn primary">
                        <i class="codicon codicon-check"></i> Apply Changes
                    </button>
                    <button id="cancel-edit-btn" class="btn secondary">
                        <i class="codicon codicon-close"></i> Cancel
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
            
            // State
            let scenarios = [];
            let testCases = [];
            let currentEditingTestCase = null;
            
            // UI Elements
            const scenariosList = document.getElementById('scenarios-list');
            const noScenarios = document.getElementById('no-scenarios');
            const refreshScenariosBtn = document.getElementById('refresh-scenarios-btn');
            const testCasePreview = document.getElementById('test-case-preview');
            const noTestCases = document.getElementById('no-testcases');
            const loadingTestCases = document.getElementById('loading-testcases');
            const generateTestCasesBtn = document.getElementById('generate-testcases-btn');
            const saveTestCasesBtn = document.getElementById('save-testcases-btn');
            const testFrameworkSelect = document.getElementById('test-framework');
            const dataDrivenCheckbox = document.getElementById('data-driven');
            const testCaseEditorPanel = document.getElementById('test-case-editor-panel');
            const testCaseCode = document.getElementById('test-case-code');
            const applyChangesBtn = document.getElementById('apply-changes-btn');
            const cancelEditBtn = document.getElementById('cancel-edit-btn');
            
            // Event Listeners
            refreshScenariosBtn.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'refreshScenarios'
                });
            });
            
            generateTestCasesBtn.addEventListener('click', () => {
                const selectedScenarioIds = getSelectedScenarioIds();
                if (selectedScenarioIds.length === 0) {
                    vscode.postMessage({
                        command: 'showError',
                        message: 'Please select at least one scenario'
                    });
                    return;
                }
                
                loadingTestCases.classList.remove('hidden');
                noTestCases.classList.add('hidden');
                
                vscode.postMessage({
                    command: 'generateTestCases',
                    scenarioIds: selectedScenarioIds,
                    options: {
                        framework: testFrameworkSelect.value,
                        datadriven: dataDrivenCheckbox.checked
                    }
                });
            });
            
            saveTestCasesBtn.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'saveTestCases',
                    testCases
                });
            });
            
            applyChangesBtn.addEventListener('click', () => {
                if (currentEditingTestCase !== null) {
                    const updatedCode = testCaseCode.value;
                    
                    vscode.postMessage({
                        command: 'updateTestCase',
                        index: currentEditingTestCase,
                        code: updatedCode
                    });
                    
                    hideEditor();
                }
            });
            
            cancelEditBtn.addEventListener('click', () => {
                hideEditor();
            });
            
            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch(message.command) {
                    case 'scenarios':
                        scenarios = message.scenarios;
                        displayScenarios(scenarios);
                        break;
                        
                    case 'testCases':
                        testCases = message.testCases;
                        displayTestCases(testCases);
                        loadingTestCases.classList.add('hidden');
                        saveTestCasesBtn.classList.remove('hidden');
                        break;
                        
                    case 'updatedTestCase':
                        testCases[message.index] = message.testCase;
                        displayTestCases(testCases);
                        break;
                        
                    case 'error':
                        loadingTestCases.classList.add('hidden');
                        // Show error message
                        break;
                }
            });
            
            // Helper functions
            function getSelectedScenarioIds() {
                const checkboxes = document.querySelectorAll('.scenario-checkbox:checked');
                return Array.from(checkboxes).map(checkbox => checkbox.getAttribute('data-id'));
            }
            
            function displayScenarios(scenarios) {
                scenariosList.innerHTML = '';
                
                if (!scenarios || scenarios.length === 0) {
                    noScenarios.classList.remove('hidden');
                    return;
                }
                
                noScenarios.classList.add('hidden');
                
                scenarios.forEach((scenario, index) => {
                    const scenarioEl = document.createElement('div');
                    scenarioEl.className = 'scenario-item';
                    
                    const header = document.createElement('div');
                    header.className = 'scenario-header';
                    
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'scenario-checkbox';
                    checkbox.id = \`scenario-\${index}\`;
                    checkbox.checked = true;
                    checkbox.setAttribute('data-id', scenario.id);
                    
                    const title = document.createElement('label');
                    title.htmlFor = \`scenario-\${index}\`;
                    title.textContent = scenario.title;
                    
                    header.appendChild(checkbox);
                    header.appendChild(title);
                    
                    scenarioEl.appendChild(header);
                    scenariosList.appendChild(scenarioEl);
                });
            }
            
            function displayTestCases(testCases) {
                testCasePreview.innerHTML = '';
                
                if (!testCases || testCases.length === 0) {
                    noTestCases.classList.remove('hidden');
                    return;
                }
                
                noTestCases.classList.add('hidden');
                
                testCases.forEach((testCase, index) => {
                    const testCaseEl = document.createElement('div');
                    testCaseEl.className = 'test-case-item';
                    
                    const header = document.createElement('div');
                    header.className = 'test-case-header';
                    
                    const title = document.createElement('h3');
                    title.textContent = testCase.name || \`Test Case \${index + 1}\`;
                    
                    const edit = document.createElement('button');
                    edit.className = 'edit-btn';
                    edit.innerHTML = '<i class="codicon codicon-edit"></i>';
                    edit.addEventListener('click', () => {
                        showEditor(index, testCase.code);
                    });
                    
                    header.appendChild(title);
                    header.appendChild(edit);
                    
                    const content = document.createElement('pre');
                    content.className = 'test-case-code';
                    content.textContent = testCase.code;
                    
                    testCaseEl.appendChild(header);
                    testCaseEl.appendChild(content);
                    testCasePreview.appendChild(testCaseEl);
                });
            }
            
            function showEditor(index, code) {
                currentEditingTestCase = index;
                testCaseCode.value = code;
                testCaseEditorPanel.classList.remove('hidden');
                testCaseCode.focus();
            }
            
            function hideEditor() {
                currentEditingTestCase = null;
                testCaseEditorPanel.classList.add('hidden');
            }
            
            // Initialize by requesting scenarios
            vscode.postMessage({
                command: 'refreshScenarios'
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
                    case 'refreshScenarios':
                        await this.refreshScenarios();
                        break;
                        
                    case 'generateTestCases':
                        await this.generateTestCases(message.scenarioIds, message.options);
                        break;
                        
                    case 'saveTestCases':
                        await this.saveTestCases(message.testCases);
                        break;
                        
                    case 'updateTestCase':
                        await this.updateTestCase(message.index, message.code);
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
     * Refreshes the scenarios list
     */
    private async refreshScenarios(): Promise<void> {
        try {
            const scenarios = this.scenarioGenerator.getScenarios();
            
            this.sendMessage({
                command: 'scenarios',
                scenarios
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error refreshing scenarios: ${(error as Error).message}`);
            
            this.sendMessage({
                command: 'error',
                message: `Error refreshing scenarios: ${(error as Error).message}`
            });
        }
    }

    /**
     * Generates test cases for selected scenarios
     * @param scenarioIds IDs of selected scenarios
     * @param options Generation options
     */
    private async generateTestCases(scenarioIds: string[], options: any): Promise<void> {
        try {
            this.statusBarManager.showBusy('Generating test cases...');
            
            // Get all scenarios
            const allScenarios = this.scenarioGenerator.getScenarios();
            
            // Filter selected scenarios
            const selectedScenarios = allScenarios.filter(scenario => scenarioIds.includes(scenario.id));
            
            // Generate test cases
            // Convert options to proper template type
            const template = options.framework === 'karate' ? 
                             TestCaseTemplate.KARATE_BDD : 
                             TestCaseTemplate.CUSTOM;
                             
            const testCases = await this.testCaseGenerator.generateTestCases(selectedScenarios, template);
            
            // Send test cases to webview
            this.sendMessage({
                command: 'testCases',
                testCases
            });
            
            this.statusBarManager.showSuccess('Test cases generated successfully');
        } catch (error) {
            this.statusBarManager.showError(`Error generating test cases: ${(error as Error).message}`);
            
            this.sendMessage({
                command: 'error',
                message: `Error generating test cases: ${(error as Error).message}`
            });
        }
    }

    /**
     * Saves test cases to files
     * @param testCases The test cases to save
     */
    private async saveTestCases(testCases: any[]): Promise<void> {
        try {
            this.statusBarManager.showBusy('Saving test cases...');
            
            // Execute the command to save test cases
            await vscode.commands.executeCommand(Commands.GENERATE_TEST_CASES);
            
            this.statusBarManager.showSuccess('Test cases saved successfully');
        } catch (error) {
            this.statusBarManager.showError(`Error saving test cases: ${(error as Error).message}`);
            
            this.sendMessage({
                command: 'error',
                message: `Error saving test cases: ${(error as Error).message}`
            });
        }
    }

    /**
     * Updates a test case
     * @param index The index of the test case
     * @param code The updated code
     */
    private async updateTestCase(index: number, code: string): Promise<void> {
        try {
            // Get current test cases
            const testCases = this.testCaseGenerator.getTestCases();
            
            // Check if index is valid
            if (index < 0 || index >= testCases.length) {
                throw new Error(`Invalid test case index: ${index}`);
            }
            
            // Create updated test case
            const testCase = testCases[index];
            const updatedTestCase = {
                ...testCase,
                content: code
            };
            
            // Update test cases array
            testCases[index] = updatedTestCase;
            
            // Send updated test case to webview
            this.sendMessage({
                command: 'updatedTestCase',
                index,
                testCase: {
                    name: `Test Case ${index + 1}`,
                    code: updatedTestCase.content
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error updating test case: ${(error as Error).message}`);
            
            this.sendMessage({
                command: 'error',
                message: `Error updating test case: ${(error as Error).message}`
            });
        }
    }
}
