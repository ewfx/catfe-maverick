import * as assert from 'assert';
import * as sinon from 'sinon';
import { CoverageAnalyzer, CoverageType, CoverageData, CoverageGap } from '../../../coverage/analyzer';
import { FileManager } from '../../../fileSystem/fileManager';
import { StatusBarManager } from '../../../core/statusBar';
import { CommandExecutor } from '../../../terminal/commandExecutor';
import { ResultCollector } from '../../../testExecution/resultCollector';
import { XmlParser } from '../../../coverage/xmlParser';

suite('CoverageAnalyzer Tests', () => {
    let analyzer: CoverageAnalyzer;
    let mockFileManager: any;
    let mockStatusBar: any;
    let mockCommandExecutor: any;
    let mockResultCollector: any;
    let mockXmlParser: any;
    
    setup(() => {
        // Reset singleton instance for each test
        (CoverageAnalyzer as any).instance = undefined;
        
        // Create stub instances
        mockFileManager = {
            readFile: sinon.stub().resolves('<mock-file-content>'),
            writeFile: sinon.stub().resolves(),
            fileExists: sinon.stub().resolves(true),
            directoryExists: sinon.stub().resolves(true),
            createDirectory: sinon.stub().resolves()
        };
        
        // Stub FileManager.getInstance to return our mock
        sinon.stub(FileManager, 'getInstance').returns(mockFileManager);
        
        mockStatusBar = {
            showBusy: sinon.stub(),
            showSuccess: sinon.stub(),
            showError: sinon.stub()
        };
        
        // Stub StatusBarManager.getInstance to return our mock
        sinon.stub(StatusBarManager, 'getInstance').returns(mockStatusBar);
        
        mockCommandExecutor = {
            executeCommand: sinon.stub().resolves({ stdout: 'mock output', exitCode: 0 })
        };
        
        // Stub CommandExecutor.getInstance to return our mock
        sinon.stub(CommandExecutor, 'getInstance').returns(mockCommandExecutor);
        
        mockResultCollector = {
            getAllureReportPath: sinon.stub().returns('/path/to/allure'),
            getJacocoReportPath: sinon.stub().returns('/path/to/jacoco'),
            getResults: sinon.stub().returns([])
        };
        
        // Stub ResultCollector.getInstance to return our mock
        sinon.stub(ResultCollector, 'getInstance').returns(mockResultCollector);
        
        mockXmlParser = {
            parseJacocoXml: sinon.stub().resolves({
                name: 'JaCoCo Coverage Report',
                sessionInfo: {
                    id: 'mock-session',
                    start: Date.now() - 3600000,
                    dump: Date.now()
                },
                packages: [
                    {
                        name: 'com.example',
                        classes: [
                            {
                                name: 'TestClass',
                                sourcefilename: 'TestClass.java',
                                methods: [
                                    {
                                        name: 'testMethod',
                                        desc: 'Test method',
                                        line: 10,
                                        counters: [
                                            { type: 'LINE', missed: 2, covered: 8 },
                                            { type: 'BRANCH', missed: 1, covered: 3 }
                                        ]
                                    }
                                ],
                                counters: [
                                    { type: 'LINE', missed: 10, covered: 40 },
                                    { type: 'BRANCH', missed: 5, covered: 15 },
                                    { type: 'METHOD', missed: 1, covered: 5 },
                                    { type: 'CLASS', missed: 0, covered: 1 }
                                ]
                            }
                        ]
                    }
                ]
            })
        };
        
        // Create a new instance for testing
        analyzer = CoverageAnalyzer.getInstance();
        
        // Access the private XmlParser to set our mock
        (analyzer as any).xmlParser = mockXmlParser;
    });
    
    teardown(() => {
        sinon.restore();
    });
    
    test('getInstance should return the same instance', () => {
        const instance1 = CoverageAnalyzer.getInstance();
        const instance2 = CoverageAnalyzer.getInstance();
        assert.strictEqual(instance1, instance2);
    });
    
    test('setThresholds and getThresholds should work correctly', () => {
        const thresholds = new Map<CoverageType, number>([
            [CoverageType.LINE, 90],
            [CoverageType.BRANCH, 80],
            [CoverageType.METHOD, 100],
            [CoverageType.CLASS, 100]
        ]);
        
        analyzer.setThresholds(thresholds);
        const result = analyzer.getThresholds();
        
        assert.strictEqual(result.get(CoverageType.LINE), 90);
        assert.strictEqual(result.get(CoverageType.BRANCH), 80);
        assert.strictEqual(result.get(CoverageType.METHOD), 100);
        assert.strictEqual(result.get(CoverageType.CLASS), 100);
    });
    
    test('analyzeJacocoReport should process XML reports correctly', async () => {
        // Setup
        const reportPath = '/path/to/jacoco';
        const jacocoXml = `${reportPath}/jacoco.xml`;
        
        mockFileManager.readFile.withArgs(jacocoXml).resolves('<xml>mock-jacoco-report</xml>');
        
        // Execute
        await analyzer.analyzeJacocoReport(reportPath);
        
        // Verify
        assert.strictEqual(mockFileManager.fileExists.calledWith(jacocoXml), true);
        assert.strictEqual(mockFileManager.readFile.calledWith(jacocoXml), true);
        assert.strictEqual(mockXmlParser.parseJacocoXml.calledOnce, true);
        assert.strictEqual(mockStatusBar.showBusy.calledOnce, true);
        assert.strictEqual(mockStatusBar.showSuccess.calledOnce, true);
    });
    
    test('analyzeJacocoReport should handle missing files', async () => {
        // Setup
        const reportPath = '/path/to/jacoco';
        const jacocoXml = `${reportPath}/jacoco.xml`;
        
        mockFileManager.fileExists.withArgs(jacocoXml).resolves(false);
        
        // Execute and verify
        try {
            await analyzer.analyzeJacocoReport(reportPath);
            assert.fail('Expected error was not thrown');
        } catch (error) {
            assert.strictEqual(mockStatusBar.showBusy.calledOnce, true);
            assert.strictEqual(mockStatusBar.showError.calledOnce, true);
        }
    });
    
    test('getCoverageSummary should calculate metrics correctly', async () => {
        // Setup - preload with test data
        await analyzer.analyzeJacocoReport('/path/to/jacoco');
        
        // Execute
        const summary = analyzer.getCoverageSummary();
        
        // Verify
        assert.ok(summary instanceof Map);
        assert.strictEqual(summary.has(CoverageType.LINE), true);
        assert.strictEqual(summary.has(CoverageType.BRANCH), true);
        assert.strictEqual(summary.has(CoverageType.METHOD), true);
        assert.strictEqual(summary.has(CoverageType.CLASS), true);
        
        // Verify correct calculation
        const lineData = summary.get(CoverageType.LINE)!;
        assert.strictEqual(lineData.covered, 40);
        assert.strictEqual(lineData.missed, 10);
        assert.strictEqual(lineData.total, 50);
        assert.strictEqual(lineData.percentage, 80);
    });
    
    test('getCoverageGaps should identify gaps based on thresholds', async () => {
        // Setup - preload with test data and set thresholds
        await analyzer.analyzeJacocoReport('/path/to/jacoco');
        
        // Set thresholds that will create gaps (branch threshold = 85)
        analyzer.setThresholds(new Map([
            [CoverageType.BRANCH, 85],
            [CoverageType.LINE, 70],
            [CoverageType.METHOD, 70],
            [CoverageType.CLASS, 70]
        ]));
        
        // Execute
        const gaps = analyzer.getCoverageGaps();
        
        // Verify
        assert.ok(Array.isArray(gaps));
        
        // Should have at least one gap for branch coverage since it's 75% (below 85% threshold)
        const branchGaps = gaps.filter(gap => gap.type === CoverageType.BRANCH);
        assert.strictEqual(branchGaps.length > 0, true);
        
        // Verify gap details
        const gap = branchGaps[0];
        assert.strictEqual(gap.packageName, 'com.example');
        assert.strictEqual(gap.className, 'TestClass');
        assert.strictEqual(gap.type, CoverageType.BRANCH);
        assert.strictEqual(gap.coverage, 75);
    });
    
    test('generateCoverageReport should create HTML report', async () => {
        // Setup - preload with test data
        await analyzer.analyzeJacocoReport('/path/to/jacoco');
        
        // Execute
        const reportPath = await analyzer.generateCoverageReport('html', '/output/report.html');
        
        // Verify
        assert.strictEqual(reportPath, '/output/report.html');
        assert.strictEqual(mockFileManager.createDirectory.calledWith('/output'), true);
        assert.strictEqual(mockFileManager.writeFile.calledOnce, true);
        
        // Verify content
        const content = mockFileManager.writeFile.firstCall.args[1];
        assert.ok(content.includes('<!DOCTYPE html>'));
        assert.ok(content.includes('Coverage Report'));
        assert.ok(content.includes('Coverage Summary'));
        assert.ok(content.includes('Coverage Gaps'));
    });
    
    test('generateCoverageReport should create JSON report', async () => {
        // Setup - preload with test data
        await analyzer.analyzeJacocoReport('/path/to/jacoco');
        
        // Execute
        const reportPath = await analyzer.generateCoverageReport('json', '/output/report.json');
        
        // Verify
        assert.strictEqual(reportPath, '/output/report.json');
        assert.strictEqual(mockFileManager.createDirectory.calledWith('/output'), true);
        assert.strictEqual(mockFileManager.writeFile.calledOnce, true);
        
        // Verify content is valid JSON
        const content = mockFileManager.writeFile.firstCall.args[1];
        const json = JSON.parse(content);
        assert.ok(json.timestamp);
        assert.ok(json.summary);
        assert.ok(json.thresholds);
        assert.ok(json.gaps);
    });
    
    test('generateCoverageGapSuggestions should provide test suggestions', async () => {
        // Setup - preload with test data and set thresholds to create gaps
        await analyzer.analyzeJacocoReport('/path/to/jacoco');
        analyzer.setThresholds(new Map([
            [CoverageType.BRANCH, 85],
            [CoverageType.LINE, 85]
        ]));
        
        // Execute
        const suggestions = await analyzer.generateCoverageGapSuggestions();
        
        // Verify
        assert.ok(suggestions instanceof Map);
        assert.strictEqual(suggestions.size > 0, true);
        
        // Should have suggestion for our test class
        const classKey = 'com.example.TestClass';
        assert.strictEqual(suggestions.has(classKey), true);
        
        // Verify suggestions for the class
        const classSuggestions = suggestions.get(classKey)!;
        assert.strictEqual(Array.isArray(classSuggestions), true);
        assert.strictEqual(classSuggestions.length > 0, true);
        
        // Verify suggestion content
        const suggestion = classSuggestions[0];
        assert.ok(suggestion.includes('Test'));
    });
    
    test('generateJacocoReport should build correct command', async () => {
        // Setup
        const execPath = 'jacoco.exec';
        const classesPath = 'target/classes';
        const outputPath = 'jacoco-report';
        const cliPath = '/path/to/jacococli.jar';
        
        // Mock settings
        const originalGetJacocoCliPath = require('../../../core/settings').SettingsManager.getJacocoCliPath;
        require('../../../core/settings').SettingsManager.getJacocoCliPath = () => cliPath;
        
        // Execute
        const reportPath = await analyzer.generateJacocoReport(execPath, classesPath, outputPath);
        
        // Verify
        assert.strictEqual(reportPath, outputPath);
        assert.strictEqual(mockFileManager.createDirectory.calledWith(outputPath), true);
        assert.strictEqual(mockCommandExecutor.executeCommand.calledOnce, true);
        
        // Verify command is correct
        const command = mockCommandExecutor.executeCommand.firstCall.args[0];
        assert.ok(command.includes(`java -jar ${cliPath} report ${execPath}`));
        assert.ok(command.includes(`--classfiles ${classesPath}`));
        assert.ok(command.includes(`--xml ${outputPath}/jacoco.xml`));
        
        // Restore original function
        require('../../../core/settings').SettingsManager.getJacocoCliPath = originalGetJacocoCliPath;
    });
});
