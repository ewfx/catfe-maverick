// @ts-nocheck
import * as vscode from 'vscode';
import { StatusBarManager } from '../core/statusBar';

// Temporary workaround for xml2js TypeScript issues
// In a real project, you would install @types/xml2js and declare proper types
const xml2js = require('xml2js');
const { parseString } = xml2js;

// Type definitions to handle XML parsing results
interface XmlElement {
    $: Record<string, string>;
    [key: string]: any;
}

interface XmlCounter {
    $: {
        type: string;
        missed: string;
        covered: string;
    };
}

interface XmlMethod {
    $: {
        name: string;
        desc: string;
        line: string;
    };
    counter?: XmlCounter | XmlCounter[];
}

interface XmlClass {
    $: {
        name: string;
        sourcefilename: string;
    };
    method?: XmlMethod | XmlMethod[];
    counter?: XmlCounter | XmlCounter[];
}

interface XmlPackage {
    $: {
        name: string;
    };
    class?: XmlClass | XmlClass[];
}

interface XmlReport {
    $: {
        name: string;
    };
    sessioninfo?: {
        $: {
            id: string;
            start: string;
            dump: string;
        }
    };
    package?: XmlPackage | XmlPackage[];
}

interface XmlTestCase {
    $: {
        name: string;
        classname: string;
        time?: string;
    };
    failure?: {
        $: {
            message: string;
            type: string;
        };
        _: string;
    };
    error?: {
        $: {
            message: string;
            type: string;
        };
        _: string;
    };
    skipped?: any;
    'system-out'?: string;
    'system-err'?: string;
}

interface XmlTestSuite {
    $: {
        name: string;
        time?: string;
        tests?: string;
        failures?: string;
        errors?: string;
        skipped?: string;
    };
    testcase?: XmlTestCase | XmlTestCase[];
}

interface XmlTestSuites {
    $: {
        name?: string;
        time?: string;
        tests?: string;
        failures?: string;
        errors?: string;
        skipped?: string;
    };
    testsuite?: XmlTestSuite | XmlTestSuite[];
}

/**
 * Class for parsing XML files
 */
export class XmlParser {
    private statusBarManager: StatusBarManager;

    constructor() {
        this.statusBarManager = StatusBarManager.getInstance();
    }

