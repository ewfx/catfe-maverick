import * as vscode from 'vscode';
import { SettingsManager } from '../core/settings';

/**
 * Risk level of a command
 */
export enum CommandRiskLevel {
    SAFE = 'safe',
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical'
}

/**
 * Command security analysis result
 */
export interface CommandSecurityAnalysis {
    command: string;
    riskLevel: CommandRiskLevel;
    risks: string[];
    requiresApproval: boolean;
    isSandboxed: boolean;
    allowedEnvironments?: string[];
}

/**
 * Command security policy
 */
export interface CommandSecurityPolicy {
    allowedPatterns?: string[];
    blockedPatterns?: string[];
    requireApprovalPatterns?: string[];
    sandboxRequiredPatterns?: string[];
    environmentRestrictedPatterns?: Record<string, string[]>;
}

/**
 * Class for handling command execution safety
 */
export class SafetyProtocols {
    private static instance: SafetyProtocols;
    private securityPolicy: CommandSecurityPolicy;

    private constructor() {
        // Initialize with default security policy
        this.securityPolicy = this.getDefaultSecurityPolicy();
        
        // TODO: Load custom security policy from settings if available
    }

    /**
     * Gets the singleton instance of the SafetyProtocols
     * @returns The SafetyProtocols instance
     */
    public static getInstance(): SafetyProtocols {
        if (!SafetyProtocols.instance) {
            SafetyProtocols.instance = new SafetyProtocols();
        }
        return SafetyProtocols.instance;
    }

    /**
     * Analyzes a command for security risks
     * @param command The command to analyze
     * @returns Command security analysis
     */
    public analyzeCommand(command: string): CommandSecurityAnalysis {
        const risks: string[] = [];
        let riskLevel = CommandRiskLevel.SAFE;
        let requiresApproval = false;
        let isSandboxed = false;
        let allowedEnvironments: string[] | undefined;

        // Check against blocked patterns
        if (this.securityPolicy.blockedPatterns) {
            for (const pattern of this.securityPolicy.blockedPatterns) {
                if (new RegExp(pattern).test(command)) {
                    risks.push(`Command contains blocked pattern: ${pattern}`);
                    riskLevel = CommandRiskLevel.CRITICAL;
                    requiresApproval = true;
                }
            }
        }

        // Check against approval-required patterns
        if (this.securityPolicy.requireApprovalPatterns) {
            for (const pattern of this.securityPolicy.requireApprovalPatterns) {
                if (new RegExp(pattern).test(command)) {
                    risks.push(`Command requires approval: ${pattern}`);
                    riskLevel = this.upgradeRiskLevel(riskLevel, CommandRiskLevel.MEDIUM);
                    requiresApproval = true;
                }
            }
        }

        // Check against sandbox-required patterns
        if (this.securityPolicy.sandboxRequiredPatterns) {
            for (const pattern of this.securityPolicy.sandboxRequiredPatterns) {
                if (new RegExp(pattern).test(command)) {
                    risks.push(`Command requires sandboxing: ${pattern}`);
                    riskLevel = this.upgradeRiskLevel(riskLevel, CommandRiskLevel.MEDIUM);
                    isSandboxed = true;
                }
            }
        }

        // Check environment-restricted patterns
        if (this.securityPolicy.environmentRestrictedPatterns) {
            for (const [env, patterns] of Object.entries(this.securityPolicy.environmentRestrictedPatterns)) {
                for (const pattern of patterns) {
                    if (new RegExp(pattern).test(command)) {
                        risks.push(`Command restricted to ${env} environment: ${pattern}`);
                        riskLevel = this.upgradeRiskLevel(riskLevel, CommandRiskLevel.MEDIUM);
                        
                        if (!allowedEnvironments) {
                            allowedEnvironments = [];
                        }
                        allowedEnvironments.push(env);
                    }
                }
            }
        }

        // Apply additional risk analysis based on command content
        if (command.includes('rm ') || command.includes('del ') || command.includes('rmdir ')) {
            risks.push('Command may delete files or directories');
            riskLevel = this.upgradeRiskLevel(riskLevel, CommandRiskLevel.HIGH);
            requiresApproval = true;
        }

        if (command.includes('sudo ') || command.includes('su ')) {
            risks.push('Command attempts to elevate privileges');
            riskLevel = this.upgradeRiskLevel(riskLevel, CommandRiskLevel.HIGH);
            requiresApproval = true;
        }

        if (command.includes('curl ') && (command.includes('| sh') || command.includes('| bash'))) {
            risks.push('Command downloads and executes scripts directly');
            riskLevel = this.upgradeRiskLevel(riskLevel, CommandRiskLevel.HIGH);
            requiresApproval = true;
            isSandboxed = true;
        }

        if (command.includes('chmod ') && command.includes('777')) {
            risks.push('Command changes permissions to world-writable');
            riskLevel = this.upgradeRiskLevel(riskLevel, CommandRiskLevel.MEDIUM);
            requiresApproval = true;
        }

        // If the command has no risks identified, mark it as safe
        if (risks.length === 0) {
            riskLevel = CommandRiskLevel.SAFE;
            requiresApproval = SettingsManager.isApprovalRequired(); // Use global setting
        }

        return {
            command,
            riskLevel,
            risks,
            requiresApproval,
            isSandboxed,
            allowedEnvironments
        };
    }

