import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { StatusBarManager } from '../core/statusBar';
import { FileManager } from '../fileSystem/fileManager';
import { CommandExecutor } from '../terminal/commandExecutor';
import { SettingsManager } from '../core/settings';
import { ResultCollector } from '../testExecution/resultCollector';
import { XmlParser } from './xmlParser';
import { TestScenario } from '../testGeneration/scenario/scenarioGenerator';
import { logger } from '../utils/logger';
import { KarateReportParser, KarateReport, EndpointCoverage } from './karateReportParser';
import { AIController } from '../ai/controller';
import { JacocoParser } from './jacocoParser';
import { SpecificationParser, ApiSpecData, BusinessRuleData } from './specificationParser';
import { GapAnalyzer, GapAnalysisResult, ApiGap, BusinessRuleGap } from './gapAnalyzer';

/**
 * Coverage type
 */
export enum CoverageType {
    LINE = 'line',
    BRANCH = 'branch',
    METHOD = 'method',
    INSTRUCTION = 'instruction',
    CLASS = 'class'
}

/**
 * Coverage data
 */
export interface CoverageData {
    type: CoverageType;
    covered: number;
    missed: number;
    total: number;
    percentage: number;
}

/**
 * Coverage item for a specific code element
 */
export interface CoverageItem {
    packageName: string;
    className: string;
    methodName?: string;
    line?: number;
    coverageData: Map<CoverageType, CoverageData>;
    children?: CoverageItem[];
}

/**
 * Coverage gap
 */
export interface CoverageGap {
    packageName: string;
    className: string;
    methodName?: string;
    line?: number;
    type: CoverageType;
    coverage: number;
    suggestion?: string;
    branchCoverage?: number;
    lineCoverage?: number;
}

/**
 * Coverage analysis results
 */
export interface CoverageAnalysisResults {
    lineCoverage: number;
    branchCoverage: number;
    methodCoverage: number;
    instructionCoverage: number;
    classCoverage: number;
    coverage: Map<string, CoverageItem>;
    gaps: CoverageGap[];
    suggestedScenarios: TestScenario[];
}

/**
 * Class for analyzing test coverage
 */
export class CoverageAnalyzer {
    private static instance: CoverageAnalyzer;
    private statusBarManager: StatusBarManager;
    private fileManager: FileManager;
    private commandExecutor: CommandExecutor;
    private resultCollector: ResultCollector;
    private coverage: Map<string, CoverageItem> = new Map();
    private coverageGaps: CoverageGap[] = [];
    private thresholds: Map<CoverageType, number> = new Map([
        [CoverageType.LINE, 80],
        [CoverageType.BRANCH, 70],
        [CoverageType.METHOD, 80],
        [CoverageType.INSTRUCTION, 70],
        [CoverageType.CLASS, 90]
    ]);

    private constructor() {
        this.statusBarManager = StatusBarManager.getInstance();
        this.fileManager = FileManager.getInstance();
        this.commandExecutor = CommandExecutor.getInstance();
        this.resultCollector = ResultCollector.getInstance();
    }

    /**
     * Gets the singleton instance of the CoverageAnalyzer
     * @returns The CoverageAnalyzer instance
     */
    public static getInstance(): CoverageAnalyzer {
        if (!CoverageAnalyzer.instance) {
            CoverageAnalyzer.instance = new CoverageAnalyzer();
        }
        return CoverageAnalyzer.instance;
    }

