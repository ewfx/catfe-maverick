import * as vscode from 'vscode';
import { SettingsManager } from '../core/settings';
import { OutputAnalyzer } from './outputAnalyzer';
import { logger } from '../utils/logger';

/**
 * Command execution options
 */
export interface CommandExecutionOptions {
    cwd?: string;
    env?: Record<string, string>;
    shellPath?: string;
    shellArgs?: string[];
    name?: string;
    requireApproval?: boolean;
}

/**
 * Command execution result
 */
export interface CommandExecutionResult {
    success: boolean;
    output?: string;
    error?: Error;
}

/**
 * Manager for executing terminal commands
 */
export class CommandExecutor {
    private static instance: CommandExecutor;
    private terminals: Map<string, vscode.Terminal> = new Map();

    private constructor() {
        // Private constructor for singleton pattern
    }

    /**
     * Gets the singleton instance of the CommandExecutor
     * @returns The CommandExecutor instance
     */
    public static getInstance(): CommandExecutor {
        if (!CommandExecutor.instance) {
            CommandExecutor.instance = new CommandExecutor();
        }
        return CommandExecutor.instance;
    }

    /**
     * Executes a command in the terminal
     * @param command The command to execute
     * @param options Execution options
     * @returns Promise resolving when the command is executed
     */
    public async executeCommand(command: string, options: CommandExecutionOptions = {}): Promise<void> {
        try {
            logger.info(`Executing command: ${command}`);
            logger.debug(`Command options: ${JSON.stringify({
                cwd: options.cwd,
                name: options.name,
                requireApproval: options.requireApproval
            })}`);
            
            // Check if approval is required
            if (options.requireApproval === undefined) {
                options.requireApproval = this.isApprovalRequired(command);
                logger.debug(`Determined approval requirement: ${options.requireApproval}`);
            }
            
            if (options.requireApproval) {
                logger.info(`Requesting user approval for command: ${command}`);
                const approved = await this.requestApproval(command);
                
                if (!approved) {
                    logger.warn(`Command execution was not approved by the user: ${command}`);
                    throw new Error('Command execution was not approved by the user');
                }
                
                logger.info('Command approved by user');
            }
            
            // Create terminal
            const terminalName = options.name || `TestAutomationAgent: ${command.substring(0, 30)}${command.length > 30 ? '...' : ''}`;
            logger.debug(`Creating terminal: ${terminalName}`);
            const terminal = vscode.window.createTerminal({
                name: terminalName,
                cwd: options.cwd,
                env: options.env,
                shellPath: options.shellPath,
                shellArgs: options.shellArgs
            });
            
            // Store terminal for later reference
            this.terminals.set(terminalName, terminal);
            logger.debug(`Stored terminal reference with name: ${terminalName}`);
            
            // Show terminal
            terminal.show();
            logger.debug('Terminal shown');
            
            // Execute command
            terminal.sendText(command);
            logger.info(`Command sent to terminal: ${command}`);
        } catch (error) {
            logger.error(`Error executing command: ${command}`, error);
            vscode.window.showErrorMessage(`Error executing command: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Requests approval from the user to execute a command
     * @param command The command to execute
     * @returns Promise resolving to a boolean indicating if the command was approved
     */
    private async requestApproval(command: string): Promise<boolean> {
        const result = await vscode.window.showWarningMessage(
            `The extension wants to execute the following command:\n${command}`,
            { modal: true },
            'Approve',
            'Reject'
        );
        
        return result === 'Approve';
    }

    /**
     * Checks if approval is required for a command
     * @param command The command to check
     * @returns Boolean indicating if approval is required
     */
    private isApprovalRequired(command: string): boolean {
        // Get the global approval setting
        const globalRequireApproval = SettingsManager.isApprovalRequired();
        logger.debug(`Global approval setting: ${globalRequireApproval}`);
        
        // Always require approval for potentially dangerous commands
        if (this.isPotentiallyDangerousCommand(command)) {
            logger.info(`Command identified as potentially dangerous, requiring approval: ${command}`);
            return true;
        }
        
        logger.debug(`Using global approval setting for command: ${globalRequireApproval}`);
        return globalRequireApproval;
    }
    
    /**
     * Checks if a command is potentially dangerous
     * @param command The command to check
     * @returns Boolean indicating if the command is potentially dangerous
     */
    private isPotentiallyDangerousCommand(command: string): boolean {
        logger.debug(`Checking if command is potentially dangerous: ${command}`);
        
        // List of potentially dangerous commands or patterns
        const dangerousPatterns = [
            /\brm\s+(-r|-f|--force)/i,      // Remove with force/recursive flags
            /\bmv\s+.*\s+\//i,              // Move to root directory
            /\bchmod\s+.*777/i,             // Change permissions to 777
            /\bsudo\b/i,                    // Sudo commands
            /\bnetwork\b.*\bconfig\b/i,     // Network configuration
            /\biptables\b/i,                // Firewall rules
            /\bdd\b/i,                      // Disk operations
            /\bformat\b/i,                  // Disk formatting
            /\bwipe\b/i,                    // Disk wiping
            /\bcurl\s+.*\s+\|\s+bash/i      // Piping curl to bash
        ];
        
        // Check if command matches any dangerous pattern
        const isDangerous = dangerousPatterns.some(pattern => pattern.test(command));
        
        if (isDangerous) {
            logger.warn(`Command identified as potentially dangerous: ${command}`);
        }
        
        return isDangerous;
    }
    
    /**
     * Checks if a command is safe to execute
     * @param command The command to check
     * @returns Promise resolving to boolean indicating if the command is safe
     */
    public async isSafeCommand(command: string): Promise<boolean> {
        logger.info(`Checking if command is safe: ${command}`);
        
        // Check if command is potentially dangerous
        if (this.isPotentiallyDangerousCommand(command)) {
            logger.warn(`Command is potentially dangerous: ${command}`);
            return false;
        }
        
        // Get allowed commands from settings
        const allowedCommands = SettingsManager.getAllowedCommands();
        logger.debug(`Allowed commands from settings: ${JSON.stringify(allowedCommands)}`);
        
        // If we have an allowlist of commands
        if (allowedCommands && allowedCommands.length > 0) {
            // Check if command is in allowed list or starts with an allowed prefix
            const isAllowed = allowedCommands.some((allowedCmd: string) => 
                command === allowedCmd || 
                command.startsWith(`${allowedCmd} `)
            );
            
            logger.debug(`Command ${isAllowed ? 'is' : 'is not'} in allowed list: ${command}`);
            return isAllowed;
        }
        
        // If no allowlist is defined, consider non-dangerous commands safe
        logger.debug(`No allowlist defined, command is considered safe: ${command}`);
        return true;
    }
    
    /**
     * Gets the output analyzer for terminal output analysis
     * @returns The OutputAnalyzer instance or undefined if not available
     */
    public getOutputAnalyzer(): OutputAnalyzer | undefined {
        try {
            // Return the OutputAnalyzer instance
            return OutputAnalyzer.getInstance();
        } catch (error) {
            console.error('Error getting OutputAnalyzer:', error);
            return undefined;
        }
    }
    
    /**
     * Disposes all terminals
     */
    public disposeTerminals(): void {
        logger.info(`Disposing ${this.terminals.size} terminals`);
        
        this.terminals.forEach((terminal, name) => {
            logger.debug(`Disposing terminal: ${name}`);
            terminal.dispose();
        });
        
        this.terminals.clear();
        logger.debug('All terminals disposed and references cleared');
    }
}
