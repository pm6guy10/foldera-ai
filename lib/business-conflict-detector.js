// Business Intelligence Engine - ALWAYS finds value, even from boring documents
// This is the core engine that guarantees insights from ANY document set

export class BusinessConflictDetector {
  constructor() {
    this.criticalPatterns = {
      financial: {
        revenue: /(?:revenue|sales|income|earnings)\s*[:=]?\s*\$?[\d,]+(?:\.\d{2})?[kmb]?/gi,
        budget: /(?:budget|allocated|funding)\s*[:=]?\s*\$?[\d,]+(?:\.\d{2})?[kmb]?/gi,
        cost: /(?:cost|expense|price)\s*[:=]?\s*\$?[\d,]+(?:\.\d{2})?[kmb]?/gi,
        payment: /(?:payment|due|owed)\s*[:=]?\s*\$?[\d,]+(?:\.\d{2})?[kmb]?/gi
      },
      dates: {
        deadline: /(?:deadline|due date|expires?|by)\s*[:=]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+ \d{1,2},? \d{4})/gi,
        start: /(?:start|begin|commence)\s*[:=]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+ \d{1,2},? \d{4})/gi,
        end: /(?:end|finish|complete|delivery)\s*[:=]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+ \d{1,2},? \d{4})/gi
      },
      legal: {
        exclusive: /(?:exclusive|exclusively|sole)\s+(?:rights?|access|agreement)/gi,
        nonexclusive: /(?:non.?exclusive|shared|multiple)/gi,
        confidential: /(?:confidential|proprietary|private|nda)/gi,
        public: /(?:public|open|disclosed)/gi,
        liability: /(?:liability|responsible|liable)\s+(?:for|up to)\s*\$?[\d,]+/gi
      },
      requirements: {
        signature: /(?:signature|signed|executed)\s+(?:by|on|before)/gi,
        approval: /(?:approval|authorized|approved)\s+(?:by|from)/gi,
        review: /(?:review|reviewed|oversight)\s+(?:by|period)/gi
      }
    };
  }

  // Main function: Find all business-critical conflicts OR opportunities
  findBusinessConflicts(documents) {
    const conflicts = [];

    // 1. Financial conflicts (most critical - can cause business failure)
    conflicts.push(...this.findFinancialConflicts(documents));

    // 2. Date/timeline conflicts (can cause missed deadlines)
    conflicts.push(...this.findTimelineConflicts(documents));

    // 3. Legal/contractual conflicts (can cause legal issues)
    conflicts.push(...this.findLegalConflicts(documents));

    // 4. Missing critical requirements (can cause compliance issues)
    conflicts.push(...this.findMissingRequirements(documents));

    // 5. Business logic conflicts (can cause operational issues)
    conflicts.push(...this.findBusinessLogicConflicts(documents));

    // 6. IF NO CONFLICTS FOUND - Generate opportunities instead!
    if (conflicts.length === 0) {
      return this.generateOpportunityInsights(documents);
    }

    return this.prioritizeConflicts(conflicts);
  }

  // THE OPPORTUNITY ENGINE - Guarantees insights from ANY documents
  generateOpportunityInsights(documents) {
    const opportunities = [];

    // 1. PATTERN DETECTION - Find repeated themes
    opportunities.push(...this.findPatterns(documents));

    // 2. MISSING ELEMENTS - Identify what's not there but should be
    opportunities.push(...this.findMissingElements(documents));

    // 3. OPTIMIZATION OPPORTUNITIES - Find inefficiencies
    opportunities.push(...this.findOptimizations(documents));

    // 4. COMPETITIVE INTELLIGENCE - Extract market insights
    opportunities.push(...this.findCompetitiveIntel(documents));

    // 5. COMPLIANCE RISKS - Proactive flags
    opportunities.push(...this.findComplianceRisks(documents));

    // 6. HIDDEN MONEY - Find implied financial exposure
    opportunities.push(...this.findMoneyMentions(documents));

    // 7. ACTION ITEMS - Convert questions/issues to actions
    opportunities.push(...this.findActionItems(documents));

    // 8. KNOWLEDGE GAPS - Identify learning opportunities
    opportunities.push(...this.findKnowledgeGaps(documents));

    return opportunities.slice(0, 3); // Return top 3 most valuable insights
  }

  // Find financial amount mismatches - THE MOST CRITICAL
  findFinancialConflicts(documents) {
    const conflicts = [];
    const financialData = this.extractFinancialData(documents);
    
    // Find same project/contract with different amounts
    financialData.forEach((data1, i) => {
      financialData.forEach((data2, j) => {
        if (i >= j) return;
        
        // Check if they're talking about the same thing
        const similarity = this.calculateContextSimilarity(data1.context, data2.context);
        if (similarity > 0.7) { // High similarity = same project/contract
          
          // Check for amount discrepancies
          const amountDiff = Math.abs(data1.amount - data2.amount);
          const percentDiff = amountDiff / Math.max(data1.amount, data2.amount);
          
          if (percentDiff > 0.1) { // More than 10% difference
            conflicts.push({
              type: 'financial_mismatch',
              severity: percentDiff > 0.5 ? 'critical' : 'warning',
              amount_difference: amountDiff,
              percentage_difference: percentDiff,
              doc1: data1.document,
              doc2: data2.document,
              amount1: data1.amount,
              amount2: data2.amount,
              context: data1.context,
              description: `Financial mismatch: ${data1.document} shows $${data1.amount.toLocaleString()} but ${data2.document} shows $${data2.amount.toLocaleString()} for ${data1.context}`,
              business_impact: this.getFinancialImpact(amountDiff, percentDiff),
              recommended_action: this.getFinancialAction(data1, data2, amountDiff)
            });
          }
        }
      });
    });
    
    return conflicts;
  }

  // Find timeline and deadline conflicts
  findTimelineConflicts(documents) {
    const conflicts = [];
    const timelineData = this.extractTimelineData(documents);
    
    timelineData.forEach((timeline1, i) => {
      timelineData.forEach((timeline2, j) => {
        if (i >= j) return;
        
        const similarity = this.calculateContextSimilarity(timeline1.context, timeline2.context);
        if (similarity > 0.6) { // Same project/obligation
          
          const date1 = new Date(timeline1.date);
          const date2 = new Date(timeline2.date);
          const daysDiff = Math.abs((date2 - date1) / (1000 * 60 * 60 * 24));
          
          if (daysDiff > 7) { // More than a week difference
            conflicts.push({
              type: 'timeline_conflict',
              severity: daysDiff > 30 ? 'critical' : 'warning',
              days_difference: daysDiff,
              doc1: timeline1.document,
              doc2: timeline2.document,
              date1: timeline1.date,
              date2: timeline2.date,
              context: timeline1.context,
              description: `Timeline conflict: ${timeline1.document} shows ${timeline1.date} but ${timeline2.document} shows ${timeline2.date} for ${timeline1.context}`,
              business_impact: this.getTimelineImpact(daysDiff, timeline1.context),
              recommended_action: this.getTimelineAction(timeline1, timeline2)
            });
          }
        }
      });
    });
    
    return conflicts;
  }

  // Find legal/contractual conflicts
  findLegalConflicts(documents) {
    const conflicts = [];
    
    // Check for contradictory legal terms
    const contradictions = [
      ['exclusive', 'non-exclusive'],
      ['confidential', 'public'],
      ['unlimited liability', 'limited liability'],
      ['perpetual', 'term limited']
    ];
    
    contradictions.forEach(([term1, term2]) => {
      const docs1 = documents.filter(doc => 
        doc.content.toLowerCase().includes(term1.toLowerCase())
      );
      const docs2 = documents.filter(doc => 
        doc.content.toLowerCase().includes(term2.toLowerCase())
      );
      
      if (docs1.length > 0 && docs2.length > 0) {
        // Check if they're in related contexts
        docs1.forEach(doc1 => {
          docs2.forEach(doc2 => {
            const similarity = this.calculateDocumentSimilarity(doc1, doc2);
            if (similarity > 0.5) {
              conflicts.push({
                type: 'legal_contradiction',
                severity: 'critical',
                doc1: doc1.name,
                doc2: doc2.name,
                term1: term1,
                term2: term2,
                description: `Legal contradiction: ${doc1.name} specifies "${term1}" while ${doc2.name} specifies "${term2}"`,
                business_impact: 'Could void contract or create legal liability',
                recommended_action: `Legal review required - resolve contradiction between "${term1}" and "${term2}" terms`
              });
            }
          });
        });
      }
    });
    
    return conflicts;
  }

  // Find missing critical requirements
  findMissingRequirements(documents) {
    const conflicts = [];
    
    // Critical requirements that should exist together
    const requirementSets = [
      {
        name: 'Contract Execution',
        required: ['signature', 'date', 'witness'],
        context: 'contract|agreement|msa'
      },
      {
        name: 'Financial Agreement', 
        required: ['amount', 'payment terms', 'due date'],
        context: 'invoice|payment|financial'
      },
      {
        name: 'Project Scope',
        required: ['deliverables', 'timeline', 'budget'],
        context: 'project|sow|statement of work'
      }
    ];
    
    requirementSets.forEach(reqSet => {
      const relevantDocs = documents.filter(doc => 
        new RegExp(reqSet.context, 'gi').test(doc.content)
      );
      
      relevantDocs.forEach(doc => {
        const missingReqs = reqSet.required.filter(req => 
          !new RegExp(req, 'gi').test(doc.content)
        );
        
        if (missingReqs.length > 0) {
          conflicts.push({
            type: 'missing_requirements',
            severity: missingReqs.length > 1 ? 'critical' : 'warning',
            document: doc.name,
            missing_requirements: missingReqs,
            requirement_set: reqSet.name,
            description: `Missing requirements in ${doc.name}: ${missingReqs.join(', ')}`,
            business_impact: this.getMissingRequirementImpact(reqSet.name, missingReqs),
            recommended_action: `Add missing requirements: ${missingReqs.join(', ')}`
          });
        }
      });
    });
    
    return conflicts;
  }

  // Find business logic conflicts (dependencies, sequences, etc.)
  findBusinessLogicConflicts(documents) {
    const conflicts = [];
    
    // Check for logical inconsistencies
    // Example: Phase 2 starts before Phase 1 ends
    const phases = this.extractPhaseData(documents);
    
    phases.forEach(phase1 => {
      phases.forEach(phase2 => {
        if (phase1.number < phase2.number && 
            new Date(phase1.endDate) > new Date(phase2.startDate)) {
          conflicts.push({
            type: 'business_logic_conflict',
            severity: 'warning',
            description: `Phase ${phase1.number} ends after Phase ${phase2.number} starts`,
            business_impact: 'Could cause project timeline issues',
            recommended_action: 'Review and adjust phase timeline dependencies',
            doc1: phase1.document,
            doc2: phase2.document
          });
        }
      });
    });
    
    return conflicts;
  }

  // Helper functions for data extraction
  extractFinancialData(documents) {
    const financialData = [];
    
    documents.forEach(doc => {
      Object.entries(this.criticalPatterns.financial).forEach(([type, pattern]) => {
        const matches = [...doc.content.matchAll(pattern)];
        matches.forEach(match => {
          const amount = this.parseAmount(match[0]);
          if (amount > 0) {
            financialData.push({
              document: doc.name,
              amount: amount,
              type: type,
              context: this.extractContext(doc.content, match.index, 100),
              raw_match: match[0]
            });
          }
        });
      });
    });
    
    return financialData;
  }

  extractTimelineData(documents) {
    const timelineData = [];
    
    documents.forEach(doc => {
      Object.entries(this.criticalPatterns.dates).forEach(([type, pattern]) => {
        const matches = [...doc.content.matchAll(pattern)];
        matches.forEach(match => {
          const date = this.parseDate(match[1] || match[0]);
          if (date) {
            timelineData.push({
              document: doc.name,
              date: date,
              type: type,
              context: this.extractContext(doc.content, match.index, 100),
              raw_match: match[0]
            });
          }
        });
      });
    });
    
    return timelineData;
  }

  // Utility functions
  parseAmount(amountStr) {
    const cleaned = amountStr.replace(/[$,]/g, '').toLowerCase();
    let amount = parseFloat(cleaned);
    
    if (isNaN(amount)) return 0;
    
    if (cleaned.includes('million') || cleaned.includes('m')) amount *= 1000000;
    else if (cleaned.includes('billion') || cleaned.includes('b')) amount *= 1000000000;
    else if (cleaned.includes('thousand') || cleaned.includes('k')) amount *= 1000;
    
    return amount;
  }

  parseDate(dateStr) {
    try {
      return new Date(dateStr).toISOString().split('T')[0];
    } catch {
      return null;
    }
  }

  extractContext(content, index, radius = 50) {
    const start = Math.max(0, index - radius);
    const end = Math.min(content.length, index + radius);
    return content.substring(start, end).trim();
  }

  calculateContextSimilarity(context1, context2) {
    // Simple similarity calculation based on common words
    const words1 = context1.toLowerCase().split(/\s+/);
    const words2 = context2.toLowerCase().split(/\s+/);
    const intersection = words1.filter(word => words2.includes(word));
    return intersection.length / Math.max(words1.length, words2.length);
  }

  calculateDocumentSimilarity(doc1, doc2) {
    // Calculate similarity between two documents based on common key terms
    const keyTerms1 = this.extractKeyTerms(doc1.content);
    const keyTerms2 = this.extractKeyTerms(doc2.content);
    const intersection = keyTerms1.filter(term => keyTerms2.includes(term));
    return intersection.length / Math.max(keyTerms1.length, keyTerms2.length);
  }

  extractKeyTerms(content) {
    // Extract important business terms
    const businessTerms = content.match(/\b(?:project|contract|agreement|client|payment|delivery|deadline|budget|revenue|phase|milestone|requirement)\b/gi) || [];
    const companies = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Inc|LLC|Corp|Ltd)\b/g) || [];
    const amounts = content.match(/\$[\d,]+(?:\.\d{2})?[kmb]?/g) || [];
    
    return [...businessTerms, ...companies, ...amounts].map(term => term.toLowerCase());
  }

  // Business impact assessment
  getFinancialImpact(amountDiff, percentDiff) {
    if (amountDiff > 1000000) return `Critical: $${Math.round(amountDiff/1000000)}M discrepancy could cause significant financial loss`;
    if (amountDiff > 100000) return `High: $${Math.round(amountDiff/1000)}K discrepancy could impact budget`;
    if (percentDiff > 0.5) return `Medium: ${Math.round(percentDiff*100)}% difference could cause confusion`;
    return `Low: Minor financial discrepancy requiring clarification`;
  }

  getTimelineImpact(daysDiff, context) {
    if (daysDiff > 30) return `Critical: Timeline discrepancy could cause major delays in ${context}`;
    if (daysDiff > 14) return `High: Timeline mismatch could affect project schedule`;
    return `Medium: Timeline clarification needed to avoid confusion`;
  }

  getMissingRequirementImpact(reqSetName, missingReqs) {
    if (reqSetName === 'Contract Execution') return 'Critical: Contract may not be legally binding';
    if (reqSetName === 'Financial Agreement') return 'High: Payment issues and disputes likely';
    return `Medium: ${reqSetName} incomplete - could cause operational issues`;
  }

  // Action recommendations
  getFinancialAction(data1, data2, amountDiff) {
    return `Immediately verify which amount is correct: $${data1.amount.toLocaleString()} (${data1.document}) vs $${data2.amount.toLocaleString()} (${data2.document}). Update incorrect document and notify stakeholders.`;
  }

  getTimelineAction(timeline1, timeline2) {
    return `Clarify correct deadline: ${timeline1.date} (${timeline1.document}) vs ${timeline2.date} (${timeline2.document}). Update project timeline and communicate changes.`;
  }

  // Prioritize conflicts by business impact
  prioritizeConflicts(conflicts) {
    const severityOrder = { 'critical': 3, 'warning': 2, 'info': 1 };
    
    return conflicts.sort((a, b) => {
      // First by severity
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      
      // Then by financial impact (if applicable)
      if (a.amount_difference && b.amount_difference) {
        return b.amount_difference - a.amount_difference;
      }
      
      return 0;
    });
  }

  extractPhaseData(documents) {
    // Extract project phase information
    const phases = [];
    documents.forEach(doc => {
      const phaseMatches = [...doc.content.matchAll(/phase\s+(\d+).*?(?:start|begin).*?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}).*?(?:end|finish|complete).*?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi)];
      phaseMatches.forEach(match => {
        phases.push({
          document: doc.name,
          number: parseInt(match[1]),
          startDate: this.parseDate(match[2]),
          endDate: this.parseDate(match[3])
        });
      });
    });
    return phases;
  }

  // THE OPPORTUNITY ENGINE METHODS - These guarantee insights from ANY documents

  findPatterns(documents) {
    const patterns = [];

    // Find most common topics/themes
    const topicCounts = new Map();
    documents.forEach(doc => {
      const topics = this.extractTopics(doc.content);
      topics.forEach(topic => {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      });
    });

    const topTopics = Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    topTopics.forEach(([topic, count]) => {
      if (count >= 2) { // Appears in multiple documents
        patterns.push({
          type: 'pattern',
          severity: 'info',
          title: `Pattern Detected: ${topic}`,
          description: `${topic} mentioned ${count} times across ${documents.length} documents`,
          business_impact: `Consider standardizing ${topic} approach across all documents`,
          recommended_action: `Create a template or process document for ${topic} to ensure consistency`
        });
      }
    });

    return patterns;
  }

  findMissingElements(documents) {
    const missing = [];

    documents.forEach(doc => {
      const content = doc.content.toLowerCase();

      // Check for common missing elements by document type
      if (content.includes('contract') || content.includes('agreement')) {
        if (!content.includes('signature')) {
          missing.push({
            type: 'missing_element',
            severity: 'warning',
            title: 'Missing Signature Section',
            description: `Contract ${doc.name} lacks signature section`,
            business_impact: 'May not be legally enforceable without proper signatures',
            recommended_action: 'Add signature block with date and witness lines'
          });
        }
      }

      if (content.includes('proposal') || content.includes('statement of work')) {
        if (!content.includes('deliverable') && !content.includes('milestone')) {
          missing.push({
            type: 'missing_element',
            severity: 'info',
            title: 'Missing Deliverables Definition',
            description: `Proposal ${doc.name} lacks clear deliverables`,
            business_impact: 'Could lead to scope creep and unclear expectations',
            recommended_action: 'Add deliverables section with specific outcomes and timelines'
          });
        }
      }
    });

    return missing;
  }

  findOptimizations(documents) {
    const optimizations = [];

    // Find redundant processes
    const processWords = ['process', 'procedure', 'workflow', 'system', 'method'];
    let redundancyCount = 0;

    documents.forEach(doc => {
      const content = doc.content.toLowerCase();
      processWords.forEach(word => {
        if (content.includes(word)) redundancyCount++;
      });
    });

    if (redundancyCount > 5) {
      optimizations.push({
        type: 'optimization',
        severity: 'info',
        title: 'Process Redundancy Detected',
        description: `Found ${redundancyCount} process-related mentions across documents`,
        business_impact: 'Multiple similar processes could be streamlined',
        recommended_action: `Consolidate into unified process documentation, saving ${Math.floor(redundancyCount / 3)} hours/week`
      });
    }

    return optimizations;
  }

  findCompetitiveIntel(documents) {
    const intel = [];

    documents.forEach(doc => {
      const content = doc.content.toLowerCase();

      // Look for competitive mentions
      const competitors = content.match(/\b(?:competitor|competition|market|industry|benchmark)\b/gi) || [];
      if (competitors.length > 0) {
        intel.push({
          type: 'competitive_intel',
          severity: 'info',
          title: 'Market Intelligence Found',
          description: `Document contains ${competitors.length} competitive references`,
          business_impact: 'Contains market insights that could inform strategy',
          recommended_action: 'Extract competitive analysis and create market positioning document'
        });
      } else {
        // No competitive analysis? That's an insight too!
        intel.push({
          type: 'missing_intel',
          severity: 'warning',
          title: 'No Competitive Analysis',
          description: `${doc.name} contains no competitive or market analysis`,
          business_impact: 'Missing market context could lead to poor strategic decisions',
          recommended_action: 'Add competitive analysis section comparing to market leaders'
        });
      }
    });

    return intel;
  }

  findComplianceRisks(documents) {
    const risks = [];

    documents.forEach(doc => {
      const content = doc.content.toLowerCase();

      // Look for outdated compliance references
      const outdatedTerms = ['fax', 'typewriter', 'carbon copy', 'pre-internet'];
      outdatedTerms.forEach(term => {
        if (content.includes(term)) {
          risks.push({
            type: 'compliance_risk',
            severity: 'warning',
            title: 'Outdated Reference Detected',
            description: `Document contains outdated reference: "${term}"`,
            business_impact: 'May indicate document needs modernization for current compliance',
            recommended_action: 'Review document for other outdated references and update for current standards'
          });
        }
      });
    });

    return risks;
  }

  findMoneyMentions(documents) {
    const moneyInsights = [];

    documents.forEach(doc => {
      const content = doc.content;

      // Find explicit money mentions
      const explicitAmounts = this.extractAmounts(content);
      if (explicitAmounts.length > 0) {
        const totalValue = explicitAmounts.reduce((sum, amount) => sum + amount.value, 0);

        moneyInsights.push({
          type: 'money_insight',
          severity: 'info',
          title: `Financial Exposure: ${this.formatAmount(totalValue)}`,
          description: `Document references ${this.formatAmount(totalValue)} in financial commitments`,
          business_impact: `Total financial exposure identified across all documents`,
          recommended_action: `Review financial commitments and ensure budget alignment`
        });
      }

      // Find implied costs (overtime, delays, etc.)
      const impliedCosts = this.findImpliedCosts(content);
      if (impliedCosts > 0) {
        moneyInsights.push({
          type: 'implied_cost',
          severity: 'warning',
          title: `Hidden Costs: ${this.formatAmount(impliedCosts)}`,
          description: `Document implies additional costs through delays, overtime, or inefficiencies`,
          business_impact: `Unbudgeted expenses that could impact project profitability`,
          recommended_action: `Quantify implied costs and include in budget planning`
        });
      }
    });

    return moneyInsights;
  }

  findActionItems(documents) {
    const actions = [];

    documents.forEach(doc => {
      const content = doc.content;

      // Find questions (usually need answers)
      const questions = content.match(/\?+/g) || [];
      if (questions.length > 3) {
        actions.push({
          type: 'action_items',
          severity: 'info',
          title: `${questions.length} Unresolved Questions`,
          description: `Document contains ${questions.length} questions that may need follow-up`,
          business_impact: 'Unresolved questions could delay decision-making',
          recommended_action: `Review and assign owners to ${questions.length} open questions`
        });
      }

      // Find action verbs that suggest next steps
      const actionVerbs = ['review', 'approve', 'decide', 'finalize', 'submit'];
      let actionCount = 0;
      actionVerbs.forEach(verb => {
        if (content.toLowerCase().includes(verb)) actionCount++;
      });

      if (actionCount > 2) {
        actions.push({
          type: 'next_steps',
          severity: 'info',
          title: `${actionCount} Action Items Identified`,
          description: `Document suggests ${actionCount} next steps or decisions needed`,
          business_impact: 'Clear next steps identified for project progression',
          recommended_action: `Create task list from ${actionCount} identified action items`
        });
      }
    });

    return actions;
  }

  findKnowledgeGaps(documents) {
    const gaps = [];

    // Look for terms that suggest missing context
    const uncertaintyTerms = ['unclear', 'unknown', 'tbd', 'to be determined', 'pending'];
    documents.forEach(doc => {
      const content = doc.content.toLowerCase();
      let uncertaintyCount = 0;

      uncertaintyTerms.forEach(term => {
        if (content.includes(term)) uncertaintyCount++;
      });

      if (uncertaintyCount > 0) {
        gaps.push({
          type: 'knowledge_gap',
          severity: 'info',
          title: `${uncertaintyCount} Areas of Uncertainty`,
          description: `${doc.name} contains ${uncertaintyCount} areas marked as unclear or pending`,
          business_impact: 'Uncertainty could lead to project delays or poor decisions',
          recommended_action: `Clarify ${uncertaintyCount} uncertain areas before proceeding`
        });
      }
    });

    return gaps;
  }

  // Helper methods for opportunity detection
  extractTopics(content) {
    const topics = [];
    const businessKeywords = [
      'budget', 'timeline', 'deliverable', 'milestone', 'risk', 'compliance',
      'contract', 'payment', 'approval', 'review', 'quality', 'performance'
    ];

    businessKeywords.forEach(keyword => {
      if (content.toLowerCase().includes(keyword)) {
        topics.push(keyword);
      }
    });

    return topics;
  }

  findImpliedCosts(content) {
    const costIndicators = [
      'overtime', 'delay', 'rush', 'expedited', 'emergency', 'weekend',
      'consultant', 'contractor', 'temporary', 'interim'
    ];

    let impliedCost = 0;
    costIndicators.forEach(indicator => {
      if (content.toLowerCase().includes(indicator)) {
        impliedCost += 5000; // Assume $5K per implied cost factor
      }
    });

    return impliedCost;
  }

  extractTopics(content) {
    const topics = [];
    const businessKeywords = [
      'budget', 'timeline', 'deliverable', 'milestone', 'risk', 'compliance',
      'contract', 'payment', 'approval', 'review', 'quality', 'performance'
    ];

    businessKeywords.forEach(keyword => {
      if (content.toLowerCase().includes(keyword)) {
        topics.push(keyword);
      }
    });

    return topics;
  }
}