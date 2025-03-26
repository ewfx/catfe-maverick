import * as path from 'path';
import { FileManager } from '../fileSystem/fileManager';
import { logger } from '../utils/logger';

/**
 * Represents a step in a Karate scenario
 */
export interface KarateStep {
    name: string;
    line: number;
    keyword: string;
    status: 'passed' | 'failed' | 'skipped';
    httpRequest?: KarateHttpRequest;
    httpResponse?: KarateHttpResponse;
}

/**
 * Represents an HTTP request in a Karate step
 */
export interface KarateHttpRequest {
    method: string;
    url: string;
    path?: string;
    headers?: Record<string, string>;
    body?: any;
}

/**
 * Represents an HTTP response in a Karate step
 */
export interface KarateHttpResponse {
    status: number;
    headers?: Record<string, string>;
    body?: any;
}

/**
 * Represents a scenario in a Karate report
 */
export interface KarateScenario {
    name: string;
    description?: string;
    tags?: string[];
    steps: KarateStep[];
    status: 'passed' | 'failed' | 'skipped';
    durationMillis?: number;
    line?: number;
}

/**
 * Represents a feature in a Karate report
 */
export interface KarateFeature {
    name: string;
    description?: string;
    path?: string;
    tags?: string[];
    scenarioCount: number;
    passedScenarios: number;
    failedScenarios: number;
    skippedScenarios: number;
    scenarios: KarateScenario[];
    durationMillis?: number;
}

/**
 * Represents a Karate report with all its features
 */
export interface KarateReport {
    features: KarateFeature[];
    totalScenarios: number;
    passedScenarios: number;
    failedScenarios: number;
    skippedScenarios: number;
    endpointCoverage: Map<string, EndpointCoverage>;
}

/**
 * Represents the coverage of an API endpoint
 */
export interface EndpointCoverage {
    path: string;
    method: string;
    covered: boolean;
    scenarioCount: number;
    scenarios: string[];
}

/**
 * Class for parsing Karate report JSON files
 */
export class KarateReportParser {
    private fileManager: FileManager;

    constructor() {
        this.fileManager = FileManager.getInstance();
    }

