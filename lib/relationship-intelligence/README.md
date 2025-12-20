# Relationship Intelligence Feature

A comprehensive system for analyzing email history to create a living map of relationships, detect decaying connections, track commitments, and predict relationship health.

## Overview

This feature analyzes email interactions to:
1. Extract all email conversations and group by person
2. Build time series of interaction patterns
3. Compute relationship trajectories (growing, stable, decaying)
4. Extract commitments using AI (promises made/received)
5. Predict future relationship health
6. Alert users to at-risk relationships

## Architecture

### Core Components

- **types.ts** - TypeScript definitions for all data structures
- **utils.ts** - Utility functions for email parsing, grouping, and calculations
- **time-series.ts** - Builds weekly time series from email interactions
- **trajectory.ts** - Calculates relationship velocity, acceleration, and health
- **commitment-extractor.ts** - AI-powered extraction of commitments/promises
- **extractor.ts** - Main extraction pipeline
- **email-fetcher.ts** - Fetches emails from Gmail and Outlook

## Usage

### Basic Usage

```typescript
import { extractRelationshipMap, fetchAllEmails } from '@/lib/relationship-intelligence';

// Fetch emails from all connected providers
const emails = await fetchAllEmails(userId, userEmail, 365); // Last year

// Extract relationship map
const relationshipMap = await extractRelationshipMap(emails, userId, userEmail);

// Access categorized relationships
console.log('At-risk relationships:', relationshipMap.atRisk);
console.log('Thriving relationships:', relationshipMap.thriving);
console.log('Stats:', relationshipMap.stats);
```

### Advanced Usage

```typescript
import { RelationshipExtractor } from '@/lib/relationship-intelligence';

// Custom configuration
const extractor = new RelationshipExtractor({
  lookbackDays: 180,  // 6 months
  minMessagesThreshold: 5,  // At least 5 messages
  extractCommitments: true,
  analyzeSentiment: false,  // Expensive, enable selectively
});

const relationshipMap = await extractor.extractRelationships(emails, userId, userEmail);
```

## Relationship Health Statuses

- **thriving** - Growing, frequent contact
- **strong** - Stable, healthy frequency
- **stable** - Okay but watch it
- **cooling** - Starting to decline
- **decaying** - Clearly declining
- **at_risk** - Decaying + unfulfilled commitments
- **dormant** - No recent contact
- **new** - Not enough history

## Features

### Time Series Analysis
- Weekly buckets of interaction data
- Response time calculations
- Initiation tracking (who starts conversations)
- Sentiment analysis (optional, AI-powered)

### Trajectory Calculation
- **Velocity**: Rate of change in messages per week (+ growing, - declining)
- **Acceleration**: Is velocity itself changing?
- **Normal Contact Frequency**: How often you typically communicate
- **Initiation Ratio**: Who drives the relationship (0-1, >0.5 = you initiate more)

### Commitment Tracking
- AI-powered extraction of promises/commitments
- Tracks both outbound (you promised) and inbound (they promised)
- Deadline detection
- Fulfillment tracking
- Overdue detection

### Predictions
- 30-day relationship status prediction
- Days until dormant (if declining)
- Confidence scores
- Actionable recommendations
- Urgency levels

## Configuration

Default configuration can be customized:

```typescript
const config = {
  lookbackDays: 365,           // How far back to analyze
  minMessagesThreshold: 3,      // Minimum messages for a relationship
  bucketSizeDays: 7,            // Time series bucket size
  extractCommitments: true,     // Extract commitments (requires AI)
  analyzeSentiment: false,       // Analyze sentiment (expensive)
  excludedDomains: [...],        // Domains to exclude
  excludedPatterns: [...],      // Regex patterns to exclude
};
```

## Performance Considerations

- Email fetching uses retry logic for rate limits
- Commitment extraction processes in batches
- Time series uses efficient bucketing
- Excludes automated emails (noreply, notifications, etc.)

## Future Enhancements

- Sentiment analysis (currently disabled by default)
- LinkedIn enrichment for contact information
- Relationship alerts/notifications
- Dashboard visualization
- Relationship action suggestions
- Commitment fulfillment verification (AI-powered)

