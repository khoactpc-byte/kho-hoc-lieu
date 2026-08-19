const fs = require('fs');
const transcriptPath = 'C:/Users/khoac/.gemini/antigravity-ide/brain/5a3899a7-00fb-46fe-b005-23baf37abd38/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
let edits = [];
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
          file = file.replace(/^\"|\"$/g, '');
          edits.push({ step: obj.step_index, file: file, chunks });
        }
      }
    }
  } catch (e) { }
}
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
      console.log('Target NOT FOUND in', filePath, 'Step:', edit.step);
      allSuccess = false;
    }
  }
  fileCache[filePath] = content;
}
if (allSuccess) {
  console.log('All patches can be applied successfully!');
} else {
  console.log('Some patches failed.');
}
