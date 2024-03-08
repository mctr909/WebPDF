/// <reference path="stream.js" />
class FontTTC {
	majorVersion = 0;
	minorVersion = 0;
	numFonts = 0;
	/** @type {Array<number>} */
	tableDirectoryOffsets = [];

	/** @param {BinaryReader} br */
	constructor(br) {
		this.ttcTag = new TextDecoder().decode(br.readBytes(4));
		if (this.ttcTag == "ttcf") {
			this.majorVersion = br.readUint16();
			this.minorVersion = br.readUint16();
			this.numFonts = br.readUint32();
			for (let i=0; i<this.numFonts; i++) {
				this.tableDirectoryOffsets.push(br.readUint32());
			}
		} else {
			this.tableDirectoryOffsets.push(0);
		}
	}

	/**
	 * @param {BinaryReader} br
	 * @param {number} index
	 */
	getFont(br, index = 0) {
		if (index >= this.tableDirectoryOffsets.length) {
			index = this.tableDirectoryOffsets.length - 1;
		}
		let fontOfs = this.tableDirectoryOffsets[index];
		br.seekBegin(fontOfs);
		return new FontOffsetTable(br);
	}

	log() {
		let ret = "<table>" +
			"<tr><th colspan='2'>ttcf</th></tr>" +
			"<tr><td>TTC Tag</td><td>" + this.ttcTag + "</td></tr>" +
			"<tr><td>MajorVersion</td><td>" + this.majorVersion + "</td></tr>" +
			"<tr><td>MinorVersion</td><td>" + this.minorVersion + "</td></tr>" +
			"<tr><td>NumFonts</td><td>" + this.numFonts + "</td></tr>" +
			"</table>"
		;
		ret += "<table><tr><th>TableDirectoryOffsets</th></tr>";
		this.tableDirectoryOffsets.forEach((v, i, arr) => {
			ret += "<tr><td>0x" + FontBin2Str(v, 8) + "</td></tr>";
		});
		return ret + "</table>";
	}
}

class FontOffsetTable {
	/** @param {BinaryReader} br */
	constructor(br) {
		this.version = br.readUint32();
		this.tables = br.readUint16();
		this.searchRange = br.readUint16();
		this.entrySelector = br.readUint16();
		this.rangeShift = br.readUint16();
		/** @type {Map<string, FontOffsetRecord>} */
		this.tableList = new Map();
		for (let i = 0; i < this.tables; i++) {
			let rec = new FontOffsetRecord(br);
			this.tableList.set(rec.tableTag, rec);
		}
	}

	log() {
		let ret = "<table>" +
			"<tr><th colspan='2'>OffsetTable</th></tr>" +
			"<tr><td>Version</td><td>" + this.version + "</td></tr>" +
			"<tr><td>Tables</td><td>" + this.tables + "</td></tr>" +
			"<tr><td>SearchRange</td><td>" + this.searchRange + "</td></tr>" +
			"<tr><td>EntrySelector</td><td>" + this.entrySelector + "</td></tr>" +
			"<tr><td>RangeShift</td><td>" + this.rangeShift + "</td></tr>" +
			"</table>"
		;
		ret += "<table>" +
			"<tr><th colspan='4'>TableRecord</th></tr>" +
			"<tr><th>TableTag</th><th>Checksum</th><th>Offset</th><th>Length</th></tr>"
		;
		this.tableList.forEach((v) => {
			ret += "<tr><td>" +
				v.tableTag + "</td><td>0x" +
				FontBin2Str(v.checksum, 8) + "</td><td>0x" +
				FontBin2Str(v.offset, 8) + "</td><td>" +
				v.length.toString().padStart(8, "0") + "</td></tr>"
			;
		});
		return ret + "</table>";
	}
}

