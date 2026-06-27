# Spec-Driven Email Service with LLM Security

## Introduction

This project builds a secure email service that leverages LLM Guard for protection against prompt injection and other LLM vulnerabilities, includes ClamAV scanning for email attachments, configurable spam filtering, and provides an MCP (Model Context Protocol) server interface for LLM agents to interact with the service. Users can sign up and receive custom email addresses (e.g., `<custom-name>@mydomain.com`). The application is designed as a mono repo and is intended to be hosted on Railway.

## Requirements

### 1. User Registration and Custom Email Provisioning

**User Story:** As a new user, I want to sign up for the service and receive a custom email address (e.g., `<custom-name>@mydomain.com`), so that I can have a personalized and secure email identity.

**Acceptance Criteria:**

1.1 The system shall provide a user registration endpoint that accepts a username, email, and password.

1.2 Upon successful registration, the system shall provision a custom email address in the format `<username>@<configured-domain>`.

1.3 The system shall validate that the username is unique before provisioning the email address.

1.4 The system shall validate that the email address provided by the user is a valid email format.

1.5 The system shall store user credentials securely using hashed passwords (e.g., bcrypt).

1.6 The system shall return a confirmation with the provisioned email address upon successful registration.

### 2. LLM Guard Integration for Email Security

**User Story:** As a user, I want all incoming email content to be scanned by LLM Guard for prompt injection and other LLM vulnerabilities, so that my email service remains secure against AI-based attacks.

**Acceptance Criteria:**

