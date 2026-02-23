---
name: code-review-classifier
description: Classifies code review comments into Critical, Major, Minor, or Invalid categories and provides improvement methods when needed. Use when analyzing code review comments, PR feedback, or when the user asks to classify or evaluate review comments.
---

# Code Review Comment Classifier

## Purpose

Analyzes code review comments and classifies them into severity categories. For valid comments requiring improvement, provides specific remediation methods.

## Classification Categories

### Critical
**Definition**: Review is valid and must be fixed immediately. Failure to address could lead to:
- System failures or crashes
- Security vulnerabilities (SQL injection, XSS, authentication bypass, etc.)
- Data loss or corruption
- Production outages
- Legal/compliance violations

**Indicators**:
- Security vulnerabilities (injection attacks, exposed secrets, weak encryption)
- Race conditions or deadlocks
- Memory leaks or resource exhaustion
- Missing null checks that could cause crashes
- Incorrect transaction handling leading to data inconsistency
- Hardcoded credentials or sensitive data

### Major
**Definition**: Review is valid and important. Failure to address could lead to:
- Functional bugs or incorrect behavior
- Significant maintainability issues
- Performance degradation
- Breaking changes in APIs
- User experience problems

**Indicators**:
- Logic errors or incorrect algorithms
- Missing error handling
- Performance issues (N+1 queries, inefficient algorithms)
- API contract violations
- Missing validation
- Code duplication that affects maintainability
- Inconsistent error messages or user feedback

### Minor
**Definition**: Review is valid but represents a "nice to have" improvement. Addresses:
- Code readability and style
- Naming conventions
- Documentation improvements
- Code organization
- Minor optimizations

**Indicators**:
- Style guide violations (naming, formatting)
- Missing or unclear comments
- Code organization suggestions
- Minor refactoring opportunities
- Unused variables or imports
- Magic numbers that should be constants

### Invalid
**Definition**: Review is inaccurate, excessive, or based on misunderstanding. No fix needed because:
- The comment is factually incorrect
- The suggested change would break existing functionality
- The reviewer misunderstood the context or requirements
- The comment is overly prescriptive without justification
- The code already follows best practices for the given context

**Indicators**:
- Suggests changes that contradict project requirements
- Based on outdated or incorrect assumptions
- Overly opinionated without technical justification
- Misunderstands the code's purpose or context
- Suggests patterns that don't fit the project's architecture

## Classification Process

When analyzing a code review comment:

1. **Understand the context**:
   - Read the code being reviewed
   - Understand the project's architecture and constraints
   - Check project-specific rules and conventions
   - Consider the reviewer's perspective

2. **Assess validity**:
   - Is the concern legitimate?
   - Does it apply to the current codebase?
   - Is it based on correct understanding?

3. **Determine severity**:
   - Could this cause immediate harm? → Critical
   - Could this cause functional issues? → Major
   - Is this a quality improvement? → Minor
   - Is this incorrect or unnecessary? → Invalid

4. **Provide remediation** (if Critical, Major, or Minor):
   - Explain why the classification was chosen
   - Provide specific steps to address the issue
   - Include code examples or patterns when helpful
   - Reference project-specific guidelines if applicable

## Output Format

For each review comment, provide:

```markdown
## Classification: [Critical/Major/Minor/Invalid]

### Analysis
[Brief explanation of why this classification was chosen]

### Impact
[What could happen if not addressed (for Critical/Major)]
[Why this is a quality improvement (for Minor)]
[Why this is incorrect/unnecessary (for Invalid)]

### Remediation (if applicable)
[Specific steps to fix the issue]
[Code examples or patterns]
[References to project guidelines]
```

## Examples

### Example 1: Critical
**Comment**: "This SQL query concatenates user input directly. This is vulnerable to SQL injection."

**Classification**: Critical

**Analysis**: Direct string concatenation in SQL queries allows attackers to inject malicious SQL code, potentially leading to data breach, data loss, or unauthorized access.

**Impact**: 
- Attackers could read, modify, or delete sensitive data
- Could lead to complete database compromise
- Legal and compliance violations

**Remediation**:
- Use parameterized queries/prepared statements
- Example:
  ```javascript
  // ❌ Vulnerable
  const query = `SELECT * FROM users WHERE email = '${email}'`;
  
  // ✅ Secure
  await connection.execute(
    'SELECT * FROM users WHERE email = ?',
    [email]
  );
  ```

### Example 2: Major
**Comment**: "This function doesn't handle the case where `user` is null, which could cause a runtime error."

**Classification**: Major

**Analysis**: Missing null check could cause a TypeError when accessing `user.email`, leading to application crash.

**Impact**:
- Application crashes for users with null data
- Poor user experience
- Potential data loss if error occurs during critical operations

**Remediation**:
- Add null check before accessing properties
- Example:
  ```javascript
  // ❌ Vulnerable to null
  function getUserEmail(user) {
    return user.email;
  }
  
  // ✅ Safe
  function getUserEmail(user) {
    if (!user) return null;
    return user.email;
  }
  ```

### Example 3: Minor
**Comment**: "Consider renaming `temp` to `temporaryFileName` for better readability."

**Classification**: Minor

**Analysis**: Variable name is too generic and doesn't clearly indicate its purpose. This is a readability improvement.

**Impact**: 
- Reduced code readability
- Potential confusion for future maintainers

**Remediation**:
- Rename variable to be more descriptive
- Example:
  ```javascript
  // ❌ Unclear
  const temp = generateFileName();
  
  // ✅ Clear
  const temporaryFileName = generateFileName();
  ```

### Example 4: Invalid
**Comment**: "You should use React hooks here instead of class components."

**Analysis**: This project uses vanilla JavaScript without any framework. The comment suggests a change that doesn't apply to the project's architecture.

**Classification**: Invalid

**Reason**: 
- Project doesn't use React or any framework
- The suggestion is based on incorrect assumptions about the tech stack
- Current implementation is appropriate for the project context

**No action needed**: The code is correct for a vanilla JavaScript project.

## Best Practices

1. **Be objective**: Base classification on technical merit, not personal preference
2. **Consider context**: What's appropriate for one project may not be for another
3. **Provide actionable feedback**: When remediation is needed, give specific, implementable steps
4. **Reference standards**: When applicable, cite project rules, coding standards, or industry best practices
5. **Be respectful**: Even for Invalid comments, explain the reasoning constructively
