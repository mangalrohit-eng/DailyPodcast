/**
 * Migrate files from Vercel Blob to AWS S3
 * 
 * WARNING: This may not work if Vercel Blob quota is exhausted
 * (quota exceeded prevents both reads and writes)
 * 
 * Usage:
 *   npx tsx scripts/migrate-blob-to-s3.ts
 */

import { list as blobList } from '@vercel/blob';
import { S3Storage } from '../lib/tools/storage-s3';
import { Config } from '../lib/config';

async function migrate() {
  console.log('🔄 Starting migration from Vercel Blob to AWS S3...\n');

  // Check if we have both credentials
  if (!Config.BLOB_READ_WRITE_TOKEN) {
    console.error('❌ BLOB_READ_WRITE_TOKEN not set. Cannot access Vercel Blob.');
    process.exit(1);
  }

  if (!Config.S3_ACCESS_KEY || !Config.S3_SECRET_KEY || !Config.S3_BUCKET) {
    console.error('❌ AWS S3 credentials not set. Cannot upload to S3.');
    console.error('   Set: S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET, S3_REGION');
    process.exit(1);
  }

  const s3 = new S3Storage();
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  try {
    // List all blobs
    console.log('📋 Listing files in Vercel Blob...');
    const { blobs } = await blobList();
    
    console.log(`Found ${blobs.length} files in Vercel Blob\n`);

    if (blobs.length === 0) {
      console.log('✅ No files to migrate.');
      return;
    }

    // Migrate each blob
    for (let i = 0; i < blobs.length; i++) {
      const blob = blobs[i];
      console.log(`\n[${i + 1}/${blobs.length}] Processing: ${blob.pathname}`);
      console.log(`   URL: ${blob.url}`);
      console.log(`   Size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);

      try {
        // Download from Vercel Blob
        console.log('   ⬇️  Downloading from Vercel Blob...');
        const response = await fetch(blob.url);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Determine content type
        const contentType = blob.contentType || guessContentType(blob.pathname);

        // Upload to S3
        console.log('   ⬆️  Uploading to AWS S3...');
        const s3Url = await s3.put(blob.pathname, buffer, contentType);

        // Verify upload
        console.log('   ✅ Successfully migrated!');
        console.log(`   S3 URL: ${s3Url}`);
        
        successCount++;

      } catch (error: any) {
        console.error(`   ❌ Failed: ${error.message}`);
        
        // Check if it's a quota error
        if (error.message.includes('quota') || error.message.includes('403') || error.message.includes('402')) {
          console.error('   💡 This looks like a Vercel Blob quota error.');
          console.error('   💡 You may not be able to read old files with exhausted quota.');
          failCount++;
          
          // Ask if user wants to continue
          console.log('\n⚠️  Vercel Blob quota appears to be exhausted.');
          console.log('   Cannot read files. Migration cannot continue.\n');
          break;
        } else {
          failCount++;
        }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary:');
    console.log('='.repeat(60));
    console.log(`✅ Successfully migrated: ${successCount} files`);
    console.log(`❌ Failed: ${failCount} files`);
    console.log(`⏭️  Skipped: ${skipCount} files`);
    console.log('='.repeat(60));

    if (successCount > 0) {
      console.log('\n🎉 Migration completed!');
      console.log('\nNext steps:');
      console.log('1. Verify files in your S3 bucket');
      console.log('2. Run health check in dashboard');
      console.log('3. Click "Index Existing Episodes" to populate the index');
    } else if (failCount > 0) {
      console.log('\n⚠️  Migration failed. Likely causes:');
      console.log('   - Vercel Blob quota exhausted (cannot read files)');
      console.log('   - Invalid credentials');
      console.log('   - Network issues');
      console.log('\n💡 If quota is exhausted, old files are not accessible.');
      console.log('   Start fresh by clicking "Run Now" to generate new episodes.');
    }

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    
    if (error.message.includes('quota') || error.message.includes('limit')) {
      console.error('\n💡 Your Vercel Blob quota is exhausted.');
      console.error('   You cannot read old files.');
      console.error('   Start fresh with new episodes in AWS S3.');
    } else if (error.message.includes('credentials') || error.message.includes('access')) {
      console.error('\n💡 Check your AWS S3 credentials.');
      console.error('   Verify S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET, S3_REGION');
    }
    
    process.exit(1);
  }
}

function guessContentType(pathname: string): string {
  const ext = pathname.split('.').pop()?.toLowerCase();
  
  const mimeTypes: Record<string, string> = {
    'mp3': 'audio/mpeg',
    'json': 'application/json',
    'xml': 'application/xml',
    'txt': 'text/plain',
    'html': 'text/html',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
  };

  return mimeTypes[ext || ''] || 'application/octet-stream';
}

// Run migration
migrate().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

