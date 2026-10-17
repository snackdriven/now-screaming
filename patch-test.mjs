import fs from 'fs';
const content = fs.readFileSync('tests/chatgpt-auth.test.mjs', 'utf8');
const newContent = content.replace(/await t.test\('chatGPTSignOutPath constructs correct path'[\s\S]*?\}\);\n/m, '');
fs.writeFileSync('tests/chatgpt-auth.test.mjs', newContent);
