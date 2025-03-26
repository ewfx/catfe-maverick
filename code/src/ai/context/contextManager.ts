import * as vscode from 'vscode';
import { SettingsManager } from '../../core/settings';

/**
 * Context Item represents a piece of context for the AI
 */
export interface ContextItem {
    id: string;
    type: 'file' | 'command' | 'conversation' | 'project' | 'custom';
    content: string;
    metadata?: Record<string, any>;
    priority: number;
    timestamp: number;
}

/**
 * Memory context options
 */
export interface ContextOptions {
    maxTokens?: number;
    historyDepth?: number;
    prioritizeCode?: boolean;
    includeProjectStructure?: boolean;
}

/**
 * Class to manage AI context
 */
export class ContextManager {
    private static instance: ContextManager;
    private context: ContextItem[] = [];
    private maxTokens: number;
    private historyDepth: number;
    private prioritizeCode: boolean;
    private includeProjectStructure: boolean;

    private constructor() {
        // Get configuration from settings
        const contextStrategy = SettingsManager.getContextStrategy();
        this.maxTokens = contextStrategy.tokenLimit;
        this.historyDepth = contextStrategy.historyDepth;
        this.prioritizeCode = contextStrategy.prioritizeCode;
        this.includeProjectStructure = contextStrategy.includeProjectStructure;
    }

    /**
     * Gets the singleton instance of the ContextManager
     * @returns The ContextManager instance
     */
    public static getInstance(): ContextManager {
        if (!ContextManager.instance) {
            ContextManager.instance = new ContextManager();
        }
        return ContextManager.instance;
    }

    /**
     * Adds a context item
     * @param item The context item to add
     */
    public addContext(item: Omit<ContextItem, 'timestamp'>): void {
        const contextItem: ContextItem = {
            ...item,
            timestamp: Date.now()
        };
        
        // Check for duplicates and remove them
        this.context = this.context.filter(c => c.id !== contextItem.id);
        
        // Add the new item
        this.context.push(contextItem);
        
        // Trim context if necessary
        this.trimContext();
    }

    /**
     * Removes a context item
     * @param id The ID of the context item to remove
     */
    public removeContext(id: string): void {
        this.context = this.context.filter(c => c.id !== id);
    }

    /**
     * Gets the current context based on the configured strategy
     * @param options Context options
     * @returns The current context as a string
     */
    public getContext(options?: ContextOptions): string {
        // Override defaults with options if provided
        const maxTokens = options?.maxTokens || this.maxTokens;
        const historyDepth = options?.historyDepth || this.historyDepth;
        const prioritizeCode = options?.prioritizeCode !== undefined ? options?.prioritizeCode : this.prioritizeCode;
        const includeProjectStructure = options?.includeProjectStructure !== undefined ? options?.includeProjectStructure : this.includeProjectStructure;

        // Sort context by priority (higher is more important) and timestamp (newer is more important)
        const sortedContext = [...this.context].sort((a, b) => {
            if (a.priority !== b.priority) {
                return b.priority - a.priority;
            }
            return b.timestamp - a.timestamp;
        });

        // Limit context by history depth
        const limitedContext = sortedContext.slice(0, historyDepth);

        // Build the context string
        let contextString = '';

        // Add project structure if enabled
        if (includeProjectStructure) {
            const projectStructure = limitedContext.find(c => c.type === 'project');
            if (projectStructure) {
                contextString += `PROJECT STRUCTURE:\n${projectStructure.content}\n\n`;
            }
        }

        // Add code with higher priority if enabled
        if (prioritizeCode) {
            // First add all code-related context
            for (const item of limitedContext) {
                if (item.type === 'file' && item.metadata?.language === 'code') {
                    contextString += `FILE (${item.metadata?.path}):\n${item.content}\n\n`;
                }
            }
            
            // Then add other context
            for (const item of limitedContext) {
                if (item.type !== 'file' || item.metadata?.language !== 'code') {
                    contextString += `${item.type.toUpperCase()}:\n${item.content}\n\n`;
                }
            }
        } else {
            // Add all context in priority order
            for (const item of limitedContext) {
                contextString += `${item.type.toUpperCase()}${item.metadata ? ` (${JSON.stringify(item.metadata)})` : ''}:\n${item.content}\n\n`;
            }
        }

        // Rough estimation of tokens - this is not accurate but helps with initial limiting
        // Approximate 4 characters per token
        const estimatedTokens = Math.ceil(contextString.length / 4);
        
        // If we're over the token limit, trim the context
        if (estimatedTokens > maxTokens) {
            const ratio = maxTokens / estimatedTokens;
            const maxChars = Math.floor(contextString.length * ratio);
            contextString = contextString.substring(0, maxChars);
            
            // Add a notice that context was trimmed
            contextString += '\n[Context was trimmed to fit token limit]';
        }

        return contextString;
    }

    /**
     * Clears all context
     */
    public clearContext(): void {
        this.context = [];
    }

    /**
     * Updates the context strategy
     * @param options Context options
     */
    public updateStrategy(options: ContextOptions): void {
        if (options.maxTokens !== undefined) {
            this.maxTokens = options.maxTokens;
        }
        
        if (options.historyDepth !== undefined) {
            this.historyDepth = options.historyDepth;
        }
        
        if (options.prioritizeCode !== undefined) {
            this.prioritizeCode = options.prioritizeCode;
        }
        
        if (options.includeProjectStructure !== undefined) {
            this.includeProjectStructure = options.includeProjectStructure;
        }
        
        // Save the updated strategy
        SettingsManager.updateContextStrategy({
            tokenLimit: this.maxTokens,
            historyDepth: this.historyDepth,
            prioritizeCode: this.prioritizeCode,
            includeProjectStructure: this.includeProjectStructure
        });
    }

    /**
     * Trims the context to fit the configured constraints
     */
    private trimContext(): void {
        // Trim by history depth
        if (this.context.length > this.historyDepth) {
            // Sort by priority (higher is more important) and timestamp (newer is more important)
            this.context.sort((a, b) => {
                if (a.priority !== b.priority) {
                    return b.priority - a.priority;
                }
                return b.timestamp - a.timestamp;
            });
            
            // Keep only the top items by history depth
            this.context = this.context.slice(0, this.historyDepth);
        }
    }
}
