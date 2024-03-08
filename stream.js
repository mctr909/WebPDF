class BitCode {
	value = 0;
	length = 0;
	/**
	 * @param {number} value
	 * @param {number} length
	 */
	constructor(value, length) {
		this.value = value;
		this.length = length;
	}
}

class BitStream {
	/** @type {Uint8Array} */
	#buffer;
	#bufferIndex = 0;
	#bits = 0;
	#bitsIndex = 0;
	#bitsLength = 8;

	get index() { return this.#bitsIndex; }
	get length() { return this.#bitsLength; }
	get isEnd() { return this.#bufferIndex >= this.#buffer.length; }
	get array() {
		return this.#buffer.subarray(0, this.#bufferIndex);
	}

	/**
	 * @param {Uint8Array} buffer
	 * @param {number} offset
	 */
	constructor(buffer, offset = 0) {
		this.#buffer = buffer;
		this.#bufferIndex = offset;
		this.#bits = buffer[offset];
	}

	read() {
		if (this.isEnd) {
			throw "bufferIndex >= buffer.length";
		}
		let retVal = this.#bits & 1;
		if (this.#bitsLength > 1) {
			this.#bitsLength--;
			this.#bits >>= 1;
		} else {
			this.#bufferIndex++;
			if (this.#bufferIndex < this.#buffer.length) {
				this.#bits = this.#buffer[this.#bufferIndex];
				this.#bitsLength = 8;
			} else {
				this.#bitsLength = 0;
			}
		}
		return retVal;
	}

	/**
	 * @param {number} length
	 */
	readRange(length) {
		while (this.#bitsLength <= length) {
			this.#bits |= this.#buffer[++this.#bufferIndex] << this.#bitsLength;
			this.#bitsLength += 8;
		}
		let retVal = this.#bits & ((1 << length) - 1);
		this.#bits >>= length;
		this.#bitsLength -= length;
		return retVal;
	}

	/**
	 * @param {number} length
	 */
	readRangeCoded(length) {
		let retVal = 0;
		for (let i = 0; i < length; i++) {
			retVal <<= 1;
			retVal |= this.read();
		}
		return retVal;
	}

	/**
	 * @param {number} value
	 * @param {number} length
	 */
	writeRange(value, length) {
		for (let i = 0, mask = 1; i < length; i++, mask <<= 1) {
			let bit = 0 < (value & mask) ? 1 : 0;
			this.#write(bit);
		}
	}

	/**
	 * @param {BitCode} code
	 */
	writeRangeCoded(code) {
		const TERM = code.length - 1;
		for (let i = 0, mask = 1 << TERM; i <= TERM; i++, mask >>= 1) {
			let bit = 0 < (code.value & mask) ? 1 : 0;
			this.#write(bit);
		}
	}

	/**
	 * @param {number} bit
	 */
	#write(bit) {
		if (this.isEnd) {
			throw "bufferIndex >= buffer.length";
		}
		this.#bits |= bit << this.#bitsIndex;
		this.#bitsIndex++;
		if (this.#bitsIndex >= 8) {
			this.#buffer[this.#bufferIndex] = this.#bits;
			this.#bufferIndex++;
			this.#bits = 0;
			this.#bitsIndex = 0;
		}
	}
}

class StreamWriter {
	/** @type {Uint8Array} */
	#stream;
	#position = 0;
	#extendUnit = 0;
	#text = "";

	get array() {
		return this.#stream.subarray(0, this.#position);
	}

	get length() {
		return this.#position;
	}

	/**
	 * @param {number} extendUnit
	 */
	constructor(extendUnit = 16 * 1024) {
		this.#stream = new Uint8Array(extendUnit);
		this.#extendUnit = extendUnit;
	}

	/**
	 * @param {number} writeUnit
	 */
	#extend(writeUnit = 4) {
		const TERM = this.#stream.length - writeUnit;
		if (TERM <= this.#position) {
			const NOW_SIZE = this.#stream.length;
			const EXT_SIZE = NOW_SIZE + this.#extendUnit;
			let newBuffer = new Uint8Array(EXT_SIZE);
			for (let i = 0; i < NOW_SIZE; i++) {
				newBuffer[i] = this.#stream[i];
			}
			this.#stream = newBuffer;
		}
	}

	/**
	 * @param {number} seek
	 */
	seekBegin(seek) {
		if (seek < 0) {
			throw "seek < 0";
		}
		if (seek >= this.#stream.length) {
			throw "seek >= stream.length";
		}
		this.#position = seek;
	}

	/**
	 * @param {number} seek
	 */
	seekCur(seek) {
		let position = this.#position + seek;
		if (position < 0) {
			throw "position < 0";
		}
		if (position >= this.#stream.length) {
			throw "position >= stream.length";
		}
		this.#position = position;
	}

	flushText() {
		let textBytes = new TextEncoder().encode(this.#text);
		this.writeBytes(textBytes);
		this.#text = "";
	}

	/**
	 * @param {string} text
	 * @param {...string} params
	 */
	write(text, ...params) {
		if (params.length == 0) {
			this.#text += text;
		} else {
			let temp = text;
			params.forEach((v, i) => {
				temp = temp.replace(new RegExp("\\{" + i + "\\}", "g"), v);
			});
			this.#text += temp;
		}
	}

	/**
	 * @param {string} text
	 * @param {...string} params
	 */
	writeLine(text = "", ...params) {
		if (params.length == 0) {
			this.#text += text + "\n";
		} else {
			let temp = text;
			params.forEach((v, i) => {
				temp = temp.replace(new RegExp("\\{" + i + "\\}", "g"), v);
			});
			this.#text += temp + "\n";
		}
	}

	/**
	 * @param {StreamWriter} source
	 * @param {number} start
	 * @param {number} length
	 */
	writeFrom(source, start, length) {
		this.#extend(length);
		const END = start + length;
		for (let i = start, j = this.#position; i < END; i++, j++) {
			this.#stream[j] = source.#stream[i];
		}
		this.#position += length;
	}

	/**
	 * @param {Uint8Array|Array<number>} array
	 * @param {number} start
	 * @param {number} length
	 */
	writeBytes(array, start=0, length=array.length) {
		this.#extend(length);
		const END = start + length;
		for (let i = start, j = this.#position; i < END; i++, j++) {
			this.#stream[j] = array[i];
		}
		this.#position += length;
	}

	/**
	 * @param {number} v
	 */
	writeByte(v) {
		this.#extend();
		this.#stream[this.#position++] = v;
	}

	/**
	 * @param {number} v
	 */
	writeSbyte(v) {
		if (v < 0) {
			v = 0x100 + v;
		}
		this.#extend();
		this.#stream[this.#position++] = v;
	}

	/**
	 * @param {number} v
	 */
	writeUint16(v) {
		this.#extend();
		this.#stream[this.#position++] = v >> 8;
		this.#stream[this.#position++] = v & 0xFF;
	}

	/**
	 * @param {number} v
	 */
	writeUint16L(v) {
		this.#extend();
		this.#stream[this.#position++] = v & 0xFF;
		this.#stream[this.#position++] = v >> 8;
	}

	/**
	 * @param {number} v
	 */
	writeInt16(v) {
		if (v < 0) {
			v = 0x10000 + v;
		}
		this.#extend();
		this.#stream[this.#position++] = v >> 8;
		this.#stream[this.#position++] = v & 0xFF;
	}

	/**
	 * @param {number} v
	 */
	writeInt16L(v) {
		if (v < 0) {
			v = 0x10000 + v;
		}
		this.#extend();
		this.#stream[this.#position++] = v & 0xFF;
		this.#stream[this.#position++] = v >> 8;
	}

	/**
	 * @param {number} v
	 */
	writeUint32(v) {
		this.#extend();
		this.#stream[this.#position++] = (v >>> 24) & 0xFF;
		this.#stream[this.#position++] = (v >>> 16) & 0xFF;
		this.#stream[this.#position++] = (v >>> 8) & 0xFF;
		this.#stream[this.#position++] = v & 0xFF;
	}

	/**
	 * @param {number} v
	 */
	writeUint32L(v) {
		this.#extend();
		this.#stream[this.#position++] = v & 0xFF;
		this.#stream[this.#position++] = (v >>> 8) & 0xFF;
		this.#stream[this.#position++] = (v >>> 16) & 0xFF;
		this.#stream[this.#position++] = (v >>> 24) & 0xFF;
	}

	/**
	 * @param {number} v
	 */
	writeInt32(v) {
		if (v < 0) {
			v = 0x100000000 + v;
		}
		this.#extend();
		this.#stream[this.#position++] = (v >>> 24) & 0xFF;
		this.#stream[this.#position++] = (v >>> 16) & 0xFF;
		this.#stream[this.#position++] = (v >>> 8) & 0xFF;
		this.#stream[this.#position++] = v & 0xFF;
	}

	/**
	 * @param {number} v
	 */
	writeInt32L(v) {
		if (v < 0) {
			v = 0x100000000 + v;
		}
		this.#extend();
		this.#stream[this.#position++] = v & 0xFF;
		this.#stream[this.#position++] = (v >>> 8) & 0xFF;
		this.#stream[this.#position++] = (v >>> 16) & 0xFF;
		this.#stream[this.#position++] = (v >>> 24) & 0xFF;
	}
}

class BinaryReader {
	/** @type {Uint8Array} */
	#stream;
	#position = 0;

	get length() { return this.#stream.length; }
	get position() { return this.#position; }

	/**
	 * @param {Uint8Array | StreamWriter} stream
	 */
	constructor(stream) {
		if (stream instanceof Uint8Array || buffer instanceof ArrayBuffer) {
			this.#stream = stream;
		}
		if (stream instanceof StreamWriter) {
			this.#stream = stream.array;
		}
	}

	/**
	 * @param {number} seek
	 */
	seekBegin(seek) {
		if (seek < 0) {
			throw "seek < 0";
		}
		if (seek >= this.#stream.length) {
			throw "seek >= stream.length";
		}
		this.#position = seek;
	}

	/**
	 * @param {number} seek
	 */
	seekCur(seek) {
		let position = this.#position + seek;
		if (position < 0) {
			throw "position < 0";
		}
		if (position >= this.#stream.length) {
			throw "position >= stream.length";
		}
		this.#position = position;
	}

	/**
	 * @param {number} length
	 */
	readBytes(length) {
		let ret = this.#stream.subarray(this.#position, this.#position + length);
		this.#position += length;
		return ret;
	}

	readByte() {
		return this.#stream[this.#position++];
	}

	readSbyte() {
		let v = this.#stream[this.#position++];
		if (v > 0x7F) {
			v -= 0x100;
		}
		return v;
	}

	readUint16() {
		return (this.#stream[this.#position++] << 8) | this.#stream[this.#position++];
	}

	readUint16L() {
		return this.#stream[this.#position++] | (this.#stream[this.#position++] << 8);
	}

	readInt16() {
		let v = (this.#stream[this.#position++] << 8) | this.#stream[this.#position++];
		if (v > 0x7FFF) {
			v -= 0x10000;
		}
		return v;
	}

	readInt16L() {
		let v = this.#stream[this.#position++] | (this.#stream[this.#position++] << 8);
		if (v > 0x7FFF) {
			v -= 0x10000;
		}
		return v;
	}

	readUint32() {
		return parseInt(
			(BigInt(this.#stream[this.#position++]) << 24n) |
			(BigInt(this.#stream[this.#position++]) << 16n) |
			(BigInt(this.#stream[this.#position++]) << 8n) |
			BigInt(this.#stream[this.#position++])
		);
	}

	readUint32L() {
		return parseInt(
			BigInt(this.#stream[this.#position++]) |
			(BigInt(this.#stream[this.#position++]) << 8n) |
			(BigInt(this.#stream[this.#position++]) << 16n) |
			(BigInt(this.#stream[this.#position++]) << 24n)
		);
	}

	readInt32() {
		let v =
			(BigInt(this.#stream[this.#position++]) << 24n) |
			(BigInt(this.#stream[this.#position++]) << 16n) |
			(BigInt(this.#stream[this.#position++]) << 8n) |
			BigInt(this.#stream[this.#position++])
		;
		if (v > 0x7FFFFFFFn) {
			v -= 0x100000000n;
		}
		return parseInt(v);
	}

	readInt32L() {
		let v =
			BigInt(this.#stream[this.#position++]) |
			(BigInt(this.#stream[this.#position++]) << 8n) |
			(BigInt(this.#stream[this.#position++]) << 16n) |
			(BigInt(this.#stream[this.#position++]) << 24n)
		;
		if (v > 0x7FFFFFFFn) {
			v -= 0x100000000n;
		}
		return parseInt(v);
	}
}

class TextReader {
	position = 0;
	#text = "";
	/** @type {Array<number>} */
	#positionList = [];

	get endOfStream() {
		return this.#text.length <= this.position;
	}

	get array() {
		return new TextEncoder().encode(
			this.#text.substring(this.position, this.#text.length)
		);
	}

	/**
	 * @param {Uint8Array | StreamWriter} buffer
	 */
	constructor(buffer) {
		if (buffer instanceof Uint8Array || buffer instanceof ArrayBuffer) {
			this.#text = new TextDecoder().decode(buffer);
		}
		if (buffer instanceof StreamWriter) {
			this.#text = new TextDecoder().decode(buffer.array);
		}
		if ("" != this.#text) {
			this.#text = this.#text.replace(/\0/g, "");
		}
	}

	pushPosition() {
		this.#positionList.push(this.position);
	}

	popPosition() {
		if (this.#positionList.length > 0) {
			this.position = this.#positionList.pop();
		}
	}

	/**
	 * @param {RegExp} reg
	 */
	seek(reg) {
		let index = this.#text.substring(this.position, this.#text.length).search(reg);
		if (index >= 0) {
			this.position += index;
		} else {
			this.position = this.#text.length;
		}
	}

	readLine() {
		let end = this.#text.indexOf("\n", this.position);
		let begin = this.position;
		if (end < 0) {
			end = this.#text.length;
		}
		this.position += end - begin + 1;
		return this.#text.substring(begin, end);
	}
}

class ZenkakuReader {
	static #ENC = new TextEncoder();
	static #DEC = new TextDecoder("utf-16");

	/** @type {Uint8Array} */
	#bytes = [];
	/** @type {Array<number>} */
	#index = [];

	/**
	 * @param {string} text
	 */
	constructor(text) {
		this.#bytes = new Uint8Array(text.length * 2);
		let bin = new BinaryReader(ZenkakuReader.#ENC.encode(text));
		let cursor = 0;
		while (bin.position < bin.length) {
			let b1 = bin.readByte();
			let utf16 = 0;
			if ((b1 & 0b1000_0000) == 0) {
				utf16 = b1;
			} else if ((b1 & 0b1110_0000) == 0b1100_0000) {
				utf16 = (b1 & 0b1_1111) << 6;
				utf16 |= (bin.readByte() & 0b11_1111);
			} else if ((b1 & 0b1111_0000) == 0b1110_0000) {
				utf16 = (b1 & 0b1111) << 12;
				utf16 |= (bin.readByte() & 0b11_1111) << 6;
				utf16 |= (bin.readByte() & 0b11_1111);
			}  else if ((b1 & 0b1111_1000) == 0b1111_0000) {
				utf16 = (b1 & 0b111) << 18;
				utf16 |= (bin.readByte() & 0b11_1111) << 12;
				utf16 |= (bin.readByte() & 0b11_1111) << 6;
				utf16 |= (bin.readByte() & 0b11_1111);
			}
			if (utf16 <= 0x7F) {
				/* ASCII */
				this.#index.push(cursor);
			} else if (0xFF61 <= utf16 && utf16 <= 0xFF9F) {
				/* 半角カナ */
				this.#index.push(cursor);
			} else if (utf16 <= 0xFFFF) {
				this.#index.push(cursor);
				this.#index.push(cursor + 1);
			} else {
				throw "UTF16範囲外";
			}
			this.#bytes[cursor] = utf16 & 0xFF;
			this.#bytes[cursor + 1] = utf16 >> 8;
			cursor += 2;
		}
	}

	/**
	 * @param {number} start
	 * @param {number} length
	 */
	substring(start, length) {
		let begin = this.#index[start];
		let end = this.#index[start + length];
		return ZenkakuReader.#DEC.decode(this.#bytes.subarray(begin, end));
	}
}

class DeflatePack {
	count = 0;
	/** @type {Array<number>} */
	simbles = [];
	/**
	 * @param {number} count
	 * @param {Array<number>} simbles
	 */
	constructor(count, simbles) {
		this.count = count;
		this.simbles = [].concat(simbles);
	}
}

class Deflate {
	static #UNCOMPRESSED = 0;
	static #FIXED = 1;
	static #DYNAMIC = 2;

	static #BLOCK_MAX_BUFFER_LEN = 131072;
	static #REPEAT_LEN_MIN = 3;
	static #FAST_INDEX_CHECK_MAX = 128;
	static #FAST_INDEX_CHECK_MIN = 16;
	static #FAST_REPEAT_LENGTH = 8;


	static #LENGTH_EXTRA_BIT_BASE = [
		3, 4, 5, 6, 7, 8, 9, 10, 11, 13,
		15, 17, 19, 23, 27, 31, 35, 43, 51, 59,
		67, 83, 99, 115, 131, 163, 195, 227, 258,
	];
	static #LENGTH_EXTRA_BIT_LEN = [
		0, 0, 0, 0, 0, 0, 0, 0, 1, 1,
		1, 1, 2, 2, 2, 2, 3, 3, 3, 3,
		4, 4, 4, 4, 5, 5, 5, 5, 0,
	];
	static #DISTANCE_EXTRA_BIT_BASE = [
		1, 2, 3, 4, 5, 7, 9, 13, 17, 25,
		33, 49, 65, 97, 129, 193, 257, 385, 513, 769,
		1025, 1537, 2049, 3073, 4097, 6145,
		8193, 12289, 16385, 24577,
	];
	static #DISTANCE_EXTRA_BIT_LEN = [
		0, 0, 0, 0, 1, 1, 2, 2, 3, 3,
		4, 4, 5, 5, 6, 6, 7, 7, 8, 8,
		9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
	];
	static #CODELEN_VALUES = [
		16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
	];

	/** @type {Map<number, Map<number, number>>} */
	static #FIXED_HUFFMAN_TABLE = Deflate.#generateHuffmanTable(
		Deflate.#makeFixedHuffmanCodelenValues()
	);

	/**
	 * @param {Uint8Array} input
	 * @param {number} startIndex
	 * @param {number} targetLength
	 * @returns {Map<number, Array<number>>}
	 */
	static #lz77GenerateIndexMap(input, startIndex, targetLength) {
		const END = startIndex + targetLength - Deflate.#REPEAT_LEN_MIN;
		/**@type {Map<number, Array<number>>} */
		let indexMap = new Map();
		for (let i = startIndex; i <= END; i++) {
			let indexKey = input[i] << 16 | input[i + 1] << 8 | input[i + 2];
			if (indexMap.has(indexKey)) {
				indexMap.get(indexKey).push(i);
			} else {
				indexMap.set(indexKey, []);
			}
		}
		return indexMap;
	}

	/**
	 * @param {Uint8Array} input
	 * @param {number} startIndex
	 * @param {number} targetLength
	 * @returns {Array<Array<number>>}
	 */
	static #lz77GenerateCodes(input, startIndex, targetLength) {
		let nowIndex = startIndex;
		let endIndex = startIndex + targetLength - Deflate.#REPEAT_LEN_MIN;
		let repeatLengthCodeValue = 0;
		let repeatDistanceCodeValue = 0;

		let indexMap = Deflate.#lz77GenerateIndexMap(input, startIndex, targetLength);

		/**@type {Map<number, number>} */
		let startIndexMap = new Map();
		/**@type {Map<number, number>} */
		let endIndexMap = new Map();
		/**@type {Array<Array<number>>} */
		let codeTargetValues = [];

		while (nowIndex <= endIndex) {
			let indexKey = input[nowIndex] << 16 | input[nowIndex + 1] << 8 | input[nowIndex + 2];
			if (!indexMap.has(indexKey) || indexMap.get(indexKey).length <= 1) {
				codeTargetValues.push([input[nowIndex]]);
				nowIndex++;
				continue;
			}

			let indexes = indexMap.get(indexKey);

			{
				let slideIndexBase = (nowIndex > 0x8000) ? (nowIndex - 0x8000) : 0;
				let skipindexes = startIndexMap.has(indexKey) ? startIndexMap.get(indexKey) : 0;
				while (indexes[skipindexes] < slideIndexBase) {
					skipindexes++;
				}
				startIndexMap.set(indexKey, skipindexes);
			}
			{
				let skipindexes = endIndexMap.has(indexKey) ? endIndexMap.get(indexKey) : 0;
				while (indexes[skipindexes] < nowIndex) {
					skipindexes++;
				}
				endIndexMap.set(indexKey, skipindexes);
			}

			let repeatLengthMax = 0;
			let repeatLengthMaxIndex = 0;
			{
				let checkCount = 0;
				let iStart = startIndexMap.get(indexKey);
				let iEnd = endIndexMap.get(indexKey) - 1;
				indexMapLoop: while (iStart <= iEnd) {
					if (checkCount >= Deflate.#FAST_INDEX_CHECK_MAX
						|| (repeatLengthMax >= Deflate.#FAST_REPEAT_LENGTH && checkCount >= Deflate.#FAST_INDEX_CHECK_MIN)) {
						break;
					}
					checkCount++;
					let index = indexes[iEnd];
					for (let j = repeatLengthMax - 1; 0 < j; j--) {
						if (input[index + j] != input[nowIndex + j]) {
							iEnd--;
							break indexMapLoop;
						}
					}
					let repeatLength = 258;
					for (let j = repeatLengthMax; j <= 258; j++) {
						if (input.length <= (index + j) || input.length <= (nowIndex + j) || input[index + j] != input[nowIndex + j]) {
							repeatLength = j;
							break;
						}
					}
					if (repeatLengthMax < repeatLength) {
						repeatLengthMax = repeatLength;
						repeatLengthMaxIndex = index;
						if (258 <= repeatLength) {
							break;
						}
					}
					iEnd--;
				}
			}

			if (repeatLengthMax >= 3 && nowIndex + repeatLengthMax <= endIndex) {
				let distance = nowIndex - repeatLengthMaxIndex;
				for (let i = 0; i < Deflate.#LENGTH_EXTRA_BIT_BASE.length; i++) {
					if (Deflate.#LENGTH_EXTRA_BIT_BASE[i] > repeatLengthMax) {
						break;
					}
					repeatLengthCodeValue = i;
				}
				for (let i = 0; i < Deflate.#DISTANCE_EXTRA_BIT_BASE.length; i++) {
					if (Deflate.#DISTANCE_EXTRA_BIT_BASE[i] > distance) {
						break;
					}
					repeatDistanceCodeValue = i;
				}
				codeTargetValues.push([
					repeatLengthCodeValue,
					repeatDistanceCodeValue,
					repeatLengthMax,
					distance
				]);
				nowIndex += repeatLengthMax;
			} else {
				codeTargetValues.push([input[nowIndex]]);
				nowIndex++;
			}
		}

		codeTargetValues.push([input[nowIndex]]);
		codeTargetValues.push([input[nowIndex + 1]]);
		return codeTargetValues;
	}

	/**
	 * @param {Array<number>} values
	 * @param {number} maxLength
	 * @returns {Array<DeflatePack>}
	 */
	static #createPackages(values, maxLength) {
		/** @type {Map<number, number>} */
		let valuesCount = new Map();
		for (let i = 0; i < values.length; i++) {
			let value = values[i];
			if (!valuesCount.has(value)) {
				valuesCount.set(value, 1);
			} else {
				let v = valuesCount.get(value);
				valuesCount.set(value, v + 1);
			}
		}

		if (valuesCount.size == 1) {
			let ret = [];
			valuesCount.forEach((v, k) => {
				ret.push(new DeflatePack(v, [k]));
			});
			return ret;
		}

		/** @type {Array<DeflatePack>} */
		let packages = [];
		/** @type {Array<DeflatePack>} */
		let tmpPackages = [];
		for (let i = 0; i < maxLength; i++) {
			packages = [];
			valuesCount.forEach((v, k) => {
				packages.push(new DeflatePack(v, [k]));
			});

			let tmpPackageIndex = 0;
			while (tmpPackageIndex + 2 <= tmpPackages.length) {
				let pack = new DeflatePack(
					tmpPackages[tmpPackageIndex].count + tmpPackages[tmpPackageIndex + 1].count,
					[]
				);
				pack.simbles = pack.simbles.concat(tmpPackages[tmpPackageIndex].simbles);
				pack.simbles = pack.simbles.concat(tmpPackages[tmpPackageIndex + 1].simbles);
				packages.push(pack);
				tmpPackageIndex += 2;
			}

			packages.sort((a, b) => {
				if (a.count < b.count) {
					return -1;
				}
				if (a.count > b.count) {
					return 1;
				}
				if (a.simbles.length < b.simbles.length) {
					return -1;
				}
				if (a.simbles.length > b.simbles.length) {
					return 1;
				}
				if (a.simbles[0] < b.simbles[0]) {
					return -1;
				}
				if (a.simbles[0] > b.simbles[0]) {
					return 1;
				}
				return 0;
			});

			if (packages.length % 2 != 0) {
				packages.pop();
			}
			tmpPackages = packages;
		}
		return packages;
	}

	/**
	 * @param {Array<number>} values
	 * @param {number} maxLength
	 * @returns {Map<number, BitCode>}
	 */
	static #generateDeflateHuffmanTable(values, maxLength = 15) {
		/** @type {Map<number, number>} */
		let valuesCodeLen = new Map();
		let packages = Deflate.#createPackages(values, maxLength);
		for (let pack of packages) {
			for (let symble of pack.simbles) {
				if (!valuesCodeLen.has(symble)) {
					valuesCodeLen.set(symble, 1);
				} else {
					let v = valuesCodeLen.get(symble);
					valuesCodeLen.set(symble, v + 1);
				}
			}
		}
		/** @type {Map<number, Array<number>>} */
		let codeLenGroup = new Map();
		let codeLenValueMin = 0xFFFFFFFF;
		let codeLenValueMax = 0;
		valuesCodeLen.forEach((codeLen, k) => {
			if (!codeLenGroup.has(codeLen)) {
				codeLenGroup.set(codeLen, []);
				if (codeLenValueMin > codeLen) {
					codeLenValueMin = codeLen;
				}
				if (codeLenValueMax < codeLen) {
					codeLenValueMax = codeLen;
				}
			}
			codeLenGroup.get(codeLen).push(k);
		});
		/** @type {Map<number, BitCode>} */
		let table = new Map();
		let code = 0;
		for (let i = codeLenValueMin; i <= codeLenValueMax; i++) {
			if (codeLenGroup.has(i)) {
				let group = codeLenGroup.get(i);
				group.sort((a, b) => {
					if (a < b) {
						return -1;
					}
					if (a > b) {
						return 1;
					}
					return 0;
				});
				for (let v of group) {
					table.set(v, new BitCode(code, i));
					code++;
				}
			}
			code <<= 1;
		}
		return table;
	}

	/**
	 * @param {BitStream} stream
	 * @param {Uint8Array} input
	 * @param {number} startIndex
	 * @param {number} targetLength
	 */
	static #deflateDynamicBlock(stream, input, startIndex, targetLength) {
		let lz77Codes = Deflate.#lz77GenerateCodes(input, startIndex, targetLength);
		let clCodeValues = [256];
		/** @type {Array<number>} */
		let distanceCodeValues = [];
		let clCodeValueMax = 256;
		let distanceCodeValueMax = 0;
		for (let i = 0, iMax = lz77Codes.length; i < iMax; i++) {
			let values = lz77Codes[i];
			let cl = values[0];
			if (2 <= values.length) {
				cl += 257;
				let distance = values[1];
				distanceCodeValues.push(distance);
				if (distanceCodeValueMax < distance) {
					distanceCodeValueMax = distance;
				}
			}
			clCodeValues.push(cl);
			if (clCodeValueMax < cl) {
				clCodeValueMax = cl;
			}
		}

		let dataHuffmanTables = Deflate.#generateDeflateHuffmanTable(clCodeValues);
		let distanceHuffmanTables = Deflate.#generateDeflateHuffmanTable(distanceCodeValues);

		/** @type {Array<number>} */
		let codelens = [];
		for (let i = 0; i <= clCodeValueMax; i++) {
			if (dataHuffmanTables.has(i)) {
				codelens.push(dataHuffmanTables.get(i).length);
			} else {
				codelens.push(0);
			}
		}

		const HLIT = codelens.length;
		for (let i = 0; i <= distanceCodeValueMax; i++) {
			if (distanceHuffmanTables.has(i)) {
				codelens.push(distanceHuffmanTables.get(i).length);
			} else {
				codelens.push(0);
			}
		}
		const HDIST = codelens.length - HLIT;

		/** @type {Array<number>} */
		let runLengthCodes = [];
		/** @type {Array<number>} */
		let runLengthRepeatCount = [];
		for (let i = 0; i < codelens.length; i++) {
			let codelen = codelens[i];
			let repeatLength = 1;
			while ((i + 1) < codelens.length && codelen == codelens[i + 1]) {
				repeatLength++;
				i++;
				if (codelen == 0) {
					if (138 <= repeatLength) {
						break;
					}
				} else {
					if (6 <= repeatLength) {
						break;
					}
				}
			}
			if (4 <= repeatLength) {
				if (codelen == 0) {
					if (11 <= repeatLength) {
						runLengthCodes.push(18);
					} else {
						runLengthCodes.push(17);
					}
				} else {
					runLengthCodes.push(codelen);
					runLengthRepeatCount.push(1);
					repeatLength--;
					runLengthCodes.push(16);
				}
				runLengthRepeatCount.push(repeatLength);
			} else {
				for (let j = 0; j < repeatLength; j++) {
					runLengthCodes.push(codelen);
					runLengthRepeatCount.push(1);
				}
			}
		}

		let codelenHuffmanTable = Deflate.#generateDeflateHuffmanTable(runLengthCodes, 7);
		let hcLen = 0;
		for (let i = 0; i < Deflate.#CODELEN_VALUES.length; i++) {
			if (codelenHuffmanTable.has(Deflate.#CODELEN_VALUES[i])) {
				hcLen = i + 1;
			}
		}

		stream.writeRange(HLIT - 257, 5);
		stream.writeRange(HDIST - 1, 5);
		stream.writeRange(hcLen - 4, 4);

		for (let i = 0; i < hcLen; i++) {
			if (codelenHuffmanTable.has(Deflate.#CODELEN_VALUES[i])) {
				let codelenTableObj = codelenHuffmanTable.get(Deflate.#CODELEN_VALUES[i]);
				stream.writeRange(codelenTableObj.length, 3);
			} else {
				stream.writeRange(0, 3);
			}
		}

		for (let i = 0; i < runLengthCodes.length; i++) {
			let value = runLengthCodes[i];
			if (codelenHuffmanTable.has(value)) {
				let codelenTableObj = codelenHuffmanTable.get(value);
				stream.writeRangeCoded(codelenTableObj);
			} else {
				throw "データ破損 codelenHuffmanTable に存在しない値：" + value;
			}
			if (value == 18) {
				stream.writeRange(runLengthRepeatCount[i] - 11, 7);
			} else if (value == 17) {
				stream.writeRange(runLengthRepeatCount[i] - 3, 3);
			} else if (value == 16) {
				stream.writeRange(runLengthRepeatCount[i] - 3, 2);
			}
		}

		for (let i = 0, iMax = lz77Codes.length; i < iMax; i++) {
			let values = lz77Codes[i];
			let clCodeValue = values[0];
			if (2 <= values.length) {
				let distanceCodeValue = values[1];
				if (!dataHuffmanTables.has(clCodeValue + 257)) {
					throw "データ破損 dataHuffmanTables に存在しない値：257 + " + clCodeValue;
				}
				let codelenTableObj = dataHuffmanTables.get(clCodeValue + 257);
				stream.writeRangeCoded(codelenTableObj);
				if (0 < Deflate.#LENGTH_EXTRA_BIT_LEN[clCodeValue]) {
					let repeatLength = values[2];
					stream.writeRange(
						repeatLength - Deflate.#LENGTH_EXTRA_BIT_BASE[clCodeValue],
						Deflate.#LENGTH_EXTRA_BIT_LEN[clCodeValue]
					);
				}
				if (!distanceHuffmanTables.has(distanceCodeValue)) {
					throw "データ破損 distanceHuffmanTables に存在しない値：" + distanceCodeValue;
				}
				let distanceTableObj = distanceHuffmanTables.get(distanceCodeValue);
				stream.writeRangeCoded(distanceTableObj);
				if (0 < Deflate.#DISTANCE_EXTRA_BIT_LEN[distanceCodeValue]) {
					let distance = values[3];
					stream.writeRange(
						distance - Deflate.#DISTANCE_EXTRA_BIT_BASE[distanceCodeValue],
						Deflate.#DISTANCE_EXTRA_BIT_LEN[distanceCodeValue]
					);
				}
			} else {
				if (!dataHuffmanTables.has(clCodeValue)) {
					throw "データ破損 dataHuffmanTables に存在しない値：" + clCodeValue;
				}
				let codelenTableObj = dataHuffmanTables.get(clCodeValue);
				stream.writeRangeCoded(codelenTableObj);
			}
		}
		if (!dataHuffmanTables.has(256)) {
			throw "データ破損 dataHuffmanTables に値(256)が存在しない";
		}
		let codelenTable256 = dataHuffmanTables.get(256);
		stream.writeRangeCoded(codelenTable256);
	}

	/**
	 * @param {Map<number, Array<number>>} codeLenValues
	 * @returns {Map<number, Map<number, number>>}
	 */
	static #generateHuffmanTable(codeLenValues) {
		let codeLenMax = 0;
		let codeLenMin = 0xFFFFFFFF;
		codeLenValues.forEach((v, codeLen) => {
			if (codeLenMax < codeLen) {
				codeLenMax = codeLen;
			}
			if (codeLenMin > codeLen) {
				codeLenMin = codeLen;
			}
		});
		/** @type {Map<number, Map<number, number>>} */
		let bitLenTables = new Map();
		let code = 0;
		for (let bitLen = codeLenMin; bitLen <= codeLenMax; bitLen++) {
			/** @type {Array<number>} */
			let values = [];
			if (codeLenValues.has(bitLen)) {
				values = codeLenValues.get(bitLen);
			} else {
				values = [];
			}
			values.sort((a, b) => {
				if (a < b) {
					return -1;
				}
				if (a > b) {
					return 1;
				}
				return 0;
			});
			/** @type {Map<number, number>} */
			let table = new Map();
			for (let v of values) {
				table.set(code++, v);
			}
			bitLenTables.set(bitLen, table);
			code <<= 1;
		}
		return bitLenTables;
	}

	/**
	 * @returns {Map<number, Array<number>>}
	 */
	static #makeFixedHuffmanCodelenValues() {
		/** @type {Map<number, Array<number>>} */
		let codelenValues = new Map();
		codelenValues.set(7, []);
		codelenValues.set(8, []);
		codelenValues.set(9, []);
		for (let i = 0; i <= 287; i++) {
			if (i <= 143) {
				codelenValues.get(8).push(i);
			} else if (i <= 255) {
				codelenValues.get(9).push(i);
			} else if (i <= 279) {
				codelenValues.get(7).push(i);
			} else {
				codelenValues.get(8).push(i);
			}
		}
		return codelenValues;
	}

	/**
	 * @param {BitStream} stream
	 * @param {StreamWriter} buffer
	 */
	static #inflateUncompressedBlock(stream, buffer) {
		if (stream.length < 8) {
			stream.readRange(stream.length);
		}
		const LEN = stream.readRange(8) | stream.readRange(8) << 8;
		const NLEN = stream.readRange(8) | stream.readRange(8) << 8;
		if ((LEN + NLEN) != 65535) {
			throw "データ破損 (LEN + NLEN) != 65535";
		}
		for (let i = 0; i < LEN; i++) {
			buffer.write(stream.readRange(8));
		}
	}

	/**
	 * @param {BitStream} stream
	 * @param {StreamWriter} buffer
	 */
	static #inflateFixedBlock(stream, buffer) {
		let tables = Deflate.#FIXED_HUFFMAN_TABLE;
		let codeLenMax = 0;
		let codeLenMin = 0xFFFFFFFF;
		tables.forEach((v, codeLen) => {
			if (codeLenMax < codeLen) {
				codeLenMax = codeLen;
			}
			if (codeLenMin > codeLen) {
				codeLenMin = codeLen;
			}
		});
		let value = 0;
		while (!stream.isEnd) {
			let codeLen = codeLenMin;
			let code = stream.readRangeCoded(codeLenMin);
			while (true) {
				if (tables.has(codeLen) && tables.get(codeLen).has(code)) {
					value = tables.get(codeLen).get(code);
					break;
				}
				if (codeLen >= codeLenMax) {
					throw "codeLen >= codeLenMax";
				}
				codeLen++;
				code <<= 1;
				code |= stream.read();
			}
			if (value < 256) {
				buffer.write(value);
				continue;
			}
			if (value == 256) {
				break;
			}
			let repeatLengthCode = value - 257;
			let repeatLengthValue = Deflate.#LENGTH_EXTRA_BIT_BASE[repeatLengthCode];
			let repeatLengthExt = Deflate.#LENGTH_EXTRA_BIT_LEN[repeatLengthCode];
			if (0 < repeatLengthExt) {
				repeatLengthValue += stream.readRange(repeatLengthExt);
			}
			let repeatDistanceCode = stream.readRangeCoded(5);
			let repeatDistanceValue = Deflate.#DISTANCE_EXTRA_BIT_BASE[repeatDistanceCode];
			let repeatDistanceExt = Deflate.#DISTANCE_EXTRA_BIT_LEN[repeatDistanceCode];
			if (0 < repeatDistanceExt) {
				repeatDistanceValue += stream.readRange(repeatDistanceExt);
			}
			let repeatStartIndex = buffer.length - repeatDistanceValue;
			buffer.writeFrom(buffer, repeatStartIndex, repeatLengthValue);
		}
	}

	/**
	 * @param {BitStream} stream
	 * @param {StreamWriter} buffer
	 */
	static #inflateDynamicBlock(stream, buffer) {
		const HLIT = stream.readRange(5) + 257;
		const HDIST = stream.readRange(5) + 1;
		const HCLEN = stream.readRange(4) + 4;
		const CODES_NUMBER = HLIT + HDIST;

		/** @type {Map<number, Array<number>>} */
		let codelenCodelenValues = new Map();
		for (let i = 0; i < HCLEN; i++) {
			let codelenCodelen = stream.readRange(3);
			if (codelenCodelen == 0) {
				continue;
			}
			if (!codelenCodelenValues.has(codelenCodelen)) {
				codelenCodelenValues.set(codelenCodelen, []);
			}
			codelenCodelenValues.get(codelenCodelen).push(Deflate.#CODELEN_VALUES[i]);
		}

		let codelenHuffmanTables = Deflate.#generateHuffmanTable(codelenCodelenValues);
		let codelenCodelenMax = 0;
		let codelenCodelenMin = 0xFFFFFFFF;
		codelenHuffmanTables.forEach((v, k) => {
			if (codelenCodelenMax < k) {
				codelenCodelenMax = k;
			}
			if (codelenCodelenMin > k) {
				codelenCodelenMin = k;
			}
		});

		/** @type {Map<number, Array<number>>} */
		let dataCodelenValues = new Map();
		/** @type {Map<number, Array<number>>} */
		let distanceCodelenValues = new Map();
		let codelen = 0;
		for (let i = 0; i < CODES_NUMBER;) {
			let runlengthCode = 0;
			let codelenCodelen = codelenCodelenMin;
			let codelenCode = stream.readRangeCoded(codelenCodelenMin);
			while (true) {
				if (codelenHuffmanTables.has(codelenCodelen) &&
					codelenHuffmanTables.get(codelenCodelen).has(codelenCode)) {
					runlengthCode = codelenHuffmanTables.get(codelenCodelen).get(codelenCode);
					break;
				}
				if (codelenCodelen >= codelenCodelenMax) {
					throw "codelenCodelen >= codelenCodelenMax";
				}
				codelenCodelen++;
				codelenCode <<= 1;
				codelenCode |= stream.read();
			}
			let repeat = 0;
			if (runlengthCode == 16) {
				repeat = 3 + stream.readRange(2);
			} else if (runlengthCode == 17) {
				repeat = 3 + stream.readRange(3);
				codelen = 0;
			} else if (runlengthCode == 18) {
				repeat = 11 + stream.readRange(7);
				codelen = 0;
			} else {
				repeat = 1;
				codelen = runlengthCode;
			}
			if (codelen <= 0) {
				i += repeat;
			} else {
				while (0 < repeat) {
					if (i < HLIT) {
						if (!dataCodelenValues.has(codelen)) {
							dataCodelenValues.set(codelen, []);
						}
						dataCodelenValues.get(codelen).push(i++);
					} else {
						if (!distanceCodelenValues.has(codelen)) {
							distanceCodelenValues.set(codelen, []);
						}
						distanceCodelenValues.get(codelen).push(i++ - HLIT);
					}
					repeat--;
				}
			}
		}

		let dataHuffmanTables = Deflate.#generateHuffmanTable(dataCodelenValues);
		let distanceHuffmanTables = Deflate.#generateHuffmanTable(distanceCodelenValues);

		let dataCodelenMax = 0;
		let dataCodelenMin = 0xFFFFFFFF;
		dataHuffmanTables.forEach((v, k) => {
			if (dataCodelenMax < k) {
				dataCodelenMax = k;
			}
			if (dataCodelenMin > k) {
				dataCodelenMin = k;
			}
		});

		let distanceCodelenMax = 0;
		let distanceCodelenMin = 0xFFFFFFFF;
		distanceHuffmanTables.forEach((v, k) => {
			if (distanceCodelenMax < k) {
				distanceCodelenMax = k;
			}
			if (distanceCodelenMin > k) {
				distanceCodelenMin = k;
			}
		});

		while (!stream.isEnd) {
			let data = 0;
			let dataCodelen = dataCodelenMin;
			let dataCode = stream.readRangeCoded(dataCodelenMin);
			while (true) {
				if (dataHuffmanTables.has(dataCodelen) &&
					dataHuffmanTables.get(dataCodelen).has(dataCode)) {
					data = dataHuffmanTables.get(dataCodelen).get(dataCode);
					break;
				}
				if (dataCodelen >= dataCodelenMax) {
					throw "dataCodelen >= dataCodelenMax";
				}
				dataCodelen++;
				dataCode <<= 1;
				dataCode |= stream.read();
			}
			if (data < 256) {
				buffer.write(data);
				continue;
			}
			if (data == 256) {
				break;
			}

			let repeatLengthCode = data - 257;
			let repeatLengthValue = Deflate.#LENGTH_EXTRA_BIT_BASE[repeatLengthCode];
			let repeatLengthExt = Deflate.#LENGTH_EXTRA_BIT_LEN[repeatLengthCode];
			if (0 < repeatLengthExt) {
				repeatLengthValue += stream.readRange(repeatLengthExt);
			}

			let repeatDistanceCode = 0;
			let repeatDistanceCodeCodelen = distanceCodelenMin;
			let repeatDistanceCodeCode = stream.readRangeCoded(distanceCodelenMin);
			while (true) {
				if (distanceHuffmanTables.has(repeatDistanceCodeCodelen) &&
					distanceHuffmanTables.get(repeatDistanceCodeCodelen).has(repeatDistanceCodeCode)) {
					repeatDistanceCode = distanceHuffmanTables.get(repeatDistanceCodeCodelen).get(repeatDistanceCodeCode);
					break;
				}
				if (repeatDistanceCodeCodelen >= distanceCodelenMax) {
					throw "repeatDistanceCodeCodelen >= distanceCodelenMax";
				}
				repeatDistanceCodeCodelen++;
				repeatDistanceCodeCode <<= 1;
				repeatDistanceCodeCode |= stream.read();
			}

			let repeatDistanceValue = Deflate.#DISTANCE_EXTRA_BIT_BASE[repeatDistanceCode];
			let repeatDistanceExt = Deflate.#DISTANCE_EXTRA_BIT_LEN[repeatDistanceCode];
			if (0 < repeatDistanceExt) {
				repeatDistanceValue += stream.readRange(repeatDistanceExt);
			}
			let repeatStartIndex = buffer.length - repeatDistanceValue;
			buffer.writeFrom(buffer, repeatStartIndex, repeatLengthValue);
		}
	}

	/**
	 * @param {Uint8Array} input
	 * @returns {Uint8Array}
	 */
	static compress(input) {
		const INPUT_LENGTH = input.length;
		const STREAM_HEAP = (INPUT_LENGTH < Deflate.#BLOCK_MAX_BUFFER_LEN / 2) ? Deflate.#BLOCK_MAX_BUFFER_LEN : INPUT_LENGTH * 2;
		let stream = new BitStream(new Uint8Array(STREAM_HEAP));
		let processedLength = 0;
		let targetLength = 0;
		while (true) {
			if (processedLength + Deflate.#BLOCK_MAX_BUFFER_LEN >= INPUT_LENGTH) {
				targetLength = INPUT_LENGTH - processedLength;
				stream.writeRange(1, 1);
			} else {
				targetLength = Deflate.#BLOCK_MAX_BUFFER_LEN;
				stream.writeRange(0, 1);
			}
			stream.writeRange(Deflate.#DYNAMIC, 2);
			Deflate.#deflateDynamicBlock(stream, input, processedLength, targetLength);
			processedLength += Deflate.#BLOCK_MAX_BUFFER_LEN;
			if (processedLength >= INPUT_LENGTH) {
				break;
			}
		}
		if (stream.index != 0) {
			stream.writeRange(0, 8 - stream.index);
		}
		return stream.array;
	}

	/**
	 * @param {Uint8Array} input
	 * @param {number} offset
	 * @returns {Uint8Array}
	 */
	static unCompress(input, offset = 0) {
		let buffer = new StreamWriter(input.length * 10);
		let stream = new BitStream(input, offset);
		let bFinal = 0;
		while (bFinal != 1) {
			bFinal = stream.readRange(1);
			let bType = stream.readRange(2);
			switch (bType) {
			case Deflate.#UNCOMPRESSED:
				Deflate.#inflateUncompressedBlock(stream, buffer);
				break;
			case Deflate.#FIXED:
				Deflate.#inflateFixedBlock(stream, buffer);
				break;
			case Deflate.#DYNAMIC:
				Deflate.#inflateDynamicBlock(stream, buffer);
				break;
			default:
				throw "不明な形式 : " + bType;
			}
			if (bFinal == 0 && stream.isEnd) {
				throw "データが不足";
			}
		}
		return buffer.array;
	}
}

class CRC32 {
	/** @type {Array<number>} */
	static #TABLE = [];
	static {
		const magic = 0xEDB88320;
		for (let i = 0; i < 256; ++i) {
			let v = i;
			for (let j = 0; j < 8; ++j) {
				if (0 == (v & 1)) {
					v >>>= 1;
				} else {
					v = magic ^ (v >>> 1);
				}
			}
			CRC32.#TABLE[i] = v >>> 0;
		}
	}
	/**
	 * @param {Uint8Array} data
	 */
	static getValue(data) {
		let crc = 0xFFFFFFFF;
		let tbl = CRC32.#TABLE;
		for (let v of data) {
			crc = (crc >>> 8) ^ tbl[(crc ^ v) & 0xFF];
		}
		crc ^= 0xFFFFFFFF;
		return crc >>> 0;
	}
}

class ZipPK0304 {
	static #SIGNETURE = [0x50, 0x4B, 0x03, 0x04];
	static #VERSION = [0x14, 0x00];
	static #OPTION = [0x00, 0x00];

	#position = 0;
	#size = 0;
	#dataSize = 0;
	#compSize = 0;
	#compType = 8;
	#crc32 = 0;
	#date = 0;
	#time = 0;

	get position() { return this.#position; }
	get size() { return this.#size; }
	get dataSize() { return this.#dataSize; }
	get compSize() { return this.#compSize; }
	get compType() { return this.#compType; }
	get crc32() { return this.#crc32; }
	get date() { return this.#date; }
	get time() { return this.#time; }

	/** @type {Uint8Array} */
	fileName = [];

	/**
	 * @param {StreamWriter} output
	 * @param {Uint8Array|Array<number>} data
	 * @param {string} fileName
	 */
	write(output, data, fileName) {
		let dateTime = new Date();
		this.#date = (dateTime.getFullYear() - 1980) << 9;
		this.#date |= (dateTime.getMonth() + 1) << 5;
		this.#date |= dateTime.getDate();
		this.#time = dateTime.getHours() << 11;
		this.#time |= dateTime.getMinutes() << 5;
		this.#time |= dateTime.getSeconds() >> 1;
		this.#crc32 = CRC32.getValue(data);
		this.#dataSize = data.length;
		let compData = Deflate.compress(data);
		this.#compSize = compData.length;
		if ((this.#compSize + 4) >= this.#dataSize) {
			this.#compSize = this.#dataSize;
			this.#compType = 0;
			compData = data;
		}
		this.fileName = new TextEncoder().encode(fileName);
		this.#position = output.length;
		output.writeBytes(ZipPK0304.#SIGNETURE);
		output.writeBytes(ZipPK0304.#VERSION);
		output.writeBytes(ZipPK0304.#OPTION);
		output.writeUint16L(this.#compType);
		output.writeUint16L(this.#time);
		output.writeUint16L(this.#date);
		output.writeUint32L(this.#crc32);
		output.writeUint32L(this.#compSize);
		output.writeUint32L(this.#dataSize);
		output.writeUint16L(this.fileName.length);
		output.writeUint16L(0);
		output.writeBytes(this.fileName);
		output.writeBytes(compData);
		this.#size = output.length - this.#position;
	}
}

class ZipPK0102 {
	static #SIGNETURE = [0x50, 0x4B, 0x01, 0x02];
	static #VERSION = [0x14, 0x00];
	static #OPTION = [0x00, 0x00];

	#position = 0;
	#size = 0;

	get position() { return this.#position; }
	get size() { return this.#size; }

	/**
	 * @param {StreamWriter} output
	 * @param {ZipPK0304} pk0304
	 */
	write(output, pk0304) {
		this.#position = output.length;
		output.writeBytes(ZipPK0102.#SIGNETURE);
		output.writeBytes(ZipPK0102.#VERSION);
		output.writeBytes(ZipPK0102.#VERSION);
		output.writeBytes(ZipPK0102.#OPTION);
		output.writeUint16L(pk0304.compType);
		output.writeUint16L(pk0304.time);
		output.writeUint16L(pk0304.date);
		output.writeUint32L(pk0304.crc32);
		output.writeUint32L(pk0304.compSize);
		output.writeUint32L(pk0304.dataSize);
		output.writeUint16L(pk0304.fileName.length);
		output.writeUint16L(0);
		output.writeUint16L(0);
		output.writeUint16L(0);
		output.writeUint16L(1);
		output.writeUint32L(0x20);
		output.writeUint32L(pk0304.position);
		output.writeBytes(pk0304.fileName);
		this.#size = output.length - this.#position;
	}
}

class Zip {
	static #SIGNETURE = [0x50, 0x4B, 0x05, 0x06];

	#output = new StreamWriter();
	/** @type {Array<ZipPK0304>} */
	#files = [];

	get fileCount() { return this.#files.length; }

	/**
	 * @param {Uint8Array|Array<number>} data
	 * @param {string} fileName
	 */
	append(data, fileName) {
		let pk = new ZipPK0304();
		pk.write(this.#output, data, fileName);
		this.#files.push(pk);
	}

	flush() {
		let pk0102Begin = this.#output.length;
		let pk0102AllSize = 0;
		for (let pk0304 of this.#files) {
			let pk0102 = new ZipPK0102();
			pk0102.write(this.#output, pk0304);
			pk0102AllSize += pk0102.size;
		}
		this.#output.writeBytes(Zip.#SIGNETURE);
		this.#output.writeUint16L(0);
		this.#output.writeUint16L(0);
		this.#output.writeUint16L(this.#files.length);
		this.#output.writeUint16L(this.#files.length);
		this.#output.writeUint32L(pk0102AllSize);
		this.#output.writeUint32L(pk0102Begin);
		this.#output.writeUint16L(0);
		let ret = this.#output.array;
		this.#output = new StreamWriter();
		this.#files = [];
		return ret;
	}
}
