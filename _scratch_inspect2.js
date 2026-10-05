const fs = require("fs");
const path = "C:\\Users\\SIBIYA~1\\AppData\\Local\\Temp\\claude\\C--Users-SIBIYA-GAMING-OneDrive-Desktop-usports\\3b258b1f-da3f-4608-b08a-55da9509dd6b\\scratchpad\\source_unpacked\\word\\document.xml";
const data = fs.readFileSync(path, "utf-8");
const idxs = [];
let i = -1;
while ((i = data.indexOf("<w:sectPr", i+1)) !== -1) idxs.push(i);
console.log("sectPr start positions:", idxs);
console.log("doc length:", data.length);
for (const idx of idxs) {
  const end = data.indexOf("</w:sectPr>", idx) + "</w:sectPr>".length;
  console.log(data.slice(idx, Math.min(end, idx+600)));
  console.log("---");
}

const tsdiIdxs = [];
let j = -1;
while ((j = data.indexOf("Test Script Document Identifier", j+1)) !== -1) tsdiIdxs.push(j);
console.log("Test Script Document Identifier occurrences at:", tsdiIdxs);
