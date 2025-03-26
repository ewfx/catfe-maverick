import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { CoverageView } from '../../ui/coverageView';
import { CoverageAnalyzer, CoverageType } from '../../coverage/analyzer';
import { XmlParser } from '../../coverage/xmlParser';
import { ResultCollector } from '../../testExecution/resultCollector';
import { ScenarioGenerator } from '../../testGeneration/scenario/scenarioGenerator';
import { AIController } from '../../ai/controller';
import { StatusBarManager } from '../../core/statusBar';
import { FileManager } from '../../fileSystem/fileManager';
import { createMockExtensionContext, createMockCoverageAnalyzer, createMockXmlParser, 
         createMockResultCollector, createMockScenarioGenerator, createMockAIController,
         createMockStatusBarManager, createMockFileManager } from '../testUtils';

// Integration tests focus on component interaction
suite('CoverageView Integration Tests', () => {
    let coverageView: CoverageView;
    let mockContext: any;
    let mockWebview: any;
    let mockAnalyzer: any;
    let mockXmlParser: any;
    let mockResultCollector: any;
    let mockScenarioGenerator: any;
    let mockAI: any;
    let mockStatusBar: any;
    let mockFileManager: any;
    
    setup(() => {
        // Create mocks
        mockContext = createMockExtensionContext();
        mockAnalyzer = createMockCoverageAnalyzer();
        mockXmlParser = createMockXmlParser();
        mockResultCollector = createMockResultCollector();
        mockScenarioGenerator = createMockScenarioGenerator();
        mockAI = createMockAIController();
        mockStatusBar = createMockStatusBarManager();
        mockFileManager = createMockFileManager();
        
        // Create the view instance
        coverageView = new CoverageView(mockContext);
        
        // Get access to the protected webview
        mockWebview = {
            html: '',
            postMessage: sinon.stub().resolves(true),
            onDidReceiveMessage: sinon.stub().returns({ dispose: sinon.stub() })
        };
        
        // Set the webview using any to bypass protection level
        (coverageView as any)._webview = mockWebview;
    });
    
    teardown(() => {
        sinon.restore();
    });
    
    test('analyzeCoverage should process reports and send metrics to webview', async () => {
        // Setup
        const allurePath = '/test/allure';
        const jacocoPath = '/test/jacoco.xml';
        
        // Set expectations
        mockFileManager.readFile.withArgs(jacocoPath).resolves('<xml>mock-content</xml>');
        
        // Execute
        await (coverageView as any).analyzeCoverage(allurePath, jacocoPath);
        
        // Verify
        assert.strictEqual(mockFileManager.readFile.calledWith(jacocoPath), true);
        assert.strictEqual(mockXmlParser.parseJacocoXml.calledOnce, true);
        assert.strictEqual(mockAnalyzer.getCoverageSummary.calledOnce, true);
        assert.strictEqual(mockAnalyzer.getCoverageGaps.calledOnce, true);
        assert.strictEqual(mockStatusBar.showBusy.calledOnce, true);
        assert.strictEqual(mockStatusBar.showSuccess.calledOnce, true);
        
        // Verify messages sent to webview
        const calls = mockWebview.postMessage.getCalls();
        assert.strictEqual(calls.length, 2);
        assert.strictEqual(calls[0].args[0].command, 'coverageResults');
        assert.strictEqual(calls[1].args[0].command, 'coverageGaps');
    });
    
    test('generateSuggestions should use AI to generate scenarios', async () => {
        // Setup gaps
        (coverageView as any).gaps = [
            {
                type: CoverageType.LINE,
                location: 'com.example.TestClass.testMethod',
                coverage: 0.6,
                suggestion: 'Improve test coverage'
            }
        ];
        
        // Execute
        await (coverageView as any).generateSuggestions();
        
        // Verify
        assert.strictEqual(mockAI.sendPrompt.calledOnce, true);
        assert.strictEqual(mockWebview.postMessage.calledOnce, true);
        assert.strictEqual(mockWebview.postMessage.firstCall.args[0].command, 'suggestions');
        assert.ok(mockWebview.postMessage.firstCall.args[0].suggestions.length > 0);
    });
    
    test('generateTestCases should store scenarios and navigate to test case generator', async () => {
        // Setup
        (coverageView as any).suggestedScenarios = [
            {
                id: 'TS-001',
                title: 'Test Scenario 1',
                description: 'Description 1',
                priority: 'High',
                sourceRequirements: ['Coverage-Gap'],
                steps: ['Step 1'],
                expectedResults: ['Result 1']
            },
            {
                id: 'TS-002',
                title: 'Test Scenario 2',
                description: 'Description 2',
                priority: 'Medium',
                sourceRequirements: ['Coverage-Gap'],
                steps: ['Step 1'],
                expectedResults: ['Result 1']
            }
        ];
        
        // Mock command execution
        const commandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
        
        // Execute with one scenario selected
        await (coverageView as any).generateTestCases(['TS-001']);
        
        // Verify
        assert.strictEqual(mockScenarioGenerator.clearScenarios.calledOnce, true);
        assert.strictEqual(mockScenarioGenerator.generateFromText.called, true);
        assert.strictEqual(commandStub.calledOnce, true);
        assert.strictEqual(commandStub.firstCall.args[0], 'testautomationagent.generateTestCases');
    });
    
    test('analyzeCoverage should handle errors properly', async () => {
        // Setup
        const error = new Error('File not found');
        mockFileManager.readFile.rejects(error);
        
        // Execute
        await (coverageView as any).analyzeCoverage('', '/file/not/found.xml');
        
        // Verify
        assert.strictEqual(mockStatusBar.showBusy.calledOnce, true);
        assert.strictEqual(mockStatusBar.showError.calledOnce, true);
        assert.strictEqual(mockWebview.postMessage.calledOnce, true);
        assert.strictEqual(mockWebview.postMessage.firstCall.args[0].command, 'error');
    });
    
    test('browseAllurePath should update webview on selection', async () => {
        // Mock showOpenDialog
        sinon.stub(vscode.window, 'showOpenDialog').resolves([vscode.Uri.file('/selected/path')]);
        
        // Execute
        await (coverageView as any).browseAllurePath();
        
        // Verify
        assert.strictEqual(mockWebview.postMessage.calledOnce, true);
        assert.strictEqual(mockWebview.postMessage.firstCall.args[0].command, 'setAllurePath');
        assert.strictEqual(mockWebview.postMessage.firstCall.args[0].path, '/selected/path');
    });
    
    test('setupMessageHandling should register handlers for webview messages', () => {
        // Setup
        const webviewWithHandlers = {
            onDidReceiveMessage: sinon.stub().callsFake(callback => {
                // Store the callback
                (webviewWithHandlers as any).messageCallback = callback;
                return { dispose: sinon.stub() };
            })
        };
        
        // Execute
        (coverageView as any).setupMessageHandling(webviewWithHandlers);
        
        // Verify handler was registered
        assert.strictEqual(webviewWithHandlers.onDidReceiveMessage.calledOnce, true);
        
        // Test the handler with a message
        const spiedAnalyzeCoverage = sinon.spy(coverageView as any, 'analyzeCoverage');
        (webviewWithHandlers as any).messageCallback({ 
            command: 'analyzeCoverage',
            allurePath: '/test/allure',
            jacocoPath: '/test/jacoco.xml'
        });
        
        // Verify handler called the appropriate method
        assert.strictEqual(spiedAnalyzeCoverage.calledOnce, true);
        assert.strictEqual(spiedAnalyzeCoverage.firstCall.args[0], '/test/allure');
        assert.strictEqual(spiedAnalyzeCoverage.firstCall.args[1], '/test/jacoco.xml');
    });
});
