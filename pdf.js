/// <reference path="stream.js" />

class PdfPoint {
	X = 0;
	Y = 0;
	constructor(x, y) {
		this.X = x;
		this.Y = y;
	}
}

class PdfColor {
	static BLACK = new PdfColor(0, 0, 0);
	static GRAY33 = new PdfColor(85, 85, 85);
	static GRAY50 = new PdfColor(127, 127, 127);
	static GRAY66 = new PdfColor(170, 170, 170);
	static GRAY75 = new PdfColor(191, 191, 191);
	static WHITE = new PdfColor(255, 255, 255);
	static RED = new PdfColor(207, 0, 0);
	static GREEN = new PdfColor(0, 191, 0);
	static BLUE = new PdfColor(0, 0, 255);
	static CYAN = new PdfColor(0, 191, 191);
	static YELLOW = new PdfColor(207, 207, 0);
	static MAGENTA = new PdfColor(191, 0, 167);
	R = 0;
	G = 0;
	B = 0;
	constructor(r, g, b) {
		this.R = r;
		this.G = g;
		this.B = b;
	}
}

class PdfSize {
	static SCALE = 72 / 25.4;
	static A4_H = new PdfSize(297, 210);
	static A4_V = new PdfSize(210, 297);
	static A5_H = new PdfSize(210, 148);
	static A5_V = new PdfSize(148, 210);
	static POST_H = new PdfSize(148, 100);
	static POST_V = new PdfSize(100, 148);
	static L_H = new PdfSize(127, 89);
	static L_V = new PdfSize(89, 127);
	size = new PdfPoint();
	pixel = new PdfPoint();
	/**
	 * @param {number} width
	 * @param {number} height
	 */
	constructor(width, height) {
		this.size = new PdfPoint(width, height);
		this.pixel = new PdfPoint(width * PdfSize.SCALE, height * PdfSize.SCALE);
	}
}

class PdfPage {
	size = PdfSize.A4_H;
	fontSize = 11.0;

	/** @type {StreamWriter} */
	#stream = new StreamWriter();
	#offsetX = 0;
	#offsetY = 0;

