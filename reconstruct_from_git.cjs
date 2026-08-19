const fs = require('fs');
const { execSync } = require('child_process');

console.log('Reverting working tree to HEAD...');
execSync('git checkout -- .', { stdio: 'inherit' });

const sessions = [
  '7adaba85-4f34-4c7e-833d-ee7f67f64469',
  '4470fee0-f87b-48bf-a771-29193bf2251d',
  '4786e841-d442-433e-b81c-c3541c217906'
];

let edits = [];

for (const session of sessions) {
  const transcriptPath = `C:/Users/khoac/.gemini/antigravity-ide/brain/${session}/.system_generated/logs/transcript.jsonl`;
  if (!fs.existsSync(transcriptPath)) {
    console.log('Skipping missing session:', session);
    continue;
  }
  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.tool_calls && obj.status === 'DONE') {
        for (const call of obj.tool_calls) {
          if (call.name === 'multi_replace_file_content' || call.name === 'replace_file_content') {
            let args = call.args;
            if (typeof args === 'string') args = JSON.parse(args);
            let chunks = args.ReplacementChunks || args.replacement_chunks || [args];
            if (typeof chunks === 'string') chunks = JSON.parse(chunks);
            let file = args.TargetFile || args.target_file;
            if (!file) continue;
            file = file.replace(/^\"|\"$/g, '');
            edits.push({ session, step: obj.step_index, file, chunks });
          }
        }
      }
    } catch (e) { }
  }
}

console.log(`Extracted ${edits.length} edits from transcripts.`);

const fileCache = {};
let allSuccess = true;

for (const edit of edits) {
  const filePath = edit.file.replace(/\\\\/g, '/');
  if (!fileCache[filePath]) {
    try { fileCache[filePath] = fs.readFileSync(filePath, 'utf8'); }
    catch (e) { fileCache[filePath] = ''; }
  }
  let content = fileCache[filePath];
  for (const chunk of edit.chunks) {
    const target = chunk.TargetContent || chunk.target_content;
    const replacement = chunk.ReplacementContent || chunk.replacement_content;
    if (content.includes(target)) {
      content = content.replace(target, replacement);
    } else {
      console.log(`[FAILED] Target NOT FOUND in ${filePath} (Session: ${edit.session}, Step: ${edit.step})`);
      allSuccess = false;
    }
  }
  fileCache[filePath] = content;
}

if (allSuccess) {
  console.log('All patches applied perfectly!');
} else {
  console.log('Some patches failed. See above.');
}

for (const filePath in fileCache) {
  fs.writeFileSync(filePath, fileCache[filePath]);
}
console.log('Files written to disk.');
