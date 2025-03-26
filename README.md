# 🚀 TestAutomationAgent VSCode Plugin

## 📌 Table of Contents
- [Introduction](#introduction)
- [Demo](#demo)
- [Inspiration](#inspiration)
- [What It Does](#what-it-does)
- [How We Built It](#how-we-built-it)
- [Challenges We Faced](#challenges-we-faced)
- [How to Run](#how-to-run)
- [Tech Stack](#tech-stack)
- [Team](#team)

---

## 🎯 Introduction
TestAutomationAgent is a powerful VSCode plugin that revolutionizes API testing automation by combining AI capabilities with proven testing frameworks. The plugin automates the entire testing workflow from scenario generation to test execution and remediation, making testing more efficient and comprehensive while requiring less manual effort from QA teams.

## 🎥 Demo
📹 [Video Demo](https://github.com/ewfx/catfe-maverick/tree/main/artifacts/demo) 
🖼️ Screenshots: NA

## 💡 Inspiration
Modern API testing often requires significant manual effort for scenario creation, test case writing, execution, and coverage analysis. We recognized that this process could be dramatically improved through AI automation. TestAutomationAgent was inspired by the need to reduce the time and expertise barriers in API testing while improving test coverage and reliability.

## ⚙️ What It Does
TestAutomationAgent offers end-to-end API testing automation with these key features:

- **AI-Powered Test Scenario Generation**: Automatically analyze requirements (from PDFs or text) and generate comprehensive test scenarios
- **AI-Powered BDD Test Case Creation**: Transform scenarios into executable Karate BDD test cases
- **AI-Powered Test Execution**: Run tests against configurable environments with real-time monitoring
- **AI-Powered Coverage Analysis**: Integrate with Karate Reports and JaCoCo to analyze test results and identify coverage gaps
- **Intelligent Remediation**: Automatically generate fixes for failing tests with AI assistance
- **Plan/Act Architecture**: Unique dual-mode operation where the AI plans testing approaches for user approval, then executes them

## 🛠️ How We Built It
TestAutomationAgent employs a modular architecture with several interconnected components:

1. **VSCode Extension Core**: Manages the plugin's integration with VSCode, UI components, and command registration
2. **Agentic AI Controller**: Orchestrates AI interactions using OpenAI and Claude APIs with Plan/Act architecture
3. **Test Generation Layer**: Processes requirements and produces test scenarios and Karate BDD test cases
4. **Test Execution Layer**: Handles test running, coverage analysis, and code remediation
5. **Platform Integration Layer**: Manages file operations, terminal commands, and data persistence

The plugin leverages advanced AI capabilities through integration with OpenAI and Claude APIs, with specific configurations for both planning and execution phases.

## 🚧 Challenges We Faced
Building TestAutomationAgent presented several technical and conceptual challenges:

1. **LLM Prompt Engineering**: Crafting precise prompts for consistent BDD scenario generation from varied inputs (JIRA, specs)
2. **Scenario Relevance & Accuracy**: Ensuring generated tests match real application behavior and requirements
3. **Cross-Source Coverage Mapping**: Merging JaCoCo, Karate reports, OpenAPI specs, and business requirements to identify coverage gaps
4. **Dynamic Test Gap Analysis**: Detecting missing test areas using AI from cross-analyzed data (test execution + business logic)
5. **Reliable Execution Sequencing**: Implementing readiness checks (e.g., for microservices) to avoid false failures in test runs
6. **User Experience Consistency**: Seamlessly integrating scenario generation, test creation, execution, and remediation into a cohesive flow
7. **Tool Integration**: Seamlessly integrating external tools like Karate BDD and JaCoCo

## 🏃 How to Run
1. Clone the repository  
   ```sh
   git clone https://github.com/example/testautomationagent.git
   ```
2. Install dependencies  
   ```sh
   npm install
   ```
3. Open in VSCode  
   ```sh
   code .
   ```
4. Build & Install Vscode Extension  
   ```sh
   cd code && echo "y" | node package-vsix.js && cd .. && code --install-extension code/dist/testautomationagent.vsix
   ```
4. Reload VsCode for the extension to load correctly
   - Press Command + Shift + P (Mac) in VSCode for Command Palete 
   - Select "Developer: Reload Window"

## 🏗️ Tech Stack
- 🔹 **Frontend**: TypeScript, React (for WebView-based UIs)
- 🔹 **Backend**: Node.js, TypeScript
- 🔹 **AI Integration**: OpenAI API and Claude API
- 🔹 **Test Frameworks**: Karate BDD API
- 🔹 **Coverage Tools**: Karate Reports and JaCoCo integration
- 🔹 **Storage**: VSCode Extension Storage API, local filesystem

## 👥 Team
- **Team Maverick** - Developing AI-powered tools to revolutionize software testing
- [Kasiperumal Achappan](https://github.com/kasiperumal)
- [Giridhar Duggirala](https://github.com/gduggirala)
- [Nageshwar Kandula](https://github.com/kandulanageshwar)
