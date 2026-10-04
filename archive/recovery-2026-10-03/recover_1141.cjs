const fs = require('fs');
const lines = fs.readFileSync('C:/Users/khoac/.gemini/antigravity-ide/brain/4786e841-d442-433e-b81c-c3541c217906/.system_generated/logs/transcript.jsonl', 'utf8').split('\n').filter(Boolean);
let edits = [];
for (const line of lines) {
  try {
    const obj = JSON.parse(line);
    if (obj.tool_calls && obj.status === 'DONE') {
      for (const call of obj.tool_calls) {
        if (call.name === 'multi_replace_file_content' || call.name === 'replace_file_content') {
          let args = call.args;
          if (typeof args === 'string') {
            args = JSON.parse(args);
          }
          let chunks = args.ReplacementChunks || args.replacement_chunks || [args];
          if (typeof chunks === 'string') {
            chunks = JSON.parse(chunks);
          }
          let file = args.TargetFile || args.target_file;
          file = file.replace(/^\"|\"$/g, '');
          edits.push({ step: obj.step_index, file: file, chunks });
        }
      }
    }
  } catch (e) { }
}

for (const edit of edits) {
  const filePath = edit.file.replace(/\\\\/g, '/');
  let content = fs.readFileSync(filePath, 'utf8');
  let applied = 0;
  for (const chunk of edit.chunks) {
    const target = chunk.TargetContent || chunk.target_content;
    const replacement = chunk.ReplacementContent || chunk.replacement_content;
    if (content.includes(target)) {
      content = content.replace(target, replacement);
      applied++;
    } else {
      console.log('Target NOT FOUND in', filePath, 'Step:', edit.step);
    }
  }
  if (applied > 0) {
    fs.writeFileSync(filePath, content);
    console.log('Updated', filePath, 'applied', applied, 'chunks (Step ' + edit.step + ')');
  }
}