class FontOffsetRecord {
	/** @param {BinaryReader} br */
	constructor(br) {
		this.tableTag = new TextDecoder().decode(br.readBytes(4));
		this.checksum = br.readUint32();
		this.offset = br.readUint32();
		this.length = br.readUint32();
		switch (this.tableTag) {
		case "cmap":
		case "hmtx":
		case "loca":
		case "glyf":
			this.data = null;
			break;
		default: {
			let pos = br.position;
			this.data = br.readBytes(this.offset, this.length);
			br.seekBegin(pos);
			break;
		}
		}
	}
}

class FontHeadTable {
	/**
	 * @param {BinaryReader} br
	 * @param {FontOffsetTable} font
	 */
	constructor(br, font) {
		let headRec = font.tableList.get("head");
		br.seekBegin(headRec.offset);
		this.majorVersion = br.readUint16();
		this.minorVersion = br.readUint16();
		this.fontRevision = br.readUint32();
		this.checkSumAdjustment = br.readUint32();
		this.magicNumber = br.readUint32();
		this.flags = br.readUint16();
		this.unitsPerEm = br.readUint16();
		this.created = br.readBytes(8);
		this.modified = br.readBytes(8);
		this.xMin = br.readInt16();
		this.yMin = br.readInt16();
		this.xMax = br.readInt16();
		this.yMax = br.readInt16();
		this.macStyle = br.readUint16();
		this.lowestRecPPEM = br.readUint16();
		this.fontDirectionHint = br.readInt16();
		this.indexToLocFormat = br.readInt16();
		this.glyphDataFormat = br.readInt16();
	}

	log() {
		return "<table>" +
			"<tr><th colspan='2'>head</th></tr>" +
			"<tr><td>MajorVersion</td><td>" + this.majorVersion + "</td></tr>" +
			"<tr><td>MinorVersion</td><td>" + this.minorVersion + "</td></tr>" +
			"<tr><td>FontRevision</td><td>" + FontFix2Str(this.fontRevision) + "</td></tr>" +
			"<tr><td>CheckSumAdjustment</td><td>0x" + FontBin2Str(this.checkSumAdjustment, 8) + "</td></tr>" +
			"<tr><td>MagicNumber</td><td>0x" + FontBin2Str(this.magicNumber, 8) + "</td></tr>" +
			"<tr><td>Flags</td><td>" + this.flags + "</td></tr>" +
			"<tr><td>UnitsPerEm</td><td>" + this.unitsPerEm + "</td></tr>" +
			"<tr><td>Created</td><td>" + FontBytes2Str(this.created) + "</td></tr>" +
			"<tr><td>Modified</td><td>" + FontBytes2Str(this.modified) + "</td></tr>" +
			"<tr><td>Min(x,y)</td><td>" + this.xMin + ", " + this.yMin + "</td></tr>" +
			"<tr><td>Max(x,y)</td><td>" + this.xMax + ", " + this.yMax + "</td></tr>" +
			"<tr><td>MacStyle</td><td>" + this.macStyle + "</td></tr>" +
			"<tr><td>LowestRecPPEM</td><td>" + this.lowestRecPPEM + "</td></tr>" +
			"<tr><td>FontDirectionHint</td><td>" + this.fontDirectionHint + "</td></tr>" +
			"<tr><td>IndexToLocFormat</td><td>" + this.indexToLocFormat + "</td></tr>" +
			"<tr><td>GlyphDataFormat</td><td>" + this.glyphDataFormat + "</td></tr>" +
			"</table>"
		;
	}
}

class FontNameTable {
	/**
	 * @param {BinaryReader} br
	 * @param {FontOffsetTable} font
	 */
	constructor(br, font) {
		let rec = font.tableList.get("name");
		br.seekBegin(rec.offset);
		let pos = br.position;
		this.format = br.readUint16();
		this.count = br.readUint16();
		this.stringOffset = br.readUint16();
		let absStringOffset = pos + this.stringOffset;
		/** @type {Array<FontNameRecord>} */
		this.nameRecord = [];
		for (let i=0; i<this.count; i++) {
			this.nameRecord.push(new FontNameRecord(br, absStringOffset));
		}
	}

