import { NextResponse } from 'next/server';

// Configure API route
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

export const maxDuration = 60; // Maximum execution time in seconds

export async function POST(req) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files');
    
    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    console.log(`Processing ${files.length} real files...`);
    
    // Actually process each file
    const processedDocs = [];
    
    for (const file of files) {
      try {
        const content = await extractTextFromFile(file);
        
        if (content && content.trim().length > 0) {
          const extractedData = extractStructuredData(content);
          
          processedDocs.push({
            name: file.name,
            size: file.size,
            type: file.type,
            content: content,
            wordCount: content.split(/\s+/).length,
            // Extract real data from each document
            dates: extractedData.dates,
            amounts: extractedData.amounts,
            deadlines: extractedData.deadlines,
            obligations: extractedData.obligations,
            contacts: extractedData.contacts,
            projects: extractedData.projects
          });
          
          console.log(`Processed ${file.name}: ${extractedData.amounts.length} amounts, ${extractedData.dates.length} dates`);
        }
      } catch (fileError) {
        console.error(`Error processing ${file.name}:`, fileError);
        // Continue processing other files
      }
    }
    
    console.log(`Successfully processed ${processedDocs.length} documents`);
    
    // Find REAL conflicts across documents
    const conflicts = findActualConflicts(processedDocs);
    console.log(`Found ${conflicts.length} real conflicts`);
    
    // Use Claude API to analyze (if available)
    let analysis = null;
    try {
      analysis = await analyzeWithClaude(processedDocs, conflicts);
    } catch (claudeError) {
      console.error('Claude analysis failed:', claudeError);
      // Continue without Claude analysis
    }
    
    return NextResponse.json({
      success: true,
      fileCount: files.length,
      processedDocuments: processedDocs.length,
      totalWords: processedDocs.reduce((sum, doc) => sum + doc.wordCount, 0),
      realConflicts: conflicts,
      analysis: analysis,
      documents: processedDocs.map(doc => ({
        name: doc.name,
        size: doc.size,
        wordCount: doc.wordCount,
        amounts: doc.amounts,
        dates: doc.dates,
        deadlines: doc.deadlines.length
      }))
    });
    
  } catch (error) {
    console.error('Real document processing error:', error);
    return NextResponse.json({ 
      error: 'Failed to process documents',
      details: error.message 
    }, { status: 500 });
  }
}

async function extractTextFromFile(file) {
  const buffer = await file.arrayBuffer();
  
  if (file.type === 'application/pdf') {
    try {
      const pdf = (await import('pdf-parse')).default;
      const data = await pdf(Buffer.from(buffer));
      return data.text;
    } catch (pdfError) {
      console.error(`PDF parsing error for ${file.name}:`, pdfError);
      return '';
    }
  } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
             file.type === 'application/msword') {
    try {
      const mammoth = (await import('mammoth')).default;
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
      return value;
    } catch (docError) {
      console.error(`DOC parsing error for ${file.name}:`, docError);
      return '';
    }
  } else if (file.type === 'text/plain') {
    return new TextDecoder().decode(buffer);
  }
  
  return '';
}

function extractStructuredData(content) {
  // Extract dates (various formats)
  const dates = [
    ...(content.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g) || []),
    ...(content.match(/\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/g) || []),
    ...(content.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi) || [])
  ];
  
  // Extract monetary amounts
  const amounts = [
    ...(content.match(/\$[\d,]+(?:\.\d{2})?(?:\s*(?:million|billion|thousand|k|m|b))?/gi) || []),
    ...(content.match(/\b\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars?|USD|usd)/gi) || [])
  ];
  
  // Extract deadlines and obligations
  const deadlines = content.match(/\b(due|deadline|expires?|by|before|no later than)\s+.{0,50}/gi) || [];
  
  // Extract obligations and commitments
  const obligations = [
    ...(content.match(/\b(must|shall|will|agree to|commit to|obligated to|required to)\s+.{0,100}/gi) || []),
    ...(content.match(/\b(contract|agreement|msa|sow|statement of work)\s+.{0,50}/gi) || [])
  ];
  
  // Extract contact information
  const contacts = [
    ...(content.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g) || []),
    ...(content.match(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g) || [])
  ];
  
  // Extract project names and references
  const projects = content.match(/\b(?:project|initiative|program|campaign)\s+[A-Za-z0-9\s-]{2,30}/gi) || [];
  
  return {
    dates: [...new Set(dates)], // Remove duplicates
    amounts: [...new Set(amounts)],
    deadlines: [...new Set(deadlines)],
    obligations: [...new Set(obligations)],
    contacts: [...new Set(contacts)],
    projects: [...new Set(projects)]
  };
}

function findActualConflicts(docs) {
  const conflicts = [];
  
  // Compare every document against every other document
  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const doc1 = docs[i];
      const doc2 = docs[j];
      
      // Check for contradicting amounts in similar contexts
      const amountConflicts = findAmountConflicts(doc1, doc2);
      conflicts.push(...amountConflicts);
      
      // Check for conflicting dates
      const dateConflicts = findDateConflicts(doc1, doc2);
      conflicts.push(...dateConflicts);
      
      // Check for conflicting obligations
      const obligationConflicts = findObligationConflicts(doc1, doc2);
      conflicts.push(...obligationConflicts);
    }
  }
  
  return conflicts;
}

