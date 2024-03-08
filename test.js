/// <reference path="pdf.js" />
/// <reference path="fontloader.js" />
let MeiryoUI; {
	let req = new XMLHttpRequest();
	req.open('GET', './font/meiryo.otf', true);
	req.responseType = 'arraybuffer';
	req.onload = function (e) {
		let arrayBuffer = this.response;
		if (this.status != 200) {
			document.write(new TextDecoder().decode(arrayBuffer));
			return;
		}
		MeiryoUI = new Uint8Array(arrayBuffer);
	};
	req.send();
}

let chkttcf = document.getElementById("chkttcf");
let chkOffsetTable = document.getElementById("chkOffsetTable");
let chkhead = document.getElementById("chkhead");
let chkname = document.getElementById("chkname");
let chkos_2 = document.getElementById("chkos2");
let chkmaxp = document.getElementById("chkmaxp");
let chkhhea = document.getElementById("chkhhea");
let chkglyf = document.getElementById("chkglyf");
let rngglyf = document.getElementById("rngglyf");
{
	let p1 = new PdfPage(PdfSize.A4_V);
	p1.drawCircleXY(150, 150, 120);
	p1.drawText(100, 100, "test");

	let p2 = new PdfPage(PdfSize.A4_H);
	p2.color = PdfColor.BLUE;
	p2.drawLineXY(100, 100, 200, 200);
	p2.drawLineXY(200, 150, 200, 200);
	p2.drawCircleXY(150, 150, 120);
	p2.color = PdfColor.RED;
	p2.drawCircleXY(200, 200, 50);
	p2.fillCircleXY(100, 100, 50);

	let pdf = new Pdf();
	pdf.addPage(p1);
	pdf.addPage(p2);

	let blob = new Blob([pdf.bytes], { "type": "application/pdf" });
	document.getElementById("download").href = window.URL.createObjectURL(blob);
	document.getElementById("download").download = "test.pdf";
	document.getElementById("btn").onclick = function (e) {
		let br = new BinaryReader(MeiryoUI);
		let ttcf = new FontTTC(br);
		let font = ttcf.getFont(br, 3);
		let head = new FontHeadTable(br, font);
		let name = new FontNameTable(br, font);
		let os_2 = new FontOS2Table(br, font);
		let maxp = new FontMaxPTable(br, font);
		let hhea = new FontHHEATable(br, font);
		let cmap = new FontCMapTable(br, font);
		let loca = new FontLocaTable(br, font);
		let glyf = new FontGlyfTable(br, font, loca.offsets[rngglyf.value]);
		rngglyf.max = loca.offsets.length;
		document.getElementById("disp").innerHTML = "<table><tr>" +
			(chkttcf.checked ? ("<td>" + ttcf.log() + "</td>") : "") +
			(chkOffsetTable.checked ? ("<td>" + font.log() + "</td>") : "") +
			(chkhead.checked ? ("<td>" + head.log() + "</td>") : "") +
			(chkname.checked ? ("<td>" + name.log() + "</td>") : "") +
			(chkos_2.checked ? ("<td>" + os_2.log() + "</td>") : "") +
			(chkmaxp.checked ? ("<td>" + maxp.log() + "</td>") : "") +
			(chkhhea.checked ? ("<td>" + hhea.log() + "</td>") : "") +
			(chkglyf.checked ? ("<td>" + glyf.log() + "</td>") : "") +
			"</tr></table>"
		;
	};
}
