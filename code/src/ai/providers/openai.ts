import * as vscode from 'vscode';
import axios, { AxiosInstance } from 'axios';
import { AIResponse } from '../controller';
import { SettingsManager } from '../../core/settings';
import { logger } from '../../utils/logger';

/**
 * OpenAI API interface
 */
export interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface OpenAIRequest {
    model: string;
    messages: OpenAIMessage[];
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
}

export interface OpenAIResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        index: number;
        message: OpenAIMessage;
        finish_reason: string;
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * Class to interact with the OpenAI API
 */
export class OpenAIProvider {
    private apiKey: string;
    private baseUrl: string;
    private httpClient: AxiosInstance;

    constructor() {
        this.apiKey = SettingsManager.getApiKeys()['openai'] || '';
        this.baseUrl = 'https://api.openai.com/v1';
        
        this.httpClient = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            }
        });
    }

    /**
     * Sends a prompt to the OpenAI API
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
        model: string = 'gpt-4',
        temperature: number = 0.3,
        maxTokens?: number,
        topP?: number
    ): Promise<AIResponse> {
        try {
            if (!this.apiKey) {
                logger.error('OpenAI API key is not configured');
                throw new Error('OpenAI API key is not configured');
            }
            
            logger.info(`Sending request to OpenAI API using model: ${model}`);

            const messages: OpenAIMessage[] = [];
            
            if (systemMessage) {
                messages.push({
                    role: 'system',
                    content: systemMessage
                });
            }
            
            messages.push({
                role: 'user',
                content: prompt
            });

            const request: OpenAIRequest = {
                model,
                messages,
                temperature
            };

            if (maxTokens) {
                request.max_tokens = maxTokens;
            }

            if (topP) {
                request.top_p = topP;
            }

            logger.debug(`Sending OpenAI request with ${messages.length} messages`);
            
            const response = await this.httpClient.post<OpenAIResponse>(
                '/chat/completions',
                request
            );

            logger.info(`OpenAI response received: ${response.status}`);
            logger.debug(`Tokens used: ${response.data.usage.total_tokens} (${response.data.usage.prompt_tokens} prompt, ${response.data.usage.completion_tokens} completion)`);
            
            return {
                text: response.data.choices[0].message.content,
                tokensUsed: response.data.usage.total_tokens,
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
                logger.error(`OpenAI API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
                throw new Error(`OpenAI API error: ${error.response.data.error?.message || JSON.stringify(error.response.data)}`);
            } else if (error.request) {
                // The request was made but no response was received
                logger.error('OpenAI API request error - no response received', error.request);
                throw new Error('No response received from OpenAI API');
            } else {
                // Something happened in setting up the request that triggered an Error
                logger.error(`OpenAI API setup error: ${error.message}`);
                throw new Error(`Error setting up OpenAI request: ${error.message}`);
            }
        } else {
            logger.error('OpenAI API unexpected error', error);
            throw new Error(`Unexpected error in OpenAI provider: ${(error as Error).message}`);
        }
    }
}
