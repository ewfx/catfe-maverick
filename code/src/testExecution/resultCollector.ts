import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { StatusBarManager } from '../core/statusBar';
import { FileManager } from '../fileSystem/fileManager';
import { TestResult, TestResultStatus } from './executor';
import { SettingsManager } from '../core/settings';

/**
 * Test execution summary
 */
export interface TestExecutionSummary {
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    error: number;
    pending: number;
    duration: number;
    startTime: Date;
    endTime: Date;
    success: boolean;
}

/**
 * Interface for test report formats
 */
export interface TestReportFormat {
    name: string;
    extension: string;
    generateReport(results: TestResult[]): Promise<string>;
}

/**
 * Class for collecting and processing test results
 */
export class ResultCollector {
    private static instance: ResultCollector;
    private statusBarManager: StatusBarManager;
    private fileManager: FileManager;
    private results: TestResult[] = [];

    private constructor() {
        this.statusBarManager = StatusBarManager.getInstance();
        this.fileManager = FileManager.getInstance();
    }

    /**
     * Gets the singleton instance of the ResultCollector
     * @returns The ResultCollector instance
     */
    public static getInstance(): ResultCollector {
        if (!ResultCollector.instance) {
            ResultCollector.instance = new ResultCollector();
        }
        return ResultCollector.instance;
    }

    /**
     * Collects test results
     * @param results The test results to collect
     */
    public collectResults(results: TestResult | TestResult[]): void {
        if (Array.isArray(results)) {
            this.results.push(...results);
        } else {
            this.results.push(results);
        }
    }

    /**
     * Gets all collected results
     * @returns Array of all test results
     */
    public getResults(): TestResult[] {
        return [...this.results];
    }

    /**
     * Clears all collected results
     */
    public clearResults(): void {
        this.results = [];
    }

    /**
     * Gets the summary of collected results
     * @returns Test execution summary
     */
    public getSummary(): TestExecutionSummary {
        // Count results by status
        const passed = this.results.filter(r => r.status === TestResultStatus.PASSED).length;
        const failed = this.results.filter(r => r.status === TestResultStatus.FAILED).length;
        const skipped = this.results.filter(r => r.status === TestResultStatus.SKIPPED).length;
        const error = this.results.filter(r => r.status === TestResultStatus.ERROR).length;
        const pending = this.results.filter(r => r.status === TestResultStatus.PENDING).length;
        
        // Calculate total duration
        const duration = this.results.reduce((total, result) => total + result.duration, 0);
        
        // Find start and end times
        const startTimes = this.results.map(r => r.startTime.getTime());
        const endTimes = this.results.map(r => r.endTime.getTime());
        
        const startTime = new Date(Math.min(...startTimes));
        const endTime = new Date(Math.max(...endTimes));
        
        // Create summary
        const summary: TestExecutionSummary = {
            totalTests: this.results.length,
            passed,
            failed,
            skipped,
            error,
            pending,
            duration,
            startTime,
            endTime,
            success: failed === 0 && error === 0
        };
        
        return summary;
    }

    /**
     * Finds failed tests
     * @returns Array of failed test results
     */
    public getFailedTests(): TestResult[] {
        return this.results.filter(r => 
            r.status === TestResultStatus.FAILED || 
            r.status === TestResultStatus.ERROR
        );
    }

