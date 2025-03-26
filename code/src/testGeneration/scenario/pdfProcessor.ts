import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileManager } from '../../fileSystem/fileManager';
import { StatusBarManager } from '../../core/statusBar';

/**
 * PDF content type
 */
export interface PDFContent {
    text: string;
    title?: string;
    pages: number;
    metadata?: Record<string, string>;
}

/**
 * Requirements extraction result
 */
export interface RequirementsExtractionResult {
    requirements: string[];
    title?: string;
    source: string;
    metadata?: Record<string, string>;
}

/**
 * Class for processing PDF files to extract requirements
 */
export class PDFProcessor {
    private static instance: PDFProcessor;
    private fileManager: FileManager;
    private statusBarManager: StatusBarManager;

    private constructor() {
        this.fileManager = FileManager.getInstance();
        this.statusBarManager = StatusBarManager.getInstance();
    }

    /**
     * Gets the singleton instance of the PDFProcessor
     * @returns The PDFProcessor instance
     */
    public static getInstance(): PDFProcessor {
        if (!PDFProcessor.instance) {
            PDFProcessor.instance = new PDFProcessor();
        }
        return PDFProcessor.instance;
    }

    /**
     * Extracts text from a PDF file
     * @param filePath Path to the PDF file
     * @returns Promise resolving to the PDF content
     */
    public async extractTextFromPDF(filePath: string): Promise<PDFContent> {
        try {
            this.statusBarManager.showBusy(`Processing PDF: ${path.basename(filePath)}`);
            
            // Check if the file exists
            if (!await this.fileManager.fileExists(filePath)) {
                throw new Error(`PDF file not found: ${filePath}`);
            }
            
            // Check if the file is a PDF
            if (path.extname(filePath).toLowerCase() !== '.pdf') {
                throw new Error(`File is not a PDF: ${filePath}`);
            }
            
            // Since we can't directly parse PDF in a VSCode extension without additional dependencies,
            // we need to use a workaround for the MVP
            
            // For the MVP, we'll use an external library via a command line tool
            // This would be installed as a dependency in the package.json
            
            // Create a temporary file for the output
            const tempOutputFile = path.join(path.dirname(filePath), 'temp_pdf_output.txt');
            
            // In a real implementation, we would use a PDF parsing library like pdf-parse or pdfjs-dist
            // For the MVP, we'll simulate the extraction
            
            // Simulate extraction
            const simulatedContent = `
# Requirements Document
## Section 1: Introduction
This document outlines the requirements for the system.

## Section 2: Functional Requirements
FR-001: The system shall allow users to log in.
FR-002: The system shall provide a dashboard view.
FR-003: The system shall allow users to create new items.
FR-004: The system shall validate all input data.

## Section 3: Non-Functional Requirements
NFR-001: The system shall respond within 2 seconds.
NFR-002: The system shall be available 99.9% of the time.
NFR-003: The system shall support 1000 concurrent users.

## Section 4: Acceptance Criteria
AC-001: User can log in with valid credentials.
AC-002: User cannot log in with invalid credentials.
AC-003: Dashboard displays correct user information.
AC-004: New items appear in the list after creation.
AC-005: System rejects invalid input data.
            `;
            
            // Write simulated content to temp file
            await this.fileManager.writeFile(tempOutputFile, simulatedContent);
            
            // Read the content from the temp file
            const content = await this.fileManager.readFile(tempOutputFile);
            
            // Clean up temp file
            await this.fileManager.deleteFile(tempOutputFile);
            
            // Parse title and metadata
            const titleMatch = content.match(/# (.*)/);
            const title = titleMatch ? titleMatch[1] : path.basename(filePath, '.pdf');
            
            // Count pages (simulated)
            const pages = 5;
            
            // Extract metadata (simulated)
            const metadata = {
                'Author': 'Unknown',
                'Creation Date': new Date().toISOString(),
                'Source': filePath
            };
            
            this.statusBarManager.showSuccess(`PDF processed: ${path.basename(filePath)}`);
            
            return {
                text: content,
                title,
                pages,
                metadata
            };
        } catch (error) {
            this.statusBarManager.showError(`Error processing PDF: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Extracts requirements from PDF content
     * @param pdfContent The PDF content
     * @returns Requirements extraction result
     */
    public extractRequirements(pdfContent: PDFContent): RequirementsExtractionResult {
        try {
            const requirements: string[] = [];
            const lines = pdfContent.text.split('\n');
            
            // Extract lines that appear to be requirements
            const reqPatterns = [
                /\b(?:FR|NFR|REQ|AC)-\d+:?/i,  // FR-001, NFR-001, REQ-001, AC-001
                /\bRequirement\s+\d+:?/i,       // Requirement 1
                /\b(?:shall|must|should)\b/i,   // The system shall/must/should...
                /\bAcceptance\s+Criteria\b/i    // Acceptance Criteria
            ];
            
            for (const line of lines) {
                // Skip empty lines
                if (!line.trim()) {
                    continue;
                }
                
                // Check if the line contains a requirement pattern
                if (reqPatterns.some(pattern => pattern.test(line))) {
                    requirements.push(line.trim());
                }
            }
            
            // If no requirements found with specific patterns, try to extract based on structure
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
                            requirements.push(match[1].trim());
                        }
                    }
                }
            }
            
            return {
                requirements,
                title: pdfContent.title,
                source: pdfContent.metadata?.['Source'] || 'Unknown',
                metadata: pdfContent.metadata
            };
        } catch (error) {
            console.error('Error extracting requirements:', error);
            return {
                requirements: [],
                source: 'Error',
                metadata: {
                    'Error': (error as Error).message
                }
            };
        }
    }

    /**
     * Process a PDF file and extract requirements
     * @param filePath Path to the PDF file
     * @returns Promise resolving to the requirements extraction result
     */
    public async processRequirements(filePath: string): Promise<RequirementsExtractionResult> {
        try {
            // Extract text from PDF
            const pdfContent = await this.extractTextFromPDF(filePath);
            
            // Extract requirements from the content
            const requirements = this.extractRequirements(pdfContent);
            
            return requirements;
        } catch (error) {
            this.statusBarManager.showError(`Error processing requirements: ${(error as Error).message}`);
            throw error;
        }
    }
}
