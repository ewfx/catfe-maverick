import * as vscode from 'vscode';
import { logger } from '../utils/logger';

/**
 * Terminal output type
 */
export enum OutputType {
    STDOUT = 'stdout',
    STDERR = 'stderr',
    COMBINED = 'combined'
}

/**
 * Terminal output segment
 */
export interface OutputSegment {
    type: OutputType;
    text: string;
    timestamp: Date;
}

/**
 * Terminal execution result
 */
export interface ExecutionResult {
    command: string;
    output: OutputSegment[];
    exitCode?: number;
    duration: number;
    startTime: Date;
    endTime: Date;
    success: boolean;
}

/**
 * Class for analyzing terminal output
 */
export class OutputAnalyzer {
    private static instance: OutputAnalyzer;
    private executionResults: Map<string, ExecutionResult> = new Map();
    private activeProcesses: Map<string, {
        command: string;
        startTime: Date;
        output: OutputSegment[];
    }> = new Map();

    private constructor() {
        // Private constructor for singleton pattern
    }

    /**
     * Gets the singleton instance of the OutputAnalyzer
     * @returns The OutputAnalyzer instance
     */
    public static getInstance(): OutputAnalyzer {
        if (!OutputAnalyzer.instance) {
            OutputAnalyzer.instance = new OutputAnalyzer();
        }
        return OutputAnalyzer.instance;
    }

    /**
     * Starts tracking a new command execution
     * @param terminalId The terminal ID
     * @param command The command being executed
     */
    public startCommandTracking(terminalId: string, command: string): void {
        logger.info(`Starting command tracking for terminal ${terminalId}: ${command}`);
        this.activeProcesses.set(terminalId, {
            command,
            startTime: new Date(),
            output: []
        });
        logger.debug(`Command tracking started for terminal ${terminalId}`);
    }

    /**
     * Adds an output segment to a tracked command
     * @param terminalId The terminal ID
     * @param type Output type
     * @param text Output text
     */
    public addOutput(terminalId: string, type: OutputType, text: string): void {
        logger.debug(`Adding output for terminal ${terminalId}, type: ${type}`);
        const process = this.activeProcesses.get(terminalId);
        
        if (process) {
            process.output.push({
                type,
                text,
                timestamp: new Date()
            });
            logger.debug(`Added ${text.length} characters of ${type} output`);
        } else {
            logger.warn(`Attempted to add output for unknown terminal: ${terminalId}`);
        }
    }

    /**
     * Ends tracking for a command
     * @param terminalId The terminal ID
     * @param exitCode The exit code (0 for success)
     * @returns The execution result
     */
    public endCommandTracking(terminalId: string, exitCode: number = 0): ExecutionResult | undefined {
        logger.info(`Ending command tracking for terminal ${terminalId} with exit code ${exitCode}`);
        const process = this.activeProcesses.get(terminalId);
        
        if (!process) {
            logger.warn(`Attempted to end tracking for unknown terminal: ${terminalId}`);
            return undefined;
        }
        
        const endTime = new Date();
        const duration = endTime.getTime() - process.startTime.getTime();
        
        const result: ExecutionResult = {
            command: process.command,
            output: process.output,
            exitCode,
            duration,
            startTime: process.startTime,
            endTime,
            success: exitCode === 0
        };
        
        logger.info(`Command ${process.command} completed in ${duration}ms with ${process.output.length} output segments`);
        logger.debug(`Command ${exitCode === 0 ? 'succeeded' : 'failed'} with exit code ${exitCode}`);
        
        // Store the result for later retrieval
        this.executionResults.set(terminalId, result);
        
        // Remove from active processes
        this.activeProcesses.delete(terminalId);
        
        return result;
    }

    /**
     * Gets the execution result for a terminal
     * @param terminalId The terminal ID
     * @returns The execution result or undefined if not found
     */
    public getExecutionResult(terminalId: string): ExecutionResult | undefined {
        return this.executionResults.get(terminalId);
    }

    /**
     * Gets all execution results
     * @returns Map of terminal IDs to execution results
     */
    public getAllExecutionResults(): Map<string, ExecutionResult> {
        return new Map(this.executionResults);
    }

    /**
     * Analyzes output for errors
     * @param output The output to analyze
     * @returns Array of detected errors
     */
    public analyzeForErrors(output: OutputSegment[]): string[] {
        logger.info(`Analyzing ${output.length} output segments for errors`);
        const errors: string[] = [];
        
        // Common error patterns to look for
        const errorPatterns = [
            /error:/i,
            /exception:/i,
            /fail/i,
            /fatal/i,
            /cannot\s+find/i,
            /not\s+found/i,
            /undefined/i,
            /syntax\s+error/i,
            /invalid/i,
            /unable\s+to/i,
            /command\s+not\s+found/i
        ];
        
        logger.debug(`Using ${errorPatterns.length} error patterns for analysis`);
        
        // Look for error patterns in stderr and stdout
        for (const segment of output) {
            if (segment.type === OutputType.STDERR) {
                // Extract lines from stderr
                const lines = segment.text.split('\n');
                logger.debug(`Analyzing ${lines.length} lines from stderr output`);
                
                for (const line of lines) {
                    if (line.trim()) {
                        // Add all non-empty stderr lines as potential errors
                        errors.push(line.trim());
                    }
                }
            } else if (segment.type === OutputType.STDOUT) {
                // Check stdout for error patterns
                const lines = segment.text.split('\n');
                logger.debug(`Analyzing ${lines.length} lines from stdout output`);
                
                for (const line of lines) {
                    if (errorPatterns.some(pattern => pattern.test(line))) {
                        logger.debug(`Found error pattern match: ${line.trim()}`);
                        errors.push(line.trim());
                    }
                }
            }
        }
        
        logger.info(`Found ${errors.length} potential errors in output`);
        return errors;
    }