function findAmountConflicts(doc1, doc2) {
  const conflicts = [];
  
  // Look for similar projects/contexts with different amounts
  const commonProjects = doc1.projects.filter(proj1 => 
    doc2.projects.some(proj2 => 
      proj1.toLowerCase().includes(proj2.toLowerCase()) || 
      proj2.toLowerCase().includes(proj1.toLowerCase())
    )
  );
  
  if (commonProjects.length > 0 && doc1.amounts.length > 0 && doc2.amounts.length > 0) {
    // If we have common context and different amounts, it might be a conflict
    const amounts1 = doc1.amounts.map(a => parseAmount(a));
    const amounts2 = doc2.amounts.map(a => parseAmount(a));
    
    // Check for significantly different amounts
    amounts1.forEach(amount1 => {
      amounts2.forEach(amount2 => {
        if (amount1 > 0 && amount2 > 0) {
          const difference = Math.abs(amount1 - amount2);
          const percentDiff = difference / Math.max(amount1, amount2);
          
          // If amounts differ by more than 20% and are substantial (>$1000)
          if (percentDiff > 0.2 && Math.min(amount1, amount2) > 1000) {
            conflicts.push({
              type: 'amount_mismatch',
              severity: 'warning',
              doc1: doc1.name,
              doc2: doc2.name,
              context: commonProjects[0],
              amount1: formatAmount(amount1),
              amount2: formatAmount(amount2),
              difference: formatAmount(difference),
              description: `${doc1.name} shows ${formatAmount(amount1)} but ${doc2.name} shows ${formatAmount(amount2)} for ${commonProjects[0]}`
            });
          }
        }
      });
    });
  }
  
  return conflicts;
}

function findDateConflicts(doc1, doc2) {
  const conflicts = [];
  
  // Look for conflicting deadlines in similar contexts
  const commonObligations = doc1.obligations.filter(ob1 => 
    doc2.obligations.some(ob2 => 
      ob1.toLowerCase().includes(ob2.toLowerCase()) || 
      ob2.toLowerCase().includes(ob1.toLowerCase())
    )
  );
  
  if (commonObligations.length > 0) {
    const dates1 = doc1.dates.map(parseDate);
    const dates2 = doc2.dates.map(parseDate);
    
    // Check for conflicting dates
    dates1.forEach((date1, i) => {
      dates2.forEach((date2, j) => {
        if (date1 && date2) {
          const daysDiff = Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24);
          
          // If dates are more than 30 days apart for same obligation
          if (daysDiff > 30) {
            conflicts.push({
              type: 'date_conflict',
              severity: 'warning',
              doc1: doc1.name,
              doc2: doc2.name,
              context: commonObligations[0],
              date1: doc1.dates[i],
              date2: doc2.dates[j],
              daysDifference: Math.round(daysDiff),
              description: `${doc1.name} shows deadline ${doc1.dates[i]} but ${doc2.name} shows ${doc2.dates[j]} for ${commonObligations[0]}`
            });
          }
        }
      });
    });
  }
  
  return conflicts;
}

function findObligationConflicts(doc1, doc2) {
  const conflicts = [];
  
  // Look for contradictory obligations
  const contradictoryTerms = [
    ['exclusive', 'non-exclusive'],
    ['confidential', 'public'],
    ['required', 'optional'],
    ['mandatory', 'voluntary']
  ];
  
  contradictoryTerms.forEach(([term1, term2]) => {
    const hasTerm1 = doc1.obligations.some(ob => ob.toLowerCase().includes(term1));
    const hasTerm2 = doc2.obligations.some(ob => ob.toLowerCase().includes(term2));
    
    if (hasTerm1 && hasTerm2) {
      conflicts.push({
        type: 'obligation_conflict',
        severity: 'critical',
        doc1: doc1.name,
        doc2: doc2.name,
        term1: term1,
        term2: term2,
        description: `${doc1.name} mentions "${term1}" while ${doc2.name} mentions "${term2}" - potential legal conflict`
      });
    }
  });
  
  return conflicts;
}

async function analyzeWithClaude(documents, conflicts) {
  // Only proceed if we have the Claude API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('No Claude API key available, skipping AI analysis');
    return null;
  }
  
  try {
    // Prepare document summary for Claude
    const docSummary = documents.map(doc => ({
      name: doc.name,
      wordCount: doc.wordCount,
      amounts: doc.amounts.slice(0, 5), // Limit to first 5 amounts
      dates: doc.dates.slice(0, 5), // Limit to first 5 dates
      deadlines: doc.deadlines.slice(0, 3) // Limit to first 3 deadlines
    }));
    
    const prompt = `
    I've processed ${documents.length} real business documents and found ${conflicts.length} potential conflicts.
    
    Documents processed:
    ${JSON.stringify(docSummary, null, 2)}
    
    Conflicts found:
    ${JSON.stringify(conflicts, null, 2)}
    
    Please analyze these conflicts and provide:
    1. Which conflicts are most critical and why
    2. Potential business risks if these conflicts aren't resolved
    3. Recommended actions for each critical conflict
    4. Any additional patterns or risks you notice
    
    Focus on business impact, not just technical differences.
    `;
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.content[0].text;
    
  } catch (error) {
    console.error('Claude analysis failed:', error);
    return null;
  }
}

// Helper functions
function parseAmount(amountStr) {
  const cleaned = amountStr.replace(/[$,]/g, '').toLowerCase();
  let amount = parseFloat(cleaned);
  
  if (cleaned.includes('million') || cleaned.includes('m')) {
    amount *= 1000000;
  } else if (cleaned.includes('billion') || cleaned.includes('b')) {
    amount *= 1000000000;
  } else if (cleaned.includes('thousand') || cleaned.includes('k')) {
    amount *= 1000;
  }
  
  return amount;
}

function formatAmount(amount) {
  if (amount >= 1000000000) {
    return `$${(amount / 1000000000).toFixed(1)}B`;
  } else if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  } else {
    return `$${amount.toFixed(0)}`;
  }
}

function parseDate(dateStr) {
  try {
    return new Date(dateStr);
  } catch {
    return null;
  }
}
