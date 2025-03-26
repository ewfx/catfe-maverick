import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { FileManager } from '../fileSystem/fileManager';

/**
 * API endpoint definition from OpenAPI spec
 */
export interface ApiEndpoint {
    path: string;
    method: string;
    operationId?: string;
    summary?: string;
    description?: string;
    parameters?: any[];
    requestBody?: any;
    responses?: Record<string, any>;
    tags?: string[];
}

/**
 * Business rule from product specification
 */
export interface BusinessRule {
    id: string;
    section: string;
    description: string;
    category: string;
    priority: 'High' | 'Medium' | 'Low';
    relatedEndpoints?: string[];
}

/**
 * Represents API specification data
 */
export interface ApiSpecData {
    title: string;
    version: string;
    description?: string;
    endpoints: ApiEndpoint[];
    schemas: Record<string, any>;
}

/**
 * Represents business rule data from specifications
 */
export interface BusinessRuleData {
    title: string;
    description?: string;
    rules: BusinessRule[];
}

/**
 * Class for parsing OpenAPI specifications and product requirements
 */
export class SpecificationParser {
    private fileManager: FileManager;

    constructor() {
        this.fileManager = FileManager.getInstance();
    }

    /**
     * Parses an OpenAPI specification file
     * @param specPath Path to the OpenAPI specification file
     * @returns Promise resolving to parsed API spec data
     */
    public async parseOpenApiSpec(specPath: string): Promise<ApiSpecData> {
        try {
            logger.info(`Parsing OpenAPI specification from: ${specPath}`);
            
            // Check if file exists
            if (!await this.fileManager.fileExists(specPath)) {
                throw new Error(`OpenAPI specification file not found: ${specPath}`);
            }
            
            // Read the specification file
            const content = await this.fileManager.readFile(specPath);
            
            try {
                // Parse the JSON or YAML content
                const specData = JSON.parse(content);
                
                // Extract API data
                const apiData: ApiSpecData = {
                    title: specData.info?.title || 'API Specification',
                    version: specData.info?.version || '1.0.0',
                    description: specData.info?.description,
                    endpoints: [],
                    schemas: specData.components?.schemas || {}
                };
                
                // Extract endpoints
                const paths = specData.paths || {};
                
                for (const [path, methods] of Object.entries(paths)) {
                    for (const [method, operation] of Object.entries(methods as Record<string, any>)) {
                        if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method.toLowerCase())) {
                            const endpoint: ApiEndpoint = {
                                path,
                                method: method.toUpperCase(),
                                operationId: operation.operationId,
                                summary: operation.summary,
                                description: operation.description,
                                parameters: operation.parameters,
                                requestBody: operation.requestBody,
                                responses: operation.responses,
                                tags: operation.tags
                            };
                            
                            apiData.endpoints.push(endpoint);
                        }
                    }
                }
                
                logger.info(`Successfully parsed OpenAPI spec with ${apiData.endpoints.length} endpoints`);
                return apiData;
            } catch (error) {
                throw new Error(`Failed to parse OpenAPI specification: ${(error as Error).message}`);
            }
        } catch (error) {
            logger.error(`Error parsing OpenAPI specification: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Parses a product specification document
     * @param specPath Path to the product specification document
     * @returns Promise resolving to parsed business rule data
     */
    public async parseProductSpec(specPath: string): Promise<BusinessRuleData> {
        try {
            logger.info(`Parsing product specification from: ${specPath}`);
            
            // Check if file exists
            if (!await this.fileManager.fileExists(specPath)) {
                throw new Error(`Product specification file not found: ${specPath}`);
            }
            
            // Read the specification file
            const content = await this.fileManager.readFile(specPath);
            
            // Extract business rules
            const rules = this.extractBusinessRules(content);
            
            // Create business rule data
            const ruleData: BusinessRuleData = {
                title: 'Product Specification',
                rules
            };
            
            logger.info(`Successfully parsed product specification with ${rules.length} business rules`);
            return ruleData;
        } catch (error) {
            logger.error(`Error parsing product specification: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Maps business rules to API endpoints
     * @param rules The business rules
     * @param endpoints The API endpoints
     * @returns Business rules with mapped endpoints
     */
    public mapRulesToEndpoints(rules: BusinessRule[], endpoints: ApiEndpoint[]): BusinessRule[] {
        const mappedRules = [...rules];
        
        for (const rule of mappedRules) {
            rule.relatedEndpoints = [];
            
            // Simple keyword matching for MVP
            // In a real implementation, a more sophisticated algorithm would be used
            for (const endpoint of endpoints) {
                const endpointStr = `${endpoint.method} ${endpoint.path}`;
                
                // Check if rule description contains any keywords related to the endpoint
                if (endpoint.summary && rule.description.toLowerCase().includes(endpoint.summary.toLowerCase())) {
                    rule.relatedEndpoints?.push(endpointStr);
                } else if (endpoint.operationId && rule.description.toLowerCase().includes(endpoint.operationId.toLowerCase())) {
                    rule.relatedEndpoints?.push(endpointStr);
                } else if (endpoint.tags?.some(tag => rule.description.toLowerCase().includes(tag.toLowerCase()))) {
                    rule.relatedEndpoints?.push(endpointStr);
                }
                
                // Check for specific endpoint paths
                const pathSegments = endpoint.path.split('/').filter(seg => seg && !seg.startsWith('{'));
                if (pathSegments.some(seg => rule.description.toLowerCase().includes(seg.toLowerCase()))) {
                    if (!rule.relatedEndpoints?.includes(endpointStr)) {
                        rule.relatedEndpoints?.push(endpointStr);
                    }
                }
            }
        }
        
        return mappedRules;
    }

    /**
     * Extracts business rules from product specification text
     * @param content The product specification text
     * @returns Array of business rules
     */
    private extractBusinessRules(content: string): BusinessRule[] {
        const rules: BusinessRule[] = [];
        
        try {
            // Split by markdown headers or numbered sections
            const lines = content.split('\n');
            let currentSection = '';
            let ruleId = 1;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                // Detect section headers (markdown style or numbered)
                if (line.startsWith('##') || /^\d+\.\d+\s+/.test(line)) {
                    currentSection = line.replace(/^#+\s*/, '').replace(/^\d+\.\d+\s+/, '');
                    continue;
                }
                
                // Look for validation rules, requirements, or similar content
                if (line.includes('Validation Rule') || 
                    line.includes('Rule') || 
                    line.includes('Requirement') || 
                    line.includes('Limit') ||
                    line.includes('Must ') ||
                    line.includes('Should ')) {
                    
                    let description = line;
                    let j = i + 1;
                    
                    // Gather multi-line descriptions
                    while (j < lines.length && 
                           lines[j].trim() !== '' && 
                           !lines[j].trim().startsWith('#') && 
                           !/^\d+\.\d+\s+/.test(lines[j])) {
                        description += ' ' + lines[j].trim();
                        j++;
                    }
                    
                    // Determine category and priority
                    let category = 'General';
                    if (description.toLowerCase().includes('security') || description.toLowerCase().includes('auth')) {
                        category = 'Security';
                    } else if (description.toLowerCase().includes('payment') || description.toLowerCase().includes('transaction')) {
                        category = 'Payment';
                    } else if (description.toLowerCase().includes('user') || description.toLowerCase().includes('account')) {
                        category = 'User';
                    }
                    
                    let priority: 'High' | 'Medium' | 'Low' = 'Medium';
                    if (description.toLowerCase().includes('critical') || description.toLowerCase().includes('must')) {
                        priority = 'High';
                    } else if (description.toLowerCase().includes('should') || description.toLowerCase().includes('recommended')) {
                        priority = 'Medium';
                    } else if (description.toLowerCase().includes('may') || description.toLowerCase().includes('optional')) {
                        priority = 'Low';
                    }
                    
                    // Create rule
                    rules.push({
                        id: `R-${ruleId++}`,
                        section: currentSection,
                        description,
                        category,
                        priority
                    });
                    
                    // Skip processed lines
                    i = j - 1;
                }
            }
        } catch (error) {
            logger.warn(`Error extracting business rules: ${(error as Error).message}`);
        }
        
        // If no rules were extracted using the formal approach, try a simpler approach
        if (rules.length === 0) {
            let ruleId = 1;
            
            // Split the content into paragraphs
            const paragraphs = content.split(/\n\s*\n/);
            
            for (const paragraph of paragraphs) {
                // Include paragraphs that look like they contain rules or requirements
                if (paragraph.includes(':') && 
                   (paragraph.toLowerCase().includes('rule') || 
                    paragraph.toLowerCase().includes('requirement') || 
                    paragraph.toLowerCase().includes('validation') ||
                    paragraph.toLowerCase().includes('must') || 
                    paragraph.toLowerCase().includes('should'))) {
                    
                    rules.push({
                        id: `R-${ruleId++}`,
                        section: 'General',
                        description: paragraph.trim(),
                        category: 'General',
                        priority: 'Medium'
                    });
                }
            }
        }
        
        return rules;
    }
}
