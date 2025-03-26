import * as path from 'path';
import { logger } from '../utils/logger';
import { TestScenario } from '../testGeneration/scenario/scenarioGenerator';
import { JacocoParser } from './jacocoParser';
import { KarateReportParser } from './karateReportParser';
import { SpecificationParser, ApiSpecData, BusinessRuleData } from './specificationParser';
import { GapAnalyzer, GapAnalysisResult, ApiGap, BusinessRuleGap } from './gapAnalyzer';
import { CoverageAnalyzer, CoverageItem, CoverageGap, CoverageType } from './analyzer';

/**
 * Coverage flow analysis result
 */
export interface CoverageFlowResult {
    // Code coverage metrics
    lineCoverage: number;
    branchCoverage: number;
    methodCoverage: number;
    
    // Analysis details
    codeGaps: CoverageGap[];
    apiGaps: ApiGap[];
    businessRuleGaps: BusinessRuleGap[];
    
    // Suggested test scenarios
    suggestedScenarios: TestScenario[];
}

/**
 * Class for managing the coverage analysis flow
 */
export class CoverageFlow {
    private jacocoParser: JacocoParser;
    private karateParser: KarateReportParser;
    private specParser: SpecificationParser;
    private gapAnalyzer: GapAnalyzer;
    private coverageAnalyzer: CoverageAnalyzer;

    constructor() {
        this.jacocoParser = new JacocoParser();
        this.karateParser = new KarateReportParser();
        this.specParser = new SpecificationParser();
        this.gapAnalyzer = new GapAnalyzer();
        this.coverageAnalyzer = CoverageAnalyzer.getInstance();
    }

    /**
     * Analyzes coverage from JaCoCo, Karate, OpenAPI and product specs
     * @param karateReportPath Path to Karate test report
     * @param jacocoReportPath Path to JaCoCo XML report
     * @param openApiPath Path to OpenAPI specification
     * @param productSpecPath Path to product specification
     * @returns Promise resolving to coverage flow result
     */
    public async analyzeCoverage(
        karateReportPath: string,
        jacocoReportPath: string,
        openApiPath: string,
        productSpecPath: string
    ): Promise<CoverageFlowResult> {
        try {
            logger.info('===== Starting comprehensive coverage analysis flow =====');
            
            // 1. Parse JaCoCo report for code coverage
            logger.info('Parsing JaCoCo XML report...');
            const codeCoverage = await this.jacocoParser.parseReport(jacocoReportPath);
            
            // 2. Parse Karate report for API endpoint coverage
            logger.info('Parsing Karate JSON report...');
            const karateReport = await this.karateParser.parseKarateReport(karateReportPath);
            
            // 3. Parse OpenAPI specification
            logger.info('Parsing OpenAPI specification...');
            const apiSpec = await this.specParser.parseOpenApiSpec(openApiPath);
            
            // 4. Parse product specification
            logger.info('Parsing product specification...');
            const businessRules = await this.specParser.parseProductSpec(productSpecPath);
            
            // 5. Map business rules to API endpoints
            logger.info('Mapping business rules to API endpoints...');
            const mappedRules = this.specParser.mapRulesToEndpoints(
                businessRules.rules,
                apiSpec.endpoints
            );
            businessRules.rules = mappedRules;
            
            // 6. Analyze API endpoint coverage
            logger.info('Analyzing API endpoint coverage...');
            const apiCoverage = await this.karateParser.analyzeApiCoverage(
                karateReport.endpointCoverage,
                JSON.parse(await this.readJsonFile(openApiPath))
            );
            
            // 7. Analyze gaps between code, API, and business rules
            logger.info('Analyzing coverage gaps...');
            const gapAnalysis = await this.gapAnalyzer.analyzeGaps(
                codeCoverage,
                apiCoverage,
                apiSpec,
                businessRules
            );
            
            // 8. Get code coverage summary
            const summary = this.jacocoParser.getCoverageSummary(codeCoverage);
            
            // 9. Create flow result
            const result: CoverageFlowResult = {
                lineCoverage: summary.get(CoverageType.LINE)?.percentage || 0,
                branchCoverage: summary.get(CoverageType.BRANCH)?.percentage || 0,
                methodCoverage: summary.get(CoverageType.METHOD)?.percentage || 0,
                codeGaps: gapAnalysis.codeGaps,
                apiGaps: gapAnalysis.apiGaps,
                businessRuleGaps: gapAnalysis.businessRuleGaps,
                suggestedScenarios: gapAnalysis.suggestedScenarios
            };
            
            // Log coverage metrics
            logger.info('===== Coverage Analysis Results =====');
            logger.info(`Line Coverage: ${result.lineCoverage.toFixed(2)}%`);
            logger.info(`Branch Coverage: ${result.branchCoverage.toFixed(2)}%`);
            logger.info(`Method Coverage: ${result.methodCoverage.toFixed(2)}%`);
            logger.info(`Code Gaps: ${result.codeGaps.length}`);
            logger.info(`API Gaps: ${result.apiGaps.length}`);
            logger.info(`Business Rule Gaps: ${result.businessRuleGaps.length}`);
            logger.info(`Suggested Scenarios: ${result.suggestedScenarios.length}`);
            
            return result;
        } catch (error) {
            logger.error(`Error in coverage flow: ${(error as Error).message}`);
            throw new Error(`Coverage flow analysis failed: ${(error as Error).message}`);
        }
    }

    /**
     * Helper to read a JSON file as a string
     * @param filePath Path to JSON file
     * @returns Promise resolving to file content
     */
    private async readJsonFile(filePath: string): Promise<string> {
        try {
            // Assuming FileManager for reading files, but we could use fs for simplicity
            const fs = require('fs').promises;
            return await fs.readFile(filePath, 'utf8');
        } catch (error) {
            logger.error(`Error reading JSON file: ${(error as Error).message}`);
            throw error;
        }
    }
}