2.1 The system shall integrate LLM Guard (https://github.com/protectai/llm-guard) as a middleware service for scanning email content.

2.2 The system shall scan all incoming email text for prompt injection patterns before delivery.

2.3 The system shall scan all incoming email text for other LLM vulnerabilities (e.g., jailbreaking, harmful content, data leakage).

2.4 If a prompt injection or vulnerability is detected, the system shall quarantine the email and notify the user.

2.5 The system shall log all LLM Guard scan results for auditing and analysis.

2.6 The system shall allow configuration of LLM Guard sensitivity levels and scan types.

### 3. ClamAV Attachment Scanning

**User Story:** As a user, I want all email attachments to be scanned by ClamAV for malware and viruses, so that my system is protected against malicious file transfers.

**Acceptance Criteria:**

3.1 The system shall integrate ClamAV (Clam AntiVirus) for scanning all email attachments.

3.2 The system shall scan all attached files before they are delivered to the user's inbox.

3.3 If a virus or malware is detected in an attachment, the system shall remove the attachment and notify the user.

3.4 The system shall support common attachment file types (e.g., PDF, DOCX, images, archives).

3.5 The system shall log all ClamAV scan results for auditing and analysis.

3.6 The system shall handle large attachments gracefully with appropriate timeouts and size limits.

### 4. Configurable Spam Filtering

**User Story:** As a user, I want configurable spam filtering for my emails, so that I can control what types of content are blocked and reduce unwanted messages.

**Acceptance Criteria:**

4.1 The system shall provide configurable spam filtering options that users can enable/disable.

4.2 The system shall allow users to set custom spam filtering rules (e.g., block by sender, block by keyword, block by content type).

4.3 The system shall support allowlists and blocklists for email senders.

4.4 The system shall apply spam filtering rules before email delivery to the user's inbox.

4.5 The system shall log all spam filtering actions for auditing and review.

4.6 The system shall allow users to adjust spam filtering sensitivity levels.

### 5. MCP Server Interface for LLM Agents

**User Story:** As an LLM agent developer, I want to interact with the email service through an MCP (Model Context Protocol) server, so that I can programmatically send, receive, and manage emails with built-in security scanning.

**Acceptance Criteria:**

5.1 The system shall expose an MCP server that implements the Model Context Protocol specification.

5.2 The MCP server shall provide tools for:

- Sending an email (with automatic LLM Guard scanning)
- Receiving/inbox access (with automatic LLM Guard scanning)
- Checking email security scan status
- Managing user registration

5.3 The MCP server shall return scan results alongside email content when queried.

5.4 The MCP server shall support authentication to prevent unauthorized access.

5.5 The MCP server shall be discoverable and follow MCP best practices for tool/ resource definitions.

### 6. Web-Based User Interface

**User Story:** As a user, I want a clean web-based UI to sign up, view my inbox, manage blocked emails, and review spam, so that I can easily interact with the email service.

**Acceptance Criteria:**

6.1 The system shall provide a web-based sign-up page where users can register with a username, email, and password.

6.2 The system shall provide a login page for authenticated access to the email dashboard.

6.3 The system shall provide an inbox view that displays received emails with sender, subject, date, and security scan status.

6.4 The system shall provide a spam folder view showing emails flagged as spam by the spam filter.

6.5 The system shall provide a blocked/quarantined emails view showing emails blocked by LLM Guard or ClamAV.

6.6 The system shall provide a compose email interface for sending new emails.

6.7 The system shall display security scan results (LLM Guard, ClamAV, spam filter) alongside each email in the inbox.

6.8 The system shall provide user settings pages for configuring spam filtering rules and security preferences.

### 7. Email Sending and Receiving Core Functionality

**User Story:** As a user, I want to send and receive emails through the service, so that I can use it as my primary email communication tool.

**Acceptance Criteria:**

7.1 The system shall support sending emails from a user's custom email address to any external recipient.

7.2 The system shall support receiving emails at the user's custom email address.

7.3 The system shall provide an API-based email client for composing, reading, and managing emails.

7.4 The system shall store emails in a persistent data store (e.g., database).

7.5 The system shall support email threading and conversation grouping.

7.6 The system shall support basic email operations: compose, reply, forward, delete.

### 8. Security and Authentication

**User Story:** As a user, I want my email service to be secure, so that my communications and data are protected from unauthorized access.

**Acceptance Criteria:**

8.1 The system shall require authentication for all API endpoints except the registration endpoint.

8.2 The system shall use JWT (JSON Web Tokens) for session management.

8.3 The system shall implement rate limiting to prevent abuse.

8.4 The system shall encrypt sensitive data at rest.

8.5 The system shall support API key-based authentication for MCP server access.

8.6 The system shall implement proper CORS policies for web client access.

### 9. Deployment and Infrastructure

**User Story:** As a developer, I want to deploy the service to Railway with minimal configuration, so that it is easily maintainable and scalable.

**Acceptance Criteria:**

9.1 The system shall be packaged as a mono repo with a clear project structure.

9.2 The system shall include a Dockerfile for containerized deployment.

9.3 The system shall include a `railway.json` configuration file for Railway deployment.

9.4 The system shall use environment variables for all configuration (database URLs, API keys, etc.).

9.5 The system shall include health check endpoints for monitoring.

9.6 The system shall support horizontal scaling for email processing.

### 10. Error Handling and Logging

**User Story:** As a developer, I want comprehensive error handling and logging, so that I can diagnose and fix issues quickly.

**Acceptance Criteria:**

10.1 The system shall implement structured logging across all services.

10.2 The system shall return appropriate HTTP status codes and error messages for API failures.

10.3 The system shall handle LLM Guard and ClamAV service failures gracefully (e.g., timeouts, service unavailable).

10.4 The system shall implement retry logic for transient failures in external service calls.

10.5 The system shall provide a centralized error tracking mechanism.

### 11. Testing

**User Story:** As a developer, I want comprehensive test coverage, so that I can ensure the system works correctly and regressions are caught early.

**Acceptance Criteria:**

11.1 The system shall include unit tests for all core services.

11.2 The system shall include integration tests for LLM Guard and ClamAV integrations.

11.3 The system shall include API endpoint tests for all routes.

11.4 The system shall include MCP server protocol compliance tests.

11.5 The system shall achieve at least 80% code coverage.

11.6 The system shall include a test suite that can be run with a single command.
