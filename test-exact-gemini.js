const { URL } = require('url');

/**
 * Finds the actual domain from a Google News RSS article URL.
 * The actual article URL is Base64-encoded within the Google News URL path.
 *
 * @param googleNewsUrl The full Google News URL (e.g., https://news.google.com/rss/articles/CBMi...).
 * @returns The root domain (e.g., "example.com") or null if extraction fails.
 */
function getActualDomainFromGoogleNewsUrl(googleNewsUrl) {
    try {
        // 1. Parse the Google News URL
        const parsedUrl = new URL(googleNewsUrl);

        // Expect the path to be something like: /rss/articles/CBMi...
        const pathParts = parsedUrl.pathname.split('/');

        // 2. Identify and extract the Base64 part (usually starts with CBMi or similar)
        // This is often the last part of the path before the query string.
        const base64Part = pathParts.find(part => part.startsWith('CBM'));

        if (!base64Part) {
            console.error('Base64 part not found in URL path.');
            return null;
        }

        // 3. Decode the Base64 string to get the full article URL.
        // Google often prepends the Base64 with 'CBMi' or similar, which needs to be removed.
        // We look for 'CBMi' which often precedes the encoded part of the actual URL.
        // The Base64 string might also contain a full URL encoded within it.
        const encodedString = base64Part;
        
        // This is a common pattern: the actual Base64 part starts after 'CBMi' or similar.
        // The first few characters are often control characters that need removal.
        // A common heuristic is to remove the leading characters until the Base64 can be decoded.
        // CBMi is a common prefix, but the actual URL might be fully Base64 encoded inside.
        
        // Let's try to decode the whole segment and then clean up the result.
        const decodedBuffer = Buffer.from(encodedString, 'base64');
        const decodedText = decodedBuffer.toString('utf-8');

        console.log('  Encoded string:', encodedString.substring(0, 50) + '...');
        console.log('  Decoded length:', decodedText.length);
        console.log('  Decoded text:', decodedText.substring(0, 100).replace(/[\x00-\x1F\x7F]/g, '.'));
        console.log('  Has http://', decodedText.includes('http://'));
        console.log('  Has https://', decodedText.includes('https://'));

        // The decoded string often contains the actual URL prefixed/suffixed with control characters.
        // Use a simple regex to find a valid looking URL within the decoded text.
        // This regex looks for http:// or https:// and captures the URL until a space or end of string.
        const urlMatch = decodedText.match(/(https?:\/\/[^\s]+)/);

        if (!urlMatch || !urlMatch[0]) {
            console.error('Actual URL not found within decoded Base64 string.');
            return null;
        }

        const actualArticleUrl = urlMatch[0];

        // 4. Extract the hostname from the actual article URL
        const articleUrlParsed = new URL(actualArticleUrl);
        const hostname = articleUrlParsed.hostname;

        // 5. Clean up the hostname to get the root domain (e.g., remove 'www.')
        // This is a basic cleanup and doesn't handle complex TLDs (like co.uk)
        const rootDomain = hostname.replace(/^www\./, '');

        return rootDomain;

    } catch (error) {
        console.error('Error processing URL:', error);
        return null;
    }
}

// --- Example Usage ---
const sampleUrl = 'https://news.google.com/rss/articles/CBMingFBVV95cUxPTlYzLTU2d0h4NndNeW1yeVpDYTlaS2UwQ2dkTTlPQlJScVlnMGREQnZmQnFuenBLU3hKeWt5N2ozQk43NERLS0pxSU5xNE11UUVYTXZiTVM5bUQwaU0tdURXVUM3NW5ONU5mQVZZbnNRTnIyMVRITllNU3FfckpPZGl0UWhaUzFtN1g2Y0RyLTdHSENsQWRyUnA5YjdFdw?oc=5';
const domain = getActualDomainFromGoogleNewsUrl(sampleUrl);

console.log(`Google News URL: ${sampleUrl}`);
console.log(`Actual Domain: ${domain}`);

// Test all three URLs
console.log('\n' + '='.repeat(80));
console.log('Testing all three URLs:');
console.log('='.repeat(80));

const testUrls = [
  'https://news.google.com/rss/articles/CBMingFBVV95cUxPTlYzLTU2d0h4NndNeW1yeVpDYTlaS2UwQ2dkTTlPQlJScVlnMGREQnZmQnFuenBLU3hKeWt5N2ozQk43NERLS0pxSU5xNE11UUVYTXZiTVM5bUQwaU0tdURXVUM3NW5ONU5mQVZZbnNRTnIyMVRITllNU3FfckpPZGl0UWhaUzFtN1g2Y0RyLTdHSENsQWRyUnA5YjdFdw?oc=5',
  'https://news.google.com/rss/articles/CBMiiwFBVV95cUxQbGxZRk9ORmlfNThqYWoxSGpXMklzSmEyVEVPZXJGOXRnenFhYzNTblluNm5GYWJRUl9oMEZKMmYxbGVuVFYxS2MzTzlVTWM5SmRSbGNmV2pvemZvRF9nUUN1Z183R0VMdU8xVjVSV1plZDZobDZUTXRhTWp1ak01U25jRlFIY28tU2Y0?oc=5',
  'https://news.google.com/rss/articles/CBMikwFBVV95cUxQRFItZVBFU2dIRVRfTlZFWEl3TDZwcTBrUnFCdWFUd2MyMktXQmdHQWJSeHdLamdhV3lDNUFNaUlHZU4yV1UtelUzMmVuRXFYX0FfazdjZndZMmliY0RSSzR0SHo3aTVTeGpFZFBEcmYzaDBlb0ViTkMtM3BSaW0wOUNYUnZxZlh6NVdTNTJJcFJXQWc?oc=5'
];

testUrls.forEach((url, i) => {
  console.log(`\nTest ${i + 1}:`);
  const result = getActualDomainFromGoogleNewsUrl(url);
  console.log(`Result: ${result}`);
});

