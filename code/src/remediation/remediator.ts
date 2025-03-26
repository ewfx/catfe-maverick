import * as vscode from 'vscode';
import * as path from 'path';
import { StatusBarManager } from '../core/statusBar';
import { FileManager } from '../fileSystem/fileManager';
import { AIController } from '../ai/controller';
import { ProjectAnalyzer } from '../fileSystem/projectAnalyzer';
import { TestResult, TestResultStatus } from '../testExecution/executor';

/**
 * Remediation suggestion type
 */
export enum RemediationType {
    CODE_FIX = 'code_fix',
    TEST_FIX = 'test_fix',
    CONFIG_FIX = 'config_fix',
    DEPENDENCY_FIX = 'dependency_fix',
    DOCUMENTATION = 'documentation'
}

/**
 * Remediation suggestion
 */
export interface RemediationSuggestion {
    id: string;
    title: string;
    description: string;
    type: RemediationType;
    fileLocation?: string;
    lineStart?: number;
    lineEnd?: number;
    originalCode?: string;
    suggestedCode?: string;
    confidence: number; // 0-100
    explanation: string;
    testResult: TestResult;
}

/**
 * Remediation result
 */
export interface RemediationResult {
    applied: boolean;
    suggestion: RemediationSuggestion;
    message?: string;
}

/**
 * Class for remediating test failures
 */
export class CodeRemediator {
    private static instance: CodeRemediator;
    private statusBarManager: StatusBarManager;
    private fileManager: FileManager;
    private aiController: AIController;
    private projectAnalyzer: ProjectAnalyzer;
    private suggestions: Map<string, RemediationSuggestion> = new Map();

    private constructor() {
        this.statusBarManager = StatusBarManager.getInstance();
        this.fileManager = FileManager.getInstance();
        this.aiController = AIController.getInstance();
        this.projectAnalyzer = ProjectAnalyzer.getInstance();
    }

    /**
     * Gets the singleton instance of the CodeRemediator
     * @returns The CodeRemediator instance
     */
    public static getInstance(): CodeRemediator {
        if (!CodeRemediator.instance) {
            CodeRemediator.instance = new CodeRemediator();
        }
        return CodeRemediator.instance;
    }

