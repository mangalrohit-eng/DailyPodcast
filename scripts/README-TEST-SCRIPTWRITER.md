# Test Scriptwriter Locally

This script allows you to test the scriptwriter prompts locally without running the full pipeline.

## Prerequisites

1. You need at least one successful podcast run in production
2. AWS credentials configured (same as production)
3. OpenAI API key set in environment

## Usage

### Test with Latest Run

```bash
npm run test-scriptwriter
```

This will:
1. Fetch the most recent successful run from S3
2. Extract the outline and picks
3. Run the scriptwriter agent locally
4. Save results to `test-data/` directory

### Test with Specific Run

```bash
npm run test-scriptwriter 2025-11-16_1763252670339
```

Replace `2025-11-16_1763252670339` with any valid run ID.

## Output

The script creates a `test-data/` directory with:

- **`scriptwriter-input.json`**: The input data sent to the scriptwriter
- **`scriptwriter-output.json`**: Full JSON output from the agent
- **`generated-script.txt`**: Plain text version of the generated script

## What Gets Tested

✅ All scriptwriter prompts (system + user)  
✅ Word count enforcement  
✅ Style guidance (executive/casual/technical)  
✅ Voice selection logic  
✅ Transition generation  
✅ Citation handling  
✅ Section breakdown  

## Workflow for Testing Prompts

1. **Run the test script** to see current output:
   ```bash
   npm run test-scriptwriter
   ```

2. **Edit prompts** in `lib/agents/scriptwriter.ts`:
   - Lines 38-71: System prompt
   - Lines 259-282: Style guidance
   - Lines 284-350: Main user prompt
   - Lines 455-486: Outro guidance

3. **Re-run the test** to see changes:
   ```bash
   npm run test-scriptwriter
   ```

4. **Compare outputs** in `test-data/`:
   - Check word counts
   - Review tone/style
   - Verify voice assignments
   - Check transitions

5. **Iterate** until satisfied

6. **Commit and deploy** when ready:
   ```bash
   git add lib/agents/scriptwriter.ts
   git commit -m "Update scriptwriter prompts"
   git push
   ```

## Example Output

```
🎙️  Testing Scriptwriter Locally

==================================================

📥 Step 1: Fetching run data...
   ✅ Using latest successful run: 2025-11-16_1763252670339
   📅 Date: 2025-11-16
   🎯 Episode: Verizon Layoffs & AI Investment

📄 Step 2: Loading manifest...
   ✅ Manifest loaded
   📊 Sections: 4
   📰 Stories: 5
   ⏱️  Target Duration: 600 sec

🗂️  Step 3: Loading outline agent data...
   ✅ Outline loaded with 4 sections

🎬 Step 4: Preparing scriptwriter input...
   ✅ Input prepared
   📝 Target: 600 seconds (~10 min)
   🎨 Style: executive
   💾 Input saved to: test-data/scriptwriter-input.json

🤖 Step 5: Running Scriptwriter Agent...
   ⏳ This may take 30-60 seconds...

   ✅ Scriptwriter completed in 45.2s

📊 Step 6: Results

==================================================

✅ Sections Generated: 4
📝 Total Word Count: 1547
⏱️  Estimated Duration: ~619 seconds
📚 Citations Used: 5

💾 Full output saved to: test-data/scriptwriter-output.json
📄 Script text saved to: test-data/generated-script.txt

📖 Script Preview (first 500 chars):

--------------------------------------------------
Verizon's cutting 15,000 jobs - that's 5% of their global workforce. The largest layoff in company history, rolling out through March 2026. But here's the twist: they're funneling savings directly into AI infrastructure and 5G expansion. This isn't belt-tightening - it's a strategic pivot.

The numbers tell the story. $2 billion in annual savings starting 2026. Meanwhile, Accenture just announced 19,000 job cuts last quarter. The pattern is clear: traditional ...
--------------------------------------------------

📋 Section Breakdown:

1. COLD-OPEN
   Words: 156
   Duration: ~62s
   Voice: shimmer
   Citations: []
   Preview: Verizon's cutting 15,000 jobs - that's 5% of their global workforce...

2. STORY
   Words: 842
   Duration: ~337s
   Voice: echo
   Citations: [1, 2, 3]
   Preview: The Verizon layoff announcement came Thursday morning. 15,000 positions going...

3. STORY
   Words: 412
   Duration: ~165s
   Voice: nova
   Citations: [4, 5]
   Preview: Let's talk AI investment. Verizon's not alone in this pivot. Accenture...

4. SIGN-OFF
   Words: 137
   Duration: ~55s
   Voice: shimmer
   Citations: []
   Preview: We'll keep you updated on those layoffs as we know more. That's it for now!


✅ Test Complete!

🔍 To modify prompts, edit: lib/agents/scriptwriter.ts
📁 Test data saved in: test-data/
```

## Troubleshooting

### Error: "No successful runs found"

You need to run the pipeline at least once successfully. Go to the dashboard and click "Run Now".

### Error: "Manifest missing outline or picks data"

The selected run may be incomplete or failed partway through. Try a different run ID or use the latest successful one.

### Error: "AWS credentials not configured"

Make sure you have the same AWS credentials configured as production:
```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=us-east-1
```

### Error: "OpenAI API key not found"

Set your OpenAI API key:
```bash
export OPENAI_API_KEY=sk-...
```

## Tips

- Run tests **locally** to iterate quickly on prompts
- Check the **console output** for voice selection debug logs
- Compare **word counts** between sections
- Review **transitions** between voice changes
- Verify **citations** are being used correctly
- Test different **styles** (executive, casual, technical)

## Advanced: Custom Test Data

You can also manually create test input by editing `test-data/scriptwriter-input.json` and running:

```typescript
import { ScriptwriterAgent } from '../lib/agents/scriptwriter';
import * as fs from 'fs';

const input = JSON.parse(fs.readFileSync('test-data/scriptwriter-input.json', 'utf8'));
const agent = new ScriptwriterAgent();
const result = await agent.execute('manual-test', input);
console.log(result.output);
```

