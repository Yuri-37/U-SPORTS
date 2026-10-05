const fs = require("fs");
const path = "C:\\Users\\SIBIYA~1\\AppData\\Local\\Temp\\claude\\C--Users-SIBIYA-GAMING-OneDrive-Desktop-usports\\3b258b1f-da3f-4608-b08a-55da9509dd6b\\scratchpad\\func_unpacked\\word\\document.xml";
const data = fs.readFileSync(path, "utf-8");

const sect1End = 320901, sect2Start = 708679;
const section2 = data.slice(sect1End, sect2Start);

// find all tbl blocks and their tblW + gridCols
const tblMatches = [...section2.matchAll(/<w:tbl>/g)];
console.log("num <w:tbl> in section2:", tblMatches.length);

// Print each table's tblW and gridCol widths
let idx = 0;
while (true) {
  const tblStart = section2.indexOf("<w:tbl>", idx);
  if (tblStart === -1) break;
  const tblGridEnd = section2.indexOf("</w:tblGrid>", tblStart);
  const chunk = section2.slice(tblStart, tblGridEnd);
  const tblW = chunk.match(/<w:tblW[^>]*w:w="(\d+)"/);
  const cols = [...chunk.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map(m=>parseInt(m[1]));
  console.log("tblW:", tblW ? tblW[1] : null, "numCols:", cols.length, "sum:", cols.reduce((a,b)=>a+b,0), "cols:", cols);
  idx = tblGridEnd + 1;
}

// Also check paragraph count / headings to understand page count intent (count pageBreaks or many "Test Case" headings)
const pageBreaks = (section2.match(/<w:br w:type="page"\/>/g) || []).length;
console.log("explicit page breaks in section2:", pageBreaks);
const lastRenderedPageBreaks = (section2.match(/<w:lastRenderedPageBreak\/>/g) || []).length;
console.log("lastRenderedPageBreak count (approx pages):", lastRenderedPageBreaks);
