import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { XmlParser } from './xmlParser';
import { FileManager } from '../fileSystem/fileManager';
import { CoverageData, CoverageType, CoverageItem, CoverageGap } from './analyzer';

/**
 * Class for parsing JaCoCo XML reports
 */
export class JacocoParser {
    private fileManager: FileManager;
    private xmlParser: XmlParser;

    constructor() {
        this.fileManager = FileManager.getInstance();
        this.xmlParser = new XmlParser();
    }

    /**
     * Parses a JaCoCo XML report file
     * @param reportPath The path to the JaCoCo XML report file
     * @returns Promise resolving to the parsed coverage data
     */
    public async parseReport(reportPath: string): Promise<Map<string, CoverageItem>> {
        try {
            logger.info(`Parsing JaCoCo report from: ${reportPath}`);
            
            // Check if file exists
            if (!await this.fileManager.fileExists(reportPath)) {
                throw new Error(`JaCoCo report file not found: ${reportPath}`);
            }
            
            // Read the report file
            const xmlContent = await this.fileManager.readFile(reportPath);
            
            // Parse the XML
            const parsedReport = await this.xmlParser.parseJacocoXml(xmlContent);
            
            // Process the report
            const coverage = new Map<string, CoverageItem>();
            this.processJacocoReport(parsedReport, coverage);
            
            logger.info(`Successfully parsed JaCoCo report with ${coverage.size} coverage items`);
            return coverage;
        } catch (error) {
            logger.error(`Error parsing JaCoCo report: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Find coverage gaps in the JaCoCo report based on thresholds
     * @param coverage The coverage data
     * @param thresholds Map of coverage types to threshold percentages
     * @returns Array of coverage gaps
     */
    public findCoverageGaps(
        coverage: Map<string, CoverageItem>,
        thresholds: Map<CoverageType, number>
    ): CoverageGap[] {
        const gaps: CoverageGap[] = [];
        
        // Check each coverage item
        for (const item of coverage.values()) {
            // Check class-level coverage
            this.checkCoverageGaps(item, thresholds, gaps);
            
            // Check method-level coverage
            if (item.children) {
                for (const methodItem of item.children) {
                    this.checkCoverageGaps(methodItem, thresholds, gaps);
                }
            }
        }
        
        logger.info(`Found ${gaps.length} coverage gaps in JaCoCo report`);
        return gaps;
    }

    /**
     * Gets a summary of the coverage data
     * @param coverage The coverage data
     * @returns Map of coverage types to coverage data
     */
    public getCoverageSummary(coverage: Map<string, CoverageItem>): Map<CoverageType, CoverageData> {
        const summary = new Map<CoverageType, CoverageData>();
        
        // Initialize summary with zeros
        for (const type of Object.values(CoverageType)) {
            summary.set(type as CoverageType, {
                type: type as CoverageType,
                covered: 0,
                missed: 0,
                total: 0,
                percentage: 0
            });
        }
        
        // Aggregate coverage data
        for (const item of coverage.values()) {
            this.aggregateCoverage(item, summary);
        }
        
        // Calculate percentages
        for (const [type, data] of summary.entries()) {
            if (data.total > 0) {
                data.percentage = Math.round((data.covered / data.total) * 100);
            }
        }
        
        return summary;
    }

    /**
     * Processes a JaCoCo XML report
     * @param report The parsed JaCoCo report
     * @param coverage The coverage map to update
     */
    private processJacocoReport(report: any, coverage: Map<string, CoverageItem>): void {
        // Process packages
        for (const pkg of report.packages || []) {
            const packageName = pkg.name;
            
            // Process classes
            for (const cls of pkg.classes || []) {
                const className = cls.name;
                const fullClassName = `${packageName}.${className}`;
                
                // Create coverage item for class
                const classItem: CoverageItem = {
                    packageName,
                    className,
                    coverageData: new Map(),
                    children: []
                };
                
                // Process class counters
                this.processCounters(classItem, cls.counters);
                
                // Process methods
                for (const method of cls.methods || []) {
                    const methodName = method.name;
                    const line = method.line;
                    
                    // Create coverage item for method
                    const methodItem: CoverageItem = {
                        packageName,
                        className,
                        methodName,
                        line,
                        coverageData: new Map()
                    };
                    
                    // Process method counters
                    this.processCounters(methodItem, method.counters);
                    
                    // Add method to class
                    classItem.children!.push(methodItem);
                }
                
                // Add class to coverage
                coverage.set(fullClassName, classItem);
            }
        }
    }

    /**
     * Processes JaCoCo counter data
     * @param item The coverage item to update
     * @param counters The counter data from JaCoCo
     */
    private processCounters(item: CoverageItem, counters: any[]): void {
        for (const counter of counters || []) {
            // Map JaCoCo counter type to CoverageType
            let type: CoverageType;
            
            switch (counter.type) {
                case 'INSTRUCTION':
                    type = CoverageType.INSTRUCTION;
                    break;
                case 'BRANCH':
                    type = CoverageType.BRANCH;
                    break;
                case 'LINE':
                    type = CoverageType.LINE;
                    break;
                case 'METHOD':
                    type = CoverageType.METHOD;
                    break;
                case 'CLASS':
                    type = CoverageType.CLASS;
                    break;
                default:
                    continue;
            }
            
            // Create coverage data
            const covered = counter.covered || 0;
            const missed = counter.missed || 0;
            const total = covered + missed;
            const percentage = total > 0 ? Math.round((covered / total) * 100) : 0;
            
            const data: CoverageData = {
                type,
                covered,
                missed,
                total,
                percentage
            };
            
            // Add to coverage data
            item.coverageData.set(type, data);
        }
    }

    /**
     * Checks for coverage gaps in a coverage item
     * @param item The coverage item to check
     * @param thresholds The coverage thresholds
     * @param gaps The gaps array to update
     */
    private checkCoverageGaps(
        item: CoverageItem,
        thresholds: Map<CoverageType, number>,
        gaps: CoverageGap[]
    ): void {
        // Check each coverage type
        for (const [type, threshold] of thresholds.entries()) {
            const data = item.coverageData.get(type);
            
            if (data && data.percentage < threshold) {
                // Add additional metrics
                const lineCoverage = item.coverageData.get(CoverageType.LINE)?.percentage || 0;
                const branchCoverage = item.coverageData.get(CoverageType.BRANCH)?.percentage || 0;
                
                // Create a coverage gap
                const gap: CoverageGap = {
                    packageName: item.packageName,
                    className: item.className,
                    methodName: item.methodName,
                    line: item.line,
                    type,
                    coverage: data.percentage,
                    lineCoverage,
                    branchCoverage
                };
                
                gaps.push(gap);
            }
        }
    }

    /**
     * Aggregates coverage data from a coverage item
     * @param item The coverage item
     * @param summary The summary to update
     */
    private aggregateCoverage(
        item: CoverageItem,
        summary: Map<CoverageType, CoverageData>
    ): void {
        // Add this item's coverage to summary
        for (const [type, data] of item.coverageData.entries()) {
            const summaryData = summary.get(type)!;
            
            summaryData.covered += data.covered;
            summaryData.missed += data.missed;
            summaryData.total += data.total;
        }
        
        // Recurse for children
        if (item.children) {
            for (const child of item.children) {
                this.aggregateCoverage(child, summary);
            }
        }
    }
}
