import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { CoverageView } from '../../../ui/coverageView';
import { createMockExtensionContext, createMockCoverageAnalyzer, createMockXmlParser, 
         createMockResultCollector, createMockScenarioGenerator, createMockAIController,
         createMockStatusBarManager, createMockFileManager, areObjectsSimilar } from '../../testUtils';
import { CoverageType } from '../../../coverage/analyzer';
         
// Use a simple describe and it syntax
suite('CoverageView Tests', () => {
    let coverageView: CoverageView;
    let mockContext: any;
    let mockWebview: any;
    
    setup(() => {
        // Create mocks
        mockContext = createMockExtensionContext();
        
        // Create dependencies via mocks
        createMockCoverageAnalyzer();
        createMockXmlParser();
        createMockResultCollector();
        createMockScenarioGenerator();
        createMockAIController();
        createMockStatusBarManager();
        createMockFileManager();
        
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
    
    test('getTitle should return the correct title', () => {
        const title = (coverageView as any).getTitle();
        assert.strictEqual(title, 'Coverage Analysis');
    });
    
    test('getBodyHtml should generate HTML content', () => {
        const html = (coverageView as any).getBodyHtml();
        assert.ok(html.includes('Coverage Analysis'));
        assert.ok(html.includes('Coverage Metrics'));
        assert.ok(html.includes('Coverage Gaps'));
        assert.ok(html.includes('Suggested Test Scenarios'));
    });
    
    test('getInlineScript should generate script content', () => {
        const script = (coverageView as any).getInlineScript();
        assert.ok(script.includes('function displayCoverageResults'));
        assert.ok(script.includes('function displayCoverageGaps'));
        assert.ok(script.includes('function displaySuggestions'));
    });
    
    test('sendMessage should call webview.postMessage', () => {
        (coverageView as any).sendMessage({ command: 'test' });
        assert.strictEqual(mockWebview.postMessage.calledOnce, true);
        assert.deepStrictEqual(mockWebview.postMessage.firstCall.args[0], { command: 'test' });
    });
    
    test('parseScenarioSuggestions should handle valid JSON response', () => {
        const testResponse = `\`\`\`json
{
  "id": "TS-002",
  "title": "Test Scenario",
  "description": "A description",
  "priority": "High",
  "steps": ["Step 1", "Step 2"],
  "expectedResults": ["Result 1"]
}
\`\`\``;
        
        const result = (coverageView as any).parseScenarioSuggestions(testResponse);
        
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].title, "Test Scenario");
        assert.strictEqual(result[0].priority, "High");
        assert.strictEqual(result[0].steps.length, 2);
        assert.strictEqual(result[0].expectedResults.length, 1);
    });
    
    test('parseScenarioSuggestions should handle multiple scenarios', () => {
        const testResponse = `\`\`\`json
{
  "id": "TS-001",
  "title": "First Scenario",
  "description": "First description",
  "priority": "High",
  "steps": ["Step 1", "Step 2"],
  "expectedResults": ["Result 1"]
}
\`\`\`

\`\`\`json
{
  "id": "TS-002",
  "title": "Second Scenario",
  "description": "Second description",
  "priority": "Medium",
  "steps": ["Step 1", "Step 2", "Step 3"],
  "expectedResults": ["Result 1", "Result 2"]
}
\`\`\``;
        
        const result = (coverageView as any).parseScenarioSuggestions(testResponse);
        
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].title, "First Scenario");
        assert.strictEqual(result[1].title, "Second Scenario");
    });
    
    test('parseScenarioSuggestions should handle malformed response', () => {
        const testResponse = `This is not JSON at all`;
        
        const result = (coverageView as any).parseScenarioSuggestions(testResponse);
        
        assert.strictEqual(result.length, 0);
    });
    
    test('formatTestResults should handle empty results', () => {
        const result = (coverageView as any).formatTestResults([]);
        assert.strictEqual(result, 'No previous test results available.');
    });
    
    test('formatTestResults should format test results correctly', () => {
        const testResults = [
            { name: 'Test 1', status: 'passed', duration: 100 },
            { name: 'Test 2', status: 'failed', duration: 200 }
        ];
        
        const result = (coverageView as any).formatTestResults(testResults);
        
        assert.ok(result.includes('Test 1'));
        assert.ok(result.includes('passed'));
        assert.ok(result.includes('100ms'));
        assert.ok(result.includes('Test 2'));
        assert.ok(result.includes('failed'));
        assert.ok(result.includes('200ms'));
    });
    
    test('constructSuggestionPrompt should build prompt with gaps', () => {
        // Setup gaps for the test
        (coverageView as any).gaps = [
            {
                type: CoverageType.LINE,
                location: 'com.example.TestClass.testMethod',
                coverage: 0.6,
                suggestion: 'Improve test coverage'
            }
        ];
        
        const result = (coverageView as any).constructSuggestionPrompt();
        
        assert.ok(result.includes('Generate test scenario suggestions'));
        assert.ok(result.includes('LINE Coverage Gap: com.example.TestClass.testMethod (60%)'));
        assert.ok(result.includes('No previous test results available'));
    });
});
