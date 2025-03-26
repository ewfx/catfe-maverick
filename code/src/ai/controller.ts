import * as vscode from 'vscode';
import { SettingsManager } from '../core/settings';
import { logger } from '../utils/logger';

/**
 * AI provider type
 */
export type AIProvider = 'openai' | 'claude';

/**
 * AI Model configuration
 */
export interface AIModelConfig {
    provider: AIProvider;
    model: string;
    temperature: number;
    maxTokens?: number;
    topP?: number;
    apiKey: string;
}

/**
 * AI Response type
 */
export interface AIResponse {
    text: string;
    tokensUsed?: number;
    model?: string;
}

/**
 * Mode for the AI controller
 */
export enum AIMode {
    PLAN = 'plan',
    ACT = 'act'
}

/**
 * Controller for managing AI interactions
 */
export class AIController {
    private static instance: AIController;
    private currentMode: AIMode = AIMode.PLAN;

    private constructor() {
        // Initialize the controller
    }

    /**
     * Gets the singleton instance of the AIController
     * @returns The AIController instance
     */
    public static getInstance(): AIController {
        if (!AIController.instance) {
            AIController.instance = new AIController();
        }
        return AIController.instance;
    }

    /**
     * Gets the current AI model configuration
     * @returns The AI model configuration
     */
    public getModelConfig(): AIModelConfig {
        const provider = SettingsManager.getAiProvider();
        const model = SettingsManager.getAiModel();
        const apiKeys = SettingsManager.getApiKeys();
        
        return {
            provider,
            model,
            temperature: 0.3, // Default temperature
            maxTokens: provider === 'claude' ? 100000 : 8192,
            topP: 0.95,
            apiKey: apiKeys[provider] || ''
        };
    }

    /**
     * Sets the current mode of the AI controller
     * @param mode The mode to set
     */
    public setMode(mode: AIMode): void {
        this.currentMode = mode;
        logger.info(`AI mode set to: ${mode}`);
    }
    
    /**
     * Sets the planning mode based on a boolean
     * @param isPlanningMode True for planning mode, false for action mode
     * @returns The new mode
     */
    public setPlanningMode(isPlanningMode: boolean): AIMode {
        this.currentMode = isPlanningMode ? AIMode.PLAN : AIMode.ACT;
        logger.info(`AI mode set to: ${this.currentMode}`);
        return this.currentMode;
    }

    /**
     * Gets the current mode of the AI controller
     * @returns The current mode
     */
    public getMode(): AIMode {
        return this.currentMode;
    }

    /**
     * Toggles between Plan and Act modes
     * @returns The new mode
     */
    public toggleMode(): AIMode {
        this.currentMode = this.currentMode === AIMode.PLAN ? AIMode.ACT : AIMode.PLAN;
        logger.info(`AI mode toggled to: ${this.currentMode}`);
        return this.currentMode;
    }

    /**
     * Sends a prompt to the AI provider
     * @param prompt The prompt to send
     * @param systemMessage Optional system message
     * @param modelOverride Optional model override
     * @returns Promise resolving to the AI response
     */
    public async sendPrompt(
        prompt: string, 
        systemMessage?: string,
        modelOverride?: string
    ): Promise<AIResponse> {
        const config = this.getModelConfig();
        
        if (modelOverride) {
            config.model = modelOverride;
        }
        
        logger.info(`Sending prompt to ${config.provider} using model ${config.model}`);
        logger.debug(`Prompt length: ${prompt.length} characters`);
        
        try {
            if (config.apiKey === '') {
                logger.error('API key not configured');
                throw new Error('API key not configured. Please configure an API key in settings.');
            }
            
            // Select the appropriate provider
            if (config.provider === 'openai') {
                logger.debug('Using OpenAI provider');
                return await this.sendOpenAIPrompt(prompt, systemMessage, config);
            } else if (config.provider === 'claude') {
                logger.debug('Using Claude provider');
                return await this.sendClaudePrompt(prompt, systemMessage, config);
            } else {
                logger.error(`Unsupported AI provider: ${config.provider}`);
                throw new Error(`Unsupported AI provider: ${config.provider}`);
            }
        } catch (error) {
            logger.error('Error sending prompt to AI', error);
            vscode.window.showErrorMessage(`AI error: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Sends a prompt to the OpenAI API
     * @param prompt The prompt to send
     * @param systemMessage Optional system message
     * @param config The AI model configuration
     * @returns Promise resolving to the AI response
     */
    private async sendOpenAIPrompt(
        prompt: string, 
        systemMessage: string | undefined,
        config: AIModelConfig
    ): Promise<AIResponse> {
        // Log the prompt being sent
        logger.info(`Sending prompt to OpenAI: Model=${config.model}, Temperature=${config.temperature}`);
        logger.debug(`Prompt content: ${prompt}`);
        if (systemMessage) {
            logger.debug(`System message: ${systemMessage}`);
        }
        
        // Import OpenAI provider dynamically to avoid circular dependencies
        const { OpenAIProvider } = await import('./providers/openai.js');
        const provider = new OpenAIProvider();
        
        // Send the prompt to OpenAI and get the response
        const response = await provider.sendPrompt(
            prompt,
            systemMessage,
            config.model,
            config.temperature,
            config.maxTokens,
            config.topP
        );
        
        // Log the response received
        logger.info(`Response received from OpenAI: Tokens used=${response.tokensUsed}`);
        logger.debug(`Response content: ${response.text}`);
        
        return response;
    }

    /**
     * Sends a prompt to the Claude API
     * @param prompt The prompt to send
     * @param systemMessage Optional system message
     * @param config The AI model configuration
     * @returns Promise resolving to the AI response
     */
    private async sendClaudePrompt(
        prompt: string, 
        systemMessage: string | undefined,
        config: AIModelConfig
    ): Promise<AIResponse> {
        // Log the prompt being sent
        logger.info(`Sending prompt to Claude: Model=${config.model}, Temperature=${config.temperature}`);
        logger.debug(`Prompt content: ${prompt}`);
        if (systemMessage) {
            logger.debug(`System message: ${systemMessage}`);
        }
        
        // Import Claude provider dynamically to avoid circular dependencies
        const { ClaudeProvider } = await import('./providers/claude.js');
        const provider = new ClaudeProvider();
        
        // Send the prompt to Claude and get the response
        const response = await provider.sendPrompt(
            prompt,
            systemMessage,
            config.model,
            config.temperature,
            config.maxTokens,
            config.topP
        );
        
        // Log the response received
        logger.info(`Response received from Claude: Tokens used=${response.tokensUsed}`);
        logger.debug(`Response content: ${response.text}`);
        
        return response;
    }
}