	log() {
		let ret = "<table>" +
			"<tr><th colspan='2'>name</th></tr>" +
			"<tr><td>Format</td><td>" + this.format + "</td></tr>" +
			"<tr><td>Count</td><td>" + this.count + "</td></tr>" +
			"<tr><td>StringOffset</td><td>0x" + FontBin2Str(this.stringOffset, 8) + "</td></tr>" +
			"</table>"
		;
		ret += "<table>" +
			"<tr><th colspan='7'>NameRecord</th></tr>" +
			"<tr><th>PlatformID</th><th>EncodingID</th><th>LanguageID</th><th>NameID</th><th>Length</th><th>Offset</th><th>Text</th></tr>"
		;
		this.nameRecord.forEach((v) => {
			ret += "<tr><td>" +
				v.platformID + "</td><td>" +
				v.encodingID + "</td><td>" +
				v.languageID + "</td><td>" +
				v.nameID + "</td><td>" +
				v.length + "</td><td>0x" +
				v.offset.toString().padStart(8, "0") + "</td><td>" +
				v.text + "</td></tr>"
			;
		});
		return ret + "</table>";
	}
}

class FontNameRecord {
	/**
	 * @param {BinaryReader} br
	 * @param {number} stringOffset
	 */
	constructor(br, stringOffset) {
		this.platformID = br.readUint16();
		this.encodingID = br.readUint16();
		this.languageID = br.readUint16();
		this.nameID = br.readUint16();
		this.length = br.readUint16();
		this.offset = br.readUint16();
		let pos = br.position;
		br.seekBegin(stringOffset + this.offset);
		this.text = new TextDecoder("utf-16be").decode(br.readBytes(this.length));
		br.seekBegin(pos);
	}
}

class FontOS2Table {
	/**
	 * @param {BinaryReader} br
	 * @param {FontOffsetTable} font
	 */
	constructor(br, font) {
		let rec = font.tableList.get("OS/2");
		br.seekBegin(rec.offset);
		this.version = br.readUint16();
		this.xAvgCharWidth = br.readInt16();
		this.usWeightClass = br.readUint16();
		this.usWidthClass = br.readUint16();
		this.fsType = br.readUint16();
		this.ySubscriptXSize = br.readInt16();
		this.ySubscriptYSize = br.readInt16();
		this.ySubscriptXOffset = br.readInt16();
		this.ySubscriptYOffset = br.readInt16();
		this.ySuperscriptXSize = br.readInt16();
		this.ySuperscriptYSize = br.readInt16();
		this.ySuperscriptXOffset = br.readInt16();
		this.ySuperscriptYOffset = br.readInt16();
		this.yStrikeoutSize = br.readInt16();
		this.yStrikeoutPosition = br.readInt16();
		this.sFamilyClass = br.readInt16();
		this.panose = br.readBytes(10);
		this.ulUnicodeRange1 = br.readUint32();
		this.ulUnicodeRange2 = br.readUint32();
		this.ulUnicodeRange3 = br.readUint32();
		this.ulUnicodeRange4 = br.readUint32();
		this.achVendID = new TextDecoder().decode(br.readBytes(4));
		this.fsSelection = br.readUint16();
		this.usFirstCharIndex = br.readUint16();
		this.usLastCharIndex = br.readUint16();
		this.sTypoAscender = br.readInt16();
		this.sTypoDescender = br.readInt16();
		this.sTypoLineGap = br.readInt16();
		this.usWinAscent = br.readUint16();
		this.usWinDescent = br.readUint16();
	}

