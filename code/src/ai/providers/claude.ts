import * as vscode from 'vscode';
import axios, { AxiosInstance } from 'axios';
import { AIResponse } from '../controller';
import { SettingsManager } from '../../core/settings';
import { logger } from '../../utils/logger';

/**
 * Claude API interfaces
 */
export interface ClaudeMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface ClaudeRequest {
    model: string;
    messages: {
        role: 'user' | 'assistant' | 'system';
        content: string | {
            type: 'text';
            text: string;
        }[];
    }[];
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    stop_sequences?: string[];
    system?: string;
}

export interface ClaudeResponse {
    id: string;
    type: string;
    role: string;
    content: {
        type: string;
        text: string;
    }[];
    model: string;
    stop_reason: string;
    stop_sequence?: string;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
}

/**
 * Class to interact with the Claude API
 */
export class ClaudeProvider {
    private apiKey: string;
    private baseUrl: string;
    private httpClient: AxiosInstance;

    constructor() {
        this.apiKey = SettingsManager.getApiKeys()['claude'] || '';
        this.baseUrl = 'https://api.anthropic.com/v1';
        
        this.httpClient = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01',
                'x-api-key': this.apiKey
            }
        });
    }

    /**
     * Sends a prompt to the Claude API
     * @param prompt The prompt to send
     * @param systemMessage Optional system message
     * @param model The model to use
     * @param temperature The temperature to use
     * @param maxTokens Maximum tokens to generate
     * @param topP Top P value for sampling
     * @returns Promise resolving to the AI response
     */
    public async sendPrompt(
        prompt: string,
        systemMessage?: string,
        model: string = 'claude-3.7-sonnet-20250219',
        temperature: number = 0.3,
        maxTokens: number = 100000,
        topP?: number
    ): Promise<AIResponse> {
        try {
            if (!this.apiKey) {
                logger.error('Claude API key is not configured');
                throw new Error('Claude API key is not configured');
            }
            
            logger.info(`Sending request to Claude API using model: ${model}`);

            const request: ClaudeRequest = {
                model,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature,
                max_tokens: maxTokens
            };

            if (systemMessage) {
                request.system = systemMessage;
            }

            if (topP) {
                request.top_p = topP;
            }

            logger.debug(`Sending Claude request with system message: ${systemMessage ? 'yes' : 'no'}`);
            
            // Updated to use the current Claude API endpoint
            const response = await this.httpClient.post<ClaudeResponse>(
                '/messages',
                request,
                {
                    headers: {
                        'anthropic-beta': 'messages-2023-12-15',
                        'x-api-key': this.apiKey
                    }
                }
            );
            
            logger.info(`Claude response received: ${response.status}`);

            // Extract the text from the response content
            let responseText = '';
            for (const content of response.data.content) {
                if (content.type === 'text') {
                    responseText += content.text;
                }
            }

            const totalTokens = response.data.usage.input_tokens + response.data.usage.output_tokens;
            logger.debug(`Tokens used: ${totalTokens} (${response.data.usage.input_tokens} input, ${response.data.usage.output_tokens} output)`);
            
            return {
                text: responseText,
                tokensUsed: totalTokens,
                model: response.data.model
            };
        } catch (error) {
            this.handleError(error);
            throw error;
        }
    }

    /**
     * Handles API errors
     * @param error The error to handle
     */
    private handleError(error: any): void {
        if (axios.isAxiosError(error)) {
            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                logger.error(`Claude API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
                throw new Error(`Claude API error: ${error.response.data.error?.message || JSON.stringify(error.response.data)}`);
            } else if (error.request) {
                // The request was made but no response was received
                logger.error('Claude API request error - no response received', error.request);
                throw new Error('No response received from Claude API');
            } else {
                // Something happened in setting up the request that triggered an Error
                logger.error(`Claude API setup error: ${error.message}`);
                throw new Error(`Error setting up Claude request: ${error.message}`);
            }
        } else {
            logger.error('Claude API unexpected error', error);
            throw new Error(`Unexpected error in Claude provider: ${(error as Error).message}`);
        }
    }
}
