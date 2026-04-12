---
id: sample-prompt
version: 1
model: claude-haiku-4-5
max_tokens: 500
temperature: 0
---

# Sample Prompt

## System Instructions
You are a test classifier.

## User Template
Analyze this: {{input}}

Context: {{context}}

## Response Format
Return JSON: { "result": "..." }