    /**
     * Generates a report of the test results
     * @param format The report format to generate
     * @param outputPath The path to save the report to
     * @returns Promise resolving to the report path
     */
    public async generateReport(format: TestReportFormat, outputPath?: string): Promise<string> {
        try {
            this.statusBarManager.showBusy(`Generating ${format.name} report...`);
            
            // Generate report content
            const content = await format.generateReport(this.results);
            
            // Determine output path
            const reportPath = outputPath || `test-report-${Date.now()}.${format.extension}`;
            
            // Create the report directory if needed
            const reportDir = path.dirname(reportPath);
            await this.fileManager.createDirectory(reportDir);
            
            // Write the report to a file
            await this.fileManager.writeFile(reportPath, content);
            
            this.statusBarManager.showSuccess(`Report generated: ${reportPath}`);
            
            return reportPath;
        } catch (error) {
            this.statusBarManager.showError(`Error generating report: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Opens a report in VSCode
     * @param reportPath The path to the report
     */
    public async openReport(reportPath: string): Promise<void> {
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
            this.statusBarManager.showError(`Error opening report: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Gets the Allure report path
     * @returns The Allure report path
     */
    public getAllureReportPath(): string {
        return SettingsManager.getAllureReportPath() || 'allure-results';
    }

    /**
     * Gets the JaCoCo report path
     * @returns The JaCoCo report path
     */
    public getJacocoReportPath(): string {
        return SettingsManager.getJacocoReportPath() || 'target/site/jacoco';
    }

    /**
     * HTML report format
     */
    public static readonly HTML_FORMAT: TestReportFormat = {
        name: 'HTML',
        extension: 'html',
        async generateReport(results: TestResult[]): Promise<string> {
            // Create a test summary
            const passed = results.filter(r => r.status === TestResultStatus.PASSED).length;
            const failed = results.filter(r => r.status === TestResultStatus.FAILED).length;
            const skipped = results.filter(r => r.status === TestResultStatus.SKIPPED).length;
            const error = results.filter(r => r.status === TestResultStatus.ERROR).length;
            const pending = results.filter(r => r.status === TestResultStatus.PENDING).length;
            
            const totalTests = results.length;
            const successRate = totalTests > 0 ? Math.round((passed / totalTests) * 100) : 0;
            
            // Get the duration
            const totalDuration = results.reduce((total, result) => total + result.duration, 0);
            
            // Format the duration
            const formatDuration = (ms: number): string => {
                const seconds = Math.floor(ms / 1000);
                const minutes = Math.floor(seconds / 60);
                const remainingSeconds = seconds % 60;
                return `${minutes}m ${remainingSeconds}s`;
            };
            
            // Generate the HTML for the results table
            const resultsTableRows = results.map(result => {
                const statusClass = 
                    result.status === TestResultStatus.PASSED ? 'passed' :
                    result.status === TestResultStatus.FAILED ? 'failed' :
                    result.status === TestResultStatus.ERROR ? 'error' :
                    result.status === TestResultStatus.SKIPPED ? 'skipped' : 'pending';
                
                return `
                <tr>
                    <td>${result.testCaseId}</td>
                    <td>${result.name}</td>
                    <td class="${statusClass}">${result.status}</td>
                    <td>${formatDuration(result.duration)}</td>
                    <td>${result.environment}</td>
                    <td>${result.errorMessage || ''}</td>
                </tr>
                `;
            }).join('');
            
            // Generate the HTML report
            return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Test Execution Report</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        margin: 0;
                        padding: 20px;
                        color: #333;
                    }
                    h1 {
                        color: #2c3e50;
                        border-bottom: 1px solid #eee;
                        padding-bottom: 10px;
                    }
                    .summary {
                        background-color: #f8f9fa;
                        border-radius: 4px;
                        padding: 15px;
                        margin-bottom: 20px;
                        display: flex;
                        flex-wrap: wrap;
                        gap: 15px;
                    }
                    .summary-item {
                        flex: 1;
                        min-width: 120px;
                        text-align: center;
                        padding: 10px;
                        border-radius: 4px;
                    }
                    .summary-item.total {
                        background-color: #3498db;
                        color: white;
                    }
                    .summary-item.passed {
                        background-color: #2ecc71;
                        color: white;
                    }
                    .summary-item.failed {
                        background-color: #e74c3c;
                        color: white;
                    }
                    .summary-item.skipped {
                        background-color: #f39c12;
                        color: white;
                    }
                    .summary-item.error {
                        background-color: #c0392b;
                        color: white;
                    }
                    .summary-item.pending {
                        background-color: #7f8c8d;
                        color: white;
                    }
                    .summary-item h2 {
                        margin: 0;
                        font-size: 24px;
                    }
                    .summary-item p {
                        margin: 5px 0 0;
                        font-size: 14px;
                    }
                    .results-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 20px;
                    }
                    .results-table th,
                    .results-table td {
                        padding: 10px 15px;
                        text-align: left;
                        border-bottom: 1px solid #ddd;
                    }
                    .results-table th {
                        background-color: #f2f2f2;
                        font-weight: bold;
                    }
                    .results-table tr:hover {
                        background-color: #f5f5f5;
                    }
                    .results-table td.passed {
                        color: #2ecc71;
                    }
                    .results-table td.failed {
                        color: #e74c3c;
                    }
                    .results-table td.error {
                        color: #c0392b;
                    }
                    .results-table td.skipped {
                        color: #f39c12;
                    }
                    .results-table td.pending {
                        color: #7f8c8d;
                    }
                    .timestamp {
                        color: #7f8c8d;
                        font-size: 14px;
                        margin-bottom: 20px;
                    }
                </style>
            </head>
            <body>
                <h1>Test Execution Report</h1>
                <div class="timestamp">
                    Generated on ${new Date().toLocaleString()}
                </div>
                
                <div class="summary">
                    <div class="summary-item total">
                        <h2>${totalTests}</h2>
                        <p>Total Tests</p>
                    </div>
                    <div class="summary-item passed">
                        <h2>${passed}</h2>
                        <p>Passed</p>
                    </div>
                    <div class="summary-item failed">
                        <h2>${failed}</h2>
                        <p>Failed</p>
                    </div>
                    <div class="summary-item skipped">
                        <h2>${skipped}</h2>
                        <p>Skipped</p>
                    </div>
                    <div class="summary-item error">
                        <h2>${error}</h2>
                        <p>Errors</p>
                    </div>
                    <div class="summary-item pending">
                        <h2>${pending}</h2>
                        <p>Pending</p>
                    </div>
                </div>
                
                <div class="execution-info">
                    <p><strong>Success Rate:</strong> ${successRate}%</p>
                    <p><strong>Total Duration:</strong> ${formatDuration(totalDuration)}</p>
                </div>
                
                <table class="results-table">
                    <thead>
                        <tr>
                            <th>Test Case ID</th>
                            <th>Name</th>
                            <th>Status</th>
                            <th>Duration</th>
                            <th>Environment</th>
                            <th>Error</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${resultsTableRows}
                    </tbody>
                </table>
            </body>
            </html>
            `;
        }
    };

    /**
     * JSON report format
     */
    public static readonly JSON_FORMAT: TestReportFormat = {
        name: 'JSON',
        extension: 'json',
        async generateReport(results: TestResult[]): Promise<string> {
            // Create a test summary
            const summary = {
                summary: {
                    totalTests: results.length,
                    passed: results.filter(r => r.status === TestResultStatus.PASSED).length,
                    failed: results.filter(r => r.status === TestResultStatus.FAILED).length,
                    skipped: results.filter(r => r.status === TestResultStatus.SKIPPED).length,
                    error: results.filter(r => r.status === TestResultStatus.ERROR).length,
                    pending: results.filter(r => r.status === TestResultStatus.PENDING).length,
                    duration: results.reduce((total, result) => total + result.duration, 0),
                    timestamp: new Date().toISOString()
                },
                results: results.map(result => ({
                    id: result.id,
                    testCaseId: result.testCaseId,
                    name: result.name,
                    status: result.status,
                    duration: result.duration,
                    startTime: result.startTime.toISOString(),
                    endTime: result.endTime.toISOString(),
                    environment: result.environment,
                    errorMessage: result.errorMessage,
                    stackTrace: result.stackTrace
                }))
            };
            
            return JSON.stringify(summary, null, 2);
        }
    };
}
