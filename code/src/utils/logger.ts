import * as vscode from 'vscode';

/**
 * Logger utility class for TestAutomationAgent extension
 * Provides logging functionality to VSCode output channel
 */
export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;
    
    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('TestAutomationAgent');
    }
    
    /**
     * Gets the singleton instance of Logger
     */
    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    
    /**
     * Log an info message
     * @param message The message to log
     */
    public info(message: string): void {
        this.log(`INFO: ${message}`);
    }
    
    /**
     * Log a debug message
     * @param message The message to log
     */
    public debug(message: string): void {
        this.log(`DEBUG: ${message}`);
    }
    
    /**
     * Log a warning message
     * @param message The message to log
     */
    public warn(message: string): void {
        this.log(`WARNING: ${message}`);
    }
    
    /**
     * Log an error message
     * @param message The message to log
     * @param error Optional error object
     */
    public error(message: string, error?: any): void {
        this.log(`ERROR: ${message}`);
        if (error) {
            if (error instanceof Error) {
                this.log(`${error.name}: ${error.message}`);
                this.log(`Stack trace: ${error.stack}`);
            } else {
                this.log(`Additional error info: ${JSON.stringify(error)}`);
            }
        }
    }
    
    /**
     * Show the output channel and bring it to focus
     */
    public show(): void {
        this.outputChannel.show();
    }
    
    /**
     * Clear the output channel
     */
    public clear(): void {
        this.outputChannel.clear();
    }
    
    /**
     * Internal log method that adds timestamps
     * @param message The message to log
     */
    private log(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }
}

// Export a singleton instance for easier imports
export const logger = Logger.getInstance();