	log() {
		return "<table>" +
			"<tr><th colspan='2'>OS/2</th></tr>" +
			"<tr><td>Version</td><td>" + this.version + "</td></tr>" +
			"<tr><td>xAvgCharWidth</td><td>" + this.xAvgCharWidth + "</td></tr>" +
			"<tr><td>usWeightClass</td><td>" + this.usWeightClass + "</td></tr>" +
			"<tr><td>usWidthClass</td><td>" + this.usWidthClass + "</td></tr>" +
			"<tr><td>fsType</td><td>0x" + FontBin2Str(this.fsType, 4) + "</td></tr>" +
			"<tr><td>ySubscriptSize(x,y)</td><td>" + this.ySubscriptXSize + ", " + this.ySubscriptYSize + "</td></tr>" +
			"<tr><td>ySubscriptOffset(x,y)</td><td>" + this.ySubscriptXOffset + ", " + this.ySubscriptYOffset +"</td></tr>" +
			"<tr><td>ySuperscriptSize(x,y)</td><td>" + this.ySuperscriptXSize + ", " + this.ySuperscriptYSize + "</td></tr>" +
			"<tr><td>ySuperscriptOffset(x,y)</td><td>" + this.ySuperscriptXOffset + ", " + this.ySuperscriptYOffset + "</td></tr>" +
			"<tr><td>yStrikeoutSize</td><td>" + this.yStrikeoutSize + "</td></tr>" +
			"<tr><td>yStrikeoutPosition</td><td>" + this.yStrikeoutPosition + "</td></tr>" +
			"<tr><td>sFamilyClass</td><td>0x" + FontBin2Str(this.sFamilyClass, 4) + "</td></tr>" +
			"<tr><td>Panose</td><td>" + this.panose[0] + "</td></tr>" +
			"<tr><td>ulUnicodeRange1</td><td>0x" + FontBin2Str(this.ulUnicodeRange1, 8) + "</td></tr>" +
			"<tr><td>ulUnicodeRange2</td><td>0x" + FontBin2Str(this.ulUnicodeRange2, 8) + "</td></tr>" +
			"<tr><td>ulUnicodeRange3</td><td>0x" + FontBin2Str(this.ulUnicodeRange3, 8) + "</td></tr>" +
			"<tr><td>ulUnicodeRange4</td><td>0x" + FontBin2Str(this.ulUnicodeRange4, 8) + "</td></tr>" +
			"<tr><td>achVendID</td><td>" + this.achVendID + "</td></tr>" +
			"<tr><td>fsSelection</td><td>0x" + FontBin2Str(this.fsSelection, 4) + "</td></tr>" +
			"<tr><td>usFirstCharIndex</td><td>0x" + FontBin2Str(this.usFirstCharIndex, 4) + "</td></tr>" +
			"<tr><td>usLastCharIndex</td><td>0x" + FontBin2Str(this.usLastCharIndex, 4) + "</td></tr>" +
			"<tr><td>sTypoAscender</td><td>" + this.sTypoAscender + "</td></tr>" +
			"<tr><td>sTypoDescender</td><td>" + this.sTypoDescender + "</td></tr>" +
			"<tr><td>sTypoLineGap</td><td>" + this.sTypoLineGap + "</td></tr>" +
			"<tr><td>usWinAscent</td><td>" + this.usWinAscent + "</td></tr>" +
			"<tr><td>usWinDescent</td><td>" + this.usWinDescent + "</td></tr>" +
			"</table>"
		;
	}
}

class FontMaxPTable {
	/**
	 * @param {BinaryReader} br
	 * @param {FontOffsetTable} font
	 */
	constructor(br, font) {
		let rec = font.tableList.get("maxp");
		br.seekBegin(rec.offset);
		this.version = br.readUint32();
		this.numGlyphs = br.readUint16();
	}

	log() {
		return "<table>" +
			"<tr><th colspan='2'>maxp</th></tr>" +
			"<tr><td>Version</td><td>" + FontFix2Str(this.version) + "</td></tr>" +
			"<tr><td>NumGlyphs</td><td>" + this.numGlyphs + "</td></tr>" +
			"</table>"
		;
	}
}