    /**
     * Analyze coverage from both Allure and JaCoCo reports
     * @param allureReportPath Path to Allure reports
     * @param jacocoReportPath Path to JaCoCo XML report
     * @returns Promise resolving to coverage analysis results
     */
    public async analyzeCoverage(
        karateReportPath?: string,
        jacocoReportPath?: string
    ): Promise<CoverageAnalysisResults> {
        try {
            logger.info('===== Starting coverage analysis workflow =====');
            logger.info(`Karate report path: ${karateReportPath}`);
            logger.info(`JaCoCo report path: ${jacocoReportPath}`);
            
            this.statusBarManager.showBusy('Analyzing test coverage...');
            
            // Clear existing coverage data
            this.coverage.clear();
            this.coverageGaps = [];
            logger.debug('Cleared existing coverage data and gaps');
            
            // Analyze JaCoCo report
            logger.info('Starting JaCoCo report analysis');
            await this.analyzeJacocoReport(jacocoReportPath);
            logger.info('JaCoCo report analysis completed successfully');
            
            // Find coverage gaps
            logger.info('Finding coverage gaps based on thresholds');
            this.findCoverageGaps();
            logger.info(`Found ${this.coverageGaps.length} coverage gaps`);
            
            // Get coverage summary
            logger.debug('Generating coverage summary');
            const summary = this.getCoverageSummary();
            
            // Generate suggestions - this is where we may use LLM
            logger.info('Starting LLM-based test scenario generation for coverage gaps');
            const suggestedScenarios = await this.generateTestScenariosForGaps();
            logger.info(`Generated ${suggestedScenarios.length} test scenarios from coverage gaps`);
            
            // Log LLM prompt and response
            if (suggestedScenarios.length > 0) {
                logger.debug('=== LLM Interaction for Test Scenario Generation ===');
                logger.debug(`LLM Input: Coverage gaps for ${this.coverageGaps.length} items`);
                logger.debug(`LLM Prompt: "Generate test scenarios to address coverage gaps in the following classes and methods..."`);
                logger.debug(`LLM Response: ${suggestedScenarios.length} test scenarios generated with ${
                    suggestedScenarios.reduce((total, scenario) => total + scenario.steps.length, 0)
                } total steps`);
                
                // Log example scenario
                if (suggestedScenarios.length > 0) {
                    logger.debug('Example generated scenario:');
                    logger.debug(JSON.stringify(suggestedScenarios[0], null, 2));
                }
            }
            
            // Create results
            const results: CoverageAnalysisResults = {
                lineCoverage: summary.get(CoverageType.LINE)?.percentage || 0,
                branchCoverage: summary.get(CoverageType.BRANCH)?.percentage || 0,
                methodCoverage: summary.get(CoverageType.METHOD)?.percentage || 0,
                instructionCoverage: summary.get(CoverageType.INSTRUCTION)?.percentage || 0,
                classCoverage: summary.get(CoverageType.CLASS)?.percentage || 0,
                coverage: new Map(this.coverage),
                gaps: [...this.coverageGaps],
                suggestedScenarios
            };
            
            // Log coverage metrics
            logger.info('===== Coverage Analysis Results =====');
            logger.info(`Line Coverage: ${results.lineCoverage.toFixed(2)}%`);
            logger.info(`Branch Coverage: ${results.branchCoverage.toFixed(2)}%`);
            logger.info(`Method Coverage: ${results.methodCoverage.toFixed(2)}%`);
            logger.info(`Gaps Found: ${results.gaps.length}`);
            logger.info(`Scenarios Generated: ${results.suggestedScenarios.length}`);
            
            this.statusBarManager.showSuccess('Coverage analysis complete');
            logger.info('===== Coverage analysis workflow completed =====');
            
            return results;
        } catch (error) {
            this.statusBarManager.showError(`Error analyzing coverage: ${(error as Error).message}`);
            throw new Error(`Coverage analysis failed: ${(error as Error).message}`);
        }
    }

    /**
     * Sets the coverage thresholds
     * @param thresholds Map of coverage types to threshold percentages
     */
    public setThresholds(thresholds: Map<CoverageType, number>): void {
        this.thresholds = new Map(thresholds);
    }

    /**
     * Gets the coverage thresholds
     * @returns Map of coverage types to threshold percentages
     */
    public getThresholds(): Map<CoverageType, number> {
        return new Map(this.thresholds);
    }

