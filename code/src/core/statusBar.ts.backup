import * as vscode from 'vscode';
import { Commands } from './commands';

/**
 * Status bar item manager for displaying the extension status and providing quick actions
 */
export class StatusBarManager {
    private static instance: StatusBarManager;
    private statusBarItem!: vscode.StatusBarItem; // Using definite assignment assertion
    private isPlanMode: boolean = true;

    private constructor() {
        // Status bar item will be created in register method
    }

    /**
     * Gets the singleton instance of the StatusBarManager
     * @returns The StatusBarManager instance
     */
    public static getInstance(): StatusBarManager {
        if (!StatusBarManager.instance) {
            StatusBarManager.instance = new StatusBarManager();
        }
        return StatusBarManager.instance;
    }

    /**
     * Registers the status bar item
     * @param context Extension context
     * @returns The StatusBarManager instance
     */
    public static register(context: vscode.ExtensionContext): StatusBarManager {
        const instance = StatusBarManager.getInstance();
        
        // Create the status bar item only if it doesn't exist
        if (!instance.statusBarItem) {
            instance.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
            instance.updateStatusBar();
            instance.statusBarItem.show();
            context.subscriptions.push(instance.statusBarItem);
        }
        
        return instance;
    }

    /**
     * Updates the status bar with current mode and status
     */
    private updateStatusBar(): void {
        if (!this.statusBarItem) {
            return; // Skip if status bar item isn't initialized yet
        }
        this.statusBarItem.text = `$(robot) Test Automation Agent: Ready`;
        this.statusBarItem.tooltip = `Test Automation Agent - Ready\n`;
        this.statusBarItem.command = Commands.TOGGLE_PLAN_ACT_MODE;
    }

    /**
     * Shows a busy indicator in the status bar
     * @param message Message to display
     */
    public showBusy(message: string): void {
        if (!this.statusBarItem) {
            return; // Skip if status bar item isn't initialized yet
        }
        this.statusBarItem.text = `$(sync~spin) TestAutomationAgent: ${message}`;
        this.statusBarItem.tooltip = `TestAutomationAgent - Processing: ${message}`;
        this.statusBarItem.command = undefined;
    }

    /**
     * Shows success status in the status bar
     * @param message Success message to display
     */
    public showSuccess(message: string): void {
        if (!this.statusBarItem) {
            return; // Skip if status bar item isn't initialized yet
        }
        this.statusBarItem.text = `$(check) TestAutomationAgent: ${message}`;
        this.statusBarItem.tooltip = `TestAutomationAgent - Success: ${message}`;
        
        // Reset the status bar after 3 seconds
        setTimeout(() => {
            this.updateStatusBar();
        }, 3000);
    }

    /**
     * Shows error status in the status bar
     * @param message Error message to display
     */
    public showError(message: string): void {
        if (!this.statusBarItem) {
            return; // Skip if status bar item isn't initialized yet
        }
        this.statusBarItem.text = `$(error) TestAutomationAgent: ${message}`;
        this.statusBarItem.tooltip = `TestAutomationAgent - Error: ${message}`;
        
        // Reset the status bar after 3 seconds
        setTimeout(() => {
            this.updateStatusBar();
        }, 3000);
    }
    
    /**
     * Shows information status in the status bar
     * @param message Info message to display
     */
    public showInfo(message: string): void {
        if (!this.statusBarItem) {
            return; // Skip if status bar item isn't initialized yet
        }
        this.statusBarItem.text = `$(info) TestAutomationAgent: ${message}`;
        this.statusBarItem.tooltip = `TestAutomationAgent - Info: ${message}`;
        
        // Reset the status bar after 3 seconds
        setTimeout(() => {
            this.updateStatusBar();
        }, 3000);
    }

    /**
     * Toggles between Plan and Act modes
     */
    public toggleMode(): void {
        this.isPlanMode = !this.isPlanMode;
        this.updateStatusBar();
        
        // Show notification of mode change
        vscode.window.showInformationMessage(`Test Automation Agent: Switched to ${this.isPlanMode ? 'Plan' : 'Act'} Mode`);
    }

    /**
     * Gets the current mode
     * @returns Boolean indicating if in Plan mode
     */
    public isPlanningMode(): boolean {
        return this.isPlanMode;
    }
}
