/**
 * Extracts the source domain from a Google News story title.
 * Google News titles have format: "Story Title - Source Name"
 * 
 * @param title The full story title
 * @returns The source domain (cleaned) or null if not found
 */
export function extractSourceFromTitle(title: string): string | null {
  try {
    // Find the last occurrence of " - " in the title
    const lastDashIndex = title.lastIndexOf(' - ');
    
    if (lastDashIndex === -1) {
      return null;
    }
    
    // Extract everything after the last dash
    const source = title.substring(lastDashIndex + 3).trim();
    
    if (!source) {
      return null;
    }
    
    // Clean up the source:
    // 1. Remove common suffixes like ".com", ".org", etc. to get just the domain
    // 2. Convert to lowercase
    // 3. Remove "www." prefix if present
    let domain = source.toLowerCase();
    
    // Remove "www." prefix
    if (domain.startsWith('www.')) {
      domain = domain.substring(4);
    }
    
    // If it already looks like a domain (has a dot), return it
    // Otherwise, just return the cleaned source name
    return domain;
    
  } catch (error) {
    return null;
  }
}

// Test with actual Google News titles from the logs
const testTitles = [
  'Verizon Eyes Layoff That May Cut 15,000 Jobs - PYMNTS.com',
  'Verizon set to cut about 15,000 jobs, convert some stores to franchises - USA Today',
  'Verizon quietly makes aggressive move to stop fleeing customers - Yahoo Finance',
  'Verizon Names Alfonso Villanueva as Executive Vice President and Chief Revenue Officer - PR Newswire',
  'Verizon layoffs add to mounting toll across large companies - The Mercury News',
  'Best early Black Friday Verizon deals 2025: 10+ deals for new and existing customers - Tom\'s Guide',
  'Verizon to cut 15,000 jobs as new CEO restructures company - The American Bazaar',
  'Verizon to cut about 15,000 jobs as new CEO restructures, sources say - CNBC',
  'Disney cuts prices for Disney Plus, Hulu ads tiers amid subscriber slowdown - CNBC',
  'Tech workers are facing a mental health crisis - TechCrunch',
  'Amazon is said to be working on an ambitious new AI chip - Business Insider',
  'Accenture (ACN): Exploring Valuation Following Launch of Physical AI Orchestrator for Smart Manufacturing - Yahoo Finance',
  'How Accenture\'s Physical AI Orchestrator Simulates Factories - AI Magazine'
];

console.log('Testing Source Extraction from Titles');
console.log('='.repeat(80));

testTitles.forEach((title, i) => {
  const source = extractSourceFromTitle(title);
  console.log(`\n${i + 1}. Title: ${title.substring(0, 70)}${title.length > 70 ? '...' : ''}`);
  console.log(`   Source: ${source || 'NOT FOUND'}`);
});

// Test edge cases
console.log('\n\n' + '='.repeat(80));
console.log('Edge Cases');
console.log('='.repeat(80));

const edgeCases = [
  'Title with no dash',
  'Title - with - multiple - dashes - Final Source',
  'Title - ',
  ' - Source Only',
  ''
];

edgeCases.forEach((title, i) => {
  const source = extractSourceFromTitle(title);
  console.log(`\n${i + 1}. Title: "${title}"`);
  console.log(`   Source: ${source || 'NOT FOUND'}`);
});