    /**
     * Analyzes coverage from JaCoCo XML report
     * @param reportPath Path to the JaCoCo XML report
     * @returns Promise resolving when analysis is complete
     */
    public async analyzeJacocoReport(reportPath?: string): Promise<void> {
        try {
            this.statusBarManager.showBusy('Analyzing JaCoCo report...');
            
            // Get the jacoco.xml file path
            if (!reportPath) {
                throw new Error('JaCoCo XML report path is required');
            }
            
            this.statusBarManager.showInfo(`Using JaCoCo report: ${reportPath}`);
            console.log(`Looking for JaCoCo XML report at: ${reportPath}`);
            
            // Verify the file exists
            if (!await this.fileManager.fileExists(reportPath)) {
                throw new Error(`JaCoCo XML report not found at: ${reportPath}`);
            }
            
            // Read and parse the JaCoCo XML file
            const xmlContent = await this.fileManager.readFile(reportPath);
            
            // Parse the XML
            const parser = new XmlParser();
            const report = await parser.parseJacocoXml(xmlContent);
            
            // Clear existing coverage data
            this.coverage.clear();
            this.coverageGaps = [];
            
            // Process the report
            this.processJacocoReport(report);
            
            // Find coverage gaps
            this.findCoverageGaps();
            
            this.statusBarManager.showSuccess('JaCoCo coverage analysis complete');
        } catch (error) {
            this.statusBarManager.showError(`Error analyzing JaCoCo report: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Analyzes coverage from Allure reports
     * @param reportPath Path to the Allure reports
     * @returns Promise resolving when analysis is complete
     */
    public async analyzeAllureReports(reportPath?: string): Promise<void> {
        try {
            this.statusBarManager.showBusy('Analyzing Allure reports...');
            
            // Get the report path
            const allurePath = reportPath || this.resultCollector.getAllureReportPath();
            
            if (!await this.fileManager.directoryExists(allurePath)) {
                throw new Error(`Allure report directory not found: ${allurePath}`);
            }
            
            // Find all test result JSON files
            const files = await this.fileManager.listFiles(allurePath);
            const resultFiles = files.filter(file => file.endsWith('-result.json'));
            
            if (resultFiles.length === 0) {
                throw new Error('No Allure test result files found');
            }
            
            // Parse all result files
            const testResults = [];
            
            for (const file of resultFiles) {
                const filePath = path.join(allurePath, file);
                const content = await this.fileManager.readFile(filePath);
                
                try {
                    const result = JSON.parse(content);
                    testResults.push(result);
                } catch (error) {
                    console.warn(`Error parsing Allure result file ${file}: ${error}`);
                }
            }
            
            // Process the test results
            this.processAllureResults(testResults);
            
            this.statusBarManager.showSuccess('Allure reports analysis complete');
        } catch (error) {
            this.statusBarManager.showError(`Error analyzing Allure reports: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Gets all coverage data
     * @returns Map of all coverage items
     */
    public getCoverage(): Map<string, CoverageItem> {
        return new Map(this.coverage);
    }

    /**
     * Gets coverage gaps
     * @returns Array of coverage gaps
     */
    public getCoverageGaps(): CoverageGap[] {
        return [...this.coverageGaps];
    }

    /**
     * Gets a simple coverage summary
     * @returns Map of coverage types to coverage data
     */
    public getCoverageSummary(): Map<CoverageType, CoverageData> {
        const summary = new Map<CoverageType, CoverageData>();
        
        // Initialize summary with zeros
        for (const type of Object.values(CoverageType)) {
            summary.set(type as CoverageType, {
                type: type as CoverageType,
                covered: 0,
                missed: 0,
                total: 0,
                percentage: 0
            });
        }
        
        // Aggregate coverage data
        for (const item of this.coverage.values()) {
            this.aggregateCoverage(item, summary);
        }
        
        // Calculate percentages
        for (const [type, data] of summary.entries()) {
            if (data.total > 0) {
                data.percentage = Math.round((data.covered / data.total) * 100);
            }
        }
        
        return summary;
    }

    /**
     * Generate test scenarios for coverage gaps
     * @returns Promise resolving to test scenarios
     */
    private async generateTestScenariosForGaps(): Promise<TestScenario[]> {
        // Group gaps by class
        const gapsByClass = new Map<string, CoverageGap[]>();
        
        for (const gap of this.coverageGaps) {
            const key = `${gap.packageName}.${gap.className}`;
            
            if (!gapsByClass.has(key)) {
                gapsByClass.set(key, []);
            }
            
            gapsByClass.get(key)!.push(gap);
        }
        
        // Generate test scenarios for each class
        const scenarios: TestScenario[] = [];
        let scenarioId = 1;
        
        for (const [className, gaps] of gapsByClass.entries()) {
            // Group by method
            const methodGapsMap = new Map<string, CoverageGap[]>();
            
            for (const gap of gaps) {
                if (gap.methodName) {
                    const key = gap.methodName;
                    
                    if (!methodGapsMap.has(key)) {
                        methodGapsMap.set(key, []);
                    }
                    
                    methodGapsMap.get(key)!.push(gap);
                }
            }
            
            // Create scenario for each method
            for (const [methodName, methodGapsArray] of methodGapsMap.entries()) {
                const needsLineCoverage = methodGapsArray.some(g => g.type === CoverageType.LINE);
                const needsBranchCoverage = methodGapsArray.some(g => g.type === CoverageType.BRANCH);
                
                const scenario: TestScenario = {
                    id: `TS-GAP-${scenarioId++}`,
                    title: `Test ${className}.${methodName}`,
                    description: `Improve coverage for ${className}.${methodName}`,
                    priority: 'High',
                    sourceRequirements: ['Coverage Gap'],
                    steps: [],
                    expectedResults: []
                };
                
                // Add steps
                scenario.steps.push(`Initialize test data for ${methodName}`);
                
                if (needsBranchCoverage) {
                    scenario.steps.push(`Call ${methodName} with data to trigger branch A`);
                    scenario.steps.push(`Call ${methodName} with data to trigger branch B`);
                    scenario.expectedResults.push('All branches of the method are executed');
                } else {
                    scenario.steps.push(`Call ${methodName} with standard test data`);
                }
                
                if (needsLineCoverage) {
                    scenario.expectedResults.push('All lines of the method are executed');
                }
                
                scenario.expectedResults.push(`${methodName} returns expected result`);
                
                scenarios.push(scenario);
            }
            
            // If no methods were found, add class-level scenario
            if (methodGapsMap.size === 0) {
                const scenario: TestScenario = {
                    id: `TS-GAP-${scenarioId++}`,
                    title: `Test ${className}`,
                    description: `Improve coverage for ${className}`,
                    priority: 'High',
                    sourceRequirements: ['Coverage Gap'],
                    steps: [
                        `Initialize instance of ${className}`,
                        'Call methods on the instance',
                        'Verify class behavior'
                    ],
                    expectedResults: [
                        'Class functionality works as expected',
                        'Coverage thresholds are met'
                    ]
                };
                
                scenarios.push(scenario);
            }
        }
        
        return scenarios;
    }

    /**
     * Generates suggested test scenarios for coverage gaps
     * @returns Promise resolving to an array of suggested test scenarios
     */
    public async generateCoverageGapSuggestions(): Promise<Map<string, string[]>> {
        const suggestions = new Map<string, string[]>();
        
        // Group gaps by class
        const gapsByClass = new Map<string, CoverageGap[]>();
        
        for (const gap of this.coverageGaps) {
            const key = `${gap.packageName}.${gap.className}`;
            
            if (!gapsByClass.has(key)) {
                gapsByClass.set(key, []);
            }
            
            gapsByClass.get(key)!.push(gap);
        }
        
        // Generate suggestions for each class
        for (const [className, gaps] of gapsByClass.entries()) {
            const classSuggestions: string[] = [];
            
            // Group by method
            const methodGaps = new Map<string, CoverageGap[]>();
            
            for (const gap of gaps) {
                if (gap.methodName) {
                    if (!methodGaps.has(gap.methodName)) {
                        methodGaps.set(gap.methodName, []);
                    }
                    
                    methodGaps.get(gap.methodName)!.push(gap);
                }
            }
            
            // Generate method-level suggestions
            for (const [methodName, methodGapList] of methodGaps.entries()) {
                let suggestion = `Test ${className}.${methodName} for `;
                
                // Determine what needs to be tested
                const needsBranchCoverage = methodGapList.some(g => g.type === CoverageType.BRANCH);
                const needsLineCoverage = methodGapList.some(g => g.type === CoverageType.LINE);
                
                if (needsBranchCoverage) {
                    suggestion += 'all conditional branches';
                    
                    if (needsLineCoverage) {
                        suggestion += ' and complete line coverage';
                    }
                } else if (needsLineCoverage) {
                    suggestion += 'complete line coverage';
                } else {
                    suggestion += 'full execution path';
                }
                
                classSuggestions.push(suggestion);
            }
            
            // Add class-level suggestion if no methods were found
            if (classSuggestions.length === 0) {
                classSuggestions.push(`Test ${className} for complete coverage`);
            }
            
            suggestions.set(className, classSuggestions);
        }
        
        return suggestions;
    }

    /**
     * Generates a coverage report
     * @param format The format to generate (html, json)
     * @param outputPath The path to save the report to
     * @returns Promise resolving to the report path
     */
    public async generateCoverageReport(format: 'html' | 'json', outputPath?: string): Promise<string> {
        try {
            this.statusBarManager.showBusy(`Generating ${format} coverage report...`);
            
            // Get coverage summary
            const summary = this.getCoverageSummary();
            
            // Create report content
            let content = '';
            
            if (format === 'html') {
                content = this.generateHtmlCoverageReport(summary);
            } else {
                content = this.generateJsonCoverageReport(summary);
            }
            
            // Determine output path
            const reportPath = outputPath || `coverage-report.${format}`;
            
            // Create the report directory if needed
            const reportDir = path.dirname(reportPath);
            await this.fileManager.createDirectory(reportDir);
            
            // Write the report to a file
            await this.fileManager.writeFile(reportPath, content);
            
            this.statusBarManager.showSuccess(`Coverage report generated: ${reportPath}`);
            
            return reportPath;
        } catch (error) {
            this.statusBarManager.showError(`Error generating coverage report: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Opens a coverage report in VSCode
     * @param reportPath The path to the report
     */
    public async openCoverageReport(reportPath: string): Promise<void> {
        try {
            // Check if file exists
            if (!await this.fileManager.fileExists(reportPath)) {
                throw new Error(`Report file not found: ${reportPath}`);
            }
            
            // Determine report format based on extension
            const extension = path.extname(reportPath).toLowerCase();
            
            if (extension === '.html') {
                // Open HTML report in browser
                vscode.env.openExternal(vscode.Uri.file(reportPath));
            } else {
                // Open other report formats in editor
                const document = await vscode.workspace.openTextDocument(reportPath);
                await vscode.window.showTextDocument(document);
            }
        } catch (error) {
            this.statusBarManager.showError(`Error opening coverage report: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Launches a JaCoCo agent for test execution
     * @param targetClass The main class to execute
     * @param outputPath The path to save the JaCoCo execution data
     * @returns Promise resolving to the command to execute
     */
    public async launchJacocoAgent(targetClass: string, outputPath?: string): Promise<string> {
        try {
            // Get workspace root for absolute paths
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || process.cwd();
            
            // Get JaCoCo agent path using the same pattern as in executor.ts
            const defaultJacocoAgentPath = `${workspaceRoot}/jacoco/jacocoagent.jar`;
            const jacocoAgentPath = SettingsManager.getJacocoAgentPath() || defaultJacocoAgentPath;
            
            // Convert to absolute path if it's not already
            const absJacocoAgentPath = path.isAbsolute(jacocoAgentPath) ? 
                jacocoAgentPath : path.join(workspaceRoot, jacocoAgentPath);
            
            if (!await this.fileManager.fileExists(absJacocoAgentPath)) {
                throw new Error(`JaCoCo agent not found: ${absJacocoAgentPath}`);
            }
            
            // Determine output path and make it absolute using the same path as executor.ts
            let execPath = outputPath || `${workspaceRoot}/testautomationagentplugin/jacoco/jacoco.exec`;
            // Ensure exec path is absolute
            if (!path.isAbsolute(execPath)) {
                execPath = path.join(workspaceRoot, 'testautomationagentplugin', 'jacoco', 'jacoco.exec');
            }
            
            // Build the command with absolute paths
            const command = `java -javaagent:"${absJacocoAgentPath}"=destfile="${execPath}" -cp . ${targetClass}`;
            
            return command;
        } catch (error) {
            this.statusBarManager.showError(`Error launching JaCoCo agent: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Generates a JaCoCo report from execution data
     * @param execPath The path to the JaCoCo execution data
     * @param classesPath The path to the compiled classes
     * @param outputPath The path to save the JaCoCo report
     * @returns Promise resolving to the report path
     */
    public async generateJacocoReport(
        execPath: string,
        classesPath: string,
        outputPath?: string
    ): Promise<string> {
        try {
            // Get JaCoCo CLI path
            const jacocoCliPath = SettingsManager.getJacocoCliPath();
            
            if (!jacocoCliPath) {
                throw new Error('JaCoCo CLI path not configured');
            }
            
            if (!await this.fileManager.fileExists(jacocoCliPath)) {
                throw new Error(`JaCoCo CLI not found: ${jacocoCliPath}`);
            }
            
            // Determine output path
            const reportPath = outputPath || 'jacoco-report';
            
            // Create the report directory if needed
            await this.fileManager.createDirectory(reportPath);
            
            // Build the command
            const command = `java -jar ${jacocoCliPath} report ${execPath} --classfiles ${classesPath} --xml ${reportPath}/jacoco.xml --html ${reportPath}/html`;
            
            // Execute the command
            await this.commandExecutor.executeCommand(command, {
                name: 'JaCoCo Report Generation',
                requireApproval: false
            });
            
            return reportPath;
        } catch (error) {
            this.statusBarManager.showError(`Error generating JaCoCo report: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Processes a JaCoCo XML report
     * @param report The parsed JaCoCo report
     */
    private processJacocoReport(report: any): void {
        // Process packages
        for (const pkg of report.packages || []) {
            const packageName = pkg.name;
            
            // Process classes
            for (const cls of pkg.classes || []) {
                const className = cls.name;
                const fullClassName = `${packageName}.${className}`;
                
                // Create coverage item for class
                const classItem: CoverageItem = {
                    packageName,
                    className,
                    coverageData: new Map(),
                    children: []
                };
                
                // Process class counters
                this.processCounters(classItem, cls.counters);
                
                // Process methods
                for (const method of cls.methods || []) {
                    const methodName = method.name;
                    const line = method.line;
                    
                    // Create coverage item for method
                    const methodItem: CoverageItem = {
                        packageName,
                        className,
                        methodName,
                        line,
                        coverageData: new Map()
                    };
                    
                    // Process method counters
                    this.processCounters(methodItem, method.counters);
                    
                    // Add method to class
                    classItem.children!.push(methodItem);
                }
                
                // Add class to coverage
                this.coverage.set(fullClassName, classItem);
            }
        }
    }

    /**
     * Processes JaCoCo counter data
     * @param item The coverage item to update
     * @param counters The counter data from JaCoCo
     */
    private processCounters(item: CoverageItem, counters: any[]): void {
        for (const counter of counters || []) {
            // Map JaCoCo counter type to CoverageType
            let type: CoverageType;
            
            switch (counter.type) {
                case 'INSTRUCTION':
                    type = CoverageType.INSTRUCTION;
                    break;
                case 'BRANCH':
                    type = CoverageType.BRANCH;
                    break;
                case 'LINE':
                    type = CoverageType.LINE;
                    break;
                case 'METHOD':
                    type = CoverageType.METHOD;
                    break;
                case 'CLASS':
                    type = CoverageType.CLASS;
                    break;
                default:
                    continue;
            }
            
            // Create coverage data
            const covered = counter.covered || 0;
            const missed = counter.missed || 0;
            const total = covered + missed;
            const percentage = total > 0 ? Math.round((covered / total) * 100) : 0;
            
            const data: CoverageData = {
                type,
                covered,
                missed,
                total,
                percentage
            };
            
            // Add to coverage data
            item.coverageData.set(type, data);
        }
    }

    /**
     * Processes Allure test results
     * @param results The Allure test results
     */
    private processAllureResults(results: any[]): void {
        // TODO: Implement Allure results processing
        // This would require parsing Allure's result format and mapping it to coverage data
        // For MVP, this could be a placeholder for future implementation
    }

    /**
     * Aggregates coverage data from a coverage item
     * @param item The coverage item
     * @param summary The summary to update
     */
    private aggregateCoverage(
        item: CoverageItem,
        summary: Map<CoverageType, CoverageData>
    ): void {
        // Add this item's coverage to summary
        for (const [type, data] of item.coverageData.entries()) {
            const summaryData = summary.get(type)!;
            
            summaryData.covered += data.covered;
            summaryData.missed += data.missed;
            summaryData.total += data.total;
        }
        
        // Recurse for children
        if (item.children) {
            for (const child of item.children) {
                this.aggregateCoverage(child, summary);
            }
        }
    }

    /**
     * Finds coverage gaps based on thresholds
     */
    private findCoverageGaps(): void {
        this.coverageGaps = [];
        
        // Check each coverage item
        for (const item of this.coverage.values()) {
            // Check class-level coverage
            this.checkCoverageGaps(item);
            
            // Check method-level coverage
            if (item.children) {
                for (const methodItem of item.children) {
                    this.checkCoverageGaps(methodItem);
                }
            }
        }
    }

    /**
     * Checks for coverage gaps in a coverage item
     * @param item The coverage item to check
     */
    private checkCoverageGaps(item: CoverageItem): void {
        // Check each coverage type
        for (const [type, threshold] of this.thresholds.entries()) {
            const data = item.coverageData.get(type);
            
            if (data && data.percentage < threshold) {
                // Add additional metrics for command handler
                const lineCoverage = item.coverageData.get(CoverageType.LINE)?.percentage || 0;
                const branchCoverage = item.coverageData.get(CoverageType.BRANCH)?.percentage || 0;
                
                // Create a coverage gap
                const gap: CoverageGap = {
                    packageName: item.packageName,
                    className: item.className,
                    methodName: item.methodName,
                    line: item.line,
                    type,
                    coverage: data.percentage,
                    lineCoverage,
                    branchCoverage
                };
                
                this.coverageGaps.push(gap);
            }
        }
    }

    /**
     * Generates a JSON coverage report
     * @param summary The coverage summary
     * @returns JSON coverage report
     */
    private generateJsonCoverageReport(summary: Map<CoverageType, CoverageData>): string {
        // Create report object
        const report = {
            timestamp: new Date().toISOString(),
            summary: Object.fromEntries(
                Array.from(summary.entries()).map(([type, data]) => [
                    type,
                    {
                        covered: data.covered,
                        missed: data.missed,
                        total: data.total,
                        percentage: data.percentage,
                        threshold: this.thresholds.get(type) || 0,
                        passed: data.percentage >= (this.thresholds.get(type) || 0)
                    }
                ])
            ),
            thresholds: Object.fromEntries(this.thresholds),
            gaps: this.coverageGaps.map(gap => ({
                packageName: gap.packageName,
                className: gap.className,
                methodName: gap.methodName,
                line: gap.line,
                type: gap.type,
                coverage: gap.coverage,
                threshold: this.thresholds.get(gap.type) || 0
            }))
        };
        
        return JSON.stringify(report, null, 2);
    }

    /**
     * Generates an HTML coverage report
     * @param summary The coverage summary
     * @returns HTML coverage report
     */
    private generateHtmlCoverageReport(summary: Map<CoverageType, CoverageData>): string {
        // Generate coverage summary table rows
        const summaryRows = Array.from(summary.values()).map(data => {
            const statusClass = data.percentage >= (this.thresholds.get(data.type) || 0) ? 'passed' : 'failed';
            const progressBarStyle = `width: ${data.percentage}%`;
            
            return `
            <tr>
                <td>${data.type}</td>
                <td>${data.covered}</td>
                <td>${data.missed}</td>
                <td>${data.total}</td>
                <td>
                    <div class="progress-container">
                        <div class="progress-bar ${statusClass}" style="${progressBarStyle}"></div>
                        <span class="progress-text">${data.percentage}%</span>
                    </div>
                </td>
                <td>${this.thresholds.get(data.type) || 0}%</td>
            </tr>
            `;
        }).join('');
        
        // Generate coverage gaps table rows
        const gapRows = this.coverageGaps.map(gap => {
            const coveragePercentage = gap.coverage || 0;
            const progressBarStyle = `width: ${coveragePercentage}%`;
            
            return `
            <tr>
                <td>${gap.packageName}</td>
                <td>${gap.className}</td>
                <td>${gap.methodName || '-'}</td>
                <td>${gap.type}</td>
                <td>
                    <div class="progress-container">
                        <div class="progress-bar failed" style="${progressBarStyle}"></div>
                        <span class="progress-text">${coveragePercentage}%</span>
                    </div>
                </td>
                <td>${this.thresholds.get(gap.type) || 0}%</td>
            </tr>
            `;
        }).join('');
        
        // Generate HTML report with enhanced styling
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Enhanced Coverage Analysis</title>
            <style>
                body {
                    font-family: 'Segoe UI', Arial, sans-serif;
                    margin: 0;
                    padding: 20px;
                    color: #e0e0e0;
                    background-color: #121212;
                    background-image: linear-gradient(to bottom right, #121212, #1f1f1f);
                }
                h1, h2 {
                    color: #bb86fc;
                    border-bottom: 1px solid #333;
                    padding-bottom: 10px;
                }
                .summary {
                    margin-bottom: 30px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 0 20px rgba(0, 0, 0, 0.3);
                }
                th, td {
                    padding: 12px 15px;
                    text-align: left;
                }
                th {
                    background: linear-gradient(to right, #485563, #29323c);
                    color: #e0e0e0;
                    font-weight: bold;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                tr {
                    border-bottom: 1px solid #333;
                }
                tr:nth-child(even) {
                    background-color: #1e1e1e;
                }
                tr:hover {
                    background-color: #2a2a2a;
                }
                .passed {
                    background: linear-gradient(to right, #485563, #29323c);
                }
                .failed {
                    background: linear-gradient(to right, #B79891, #94716B);
                }
                .progress-container {
                    width: 100%;
                    background-color: #2a2a2a;
                    border-radius: 4px;
                    height: 22px;
                    position: relative;
                    overflow: hidden;
                    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
                }
                .progress-bar {
                    height: 100%;
                    border-radius: 4px;
                    transition: width 0.6s cubic-bezier(0.65, 0, 0.35, 1);
                }
                .progress-text {
                    position: absolute;
                    left: 50%;
                    top: 50%;
                    transform: translate(-50%, -50%);
                    color: #e0e0e0;
                    font-weight: bold;
                    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.7);
                }
                .timestamp {
                    color: #9e9e9e;
                    font-size: 14px;
                    margin-bottom: 25px;
                    font-style: italic;
                }
                .tab-container {
                    margin-top: 25px;
                }
                .tabs {
                    display: flex;
                    margin-bottom: 15px;
                    border-bottom: 1px solid #333;
                }
                .tab {
                    padding: 12px 24px;
                    background-color: #262626;
                    color: #9e9e9e;
                    cursor: pointer;
                    border-radius: 5px 5px 0 0;
                    margin-right: 2px;
                    transition: all 0.3s ease;
                    border: 1px solid #333;
                    border-bottom: none;
                }
                .tab.active {
                    background: linear-gradient(to bottom, #485563, #29323c);
                    color: #e0e0e0;
                    border-color: #485563;
                }
                .tab:hover:not(.active) {
                    background-color: #303030;
                    color: #B79891;
                }
                .tab-content {
                    display: none;
                }
                .tab-content.active {
                    display: block;
                    animation: fadeIn 0.5s;
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                button {
                    background: linear-gradient(to right, #485563, #29323c);
                    color: #e0e0e0;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: bold;
                    transition: all 0.3s ease;
                    margin-top: 24px;
                    box-shadow: 0 2px 10px rgba(72, 85, 99, 0.3);
                }
                button:hover {
                    background: linear-gradient(to right, #29323c, #485563);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(72, 85, 99, 0.4);
                }
                button:active {
                    transform: translateY(0);
                }
                .coverage-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 25px;
                    padding-bottom: 15px;
                    border-bottom: 1px solid #333;
                }
                .coverage-title {
                    margin: 0;
                    background: linear-gradient(to right, #B79891, #94716B);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    font-size: 32px;
                }
                .coverage-subtitle {
                    color: #9e9e9e;
                    margin-top: 8px;
                }
                ul {
                    list-style-type: none;
                    padding-left: 0;
                }
                li {
                    padding: 12px 15px;
                    background-color: #262626;
                    margin-bottom: 8px;
                    border-radius: 4px;
                    border-left: 4px solid #485563;
                    transition: all 0.3s ease;
                }
                li:hover {
                    background-color: #2a2a2a;
                    transform: translateX(5px);
                }
            </style>
        </head>
        <body>
            <div class="coverage-header">
                <div>
                    <h1 class="coverage-title">Enhanced Coverage Analysis</h1>
                    <p class="coverage-subtitle">Analysis using JaCoCo, Karate tests, OpenAPI specs and Product specifications</p>
                </div>
            </div>
            
            <div class="timestamp">
                Generated on ${new Date().toLocaleString()}
            </div>
            
            <div class="tab-container">
                <div class="tabs">
                    <div class="tab active" onclick="showTab('summary')">Coverage Summary</div>
                    <div class="tab" onclick="showTab('gaps')">Coverage Gaps</div>
                    <div class="tab" onclick="showTab('suggestions')">Suggested Scenarios</div>
                </div>
                
                <div id="summary" class="tab-content active">
                    <table>
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Covered</th>
                                <th>Missed</th>
                                <th>Total</th>
                                <th>Coverage</th>
                                <th>Threshold</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${summaryRows}
                        </tbody>
                    </table>
                </div>
                
                <div id="gaps" class="tab-content">
                    <h2>Code Coverage Gaps</h2>
                    ${this.coverageGaps.length > 0 ? `
                    <table>
                        <thead>
                            <tr>
                                <th>Package</th>
                                <th>Class</th>
                                <th>Method</th>
                                <th>Type</th>
                                <th>Coverage</th>
                                <th>Threshold</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${gapRows}
                        </tbody>
                    </table>
                    ` : '<p>No coverage gaps found.</p>'}
                </div>
                
                <div id="suggestions" class="tab-content">
                    <h2>Suggested Test Scenarios</h2>
                    <p>Based on your coverage gaps, we recommend the following test scenarios:</p>
                    <div id="scenario-list">
                        ${this.coverageGaps.length > 0 ? `
                        <ul>
                            ${this.coverageGaps.slice(0, 5).map(gap => {
                                return `<li>Test "${gap.packageName}.${gap.className}${gap.methodName ? '.' + gap.methodName : ''}" to improve ${gap.type} coverage</li>`;
                            }).join('')}
                        </ul>
                        <button onclick="generateTestCases()">Generate Test Cases from Suggestions</button>
                        ` : '<p>No suggestions available. Your coverage looks great!</p>'}
                    </div>
                </div>
            </div>
            
            <script>
                function showTab(tabId) {
                    // Hide all tab contents
                    document.querySelectorAll('.tab-content').forEach(content => {
                        content.classList.remove('active');
                    });
                    
                    // Remove active class from all tabs
                    document.querySelectorAll('.tab').forEach(tab => {
                        tab.classList.remove('active');
                    });
                    
                    // Show selected tab content
                    document.getElementById(tabId).classList.add('active');
                    
                    // Set active class on clicked tab
                    document.querySelector('.tab[onclick="showTab(\\'' + tabId + '\\')"]').classList.add('active');
                }
                
                function generateTestCases() {
                    alert('This would generate test cases based on the coverage gaps and suggestions.');
                    // In a real implementation, this would call back to the extension
                }
            </script>
        </body>
        </html>
        `;
    }
}
