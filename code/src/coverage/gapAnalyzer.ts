import { logger } from '../utils/logger';
import { AIController } from '../ai/controller';
import { TestScenario } from '../testGeneration/scenario/scenarioGenerator';
import { CoverageData, CoverageGap, CoverageItem, CoverageType } from './analyzer';
import { ApiEndpoint, ApiSpecData, BusinessRule, BusinessRuleData } from './specificationParser';
import { EndpointCoverage } from './karateReportParser';

/**
 * Represents a coverage gap analysis result
 */
export interface GapAnalysisResult {
    codeGaps: CoverageGap[];
    apiGaps: ApiGap[];
    businessRuleGaps: BusinessRuleGap[];
    suggestedScenarios: TestScenario[];
}

/**
 * Represents an API endpoint gap
 */
export interface ApiGap {
    path: string;
    method: string;
    operationId?: string;
    covered: boolean;
    suggestion?: string;
}

/**
 * Represents a business rule gap
 */
export interface BusinessRuleGap {
    ruleId: string;
    description: string;
    category: string;
    priority: 'High' | 'Medium' | 'Low';
    covered: boolean;
    suggestion?: string;
}

/**
 * Class for analyzing coverage gaps between code, API and business rules
 */
export class GapAnalyzer {
    private aiController: AIController;

    constructor() {
        this.aiController = AIController.getInstance();
    }