class FontCMapTable {
	/**
	 * @param {BinaryReader} br
	 * @param {FontOffsetTable} font
	 */
	constructor(br, font) {
		let rec = font.tableList.get("cmap");
		br.seekBegin(rec.offset);
		this.version = br.readUint16();
		this.numTables = br.readUint16();
		/** @type {Array<FontEncodingRecord>} */
		this.encodingRecords = [];
		for (let i = 0; i < this.numTables; i++) {
			this.encodingRecords.push(new FontEncodingRecord(br, rec.offset));
		}
	}
}

class FontEncodingRecord {
	/**
	 * @param {BinaryReader} br
	 * @param {number} cmapPos
	 */
	constructor(br, cmapPos) {
		this.map = null;
		this.platformID = br.readUint16();
		this.encodingID = br.readUint16();
		let offset = br.readUint32();
		let position = br.position;
		br.seekBegin(cmapPos + offset);
		switch (this.platformID) {
		case 0: /* Unicode */
			switch (this.encodingID) {
			case 3: /* 基本多言語面 */
				this.map = new FontCMap4(br);
				break;
			case 4: /* フル */
				this.map = new FontCMap(br);
				break;
			case 5: /* 異体字セレクタ */
				break;
			default:
				break;
			}
			break;
		case 3: /* Windows */
			switch (this.encodingID) {
			case 1:  /* Unicode 基本多言語面 */
				this.map = new FontCMap4(br);
				break;
			case 10: /* Unicode フル */
				this.map = new FontCMap(br);
				break;
			default:
				break;
			}
			break;
		default:
			break;
		}
		br.seekBegin(position);
	}
}

class FontCMap {
	/**
	 * @param {BinaryReader} br
	 */
	constructor(br) {
		this.format = br.readUint16();
		this.reserved = br.readUint16();
		this.len = br.readUint32();
		this.language = br.readUint32();
		this.numGroups = br.readUint32();
		/** @type {Array<FontCMapRecord>} */
		this.map = [];
		for(let i=0; i<this.numGroups; i++) {
			this.map.push(new FontCMapRecord(br));
		}
	}
}

class FontCMap4 {
	/**
	 * @param {BinaryReader} br
	 */
	constructor(br) {
		this.format = br.readUint16();
		this.len = br.readUint16();
		this.language = br.readUint16();
		this.segCount = br.readUint16() >> 1;
		this.searchRange = br.readUint16();
		this.entrySelector = br.readUint16();
		this.rangeShift = br.readUint16();
		/** @type {Array<number>} */
		let endCode = [];
		/** @type {Array<number>} */
		let startCode = [];
		/** @type {Array<number>} */
		let idDelta = [];
		/** @type {Array<number>} */
		let idRangeOffset = [];
		/** @type {Array<number>} */
		let glyphID = [];
		for (let i = 0; i < this.segCount; i++) {
			endCode.push(br.readUint16());
		}
		br.readUint16(); // reserved
		for (let i = 0; i < this.segCount; i++) {
			startCode.push(br.readUint16());
		}
		for (let i = 0; i < this.segCount; i++) {
			idDelta.push(br.readUint16());
		}
		for (let i = 0; i < this.segCount; i++) {
			let pos = br.position;
			let ofs = br.readUint16();
			idRangeOffset.push(ofs);
			if (0 == ofs) {
				glyphID.push(-1);
			} else {
				br.seekBegin(pos + ofs);
				glyphID.push(br.readUint16());
				br.seekBegin(pos + 2);
			}
		}
		/** @type {Array<FontCMap4Record>} */
		this.record = [];
		for (let i = 0; i < this.segCount; i++) {
			let rec = new FontCMap4Record();
			rec.startCode = startCode[i];
			rec.endCode = endCode[i];
			rec.glyphID = glyphID[i];
			rec.idDelta = idDelta[i];
			rec.idRangeOffset = idRangeOffset[i];
			this.record.push(rec);
		}
	}
}

class FontCMapRecord {
	startCode = 0;
	endCode = 0;
	glyphID = 0;
	/**
	 * @param {BinaryReader} br
	 */
	constructor(br = null) {
		if (null != br) {
			this.startCode = br.readUint32();
			this.endCode = br.readUint32();
			this.glyphID = br.readUint32();
		}
	}
}

