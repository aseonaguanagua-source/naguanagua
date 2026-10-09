const fs = require('fs');
const path = '/Users/davidzara/.gemini/antigravity-ide/brain/41ad0d8f-f50b-4e3c-9779-4790bdb59481/.system_generated/logs/transcript_full.jsonl';

const lines = fs.readFileSync(path, 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('sambil_activities_old.json')) {
    console.log(`Found mention at line ${i}`);
    try {
      const obj = JSON.parse(lines[i]);
      if (obj.content && obj.content.includes('{') && obj.content.includes('URB016')) {
        // console.log(obj.content);
      }
      if (obj.tool_calls) {
        for (const tc of obj.tool_calls) {
          if (tc.function && tc.function.arguments && tc.function.arguments.includes('sambil_activities_old.json')) {
            console.log("TOOL CALL ARGS:");
            console.log(tc.function.arguments.substring(0, 500));
            // if it's a write_to_file, we can extract it!
            if (tc.function.name === 'write_to_file' || tc.function.name === 'default_api:write_to_file') {
              const args = JSON.parse(tc.function.arguments);
              if (args.TargetFile && args.TargetFile.includes('sambil_activities_old.json')) {
                 fs.writeFileSync('scratch/sambil_activities_old.json', args.CodeContent);
                 console.log("RECOVERED THE FILE!");
              }
            }
          }
        }
      }
      if(obj.output && obj.output.includes('URB016')) {
        console.log("OUTPUT DATA:");
        console.log(obj.output.substring(0, 1000));
      }
    } catch(e) {}
  }
}