    /**
     * Analyzes gaps between code coverage, API coverage, and business rules
     * @param codeCoverage The code coverage data from JaCoCo
     * @param apiCoverage The API endpoint coverage from Karate
     * @param apiSpec The API specification data
     * @param businessRules The business rule data
     * @returns Promise resolving to gap analysis result
     */
    public async analyzeGaps(
        codeCoverage: Map<string, CoverageItem>,
        apiCoverage: Map<string, EndpointCoverage>,
        apiSpec: ApiSpecData,
        businessRules: BusinessRuleData
    ): Promise<GapAnalysisResult> {
        try {
            logger.info('===== Starting coverage gap analysis =====');
            
            // Find code coverage gaps
            logger.info('Analyzing code coverage gaps...');
            const codeGaps = this.findCodeCoverageGaps(codeCoverage);
            logger.info(`Found ${codeGaps.length} code coverage gaps`);
            
            // Find API coverage gaps
            logger.info('Analyzing API coverage gaps...');
            const apiGaps = this.findApiCoverageGaps(apiCoverage, apiSpec);
            logger.info(`Found ${apiGaps.length} API coverage gaps`);
            
            // Find business rule coverage gaps
            logger.info('Analyzing business rule coverage gaps...');
            const businessRuleGaps = this.findBusinessRuleGaps(apiCoverage, businessRules);
            logger.info(`Found ${businessRuleGaps.length} business rule coverage gaps`);
            
            // Generate test scenarios for gaps
            logger.info('Generating test scenarios for gaps using LLM...');
            const suggestedScenarios = await this.generateTestScenariosFromGaps(
                codeGaps,
                apiGaps,
                businessRuleGaps,
                apiSpec,
                businessRules
            );
            logger.info(`Generated ${suggestedScenarios.length} test scenarios`);
            
            // Create result
            const result: GapAnalysisResult = {
                codeGaps,
                apiGaps,
                businessRuleGaps,
                suggestedScenarios
            };
            
            logger.info('===== Coverage gap analysis completed =====');
            return result;
        } catch (error) {
            logger.error(`Error analyzing coverage gaps: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Finds code coverage gaps
     * @param codeCoverage The code coverage data
     * @returns Array of code coverage gaps
     */
    private findCodeCoverageGaps(codeCoverage: Map<string, CoverageItem>): CoverageGap[] {
        const gaps: CoverageGap[] = [];
        const thresholds = new Map<CoverageType, number>([
            [CoverageType.LINE, 80],
            [CoverageType.BRANCH, 70],
            [CoverageType.METHOD, 80]
        ]);
        
        // Check each code item for coverage
        for (const item of codeCoverage.values()) {
            // Check class coverage
            this.checkCodeItemGaps(item, thresholds, gaps);
            
            // Check method coverage
            if (item.children) {
                for (const methodItem of item.children) {
                    this.checkCodeItemGaps(methodItem, thresholds, gaps);
                }
            }
        }
        
        // Sort gaps by line coverage (ascending)
        gaps.sort((a, b) => {
            const aLineCov = a.lineCoverage ?? 0;
            const bLineCov = b.lineCoverage ?? 0;
            return aLineCov - bLineCov;
        });
        
        return gaps;
    }

    /**
     * Checks a code item for coverage gaps
     * @param item The code item to check
     * @param thresholds The coverage thresholds
     * @param gaps The gaps array to update
     */
    private checkCodeItemGaps(
        item: CoverageItem,
        thresholds: Map<CoverageType, number>,
        gaps: CoverageGap[]
    ): void {
        // Check each coverage type
        for (const [type, threshold] of thresholds.entries()) {
            const data = item.coverageData.get(type);
            
            if (data && data.percentage < threshold) {
                // Get additional metrics for analysis
                const lineCoverage = item.coverageData.get(CoverageType.LINE)?.percentage ?? 0;
                const branchCoverage = item.coverageData.get(CoverageType.BRANCH)?.percentage ?? 0;
                
                // Create gap item
                const gap: CoverageGap = {
                    packageName: item.packageName,
                    className: item.className,
                    methodName: item.methodName,
                    line: item.line,
                    type,
                    coverage: data.percentage,
                    lineCoverage,
                    branchCoverage,
                    suggestion: this.generateCodeGapSuggestion(item, type, data)
                };
                
                gaps.push(gap);
            }
        }
    }

    /**
     * Generates a suggestion for a code coverage gap
     * @param item The coverage item
     * @param type The coverage type
     * @param data The coverage data
     * @returns Suggestion string
     */
    private generateCodeGapSuggestion(
        item: CoverageItem,
        type: CoverageType,
        data: CoverageData
    ): string {
        const className = item.className.split('/').pop() || item.className;
        const methodName = item.methodName || 'unknown method';
        
        let suggestion = `Test ${className}`;
        if (item.methodName) {
            suggestion += `.${methodName}`;
        }
        
        suggestion += ` for improved ${type.toLowerCase()} coverage (currently ${data.percentage}%)`;
        
        if (type === CoverageType.BRANCH) {
            suggestion += '. Ensure all conditional branches are tested.';
        } else if (type === CoverageType.LINE) {
            suggestion += '. Ensure all code paths are exercised.';
        } else if (type === CoverageType.METHOD) {
            suggestion += '. Ensure method is called with various inputs.';
        }
        
        return suggestion;
    }

    /**
     * Finds API coverage gaps
     * @param apiCoverage The API endpoint coverage
     * @param apiSpec The API specification data
     * @returns Array of API gaps
     */
    private findApiCoverageGaps(
        apiCoverage: Map<string, EndpointCoverage>,
        apiSpec: ApiSpecData
    ): ApiGap[] {
        const gaps: ApiGap[] = [];
        
        // Check all endpoints from the spec
        for (const endpoint of apiSpec.endpoints) {
            const key = `${endpoint.method}:${endpoint.path}`;
            const coverage = apiCoverage.get(key);
            
            // If endpoint is not covered, add to gaps
            if (!coverage || !coverage.covered) {
                gaps.push({
                    path: endpoint.path,
                    method: endpoint.method,
                    operationId: endpoint.operationId,
                    covered: false,
                    suggestion: this.generateApiGapSuggestion(endpoint)
                });
            }
        }
        
        // Sort gaps by priority (POST/PUT operations first)
        gaps.sort((a, b) => {
            const methodPriority: Record<string, number> = {
                'POST': 0,
                'PUT': 1,
                'DELETE': 2,
                'GET': 3,
                'PATCH': 4,
                'HEAD': 5,
                'OPTIONS': 6
            };
            
            return (methodPriority[a.method] || 99) - (methodPriority[b.method] || 99);
        });
        
        return gaps;
    }

    /**
     * Generates a suggestion for an API gap
     * @param endpoint The API endpoint
     * @returns Suggestion string
     */
    private generateApiGapSuggestion(endpoint: ApiEndpoint): string {
        let suggestion = `Test ${endpoint.method} ${endpoint.path}`;
        
        if (endpoint.operationId) {
            suggestion += ` (${endpoint.operationId})`;
        }
        
        if (endpoint.summary) {
            suggestion += `: ${endpoint.summary}`;
        }
        
        // Add more detailed suggestions based on method
        if (endpoint.method === 'GET') {
            suggestion += '. Test different query parameters and response codes.';
        } else if (endpoint.method === 'POST') {
            suggestion += '. Test with valid and invalid request payloads.';
        } else if (endpoint.method === 'PUT') {
            suggestion += '. Test update functionality with different payloads.';
        } else if (endpoint.method === 'DELETE') {
            suggestion += '. Test successful deletion and error cases.';
        }
        
        return suggestion;
    }

    /**
     * Finds business rule coverage gaps
     * @param apiCoverage The API endpoint coverage
     * @param businessRules The business rule data
     * @returns Array of business rule gaps
     */
    private findBusinessRuleGaps(
        apiCoverage: Map<string, EndpointCoverage>,
        businessRules: BusinessRuleData
    ): BusinessRuleGap[] {
        const gaps: BusinessRuleGap[] = [];
        
        // Check each business rule
        for (const rule of businessRules.rules) {
            let covered = false;
            
            // Check if related endpoints are covered
            if (rule.relatedEndpoints && rule.relatedEndpoints.length > 0) {
                covered = rule.relatedEndpoints.some(endpointStr => {
                    const parts = endpointStr.split(' ');
                    const method = parts[0];
                    const path = parts[1];
                    const key = `${method}:${path}`;
                    
                    return apiCoverage.has(key) && apiCoverage.get(key)!.covered;
                });
            }
            
            // If rule is not covered, add to gaps
            if (!covered) {
                gaps.push({
                    ruleId: rule.id,
                    description: rule.description,
                    category: rule.category,
                    priority: rule.priority,
                    covered: false,
                    suggestion: this.generateBusinessRuleGapSuggestion(rule)
                });
            }
        }
        
        // Sort gaps by priority
        gaps.sort((a, b) => {
            const priorityMap: Record<string, number> = {
                'High': 0,
                'Medium': 1,
                'Low': 2
            };
            
            return (priorityMap[a.priority] || 99) - (priorityMap[b.priority] || 99);
        });
        
        return gaps;
    }

    /**
     * Generates a suggestion for a business rule gap
     * @param rule The business rule
     * @returns Suggestion string
     */
    private generateBusinessRuleGapSuggestion(rule: BusinessRule): string {
        let suggestion = `Test business rule: ${rule.description.substring(0, 100)}`;
        
        if (rule.description.length > 100) {
            suggestion += '...';
        }
        
        suggestion += ` (${rule.category}, ${rule.priority} priority)`;
        
        // Add endpoint suggestions if available
        if (rule.relatedEndpoints && rule.relatedEndpoints.length > 0) {
            suggestion += '. Test using endpoints: ' + rule.relatedEndpoints.join(', ');
        }
        
        return suggestion;
    }

    /**
     * Generates test scenarios from coverage gaps using OpenAI
     * @param codeGaps The code coverage gaps
     * @param apiGaps The API coverage gaps
     * @param businessRuleGaps The business rule coverage gaps
     * @param apiSpec The API specification data
     * @param businessRules The business rule data
     * @returns Promise resolving to array of test scenarios
     */
    private async generateTestScenariosFromGaps(
        codeGaps: CoverageGap[],
        apiGaps: ApiGap[],
        businessRuleGaps: BusinessRuleGap[],
        apiSpec: ApiSpecData,
        businessRules: BusinessRuleData
    ): Promise<TestScenario[]> {
        try {
            // Generate prompt for OpenAI
            const prompt = this.constructPromptForScenarioGeneration(
                codeGaps,
                apiGaps,
                businessRuleGaps,
                apiSpec,
                businessRules
            );
            
            // Get response from OpenAI
            logger.info('Sending prompt to OpenAI for scenario generation');
            const response = await this.aiController.sendPrompt(
                prompt,
                'You are a Test Automation Agent that helps create comprehensive test scenarios to address coverage gaps in the system.'
            );
            
            // Parse the response into scenarios
            const scenarios = this.parseScenarioResponse(response.text);
            logger.info(`Parsed ${scenarios.length} scenarios from OpenAI response`);
            
            return scenarios;
        } catch (error) {
            logger.error(`Error generating test scenarios from gaps: ${(error as Error).message}`);
            
            // Return empty array on error
            return [];
        }
    }

    /**
     * Constructs a prompt for OpenAI to generate test scenarios
     * @param codeGaps The code coverage gaps
     * @param apiGaps The API coverage gaps
     * @param businessRuleGaps The business rule coverage gaps
     * @param apiSpec The API specification data
     * @param businessRules The business rule data
     * @returns The constructed prompt
     */
    private constructPromptForScenarioGeneration(
        codeGaps: CoverageGap[],
        apiGaps: ApiGap[],
        businessRuleGaps: BusinessRuleGap[],
        apiSpec: ApiSpecData,
        businessRules: BusinessRuleData
    ): string {
        // Limit to most important gaps to avoid token limits
        const topCodeGaps = codeGaps.slice(0, 5);
        const topApiGaps = apiGaps.slice(0, 5);
        const topBusinessRuleGaps = businessRuleGaps.slice(0, 5);
        
        // Construct prompt
        let prompt = `
Generate test scenarios to improve code coverage based on the following gap analysis:

API Information:
- Title: ${apiSpec.title}
- Version: ${apiSpec.version}
${apiSpec.description ? `- Description: ${apiSpec.description}` : ''}

`;

        // Add code coverage gaps
        if (topCodeGaps.length > 0) {
            prompt += `\nCode Coverage Gaps:\n`;
            
            for (const gap of topCodeGaps) {
                prompt += `- Class: ${gap.className}${gap.methodName ? `, Method: ${gap.methodName}` : ''}
  - ${gap.type} Coverage: ${gap.coverage}%
  - Suggestion: ${gap.suggestion}\n`;
            }
        }
        
        // Add API coverage gaps
        if (topApiGaps.length > 0) {
            prompt += `\nAPI Coverage Gaps:\n`;
            
            for (const gap of topApiGaps) {
                prompt += `- ${gap.method} ${gap.path}${gap.operationId ? ` (${gap.operationId})` : ''}
  - Suggestion: ${gap.suggestion}\n`;
            }
        }
        
        // Add business rule gaps
        if (topBusinessRuleGaps.length > 0) {
            prompt += `\nBusiness Rule Coverage Gaps:\n`;
            
            for (const gap of topBusinessRuleGaps) {
                prompt += `- ${gap.ruleId}: ${gap.description.substring(0, 150)}${gap.description.length > 150 ? '...' : ''}
  - Category: ${gap.category}, Priority: ${gap.priority}
  - Suggestion: ${gap.suggestion}\n`;
            }
        }
        
        // Add response instructions
        prompt += `
Based on the above gaps, generate 5-10 detailed test scenarios. For each scenario, provide:
1. A unique ID (TS-XXX format)
2. A clear title
3. A detailed description
4. Priority (High/Medium/Low)
5. Source requirements
6. Steps to execute the test
7. Expected results

Format your response as a valid JSON array of scenarios with the following structure:
[
  {
    "id": "TS-GAP-XXX",
    "title": "Scenario title",
    "description": "Detailed description",
    "priority": "High/Medium/Low",
    "sourceRequirements": ["Coverage Gap", "Business Rule", "API Endpoint"],
    "steps": [
      "Step 1 description",
      "Step 2 description"
    ],
    "expectedResults": [
      "Expected result 1",
      "Expected result 2"
    ]
  }
]

Focus on creating scenarios that:
- Address the most critical gaps first
- Cover both success and failure cases
- Test boundary conditions and edge cases
- Validate business rules thoroughly
`;

        return prompt;
    }

    /**
     * Parses the OpenAI response into test scenarios
     * @param responseText The response text from OpenAI
     * @returns Array of test scenarios
     */
    private parseScenarioResponse(responseText: string): TestScenario[] {
        try {
            // Extract JSON content from the response
            const jsonPattern = /\[\s*\{[\s\S]*\}\s*\]/;
            const match = responseText.match(jsonPattern);
            
            if (!match) {
                logger.warn('No valid JSON found in the OpenAI response');
                return [];
            }
            
            // Parse the JSON
            const scenarios = JSON.parse(match[0]) as TestScenario[];
            
            // Validate the structure
            for (const scenario of scenarios) {
                if (!scenario.id || !scenario.title || !scenario.description || !scenario.priority) {
                    logger.warn(`Invalid scenario structure: ${JSON.stringify(scenario)}`);
                    return [];
                }
            }
            
            return scenarios;
        } catch (error) {
            logger.error(`Error parsing OpenAI response: ${(error as Error).message}`);
            return [];
        }
    }
}