class FontCMap4Record extends FontCMapRecord {
	idDelta = 0;
	idRangeOffset = 0;
}

class FontHHEATable {
	/**
	 * @param {BinaryReader} br
	 * @param {FontOffsetTable} font
	 */
	constructor(br, font) {
		let rec = font.tableList.get("hhea");
		br.seekBegin(rec.offset);
		this.majorVersion = br.readUint16();
		this.minorVersion = br.readUint16();
		this.ascender = br.readInt16();
		this.descender = br.readInt16();
		this.lineGap = br.readInt16();
		this.advanceWidthMax = br.readUint16();
		this.minLeftSideBearing = br.readInt16();
		this.minRightSideBearing = br.readInt16();
		this.xMaxExtent = br.readInt16();
		this.caretSlopeRise = br.readInt16();
		this.caretSlopeRun = br.readInt16();
		this.caretOffset = br.readInt16();
		br.seekCur(8);
		this.metricDataFormat = br.readInt16();
		this.numberOfHMetrics = br.readUint16();
	}

	log() {
		return "<table>" +
			"<tr><th colspan='2'>hhea</th></tr>" +
			"<tr><td>MajorVersion</td><td>" + this.majorVersion + "</td></tr>" +
			"<tr><td>MinorVersion</td><td>" + this.minorVersion + "</td></tr>" +
			"<tr><td>Ascender</td><td>" + this.ascender + "</td></tr>" +
			"<tr><td>Descender</td><td>" + this.descender + "</td></tr>" +
			"<tr><td>LineGap</td><td>" + this.lineGap + "</td></tr>" +
			"<tr><td>AdvanceWidthMax</td><td>" + this.advanceWidthMax + "</td></tr>" +
			"<tr><td>MinLeftSideBearing</td><td>" + this.minLeftSideBearing + "</td></tr>" +
			"<tr><td>MinRightSideBearing</td><td>" + this.minRightSideBearing + "</td></tr>" +
			"<tr><td>xMaxExtent</td><td>" + this.xMaxExtent + "</td></tr>" +
			"<tr><td>CaretSlopeRise</td><td>" + this.caretSlopeRise + "</td></tr>" +
			"<tr><td>CaretSlopeRun</td><td>" + this.caretSlopeRun + "</td></tr>" +
			"<tr><td>CaretOffset</td><td>" + this.caretOffset + "</td></tr>" +
			"<tr><td>Reserved(16bytes)</td><td></td></tr>" +
			"<tr><td>MetricDataFormat</td><td>" + this.metricDataFormat + "</td></tr>" +
			"<tr><td>NumberOfHMetrics</td><td>" + this.numberOfHMetrics + "</td></tr>" +
			"</table>"
		;
	}
}

class FontHMTXTable {
	/**
	 * @param {BinaryReader} br
	 * @param {FontOffsetTable} font
	 */
	constructor(br, font) {
		let maxp = new FontMaxPTable(br, font);
		let hhea = new FontHHEATable(br, font);
		let rec = font.tableList.get("hmtx");
		br.seekBegin(rec.offset);
		/** @type {Array<FontLongHorMetric>} */
		this.hMetrics = [];
		for (let i = 0; i < hhea.numberOfHMetrics; i++) {
			this.hMetrics.push(new FontLongHorMetric(br));
		}
		/** @type {Array<number>} */
		this.leftSideBearings = [];
		let end = maxp.numGlyphs - hhea.numberOfHMetrics;
		for(let i=0; i<end; i++) {
			this.leftSideBearings.push(br.readUint16());
		}
	}
}

class FontLongHorMetric {
	/**
	 * @param {BinaryReader} br
	 */
	constructor(br) {
		this.advanceWidth = br.readInt16();
		this.leftSideBearings = br.readInt16();
	}
}