    /**
     * Parse a Karate JSON report file
     * @param reportPath The path to the Karate JSON report file
     * @returns Promise resolving to a parsed KarateReport
     */
    public async parseKarateReport(reportPath: string): Promise<KarateReport> {
        try {
            logger.info(`Parsing Karate report from: ${reportPath}`);
            
            // Check if file exists
            if (!await this.fileManager.fileExists(reportPath)) {
                throw new Error(`Karate report file not found: ${reportPath}`);
            }
            
            // Read the report file
            const content = await this.fileManager.readFile(reportPath);
            
            try {
                // Parse the JSON content
                const reportData = JSON.parse(content);
                
                // Extract features
                const features: KarateFeature[] = this.extractFeatures(reportData);
                
                // Count total scenarios
                const totalScenarios = features.reduce((sum, feature) => sum + feature.scenarioCount, 0);
                const passedScenarios = features.reduce((sum, feature) => sum + feature.passedScenarios, 0);
                const failedScenarios = features.reduce((sum, feature) => sum + feature.failedScenarios, 0);
                const skippedScenarios = features.reduce((sum, feature) => sum + feature.skippedScenarios, 0);
                
                // Extract endpoint coverage
                const endpointCoverage = this.extractEndpointCoverage(features);
                
                // Create the report
                const report: KarateReport = {
                    features,
                    totalScenarios,
                    passedScenarios,
                    failedScenarios,
                    skippedScenarios,
                    endpointCoverage
                };
                
                logger.info(`Parsed Karate report with ${features.length} features and ${totalScenarios} scenarios`);
                
                return report;
            } catch (error) {
                throw new Error(`Failed to parse Karate report JSON: ${(error as Error).message}`);
            }
        } catch (error) {
            logger.error(`Error parsing Karate report: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Extract features from the Karate report data
     * @param reportData The Karate report data
     * @returns Array of KarateFeature objects
     */
    private extractFeatures(reportData: any): KarateFeature[] {
        const features: KarateFeature[] = [];
        
        try {
            // Handle different report formats
            const reportFeatures = reportData.features || reportData.feature || [];
            
            for (const featureData of Array.isArray(reportFeatures) ? reportFeatures : [reportFeatures]) {
                // Extract scenarios
                const scenarios: KarateScenario[] = this.extractScenarios(featureData);
                
                // Count scenario statuses
                const passedScenarios = scenarios.filter(s => s.status === 'passed').length;
                const failedScenarios = scenarios.filter(s => s.status === 'failed').length;
                const skippedScenarios = scenarios.filter(s => s.status === 'skipped').length;
                
                // Create the feature
                const feature: KarateFeature = {
                    name: featureData.name || featureData.keyword || 'Unknown Feature',
                    description: featureData.description,
                    path: featureData.relativePath || featureData.uri,
                    tags: featureData.tags?.map((tag: any) => tag.name) || [],
                    scenarioCount: scenarios.length,
                    passedScenarios,
                    failedScenarios,
                    skippedScenarios,
                    scenarios,
                    durationMillis: featureData.durationMillis || featureData.duration
                };
                
                features.push(feature);
            }
        } catch (error) {
            logger.warn(`Error extracting features: ${(error as Error).message}`);
        }
        
        return features;
    }

    /**
     * Extract scenarios from a feature
     * @param featureData The feature data
     * @returns Array of KarateScenario objects
     */
    private extractScenarios(featureData: any): KarateScenario[] {
        const scenarios: KarateScenario[] = [];
        
        try {
            // Handle different report formats
            const elements = featureData.elements || featureData.scenarios || [];
            
            for (const element of elements) {
                if (element.type === 'scenario' || element.keyword === 'Scenario') {
                    // Extract steps
                    const steps = this.extractSteps(element);
                    
                    // Determine scenario status based on steps
                    let status: 'passed' | 'failed' | 'skipped' = 'passed';
                    
                    if (steps.some(step => step.status === 'failed')) {
                        status = 'failed';
                    } else if (steps.every(step => step.status === 'skipped')) {
                        status = 'skipped';
                    }
                    
                    // Create the scenario
                    const scenario: KarateScenario = {
                        name: element.name || element.keyword || 'Unknown Scenario',
                        description: element.description,
                        tags: element.tags?.map((tag: any) => tag.name) || [],
                        steps,
                        status,
                        durationMillis: element.durationMillis || element.duration,
                        line: element.line
                    };
                    
                    scenarios.push(scenario);
                }
            }
        } catch (error) {
            logger.warn(`Error extracting scenarios: ${(error as Error).message}`);
        }
        
        return scenarios;
    }

    /**
     * Extract steps from a scenario
     * @param scenarioData The scenario data
     * @returns Array of KarateStep objects
     */
    private extractSteps(scenarioData: any): KarateStep[] {
        const steps: KarateStep[] = [];
        
        try {
            // Handle different report formats
            const reportSteps = scenarioData.steps || [];
            
            for (const step of reportSteps) {
                // Extract HTTP request/response if available
                const httpRequest = this.extractHttpRequest(step);
                const httpResponse = this.extractHttpResponse(step);
                
                // Create the step
                const karateStep: KarateStep = {
                    name: step.name || step.text || '',
                    line: step.line || 0,
                    keyword: step.keyword || '',
                    status: step.result?.status || 'skipped',
                    httpRequest,
                    httpResponse
                };
                
                steps.push(karateStep);
            }
        } catch (error) {
            logger.warn(`Error extracting steps: ${(error as Error).message}`);
        }
        
        return steps;
    }

    /**
     * Extract HTTP request from a step
     * @param stepData The step data
     * @returns KarateHttpRequest object or undefined
     */
    private extractHttpRequest(stepData: any): KarateHttpRequest | undefined {
        try {
            // Look for HTTP request data in different formats
            const requestData = stepData.request || stepData.match?.arguments?.find((arg: any) => arg.request);
            
            if (requestData) {
                return {
                    method: requestData.method || '',
                    url: requestData.url || '',
                    path: requestData.path || '',
                    headers: requestData.headers,
                    body: requestData.body
                };
            }
        } catch (error) {
            logger.debug(`Error extracting HTTP request: ${(error as Error).message}`);
        }
        
        return undefined;
    }

    /**
     * Extract HTTP response from a step
     * @param stepData The step data
     * @returns KarateHttpResponse object or undefined
     */
    private extractHttpResponse(stepData: any): KarateHttpResponse | undefined {
        try {
            // Look for HTTP response data in different formats
            const responseData = stepData.response || stepData.result?.response;
            
            if (responseData) {
                return {
                    status: responseData.status || 0,
                    headers: responseData.headers,
                    body: responseData.body
                };
            }
        } catch (error) {
            logger.debug(`Error extracting HTTP response: ${(error as Error).message}`);
        }
        
        return undefined;
    }

    /**
     * Extract API endpoint coverage from features
     * @param features The Karate features
     * @returns Map of endpoints to coverage information
     */
    private extractEndpointCoverage(features: KarateFeature[]): Map<string, EndpointCoverage> {
        const endpoints = new Map<string, EndpointCoverage>();
        
        try {
            // Iterate through all features, scenarios, and steps
            for (const feature of features) {
                for (const scenario of feature.scenarios) {
                    for (const step of scenario.steps) {
                        // Check if the step has an HTTP request
                        if (step.httpRequest) {
                            const { method, url, path } = step.httpRequest;
                            
                            // Use path if available, otherwise extract path from URL
                            const requestPath = path || this.extractPathFromUrl(url);
                            
                            if (requestPath && method) {
                                const key = `${method.toUpperCase()}:${requestPath}`;
                                
                                // Add or update endpoint coverage
                                if (!endpoints.has(key)) {
                                    endpoints.set(key, {
                                        path: requestPath,
                                        method: method.toUpperCase(),
                                        covered: true,
                                        scenarioCount: 0,
                                        scenarios: []
                                    });
                                }
                                
                                const coverage = endpoints.get(key)!;
                                
                                // Add scenario if not already counted
                                if (!coverage.scenarios.includes(scenario.name)) {
                                    coverage.scenarioCount++;
                                    coverage.scenarios.push(scenario.name);
                                }
                            }
                        }
                    }
                }
            }
        } catch (error) {
            logger.warn(`Error extracting endpoint coverage: ${(error as Error).message}`);
        }
        
        return endpoints;
    }

    /**
     * Extract path component from a URL
     * @param url The URL
     * @returns The path component
     */
    private extractPathFromUrl(url: string): string {
        try {
            // Try to parse the URL
            const parsedUrl = new URL(url);
            return parsedUrl.pathname;
        } catch (error) {
            // If URL parsing fails, try to extract the path manually
            const match = url.match(/https?:\/\/[^\/]+(\/[^?#]*)/);
            return match ? match[1] : '';
        }
    }

    /**
     * Compare Karate endpoint coverage with OpenAPI specification
     * @param endpointCoverage The endpoint coverage from Karate
     * @param openApiSpec The OpenAPI specification
     * @returns Map of all API endpoints with coverage information
     */
    public async analyzeApiCoverage(
        endpointCoverage: Map<string, EndpointCoverage>,
        openApiSpec: any
    ): Promise<Map<string, EndpointCoverage>> {
        const apiCoverage = new Map<string, EndpointCoverage>(endpointCoverage);
        
        try {
            // Extract endpoints from OpenAPI spec
            const paths = openApiSpec.paths || {};
            
            for (const [path, methods] of Object.entries(paths)) {
                for (const [method, definition] of Object.entries(methods as Record<string, any>)) {
                    if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method.toLowerCase())) {
                        const key = `${method.toUpperCase()}:${path}`;
                        
                        // Add endpoint if not already in coverage
                        if (!apiCoverage.has(key)) {
                            apiCoverage.set(key, {
                                path: path,
                                method: method.toUpperCase(),
                                covered: false,
                                scenarioCount: 0,
                                scenarios: []
                            });
                        }
                    }
                }
            }
            
            // Log coverage stats
            const totalEndpoints = apiCoverage.size;
            const coveredEndpoints = Array.from(apiCoverage.values()).filter(e => e.covered).length;
            const coveragePercentage = totalEndpoints > 0 ? (coveredEndpoints / totalEndpoints) * 100 : 0;
            
            logger.info(`API endpoint coverage: ${coveredEndpoints}/${totalEndpoints} (${coveragePercentage.toFixed(2)}%)`);
        } catch (error) {
            logger.warn(`Error analyzing API coverage: ${(error as Error).message}`);
        }
        
        return apiCoverage;
    }
}
