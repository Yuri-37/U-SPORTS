const fs = require("fs");
const path = "C:\\Users\\SIBIYA~1\\AppData\\Local\\Temp\\claude\\C--Users-SIBIYA-GAMING-OneDrive-Desktop-usports\\3b258b1f-da3f-4608-b08a-55da9509dd6b\\scratchpad\\func_unpacked\\word\\document.xml";
const data = fs.readFileSync(path, "utf-8");
const idxs = [];
let i = -1;
while ((i = data.indexOf("<w:sectPr", i+1)) !== -1) idxs.push(i);
console.log("sectPr start positions:", idxs);
console.log("doc length:", data.length);

// extract section2 content (between first sectPr end and second sectPr start)
const sectPrEnds = idxs.map(idx => data.indexOf("</w:sectPr>", idx) + "</w:sectPr>".length);
console.log("sectPr end positions:", sectPrEnds);

const section2Content = data.slice(sectPrEnds[0], idxs[1]);
console.log("section2 length:", section2Content.length);

// find table widths
const tblWs = [...section2Content.matchAll(/<w:tblW[^>]*w:w="(\d+)"/g)].map(m=>m[1]);
console.log("tblW values in section2:", tblWs);

const tblGrids = [...section2Content.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map(m=>m[1]);
console.log("num gridCol entries:", tblGrids.length);

// find any text mentioning "Test Script Document Identifier"
const tsdiIdx = data.indexOf("Test Script Document Identifier");
console.log("Test Script Document Identifier found at:", tsdiIdx, "vs section boundaries", idxs, sectPrEnds);