    /**
     * Generates remediation suggestions for a failed test
     * @param testResult The test result
     * @returns Promise resolving to an array of remediation suggestions
     */
    public async generateSuggestions(testResult: TestResult): Promise<RemediationSuggestion[]> {
        try {
            this.statusBarManager.showBusy(`Analyzing test failure: ${testResult.testCaseId}`);
            
            // Only analyze failed or error tests
            if (testResult.status !== TestResultStatus.FAILED && testResult.status !== TestResultStatus.ERROR) {
                return [];
            }
            
            // Analyze the test result
            const analysis = await this.analyzeFailure(testResult);
            
            // Generate suggestions
            const suggestions = await this.generateRemediationSuggestions(testResult, analysis);
            
            // Store the suggestions
            for (const suggestion of suggestions) {
                this.suggestions.set(suggestion.id, suggestion);
            }
            
            this.statusBarManager.showSuccess(`Generated ${suggestions.length} remediation suggestions`);
            
            return suggestions;
        } catch (error) {
            this.statusBarManager.showError(`Error generating remediation suggestions: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Generates remediation suggestions for multiple failed tests
     * @param testResults Array of failed test results
     * @returns Promise resolving to an array of remediation suggestions
     */
    public async generateRemediation(testResults: TestResult[]): Promise<any[]> {
        try {
            this.statusBarManager.showBusy(`Analyzing ${testResults.length} test failures...`);
            
            const remediationSuggestions = [];
            
            // Process each test result
            for (const testResult of testResults) {
                // Only analyze failed or error tests
                if (testResult.status !== TestResultStatus.FAILED && testResult.status !== TestResultStatus.ERROR) {
                    continue;
                }
                
                // Generate suggestions for this test
                const suggestions = await this.generateSuggestions(testResult);
                
                // Format for the UI
                const formattedSuggestions = suggestions.map(suggestion => ({
                    testName: testResult.name,
                    testId: testResult.id,
                    filePath: suggestion.fileLocation || 'N/A',
                    diff: this.formatDiff(suggestion.originalCode || '', suggestion.suggestedCode || ''),
                    explanation: suggestion.explanation,
                    confidence: suggestion.confidence,
                    suggestionId: suggestion.id
                }));
                
                remediationSuggestions.push(...formattedSuggestions);
            }
            
            this.statusBarManager.showSuccess(`Generated ${remediationSuggestions.length} remediation suggestions`);
            
            return remediationSuggestions;
        } catch (error) {
            this.statusBarManager.showError(`Error generating remediation suggestions: ${(error as Error).message}`);
            throw error;
        }
    }
    
    /**
     * Applies a remediation suggestion
     * @param suggestion The remediation suggestion object
     * @returns Promise resolving to boolean indicating success
     */
    public async applyRemediation(suggestion: any): Promise<boolean> {
        try {
            this.statusBarManager.showBusy(`Applying remediation...`);
            
            // Apply the suggestion using the suggestionId
            const result = await this.applySuggestion(suggestion.suggestionId);
            
            if (result.applied) {
                this.statusBarManager.showSuccess(`Applied remediation successfully`);
                return true;
            } else {
                this.statusBarManager.showError(`Failed to apply remediation: ${result.message}`);
                return false;
            }
        } catch (error) {
            this.statusBarManager.showError(`Error applying remediation: ${(error as Error).message}`);
            return false;
        }
    }
    
    /**
     * Formats a diff between original and suggested code
     * @param original Original code
     * @param suggested Suggested code
     * @returns Formatted diff string
     */
    private formatDiff(original: string, suggested: string): string {
        // Split into lines
        const originalLines = original.split('\n');
        const suggestedLines = suggested.split('\n');
        
        // Build diff
        let diff = '';
        
        // Add removed lines
        for (const line of originalLines) {
            diff += `- ${line}\n`;
        }
        
        // Add separator
        diff += '\n';
        
        // Add added lines
        for (const line of suggestedLines) {
            diff += `+ ${line}\n`;
        }
        
        return diff;
    }
    
    /**
     * Applies a remediation suggestion
     * @param suggestionId The suggestion ID
     * @returns Promise resolving to the remediation result
     */
    public async applySuggestion(suggestionId: string): Promise<RemediationResult> {
        try {
            this.statusBarManager.showBusy(`Applying remediation suggestion: ${suggestionId}`);
            
            // Get the suggestion
            const suggestion = this.suggestions.get(suggestionId);
            
            if (!suggestion) {
                throw new Error(`Suggestion not found: ${suggestionId}`);
            }
            
            // Check if the suggestion has code to apply
            if (!suggestion.fileLocation || !suggestion.suggestedCode) {
                return {
                    applied: false,
                    suggestion,
                    message: 'Suggestion does not have code to apply'
                };
            }
            
            // Check if the file exists
            if (!await this.fileManager.fileExists(suggestion.fileLocation)) {
                return {
                    applied: false,
                    suggestion,
                    message: `File not found: ${suggestion.fileLocation}`
                };
            }
            
            // Apply the suggestion
            await this.applyCodeFix(suggestion);
            
            this.statusBarManager.showSuccess(`Applied remediation suggestion: ${suggestionId}`);
            
            return {
                applied: true,
                suggestion,
                message: 'Suggestion applied successfully'
            };
        } catch (error) {
            this.statusBarManager.showError(`Error applying remediation suggestion: ${(error as Error).message}`);
            
            return {
                applied: false,
                suggestion: this.suggestions.get(suggestionId)!,
                message: `Error: ${(error as Error).message}`
            };
        }
    }

    /**
     * Gets all remediation suggestions
     * @returns Array of all remediation suggestions
     */
    public getAllSuggestions(): RemediationSuggestion[] {
        return Array.from(this.suggestions.values());
    }

    /**
     * Gets a remediation suggestion by ID
     * @param id The suggestion ID
     * @returns The remediation suggestion or undefined if not found
     */
    public getSuggestion(id: string): RemediationSuggestion | undefined {
        return this.suggestions.get(id);
    }

    /**
     * Clears all remediation suggestions
     */
    public clearSuggestions(): void {
        this.suggestions.clear();
    }

    /**
     * Analyzes a test failure
     * @param testResult The test result
     * @returns Promise resolving to the failure analysis
     */
    private async analyzeFailure(testResult: TestResult): Promise<any> {
        // Extract error messages and stack traces
        const errorMessage = testResult.errorMessage || '';
        const stackTrace = testResult.stackTrace || '';
        const output = testResult.output || '';
        
        // Combine the error information
        const errorInfo = `
        Test ID: ${testResult.testCaseId}
        Status: ${testResult.status}
        Error Message: ${errorMessage}
        Stack Trace: ${stackTrace}
        Output: ${output}
        `;
        
        // Use AI to analyze the failure
        const prompt = `
        Analyze the following test failure and identify potential root causes:
        
        ${errorInfo}
        
        Analyze the error message, stack trace, and test output to identify:
        1. The type of error (syntax error, assertion failure, exception, etc.)
        2. The likely location in the code where the error occurred
        3. The potential root causes of the failure
        4. What code might need to be fixed to resolve the issue
        
        Provide your analysis in structured format with the following sections:
        - Error Type
        - Error Location
        - Root Causes
        - Potential Fixes
        `;
        
        const response = await this.aiController.sendPrompt(
            prompt,
            'You are TestAutomationAgent, a VSCode plugin assistant for test automation. Analyze test failures and suggest remediation.'
        );
        
        // Parse the AI response
        return this.parseAnalysisResponse(response.text);
    }

    /**
     * Parses the analysis response from the AI
     * @param responseText The response text
     * @returns The parsed analysis
     */
    private parseAnalysisResponse(responseText: string): any {
        // Simple parsing for MVP
        const sections: {
            errorType: string;
            errorLocation: string;
            rootCauses: string[];
            potentialFixes: string[];
        } = {
            errorType: '',
            errorLocation: '',
            rootCauses: [],
            potentialFixes: []
        };
        
        // Extract each section
        const errorTypeMatch = responseText.match(/Error Type[:\s]+([\s\S]+?)(?=Error Location|Root Causes|Potential Fixes|$)/i);
        if (errorTypeMatch && errorTypeMatch[1]) {
            sections.errorType = errorTypeMatch[1].trim();
        }
        
        const errorLocationMatch = responseText.match(/Error Location[:\s]+([\s\S]+?)(?=Error Type|Root Causes|Potential Fixes|$)/i);
        if (errorLocationMatch && errorLocationMatch[1]) {
            sections.errorLocation = errorLocationMatch[1].trim();
        }
        
        const rootCausesMatch = responseText.match(/Root Causes[:\s]+([\s\S]+?)(?=Error Type|Error Location|Potential Fixes|$)/i);
        if (rootCausesMatch && rootCausesMatch[1]) {
            const rootCausesText = rootCausesMatch[1].trim();
            sections.rootCauses = rootCausesText
                .split(/\r?\n/)
                .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'))
                .map(line => line.trim().replace(/^[-*]\s*/, ''));
        }
        
        const potentialFixesMatch = responseText.match(/Potential Fixes[:\s]+([\s\S]+?)(?=Error Type|Error Location|Root Causes|$)/i);
        if (potentialFixesMatch && potentialFixesMatch[1]) {
            const potentialFixesText = potentialFixesMatch[1].trim();
            sections.potentialFixes = potentialFixesText
                .split(/\r?\n/)
                .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'))
                .map(line => line.trim().replace(/^[-*]\s*/, ''));
        }
        
        return sections;
    }

    /**
     * Generates remediation suggestions based on the analysis
     * @param testResult The test result
     * @param analysis The failure analysis
     * @returns Promise resolving to an array of remediation suggestions
     */
    private async generateRemediationSuggestions(
        testResult: TestResult,
        analysis: any
    ): Promise<RemediationSuggestion[]> {
        // Generate prompt for AI to create remediation suggestions
        const prompt = `
        Based on the following test failure analysis, generate specific remediation suggestions:
        
        Test ID: ${testResult.testCaseId}
        Status: ${testResult.status}
        Error Message: ${testResult.errorMessage || ''}
        
        Analysis:
        - Error Type: ${analysis.errorType}
        - Error Location: ${analysis.errorLocation}
        - Root Causes: ${analysis.rootCauses.join(', ')}
        
        For each potential fix, provide:
        1. A short title describing the fix
        2. A detailed description of what the fix does
        3. The exact file path that needs to be modified (if applicable)
        4. The line numbers that need to be changed (if applicable)
        5. The original code snippet (if applicable)
        6. The suggested replacement code (if applicable)
        7. An explanation of why this fix addresses the root cause
        8. A confidence score (0-100) indicating how likely this fix is to resolve the issue
        
        Each fix should be in a structured format that can be parsed programmatically.
        `;
        
        const response = await this.aiController.sendPrompt(
            prompt,
            'You are TestAutomationAgent, a VSCode plugin assistant for test automation. Generate specific remediation suggestions for test failures.'
        );
        
        // Extract suggestions from the response
        return this.extractSuggestionsFromResponse(response.text, testResult);
    }

    /**
     * Extracts remediation suggestions from the AI response
     * @param responseText The response text
     * @param testResult The test result
     * @returns Array of remediation suggestions
     */
    private extractSuggestionsFromResponse(
        responseText: string,
        testResult: TestResult
    ): RemediationSuggestion[] {
        const suggestions: RemediationSuggestion[] = [];
        
        // Look for suggestions in the format:
        // ### Suggestion 1: [Title]
        // or
        // ## Suggestion 1: [Title]
        // or
        // Suggestion 1: [Title]
        const suggestionBlocks = responseText.split(/(?:###|##|\n)\s*Suggestion\s+\d+:/i);
        
        // Skip the first block if it doesn't contain a suggestion
        const blocks = suggestionBlocks.slice(1).length > 0 ? suggestionBlocks.slice(1) : [suggestionBlocks[0]];
        
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i].trim();
            if (!block) continue;
            
            // Extract title (first line)
            const titleMatch = block.match(/^(.+?)(?=\n|$)/);
            const title = titleMatch ? titleMatch[1].trim() : `Suggestion ${i + 1}`;
            
            // Extract description
            const descriptionMatch = block.match(/(?:Description:?\s*)(.+?)(?=\n\s*File|File Path|Line|Original Code|Suggested Code|Explanation|Confidence|$)/is);
            const description = descriptionMatch ? descriptionMatch[1].trim() : '';
            
            // Extract file location
            const fileLocationMatch = block.match(/(?:File(?:\s*Path)?:?\s*)(.+?)(?=\n\s*Line|Original Code|Suggested Code|Explanation|Confidence|$)/is);
            const fileLocation = fileLocationMatch ? fileLocationMatch[1].trim() : undefined;
            
            // Extract line numbers
            const lineRangeMatch = block.match(/(?:Line(?:\s*Numbers?)?:?\s*)(\d+)(?:\s*-\s*(\d+))?/i);
            const lineStart = lineRangeMatch ? parseInt(lineRangeMatch[1], 10) : undefined;
            const lineEnd = lineRangeMatch && lineRangeMatch[2] ? parseInt(lineRangeMatch[2], 10) : lineStart;
            
            // Extract original code
            const originalCodeMatch = block.match(/(?:Original\s*Code:?\s*)(```[\s\S]*?```|`[\s\S]*?`)/i);
            let originalCode = undefined;
            if (originalCodeMatch) {
                originalCode = originalCodeMatch[1].replace(/^```[\w]*\n?|```$|^`|`$/g, '').trim();
            }
            
            // Extract suggested code
            const suggestedCodeMatch = block.match(/(?:Suggested\s*Code:?\s*)(```[\s\S]*?```|`[\s\S]*?`)/i);
            let suggestedCode = undefined;
            if (suggestedCodeMatch) {
                suggestedCode = suggestedCodeMatch[1].replace(/^```[\w]*\n?|```$|^`|`$/g, '').trim();
            }
            
            // Extract explanation
            const explanationMatch = block.match(/(?:Explanation:?\s*)(.+?)(?=\n\s*Confidence|$)/is);
            const explanation = explanationMatch ? explanationMatch[1].trim() : '';
            
            // Extract confidence
            const confidenceMatch = block.match(/(?:Confidence:?\s*)(\d+)/i);
            const confidence = confidenceMatch ? parseInt(confidenceMatch[1], 10) : 50;
            
            // Determine remediation type
            let type = RemediationType.CODE_FIX;
            if (block.toLowerCase().includes('test') && block.toLowerCase().includes('fix')) {
                type = RemediationType.TEST_FIX;
            } else if (block.toLowerCase().includes('config') || block.toLowerCase().includes('configuration')) {
                type = RemediationType.CONFIG_FIX;
            } else if (block.toLowerCase().includes('dependency') || block.toLowerCase().includes('package')) {
                type = RemediationType.DEPENDENCY_FIX;
            } else if (!suggestedCode && !fileLocation) {
                type = RemediationType.DOCUMENTATION;
            }
            
            // Create suggestion
            const suggestion: RemediationSuggestion = {
                id: `suggestion-${Date.now()}-${i}`,
                title,
                description,
                type,
                fileLocation,
                lineStart,
                lineEnd,
                originalCode,
                suggestedCode,
                confidence,
                explanation,
                testResult
            };
            
            suggestions.push(suggestion);
        }
        
        return suggestions;
    }

    /**
     * Applies a code fix suggestion
     * @param suggestion The remediation suggestion
     * @returns Promise resolving when the fix is applied
     */
    private async applyCodeFix(suggestion: RemediationSuggestion): Promise<void> {
        // Get the file content
        const fileContent = await this.fileManager.readFile(suggestion.fileLocation!);
        
        // If we have line numbers, use them to replace the code
        if (suggestion.lineStart !== undefined && suggestion.lineEnd !== undefined) {
            const lines = fileContent.split(/\r?\n/);
            
            // Validate line numbers
            if (suggestion.lineStart < 1 || suggestion.lineEnd > lines.length) {
                throw new Error(`Invalid line numbers: ${suggestion.lineStart}-${suggestion.lineEnd}`);
            }
            
            // Replace the lines
            const newLines = [...lines];
            const linesToReplace = newLines.slice(suggestion.lineStart - 1, suggestion.lineEnd);
            const originalCode = linesToReplace.join('\n');
            
            // Verify the original code if provided
            if (suggestion.originalCode && originalCode.trim() !== suggestion.originalCode.trim()) {
                // Try to find the original code in the file
                const originalCodeIndex = fileContent.indexOf(suggestion.originalCode);
                
                if (originalCodeIndex === -1) {
                    throw new Error('Original code does not match the file content');
                } else {
                    // Calculate line numbers based on the found code
                    const beforeCode = fileContent.substring(0, originalCodeIndex);
                    const linesBefore = beforeCode.split(/\r?\n/).length;
                    const originalLines = suggestion.originalCode.split(/\r?\n/).length;
                    
                    // Update line numbers
                    suggestion.lineStart = linesBefore;
                    suggestion.lineEnd = linesBefore + originalLines - 1;
                    
                    // Update lines to replace
                    const updatedLinesToReplace = newLines.slice(suggestion.lineStart - 1, suggestion.lineEnd);
                    const updatedOriginalCode = updatedLinesToReplace.join('\n');
                    
                    // Final verification
                    if (updatedOriginalCode.trim() !== suggestion.originalCode.trim()) {
                        throw new Error('Could not locate the exact code to replace');
                    }
                }
            }
            
            // Perform the replacement
            newLines.splice(
                suggestion.lineStart - 1,
                suggestion.lineEnd - suggestion.lineStart + 1,
                suggestion.suggestedCode!
            );
            
            // Write the updated content back to the file
            const newContent = newLines.join('\n');
            await this.fileManager.writeFile(suggestion.fileLocation!, newContent);
        } else if (suggestion.originalCode && suggestion.suggestedCode) {
            // No line numbers, but we have original and suggested code
            // Replace all occurrences (might be dangerous)
            const newContent = fileContent.replace(
                new RegExp(this.escapeRegExp(suggestion.originalCode), 'g'),
                suggestion.suggestedCode
            );
            
            // Write the updated content back to the file
            await this.fileManager.writeFile(suggestion.fileLocation!, newContent);
        } else {
            throw new Error('Insufficient information to apply the fix');
        }
    }

    /**
     * Escapes special characters in a string for use in a regular expression
     * @param string The string to escape
     * @returns The escaped string
     */
    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