    /**
     * Extracts structured data from command output
     * @param output The output to analyze
     * @returns Structured data extracted from the output
     */
    public extractStructuredData(output: OutputSegment[]): any {
        // Combined output text
        const combinedText = output
            .filter(segment => segment.type !== OutputType.STDERR)
            .map(segment => segment.text)
            .join('\n');
        
        // Try to extract JSON data
        const jsonResults = this.extractJson(combinedText);
        if (jsonResults.length > 0) {
            return jsonResults.length === 1 ? jsonResults[0] : jsonResults;
        }
        
        // Try to extract tabular data
        const tableResults = this.extractTable(combinedText);
        if (tableResults.length > 0) {
            return tableResults;
        }
        
        // Try to extract key-value pairs
        const keyValueResults = this.extractKeyValuePairs(combinedText);
        if (Object.keys(keyValueResults).length > 0) {
            return keyValueResults;
        }
        
        // If no structured data found, return the raw text
        return { rawOutput: combinedText };
    }

    /**
     * Extracts JSON objects from text
     * @param text The text to analyze
     * @returns Array of parsed JSON objects
     */
    private extractJson(text: string): any[] {
        const results: any[] = [];
        
        // Try to find JSON objects in the text
        const jsonRegex = /\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}/g;
        const matches = text.match(jsonRegex);
        
        if (matches) {
            for (const match of matches) {
                try {
                    const parsed = JSON.parse(match);
                    results.push(parsed);
                } catch (error) {
                    // Not valid JSON, ignore
                }
            }
        }
        
        return results;
    }

    /**
     * Extracts tabular data from text
     * @param text The text to analyze
     * @returns Array of rows, each containing an array of columns
     */
    private extractTable(text: string): any[] {
        const lines = text.split('\n');
        const rows: any[] = [];
        
        // Skip empty lines
        const nonEmptyLines = lines.filter(line => line.trim().length > 0);
        
        if (nonEmptyLines.length < 2) {
            // Need at least a header and one row
            return [];
        }
        
        // Check if the table has consistent delimiters
        const delimiters = ['\t', '|', ',', '  '];
        let bestDelimiter = '';
        let maxColumns = 0;
        
        for (const delimiter of delimiters) {
            const columns = nonEmptyLines[0].split(delimiter).filter(col => col.trim().length > 0);
            
            if (columns.length > maxColumns) {
                maxColumns = columns.length;
                bestDelimiter = delimiter;
            }
        }
        
        if (maxColumns < 2) {
            // Need at least two columns for a table
            return [];
        }
        
        // Parse the header
        const header = nonEmptyLines[0].split(bestDelimiter)
            .map(col => col.trim())
            .filter(col => col.length > 0);
        
        // Parse the rows
        for (let i = 1; i < nonEmptyLines.length; i++) {
            const columns = nonEmptyLines[i].split(bestDelimiter)
                .map(col => col.trim())
                .filter(col => col.length > 0);
            
            if (columns.length >= 2) {
                const row: Record<string, string> = {};
                
                for (let j = 0; j < Math.min(header.length, columns.length); j++) {
                    row[header[j]] = columns[j];
                }
                
                rows.push(row);
            }
        }
        
        return rows;
    }

    /**
     * Analyzes command output and returns a structured result
     * @param command The command that was executed
     * @param output The output to analyze
     * @returns Structured analysis of the command output
     */
    public analyzeOutput(command: string, output: string): any {
        logger.info(`Analyzing output for command: ${command}`);
        logger.debug(`Output length: ${output.length} characters`);
        
        // Create a synthetic output segment
        const outputSegment: OutputSegment = {
            type: OutputType.COMBINED,
            text: output,
            timestamp: new Date()
        };
        
        // Create an array with the output segment
        const segments = [outputSegment];
        
        // Get any errors in the output
        logger.debug('Checking for errors in output');
        const errors = this.analyzeForErrors(segments);
        
        // Extract structured data
        logger.debug('Extracting structured data from output');
        const structuredData = this.extractStructuredData(segments);
        
        // Determine success based on errors
        const success = errors.length === 0;
        logger.info(`Analysis complete: Command ${success ? 'succeeded' : 'failed'} with ${errors.length} errors`);
        
        // Return the analysis result
        return {
            command,
            success,
            errors,
            data: structuredData,
            timestamp: new Date()
        };
    }
    
    /**
     * Extracts key-value pairs from text
     * @param text The text to analyze
     * @returns Object containing extracted key-value pairs
     */
    private extractKeyValuePairs(text: string): Record<string, string> {
        const lines = text.split('\n');
        const result: Record<string, string> = {};
        
        // Common key-value patterns
        const patterns = [
            /^([^:]+):\s*(.+)$/,      // key: value
            /^([^=]+)=\s*(.+)$/,      // key=value
            /^([^-]+)\s+-\s+(.+)$/    // key - value
        ];
        
        for (const line of lines) {
            for (const pattern of patterns) {
                const match = line.match(pattern);
                
                if (match) {
                    const key = match[1].trim();
                    const value = match[2].trim();
                    
                    if (key && value) {
                        result[key] = value;
                    }
                    
                    break;
                }
            }
        }
        
        return result;
    }
}