    /**
     * Parses a JaCoCo XML report
     * @param xmlContent The JaCoCo XML content
     * @returns Promise resolving to the parsed report
     */
    public async parseJacocoXml(xmlContent: string): Promise<any> {
        try {
            return new Promise((resolve, reject) => {
                parseString(xmlContent, { explicitArray: false }, (err: any, result: any) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    try {
                        // Extract the report data
                        const report = result.report;
                        
                        // Process packages
                        const packages = Array.isArray(report.package) ? report.package : [report.package];
                        
                        // Processed data
                        const processedReport = {
                            name: report.$.name,
                            sessionInfo: this.processSessionInfo(report.sessioninfo),
                            packages: packages.map(pkg => this.processPackage(pkg))
                        };
                        
                        resolve(processedReport);
                    } catch (error) {
                        reject(new Error(`Error processing JaCoCo XML: ${error}`));
                    }
                });
            });
        } catch (error) {
            this.statusBarManager.showError(`Error parsing JaCoCo XML: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Parses an Allure XML report
     * @param xmlContent The Allure XML content
     * @returns Promise resolving to the parsed report
     */
    public async parseAllureXml(xmlContent: string): Promise<any> {
        try {
            return new Promise((resolve, reject) => {
                parseString(xmlContent, { explicitArray: false }, (err: any, result: any) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    try {
                        // Extract the report data
                        const testsuites = result.testsuites;
                        
                        // Process testsuites
                        const processedReport = {
                            testsuites: this.processTestsuites(testsuites)
                        };
                        
                        resolve(processedReport);
                    } catch (error) {
                        reject(new Error(`Error processing Allure XML: ${error}`));
                    }
                });
            });
        } catch (error) {
            this.statusBarManager.showError(`Error parsing Allure XML: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Processes a JaCoCo session info
     * @param sessionInfo The session info
     * @returns The processed session info
     */
    private processSessionInfo(sessionInfo: any): any {
        if (!sessionInfo) {
            return null;
        }
        
        return {
            id: sessionInfo.$.id,
            start: parseInt(sessionInfo.$.start, 10),
            dump: parseInt(sessionInfo.$.dump, 10)
        };
    }

    /**
     * Processes a JaCoCo package
     * @param pkg The package
     * @returns The processed package
     */
    private processPackage(pkg: any): any {
        const name = pkg.$.name;
        
        // Process classes
        const classes = Array.isArray(pkg.class) ? pkg.class : (pkg.class ? [pkg.class] : []);
        
        return {
            name,
            classes: classes.map(cls => this.processClass(cls))
        };
    }

    /**
     * Processes a JaCoCo class
     * @param cls The class
     * @returns The processed class
     */
    private processClass(cls: any): any {
        const name = cls.$.name;
        const sourcefilename = cls.$.sourcefilename;
        
        // Process methods
        const methods = Array.isArray(cls.method) ? cls.method : (cls.method ? [cls.method] : []);
        
        // Process counters
        const counters = Array.isArray(cls.counter) ? cls.counter : (cls.counter ? [cls.counter] : []);
        
        return {
            name,
            sourcefilename,
            methods: methods.map(method => this.processMethod(method)),
            counters: counters.map(counter => this.processCounter(counter))
        };
    }

    /**
     * Processes a JaCoCo method
     * @param method The method
     * @returns The processed method
     */
    private processMethod(method: any): any {
        const name = method.$.name;
        const desc = method.$.desc;
        const line = parseInt(method.$.line, 10);
        
        // Process counters
        const counters = Array.isArray(method.counter) ? method.counter : (method.counter ? [method.counter] : []);
        
        return {
            name,
            desc,
            line,
            counters: counters.map(counter => this.processCounter(counter))
        };
    }

    /**
     * Processes a JaCoCo counter
     * @param counter The counter
     * @returns The processed counter
     */
    private processCounter(counter: any): any {
        const type = counter.$.type;
        const missed = parseInt(counter.$.missed, 10);
        const covered = parseInt(counter.$.covered, 10);
        
        return {
            type,
            missed,
            covered
        };
    }

    /**
     * Processes Allure testsuites
     * @param testsuites The testsuites
     * @returns The processed testsuites
     */
    private processTestsuites(testsuites: any): any {
        // Process testsuites
        const suites = Array.isArray(testsuites.testsuite) ? testsuites.testsuite : (testsuites.testsuite ? [testsuites.testsuite] : []);
        
        return {
            name: testsuites.$.name,
            time: parseFloat(testsuites.$.time || 0),
            tests: parseInt(testsuites.$.tests || 0, 10),
            failures: parseInt(testsuites.$.failures || 0, 10),
            errors: parseInt(testsuites.$.errors || 0, 10),
            skipped: parseInt(testsuites.$.skipped || 0, 10),
            testsuites: suites.map(suite => this.processTestsuite(suite))
        };
    }

    /**
     * Processes an Allure testsuite
     * @param testsuite The testsuite
     * @returns The processed testsuite
     */
    private processTestsuite(testsuite: any): any {
        // Process testcases
        const cases = Array.isArray(testsuite.testcase) ? testsuite.testcase : (testsuite.testcase ? [testsuite.testcase] : []);
        
        return {
            name: testsuite.$.name,
            time: parseFloat(testsuite.$.time || 0),
            tests: parseInt(testsuite.$.tests || 0, 10),
            failures: parseInt(testsuite.$.failures || 0, 10),
            errors: parseInt(testsuite.$.errors || 0, 10),
            skipped: parseInt(testsuite.$.skipped || 0, 10),
            testcases: cases.map(testcase => this.processTestcase(testcase))
        };
    }

    /**
     * Processes an Allure testcase
     * @param testcase The testcase
     * @returns The processed testcase
     */
    private processTestcase(testcase: any): any {
        return {
            name: testcase.$.name,
            classname: testcase.$.classname,
            time: parseFloat(testcase.$.time || 0),
            failure: testcase.failure ? {
                message: testcase.failure.$.message,
                type: testcase.failure.$.type,
                content: testcase.failure._
            } : null,
            error: testcase.error ? {
                message: testcase.error.$.message,
                type: testcase.error.$.type,
                content: testcase.error._
            } : null,
            skipped: testcase.skipped ? true : false,
            systemOut: testcase['system-out'] ? testcase['system-out'] : null,
            systemErr: testcase['system-err'] ? testcase['system-err'] : null
        };
    }
}