	/**
	 * @param {PdfColor} value
	 */
	set color(value) {
		this.#stream.writeLine("{0} {1} {2} RG",
			(value.R / 255.0).toFixed(2),
			(value.G / 255.0).toFixed(2),
			(value.B / 255.0).toFixed(2)
		);
		this.#stream.writeLine("{0} {1} {2} rg",
			(value.R / 255.0).toFixed(2),
			(value.G / 255.0).toFixed(2),
			(value.B / 255.0).toFixed(2)
		);
	}

	/**
	 * @param {number} v
	 */
	static #dpi72(v) {
		return (v * PdfSize.SCALE).toFixed(2);
	}

	/**
	 * @param {PdfSize} size
	 */
	constructor(size) {
		this.size = size;
	}

	/**
	 * @param {StreamWriter} stream
	 */
	write(stream) {
		let unComp = new StreamWriter();
		unComp.writeLine("q");
		unComp.writeLine("0 w");
		unComp.writeLine("0.5 0 0 -0.5 0 {0} cm", this.size.pixel.Y.toFixed(2));
		unComp.writeLine("BT");
		this.#stream.flushText();
		let tr = new TextReader(this.#stream);
		while (!tr.endOfStream) {
			unComp.writeLine(tr.readLine());
		}
		unComp.writeLine("ET");
		unComp.writeLine("Q");
		unComp.flushText();
		let comp = Deflate.compress(unComp.array);
		stream.writeLine("<</Filter /FlateDecode /Length {0}>>stream", comp.length + 2);
		stream.flushText();
		stream.writeByte(0x68);
		stream.writeByte(0xDE);
		stream.writeBytes(comp, 0, comp.length);
		stream.writeLine();
		stream.writeLine("endstream");
		stream.flushText();
	}

	clearTranslate() {
		this.#offsetX = 0.0;
		this.#offsetY = 0.0;
	}

	/**
	 * @param {PdfPoint} p
	 */
	setTranslate(p) {
		this.#offsetX = p.X;
		this.#offsetY = p.Y;
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @param {string} s
	 */
	drawText(x, y, s) {
		this.#writeText(s, x, y);
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @param {string} s
	 * @param {number} rotateAngle
	 */
	drawTextC(x, y, s, rotateAngle = 0.0) {
		this.#writeTextRot(s, x, y, rotateAngle, GetTextSize(s).Width * 0.5);
	}

	/**
	 * @param {number} ax
	 * @param {number} ay
	 * @param {number} bx
	 * @param {number} by
	 */
	drawLineXY(ax, ay, bx, by) {
		this.#writeMXY(ax, ay);
		this.#writeLSXY(bx, by);
	}

	/**
	 * @param {PdfPoint} a
	 * @param {PdfPoint} b
	 */
	drawLine(a, b) {
		this.#writeM(a);
		this.#writeLS(b);
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @param {number} w
	 * @param {number} h
	 */
	drawRectangleXY(x, y, w, h) {
		let x0 = x;
		let x1 = x + w - 1;
		let y0 = y;
		let y1 = y + h - 1;
		this.drawLineXY(x0, y0, x1, y0);
		this.drawLineXY(x1, y0, x1, y1);
		this.drawLineXY(x1, y1, x0, y1);
		this.drawLineXY(x0, y1, x0, y0);
	}

	/**
	 * @param {PdfPoint} point
	 * @param {PdfPoint} size
	 */
	drawRectangle(point, size) {
		this.drawRectangleXY(point.X, point.Y, size.X, size.Y);
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @param {number} radius
	 */
	drawCircleXY(x, y, radius) {
		let poly = this.#createArc(x, y, radius);
		this.#writeM(poly[0]);
		for (let i = 1; i < poly.length; i++) {
			this.#writeL(poly[i]);
		}
		this.#writeLS(poly[0]);
	}

	/**
	 * @param {PdfPoint} point
	 * @param {number} radius
	 */
	drawCircle(point, radius) {
		this.drawCircleXY(point.X, point.Y, radius);
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @param {number} radius
	 * @param {number} start
	 * @param {number} sweep
	 */
	drawArcXY(x, y, radius, start, sweep) {
		let poly = this.#createArc(x, y, radius, start, sweep);
		this.#writeM(poly[0]);
		for (let i = 1; i < poly.length - 1; i++) {
			this.#writeL(poly[i]);
		}
		this.#writeLS(poly[poly.length - 1]);
	}

	/**
	 * @param {PdfPoint} point
	 * @param {number} radius
	 * @param {number} start
	 * @param {number} sweep
	 */
	drawArc(point, radius, start, sweep) {
		this.drawArcXY(point.X, point.Y, radius, start, sweep)
	}

	/**
	 * @param {Array<PdfPoint>} poly
	 */
	drawPolygon(poly) {
		this.#writeM(poly[0]);
		for (let i = 1; i < poly.length; i++) {
			this.#writeL(poly[i]);
		}
		this.#writeLS(poly[0]);
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @param {number} width
	 * @param {number} heght
	 */
	fillRectangleXY(x, y, width, heght) {
		this.#writeMXY(x, y);
		this.#writeLXY(x + width, y);
		this.#writeLXY(x + width, y + heght);
		this.#writeLXY(x, y + heght);
		this.#writeLFXY(x, y);
	}

	/**
	 * @param {PdfPoint} point
	 * @param {PdfPoint} size
	 * @param {number} heght
	 */
	fillRectangle(point, size) {
		this.fillRectangleXY(point.X, point.Y, size.X, size.Y);
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @param {number} radius
	 */
	fillCircleXY(x, y, radius) {
		let poly = this.#createArc(x, y, radius);
		this.#writeM(poly[0]);
		for (let i = 1; i < poly.length; i++) {
			this.#writeL(poly[i]);
		}
		this.#writeLF(poly[0]);
	}

	/**
	 * @param {PdfPoint} point
	 * @param {number} radius
	 */
	fillCircle(point, radius) {
		this.fillCircleXY(point.X, point.Y, radius);
	}

	/**
	 * @param {Array<PdfPoint>} poly
	 */
	fillPolygon(poly) {
		this.#writeM(poly[0]);
		for (let i = 1; i < poly.length; i++) {
			this.#writeL(poly[i]);
		}
		this.#writeLF(poly[0]);
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @param {number} radius
	 * @param {number} start
	 * @param {number} sweep
	 * @returns {Array<PdfPoint>}
	 */
	#createArc(x, y, radius, start = 0, sweep = 360) {
		const DIV = radius < 4 ? 8 : (radius * 2);
		const START = Math.PI * start / 180.0;
		const SWEEP = Math.PI * sweep / 180.0;
		let poly = [];
		for (let i = 0; i < DIV; i++) {
			let th = START + (i + 0.5) * SWEEP / DIV;
			poly.push(new PdfPoint(
				x + radius * Math.cos(th),
				y + radius * Math.sin(th)
			));
		}
		return poly;
	}

	#writeFontSize() {
		this.#stream.writeLine("/F0 {0} Tf", this.fontSize.toFixed(2));
	}

	/**
	 * @param {string} s
	 * @param {number} x
	 * @param {number} y
	 * @param {number} ofsX
	 */
	#writeText(s, x, y, ofsX = 0.0) {
		this.#writeFontSize();
		let ofsY = this.fontSize * 0.5;
		let strs = s.replace(/\r/g, "").split('\n');
		x += this.#offsetX;
		y += this.#offsetY;
		strs.forEach((v, i, s) => {
			this.#stream.writeLine("1 0 0 -1 {0} {1} Tm",
				PdfPage.#dpi72(x - ofsX),
				PdfPage.#dpi72(y + ofsY)
			);
			this.#stream.writeLine("({0}) Tj", v.replace(/\n/g, ""));
			ofsY += this.fontSize;
		});
	}

	/**
	 * @param {string} s
	 * @param {number} x
	 * @param {number} y
	 * @param {number} theta
	 * @param {number} ofsX
	 */
	#writeTextRot(s, x, y, theta, ofsX = 0.0) {
		this.#writeFontSize();
		x += this.#offsetX;
		y += this.#offsetY;
		let strs = s.replace(/\r/g, "").split('\n');
		let ofsY = this.fontSize * (2 - strs.length) * 0.5;
		let cos = Math.cos(theta);
		let sin = Math.sin(theta);
		strs.forEach((v, i, s) => {
			let rx = ofsX * cos + ofsY * sin;
			let ry = ofsX * sin - ofsY * cos;
			this.#stream.writeLine("{0} {1} {2} {3} {4} {5} Tm",
				cos.toFixed(3), sin.toFixed(3),
				sin.toFixed(3), (-cos).toFixed(3),
				PdfPage.#dpi72(x - rx),
				PdfPage.#dpi72(y - ry)
			);
			this.#stream.writeLine("({0}) Tj", v.replace(/\n/g, ""));
			ofsY += this.fontSize + 0.5;
		});
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 */
	#writeMXY(x, y) {
		this.#stream.writeLine("{0} {1} m",
			PdfPage.#dpi72(x + this.#offsetX),
			PdfPage.#dpi72(y + this.#offsetY)
		);
	}

	/**
	 * @param {PdfPoint} p
	 */
	#writeM(p) {
		this.#stream.writeLine("{0} {1} m",
			PdfPage.#dpi72(p.X + this.#offsetX),
			PdfPage.#dpi72(p.Y + this.#offsetY)
		);
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 */
	#writeLXY(x, y) {
		this.#stream.writeLine("{0} {1} l",
			PdfPage.#dpi72(x + this.#offsetX),
			PdfPage.#dpi72(y + this.#offsetY)
		);
	}

	/**
	 * @param {PdfPoint} p
	 */
	#writeL(p) {
		this.#stream.writeLine("{0} {1} l",
			PdfPage.#dpi72(p.X + this.#offsetX),
			PdfPage.#dpi72(p.Y + this.#offsetY)
		);
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 */
	#writeLSXY(x, y) {
		this.#stream.writeLine("{0} {1} l S",
			PdfPage.#dpi72(x + this.#offsetX),
			PdfPage.#dpi72(y + this.#offsetY)
		);
	}

	/**
	 * @param {PdfPoint} p
	 */
	#writeLS(p) {
		this.#stream.writeLine("{0} {1} l S",
			PdfPage.#dpi72(p.X + this.#offsetX),
			PdfPage.#dpi72(p.Y + this.#offsetY)
		);
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 */
	#writeLFXY(x, y) {
		this.#stream.writeLine("{0} {1} l f",
			PdfPage.#dpi72(x + this.#offsetX),
			PdfPage.#dpi72(y + this.#offsetY)
		);
	}

	/**
	 * @param {PdfPoint} p
	 */
	#writeLF(p) {
		this.#stream.writeLine("{0} {1} l f",
			PdfPage.#dpi72(p.X + this.#offsetX),
			PdfPage.#dpi72(p.Y + this.#offsetY)
		);
	}
}

