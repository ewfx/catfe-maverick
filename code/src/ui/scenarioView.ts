import * as vscode from 'vscode';
import { WebviewProvider } from './webviewProvider';
import { ScenarioGenerator } from '../testGeneration/scenario/scenarioGenerator';
import { Commands } from '../core/commands';
import { StatusBarManager } from '../core/statusBar';
import { PDFProcessor } from '../testGeneration/scenario/pdfProcessor';
import { TextProcessor } from '../testGeneration/scenario/textProcessor';

/**
 * WebView provider for the Test Scenario Generation UI
 */
export class ScenarioView extends WebviewProvider {
    private scenarioGenerator: ScenarioGenerator;
    private pdfProcessor: PDFProcessor;
    private textProcessor: TextProcessor;
    private statusBarManager: StatusBarManager;

    constructor(context: vscode.ExtensionContext) {
        super('testautomationagent.scenarioView', context);
        this.scenarioGenerator = ScenarioGenerator.getInstance();
        this.pdfProcessor = PDFProcessor.getInstance();
        this.textProcessor = TextProcessor.getInstance();
        // Use the existing status bar instance without creating a new one
        this.statusBarManager = StatusBarManager.getInstance();
    }

    /**
     * Gets the title of the webview
     * @returns The webview title
     */
    protected getTitle(): string {
        return 'Test Scenario Generation';
    }

