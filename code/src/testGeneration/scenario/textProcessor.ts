import * as vscode from 'vscode';
import { StatusBarManager } from '../../core/statusBar';

/**
 * Text content type
 */
export interface TextContent {
    text: string;
    source: string;
    format?: 'plain' | 'markdown' | 'jira' | 'gherkin';
}

/**
 * Requirements extraction result
 */
export interface RequirementsExtractionResult {
    requirements: string[];
    acceptanceCriteria: string[];
    source: string;
    format?: string;
}

/**
 * Class for processing text files to extract requirements
 */
export class TextProcessor {
    private static instance: TextProcessor;
    private statusBarManager: StatusBarManager;

    private constructor() {
        this.statusBarManager = StatusBarManager.getInstance();
    }

    /**
     * Gets the singleton instance of the TextProcessor
     * @returns The TextProcessor instance
     */
    public static getInstance(): TextProcessor {
        if (!TextProcessor.instance) {
            TextProcessor.instance = new TextProcessor();
        }
        return TextProcessor.instance;
    }

    /**
     * Processes text content to extract requirements
     * @param content The text content
     * @returns RequirementsExtractionResult
     */
    public processTextContent(content: TextContent): RequirementsExtractionResult {
        try {
            this.statusBarManager.showBusy('Processing text content...');
            
            // Detect format if not provided
            const format = content.format || this.detectFormat(content.text);
            
            // Extract requirements based on format
            let requirements: string[] = [];
            let acceptanceCriteria: string[] = [];
            
            switch (format) {
                case 'gherkin':
                    ({ requirements, acceptanceCriteria } = this.processGherkinContent(content.text));
                    break;
                    
                case 'jira':
                    ({ requirements, acceptanceCriteria } = this.processJiraContent(content.text));
                    break;
                    
                case 'markdown':
                    ({ requirements, acceptanceCriteria } = this.processMarkdownContent(content.text));
                    break;
                    
                default:
                    // Plain text processing
                    ({ requirements, acceptanceCriteria } = this.processPlainTextContent(content.text));
            }
            
            this.statusBarManager.showSuccess('Text processing complete');
            
            return {
                requirements,
                acceptanceCriteria,
                source: content.source,
                format
            };
        } catch (error) {
            this.statusBarManager.showError(`Error processing text: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Detects the format of the text content
     * @param text The text content
     * @returns The detected format
     */
    private detectFormat(text: string): 'plain' | 'markdown' | 'jira' | 'gherkin' {
        // Check for Gherkin format
        if (/Feature:|Scenario:|Given |When |Then /.test(text)) {
            return 'gherkin';
        }
        
        // Check for JIRA format
        if (/h[1-6]\.|{code}|{noformat}|{panel}/.test(text)) {
            return 'jira';
        }
        
        // Check for Markdown format
        if (/^#+\s|```|\*\*|__|\[.*\]\(.*\)/.test(text)) {
            return 'markdown';
        }
        
        // Default to plain text
        return 'plain';
    }

    /**
     * Processes Gherkin content
     * @param text The Gherkin content
     * @returns Extracted requirements and acceptance criteria
     */
    private processGherkinContent(text: string): { requirements: string[], acceptanceCriteria: string[] } {
        const requirements: string[] = [];
        const acceptanceCriteria: string[] = [];
        
        // Split text into lines
        const lines = text.split('\n');
        
        // Extract Feature as requirement
        const featureMatch = text.match(/Feature:([^\n]+)/);
        if (featureMatch) {
            requirements.push(`REQ: ${featureMatch[1].trim()}`);
        }
        
        // Process scenarios
        let currentScenario = '';
        let inScenario = false;
        
        for (const line of lines) {
            // Check for scenario
            if (line.trim().startsWith('Scenario:') || line.trim().startsWith('Scenario Outline:')) {
                // Save previous scenario if any
                if (currentScenario) {
                    acceptanceCriteria.push(currentScenario);
                }
                
                // Start new scenario
                currentScenario = line.trim();
                inScenario = true;
            }
            // Add steps to current scenario
            else if (inScenario && (
                line.trim().startsWith('Given ') || 
                line.trim().startsWith('When ') || 
                line.trim().startsWith('Then ') || 
                line.trim().startsWith('And ') || 
                line.trim().startsWith('But ')
            )) {
                currentScenario += '\n  ' + line.trim();
            }
            // Add examples to current scenario
            else if (inScenario && line.trim().startsWith('Examples:')) {
                currentScenario += '\n' + line.trim();
            }
            // Add example table to current scenario
            else if (inScenario && line.trim().startsWith('|')) {
                currentScenario += '\n  ' + line.trim();
            }
        }
        
        // Add the last scenario if any
        if (currentScenario) {
            acceptanceCriteria.push(currentScenario);
        }
        
        return { requirements, acceptanceCriteria };
    }

    /**
     * Processes JIRA content
     * @param text The JIRA content
     * @returns Extracted requirements and acceptance criteria
     */
    private processJiraContent(text: string): { requirements: string[], acceptanceCriteria: string[] } {
        const requirements: string[] = [];
        const acceptanceCriteria: string[] = [];
        
        // Split text into lines
        const lines = text.split('\n');
        
        // Process lines
        let inAC = false;
        let currentAC = '';
        
        for (const line of lines) {
            // Check for headings indicating requirements
            if (line.startsWith('h1.') || line.startsWith('h2.') || line.startsWith('h3.')) {
                const heading = line.substring(line.indexOf('.') + 1).trim();
                requirements.push(`REQ: ${heading}`);
            }
            // Check for acceptance criteria section
            else if (line.toLowerCase().includes('acceptance criteria')) {
                inAC = true;
                if (currentAC) {
                    acceptanceCriteria.push(currentAC.trim());
                    currentAC = '';
                }
            }
            // Check for another heading indicating end of AC section
            else if (inAC && (line.startsWith('h1.') || line.startsWith('h2.') || line.startsWith('h3.'))) {
                inAC = false;
                if (currentAC) {
                    acceptanceCriteria.push(currentAC.trim());
                    currentAC = '';
                }
            }
            // Add line to current AC if in AC section
            else if (inAC) {
                // Check for bullet points or numbered list items
                if (line.trim().startsWith('-') || line.trim().startsWith('#') || line.trim().match(/^\d+\./)) {
                    if (currentAC) {
                        acceptanceCriteria.push(currentAC.trim());
                        currentAC = '';
                    }
                    currentAC = line.trim();
                } else if (currentAC && line.trim()) {
                    currentAC += '\n' + line.trim();
                }
            }
        }
        
        // Add the last AC if any
        if (inAC && currentAC) {
            acceptanceCriteria.push(currentAC.trim());
        }
        
        return { requirements, acceptanceCriteria };
    }

    /**
     * Processes Markdown content
     * @param text The Markdown content
     * @returns Extracted requirements and acceptance criteria
     */
    private processMarkdownContent(text: string): { requirements: string[], acceptanceCriteria: string[] } {
        const requirements: string[] = [];
        const acceptanceCriteria: string[] = [];
        
        // Split text into lines
        const lines = text.split('\n');
        
        // Process lines
        let inAC = false;
        let currentAC = '';
        
        for (const line of lines) {
            // Check for headings
            if (line.startsWith('#')) {
                const headingLevel = line.match(/^(#+)/)?.[0].length || 0;
                const heading = line.substring(headingLevel).trim();
                
                // Top-level headings are likely requirements
                if (headingLevel <= 2) {
                    requirements.push(`REQ: ${heading}`);
                }
                
                // Check for acceptance criteria section
                if (heading.toLowerCase().includes('acceptance criteria')) {
                    inAC = true;
                    if (currentAC) {
                        acceptanceCriteria.push(currentAC.trim());
                        currentAC = '';
                    }
                }
                // Another heading indicates end of AC section
                else if (inAC) {
                    inAC = false;
                    if (currentAC) {
                        acceptanceCriteria.push(currentAC.trim());
                        currentAC = '';
                    }
                }
            }
            // Process list items in AC section
            else if (inAC) {
                // Check for bullet points or numbered list items
                if (line.trim().startsWith('-') || line.trim().startsWith('*') || line.trim().match(/^\d+\./)) {
                    if (currentAC) {
                        acceptanceCriteria.push(currentAC.trim());
                    }
                    currentAC = line.trim();
                } else if (currentAC && line.trim()) {
                    currentAC += '\n' + line.trim();
                }
            }
        }
        
        // Add the last AC if any
        if (inAC && currentAC) {
            acceptanceCriteria.push(currentAC.trim());
        }
        
        return { requirements, acceptanceCriteria };
    }

    /**
     * Processes plain text content
     * @param text The plain text content
     * @returns Extracted requirements and acceptance criteria
     */
    private processPlainTextContent(text: string): { requirements: string[], acceptanceCriteria: string[] } {
        const requirements: string[] = [];
        const acceptanceCriteria: string[] = [];
        
        // Split text into lines
        const lines = text.split('\n');
        
        // Common requirement patterns
        const reqPatterns = [
            /\b(?:FR|NFR|REQ|R)-\d+:?/i,     // FR-001, NFR-001, REQ-001, R-001
            /\bRequirement\s+\d+:?/i,         // Requirement 1
            /\b(?:shall|must|should)\b/i,     // The system shall/must/should...
            /\bneeds?\s+to\b/i,               // The system needs to...
            /\brequires?\b/i                  // The system requires...
        ];
        
        // Common acceptance criteria patterns
        const acPatterns = [
            /\b(?:AC|TC)-\d+:?/i,             // AC-001, TC-001
            /\bAcceptance\s+Criteria\b/i,     // Acceptance Criteria
            /\bTest\s+Case\b/i,               // Test Case
            /\bGiven\b.*\bWhen\b.*\bThen\b/i, // Given-When-Then format
            /\bExpect\b/i                     // Expect...
        ];
        
        // Process each line
        for (const line of lines) {
            // Skip empty lines
            if (!line.trim()) {
                continue;
            }
            
            // Check for requirement patterns
            if (reqPatterns.some(pattern => pattern.test(line))) {
                requirements.push(line.trim());
            }
            
            // Check for acceptance criteria patterns
            if (acPatterns.some(pattern => pattern.test(line))) {
                acceptanceCriteria.push(line.trim());
            }
        }
        
        // If no structured requirements found, try to extract based on line position and formatting
        if (requirements.length === 0) {
            // Look for numbered or bulleted lists
            const listPatterns = [
                /^\s*\d+\.\s+(.+)$/,    // Numbered list: 1. Item
                /^\s*-\s+(.+)$/,        // Dash list: - Item
                /^\s*•\s+(.+)$/,        // Bullet list: • Item
                /^\s*\*\s+(.+)$/        // Asterisk list: * Item
            ];
            
            for (const line of lines) {
                for (const pattern of listPatterns) {
                    const match = line.match(pattern);
                    if (match && match[1].trim()) {
                        // If contains acceptance criteria keywords, add to AC
                        if (acPatterns.some(pattern => pattern.test(line))) {
                            acceptanceCriteria.push(match[1].trim());
                        } else {
                            requirements.push(match[1].trim());
                        }
                    }
                }
            }
        }
        
        return { requirements, acceptanceCriteria };
    }
}