class Pdf {
	static #FontName = "Arial";

	/** @type {Array<PdfPage>} */
	#pageList = [];

	/**
	 * @param {PdfPage} page
	 */
	addPage(page) {
		this.#pageList.push(page);
	}

	get bytes() {
		const PAGE_BEGIN = 4;
		const CONTENTS_BEGIN = PAGE_BEGIN + this.#pageList.length;
		let sw = new StreamWriter();
		sw.writeLine("%PDF-1.7");
		sw.flushText();
		sw.writeByte(0xE2);
		sw.writeByte(0xE3);
		sw.writeByte(0xCF);
		sw.writeByte(0xD3);
		sw.writeLine();
		sw.writeLine("1 0 obj <<");
		sw.writeLine("\t/Type/Catalog");
		sw.writeLine("\t/Pages 2 0 R");
		sw.writeLine(">> endobj");
		sw.writeLine("2 0 obj <<");
		sw.writeLine("\t/Type/Pages");
		sw.write("\t/Kids [");
		for (let pIdx = 0; pIdx < this.#pageList.length; pIdx++) {
			sw.write("{0} 0 R ", PAGE_BEGIN + pIdx);
		}
		sw.writeLine("]");
		sw.writeLine("\t/Count {0}", this.#pageList.length);
		sw.writeLine(">> endobj");
		sw.writeLine("3 0 obj <<");
		sw.writeLine("\t/Font <<");
		sw.writeLine("\t\t/F0 <<");
		sw.writeLine("\t\t\t/Type/Font");
		sw.writeLine("\t\t\t/BaseFont/{0}", Pdf.#FontName);
		sw.writeLine("\t\t\t/Subtype/Type1");
		sw.writeLine("\t\t>>");
		sw.writeLine("\t>>");
		sw.writeLine(">> endobj");
		for (let pIdx = 0; pIdx < this.#pageList.length; pIdx++) {
			let size = this.#pageList[pIdx].size.pixel;
			sw.writeLine("{0} 0 obj <<", PAGE_BEGIN + pIdx);
			sw.writeLine("\t/Type/Page");
			sw.writeLine("\t/Parent 2 0 R");
			sw.writeLine("\t/Resources 3 0 R");
			sw.writeLine("\t/MediaBox [0 0 {0} {1}]", size.X.toFixed(2), size.Y.toFixed(2));
			sw.writeLine("\t/Contents {0} 0 R", CONTENTS_BEGIN + pIdx);
			sw.writeLine(">> endobj");
		}
		for (let pIdx = 0; pIdx < this.#pageList.length; pIdx++) {
			sw.writeLine("{0} 0 obj", CONTENTS_BEGIN + pIdx);
			sw.flushText();
			this.#pageList[pIdx].write(sw);
			sw.writeLine("endobj");
		}
		sw.writeLine("xref");
		sw.writeLine("trailer <<");
		sw.writeLine("\t/Size {0}", PAGE_BEGIN + this.#pageList.length * 2);
		sw.writeLine("\t/Root 1 0 R");
		sw.writeLine(">>");
		sw.writeLine("startxref");
		sw.writeLine("0");
		sw.writeLine("%%EOF");
		sw.flushText();
		return sw.array;
	}
}