    /**
     * Checks if a command is allowed to run
     * @param command The command to check
     * @returns Boolean indicating if the command is allowed
     */
    public isCommandAllowed(command: string): boolean {
        // Check against blocked patterns
        if (this.securityPolicy.blockedPatterns) {
            for (const pattern of this.securityPolicy.blockedPatterns) {
                if (new RegExp(pattern).test(command)) {
                    return false;
                }
            }
        }

        // Check if only allowed patterns are enabled and command matches one
        if (this.securityPolicy.allowedPatterns && this.securityPolicy.allowedPatterns.length > 0) {
            return this.securityPolicy.allowedPatterns.some(pattern => 
                new RegExp(pattern).test(command)
            );
        }

        // By default, allow commands not explicitly blocked
        return true;
    }

    /**
     * Requests user approval for a command
     * @param command The command to approve
     * @param risks List of identified risks
     * @returns Promise resolving to a boolean indicating if the command was approved
     */
    public async requestApproval(command: string, risks: string[]): Promise<boolean> {
        const formattedRisks = risks.map(risk => `• ${risk}`).join('\n');
        const message = `The command "${command}" has potential risks:\n\n${formattedRisks}\n\nDo you want to proceed?`;
        
        const response = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            'Approve',
            'Reject'
        );
        
        return response === 'Approve';
    }

    /**
     * Updates the security policy
     * @param policy The new security policy
     */
    public updateSecurityPolicy(policy: CommandSecurityPolicy): void {
        this.securityPolicy = {
            ...this.getDefaultSecurityPolicy(),
            ...policy
        };
    }

    /**
     * Gets the default security policy
     * @returns The default security policy
     */
    private getDefaultSecurityPolicy(): CommandSecurityPolicy {
        return {
            blockedPatterns: [
                "rm\\s+-rf\\s+/", // Delete root directory
                "rm\\s+-rf\\s+~", // Delete home directory
                "dd\\s+.+of=/dev/sd[a-z]", // Overwrite disk
                ":(){:\\|:&};:", // Fork bomb
                "mkfs", // Format filesystem
                "wget\\s+.+\\s+\\|\\s+bash", // Download and execute script
                "curl\\s+.+\\s+\\|\\s+bash", // Download and execute script
            ],
            requireApprovalPatterns: [
                "rm\\s+-\\w*[rf]\\w*", // Remove files recursively or force
                "rmdir", // Remove directory
                "sudo", // Sudo commands
                "su\\s", // Switch user
                "chmod", // Change permissions
                "chown", // Change ownership
                "mv\\s+.+\\s+/", // Move to root
                "\\|\\s*bash", // Pipe to bash
                "\\|\\s*sh", // Pipe to sh
                ">\\s*/etc/", // Write to system config
                "npm\\s+(?:i|install)\\s+-g", // Global npm install
                "pip\\s+install\\s+--system", // System pip install
            ],
            sandboxRequiredPatterns: [
                "curl", // Download from internet
                "wget", // Download from internet
                "npm\\s+(?:i|install)", // Install npm packages
                "pip\\s+install", // Install pip packages
                "yarn\\s+add", // Add yarn packages
            ],
            environmentRestrictedPatterns: {
                dev: [
                    "npm\\s+run\\s+dev",
                    "npm\\s+start",
                    "yarn\\s+dev",
                    "yarn\\s+start"
                ],
                test: [
                    "npm\\s+test",
                    "yarn\\s+test",
                    "jest",
                    "mocha",
                    "pytest"
                ],
                prod: [
                    "npm\\s+run\\s+build",
                    "yarn\\s+build",
                    "docker\\s+push",
                    "deploy"
                ]
            }
        };
    }

    /**
     * Upgrades the risk level if the new level is higher
     * @param currentLevel Current risk level
     * @param newLevel New risk level
     * @returns The higher risk level
     */
    private upgradeRiskLevel(currentLevel: CommandRiskLevel, newLevel: CommandRiskLevel): CommandRiskLevel {
        const levelOrder = [
            CommandRiskLevel.SAFE,
            CommandRiskLevel.LOW,
            CommandRiskLevel.MEDIUM,
            CommandRiskLevel.HIGH,
            CommandRiskLevel.CRITICAL
        ];
        
        const currentIndex = levelOrder.indexOf(currentLevel);
        const newIndex = levelOrder.indexOf(newLevel);
        
        return levelOrder[Math.max(currentIndex, newIndex)];
    }
}