class FontLocaTable {
	/**
	 * @param {BinaryReader} br
	 * @param {FontOffsetTable} font
	 */
	constructor(br, font) {
		let head = new FontHeadTable(br, font);
		let maxp = new FontMaxPTable(br, font);
		let rec = font.tableList.get("loca");
		br.seekBegin(rec.offset);
		/** @type {Array<number>} */
		this.offsets = [];
		if (0 == head.indexToLocFormat) {
			for (let i = 0; i <= maxp.numGlyphs; i++) {
				this.offsets.push(br.readUint16() << 1);
			}
		} else {
			for (let i = 0; i <= maxp.numGlyphs; i++) {
				this.offsets.push(br.readUint32());
			}
		}
	}
}

class FontGlyfTable {
	/**
	 * @param {BinaryReader} br
	 * @param {FontOffsetTable} font
	 * @param {number} glyfOffset
	 */
	constructor(br, font, glyfOffset) {
		let rec = font.tableList.get("glyf");
		br.seekBegin(rec.offset + glyfOffset);
		this.numberOfContours = br.readInt16();
		this.xMin = br.readInt16();
		this.yMin = br.readInt16();
		this.xMax = br.readInt16();
		this.yMax = br.readInt16();
		/** @type {Array<number>} */
		this.endPtsOfContours = [];
		for(let i=0; i<this.numberOfContours; i++) {
			this.endPtsOfContours.push(br.readUint16());
		}
		this.instructionLength = br.readUint16();
		this.instructions = br.readBytes(this.instructionLength);
		/** @type {Array<number>} */
		this.flags = [];
		/** @type {Array<number>} */
		this.xCoordinates = [];
		/** @type {Array<number>} */
		this.yCoordinates = [];
	}

	log() {
		let ret = "<table>" +
			"<tr><th colspan='2'>glyf</th></tr>" +
			"<tr><td>NumberOfContours</td><td>" + this.numberOfContours + "</td></tr>" +
			"<tr><td>Min(x,y)</td><td>" + this.xMin + ", " + this.yMin + "</td></tr>" +
			"<tr><td>Max(x,y)</td><td>" + this.xMax + ", " + this.yMax + "</td></tr>" +
			"<tr><td>EndPtsOfContours</td><td style=\"font-family: 'MS Gothic';\">" + FontArr2Str(this.endPtsOfContours, 16, 4) + "</td></tr>" +
			"<tr><td>InstructionLength</td><td>" + this.instructionLength + "</td></tr>" +
			"<tr><td>Instructions</td><td style=\"font-family: 'MS Gothic';\">" + FontBytes2Str(this.instructions) + "</td></tr>" +
			"</table>"
		;
		return ret + "</table>";
	}
}

/**
 * @param {number} v
 * @param {number} length
 * @returns {string}
 */
function FontBin2Str(v, length) {
	return v.toString(16).toUpperCase().padStart(length, "0")
}

/**
 * @param {number} v
 * @returns {string}
 */
function FontFix2Str(v) {
	let i = v >> 16;
	let d = (v & 0xFFFF) / 0x10000;
	return (i + d).toString();
}

/**
 * @param {Array<number>} arr
 * @param {number} radix
 * @param {number} len
 * @returns {string}
 */
function FontArr2Str(arr, radix=10, len=1) {
	let str = "";
	arr.forEach((v, i) => {
		str += v.toString(radix).toUpperCase().padStart(len, "0");
		switch (i%10) {
		case 4:
			str += "&nbsp;";
			str += " ";
			break;
		case 9:
			str += "<br>";
			break;
		default:
			str += " ";
			break;
		}
	});
	return str;
}

/**
 * @param {Uint8Array} arr
 * @returns {string}
 */
function FontBytes2Str(arr) {
	let str = "";
	arr.forEach((v, i) => {
		str += v.toString(16).toUpperCase().padStart(2, "0");
		switch (i%16) {
		case 3:
		case 7:
		case 11:
			str += "&nbsp;";
			str += " ";
			break;
		case 15:
			str += "<br>";
			break;
		default:
			str += " ";
			break;
		}
	});
	return str;
}