    /**
     * Gets the HTML body content
     * @returns The HTML body content
     */
    protected getBodyHtml(): string {
        return `
        <div class="container">
            <h1>Test Scenario Generation</h1>
            
            <div class="panel">
                <h2>Import Requirements</h2>
                <div class="import-options">
                    <button id="upload-pdf-btn" class="btn primary">
                        <i class="codicon codicon-file-pdf"></i> Upload PDF
                    </button>
                    <span class="or">OR</span>
                    <button id="paste-jira-btn" class="btn secondary">
                        <i class="codicon codicon-clipboard"></i> Paste JIRA Criteria
                    </button>
                </div>
                
                <div id="pdf-preview" class="hidden">
                    <h3>PDF Content Preview</h3>
                    <div id="pdf-content" class="content-preview"></div>
                    <div class="action-bar">
                        <button id="clear-pdf-btn" class="btn secondary">
                            <i class="codicon codicon-clear-all"></i> Clear
                        </button>
                    </div>
                </div>
                
                <div id="text-input" class="text-input-container">
                    <h3>Requirements Text</h3>
                    <textarea id="requirements-text" placeholder="Paste your requirements or JIRA acceptance criteria here..."></textarea>
                </div>
                
                <div class="action-bar">
                    <button id="generate-btn" class="btn primary">
                        <i class="codicon codicon-play"></i> Generate Scenarios
                    </button>
                </div>
            </div>
            
            <div class="panel">
                <h2>Generated Test Scenarios</h2>
                <div id="loading-scenarios" class="loading hidden">
                    <i class="codicon codicon-loading spin"></i> Generating test scenarios...
                </div>
                
                <div id="scenarios-list" class="scenarios-container">
                    <div id="no-scenarios" class="message-box">
                        <i class="codicon codicon-info"></i>
                        <p>No test scenarios generated yet. Import requirements and click "Generate Scenarios" to start.</p>
                    </div>
                </div>
                
                <div class="action-bar hidden" id="scenario-actions">
                    <button id="save-scenarios-btn" class="btn primary">
                        <i class="codicon codicon-save"></i> Save Scenarios
                    </button>
                    <button id="create-tests-btn" class="btn primary">
                        <i class="codicon codicon-beaker"></i> Create Test Cases
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
            // Get state from VSCode
            const vscode = acquireVsCodeApi();
            
            // UI Elements
            const uploadPdfBtn = document.getElementById('upload-pdf-btn');
            const pasteJiraBtn = document.getElementById('paste-jira-btn');
            const clearPdfBtn = document.getElementById('clear-pdf-btn');
            const pdfPreview = document.getElementById('pdf-preview');
            const pdfContent = document.getElementById('pdf-content');
            const textInput = document.getElementById('requirements-text');
            const generateBtn = document.getElementById('generate-btn');
            const loadingScenarios = document.getElementById('loading-scenarios');
            const scenariosList = document.getElementById('scenarios-list');
            const noScenarios = document.getElementById('no-scenarios');
            const scenarioActions = document.getElementById('scenario-actions');
            const saveScenariosBtn = document.getElementById('save-scenarios-btn');
            const createTestsBtn = document.getElementById('create-tests-btn');
            
            // Event Listeners
            uploadPdfBtn.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'uploadPdf'
                });
            });
            
            pasteJiraBtn.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'pasteFromClipboard'
                });
            });
            
            clearPdfBtn.addEventListener('click', () => {
                pdfPreview.classList.add('hidden');
                pdfContent.innerHTML = '';
                vscode.postMessage({
                    command: 'clearPdf'
                });
            });
            
            generateBtn.addEventListener('click', () => {
                const requirements = textInput.value.trim();
                if (requirements) {
                    loadingScenarios.classList.remove('hidden');
                    noScenarios.classList.add('hidden');
                    
                    vscode.postMessage({
                        command: 'generateScenarios',
                        requirements
                    });
                } else {
                    vscode.postMessage({
                        command: 'showError',
                        message: 'Please enter requirements or upload a PDF'
                    });
                }
            });
            
            saveScenariosBtn.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'saveScenarios'
                });
            });
            
            createTestsBtn.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'createTestCases'
                });
            });
            
            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch(message.command) {
                    case 'pdfContent':
                        textInput.value = message.content;
                        pdfContent.textContent = message.content;
                        pdfPreview.classList.remove('hidden');
                        break;
                        
                    case 'clipboardContent':
                        textInput.value = message.content;
                        break;
                        
                    case 'scenarios':
                        displayScenarios(message.scenarios);
                        loadingScenarios.classList.add('hidden');
                        scenarioActions.classList.remove('hidden');
                        break;
                        
                    case 'error':
                        loadingScenarios.classList.add('hidden');
                        // Show error message
                        break;
                }
            });
            
            // Display scenarios in the UI
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
                    checkbox.id = \`scenario-\${index}\`;
                    checkbox.checked = true;
                    checkbox.setAttribute('data-id', scenario.id);
                    
                    const title = document.createElement('h3');
                    title.textContent = scenario.title;
                    
                    const toggle = document.createElement('button');
                    toggle.className = 'toggle-btn';
                    toggle.innerHTML = '<i class="codicon codicon-chevron-down"></i>';
                    toggle.addEventListener('click', () => {
                        scenarioEl.classList.toggle('expanded');
                        toggle.innerHTML = scenarioEl.classList.contains('expanded') 
                            ? '<i class="codicon codicon-chevron-up"></i>' 
                            : '<i class="codicon codicon-chevron-down"></i>';
                    });
                    
                    header.appendChild(checkbox);
                    header.appendChild(title);
                    header.appendChild(toggle);
                    
                    const content = document.createElement('div');
                    content.className = 'scenario-content';
                    
                    // Description
                    const description = document.createElement('div');
                    description.className = 'scenario-description';
                    description.textContent = scenario.description;
                    content.appendChild(description);
                    
                    // Steps
                    if (scenario.steps && scenario.steps.length > 0) {
                        const stepsTitle = document.createElement('h4');
                        stepsTitle.textContent = 'Steps:';
                        content.appendChild(stepsTitle);
                        
                        const stepsList = document.createElement('ol');
                        stepsList.className = 'steps-list';
                        
                        scenario.steps.forEach(step => {
                            const stepItem = document.createElement('li');
                            stepItem.textContent = step;
                            stepsList.appendChild(stepItem);
                        });
                        
                        content.appendChild(stepsList);
                    }
                    
                    // Expected Results
                    if (scenario.expectedResults && scenario.expectedResults.length > 0) {
                        const resultsTitle = document.createElement('h4');
                        resultsTitle.textContent = 'Expected Results:';
                        content.appendChild(resultsTitle);
                        
                        const resultsList = document.createElement('ul');
                        resultsList.className = 'results-list';
                        
                        scenario.expectedResults.forEach(result => {
                            const resultItem = document.createElement('li');
                            resultItem.textContent = result;
                            resultsList.appendChild(resultItem);
                        });
                        
                        content.appendChild(resultsList);
                    }
                    
                    scenarioEl.appendChild(header);
                    scenarioEl.appendChild(content);
                    scenariosList.appendChild(scenarioEl);
                });
            }
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
                    case 'uploadPdf':
                        await this.uploadPdf();
                        break;
                        
                    case 'pasteFromClipboard':
                        await this.pasteFromClipboard();
                        break;
                        
                    case 'clearPdf':
                        // Clear any stored PDF content
                        break;
                        
                    case 'generateScenarios':
                        await this.generateScenarios(message.requirements);
                        break;
                        
                    case 'saveScenarios':
                        await this.saveScenarios();
                        break;
                        
                    case 'createTestCases':
                        await this.createTestCases();
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
     * Handles uploading a PDF file
     */
    private async uploadPdf(): Promise<void> {
        try {
            // Show file picker dialog
            const uris = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'PDF Files': ['pdf']
                },
                title: 'Select PDF Requirements File'
            });
            
            if (uris && uris.length > 0) {
                this.statusBarManager.showBusy('Processing PDF...');
                
                // Process the PDF
                const pdfPath = uris[0].fsPath;
                const content = await this.pdfProcessor.extractTextFromPDF(pdfPath);
                
                // Send content to webview
                this.sendMessage({
                    command: 'pdfContent',
                    content
                });
                
                this.statusBarManager.showSuccess('PDF processed successfully');
            }
        } catch (error) {
            this.statusBarManager.showError(`Error processing PDF: ${(error as Error).message}`);
            
            this.sendMessage({
                command: 'error',
                message: `Error processing PDF: ${(error as Error).message}`
            });
        }
    }

    /**
     * Handles pasting content from clipboard
     */
    private async pasteFromClipboard(): Promise<void> {
        try {
            // Get clipboard content
            const clipboardContent = await vscode.env.clipboard.readText();
            
            // Send content to webview
            this.sendMessage({
                command: 'clipboardContent',
                content: clipboardContent
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error reading clipboard: ${(error as Error).message}`);
        }
    }

    /**
     * Handles generating scenarios from requirements
     * @param requirements The requirements text
     */
    private async generateScenarios(requirements: string): Promise<void> {
        try {
            this.statusBarManager.showBusy('Generating test scenarios...');
            
            // Process the requirements text
            const processedRequirements = this.textProcessor.processTextContent({
                text: requirements,
                source: 'user-input'
            });
            
            // Generate scenarios
            const scenarios = await this.scenarioGenerator.generateFromText(requirements);
            
            // Send scenarios to webview
            this.sendMessage({
                command: 'scenarios',
                scenarios
            });
            
            this.statusBarManager.showSuccess('Test scenarios generated successfully');
        } catch (error) {
            this.statusBarManager.showError(`Error generating scenarios: ${(error as Error).message}`);
            
            this.sendMessage({
                command: 'error',
                message: `Error generating scenarios: ${(error as Error).message}`
            });
        }
    }

    /**
     * Handles saving scenarios
     */
    private async saveScenarios(): Promise<void> {
        try {
            await vscode.commands.executeCommand(Commands.GENERATE_SCENARIOS);
        } catch (error) {
            vscode.window.showErrorMessage(`Error saving scenarios: ${(error as Error).message}`);
        }
    }

    /**
     * Handles creating test cases from scenarios
     */
    private async createTestCases(): Promise<void> {
        try {
            await vscode.commands.executeCommand(Commands.GENERATE_TEST_CASES);
        } catch (error) {
            vscode.window.showErrorMessage(`Error creating test cases: ${(error as Error).message}`);
        }
    }
}
