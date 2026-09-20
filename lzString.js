// A small ES-module build of LZ-String's URI-safe codec (MIT).
// Save strings intentionally use this established format so they are compact,
// copy/paste-safe, and can be decoded by other LZString implementations.
const KEY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$';
const REVERSE = Object.create(null);

function baseValue(character) {
    if (REVERSE[character] === undefined) REVERSE[character] = KEY.indexOf(character);
    return REVERSE[character];
}

export function compressToEncodedURIComponent(input) {
    if (input == null) return '';
    return compress(String(input), 6, value => KEY.charAt(value));
}

export function decompressFromEncodedURIComponent(input) {
    if (input == null) return '';
    if (input === '') return null;
    return decompress(input.length, 32, index => baseValue(input.charAt(index)));
}

function compress(input, bitsPerChar, getChar) {
    let i, value;
    const dictionary = Object.create(null);
    const dictionaryToCreate = Object.create(null);
    let c = '';
    let wc = '';
    let w = '';
    let enlargeIn = 2;
    let dictSize = 3;
    let numBits = 2;
    const data = [];
    let dataVal = 0;
    let dataPosition = 0;

    const writeBit = bit => {
        dataVal = (dataVal << 1) | bit;
        if (dataPosition === bitsPerChar - 1) {
            dataPosition = 0;
            data.push(getChar(dataVal));
            dataVal = 0;
        } else dataPosition++;
    };
    const writeBits = (count, number) => {
        for (i = 0; i < count; i++) {
            writeBit(number & 1);
            number >>= 1;
        }
    };
    const emitWord = word => {
        if (Object.prototype.hasOwnProperty.call(dictionaryToCreate, word)) {
            if (word.charCodeAt(0) < 256) {
                writeBits(numBits, 0);
                writeBits(8, word.charCodeAt(0));
            } else {
                writeBits(numBits, 1);
                writeBits(16, word.charCodeAt(0));
            }
            enlargeIn--;
            if (enlargeIn === 0) { enlargeIn = 2 ** numBits; numBits++; }
            delete dictionaryToCreate[word];
        } else {
            writeBits(numBits, dictionary[word]);
        }
        enlargeIn--;
        if (enlargeIn === 0) { enlargeIn = 2 ** numBits; numBits++; }
    };

    for (let ii = 0; ii < input.length; ii++) {
        c = input.charAt(ii);
        if (!Object.prototype.hasOwnProperty.call(dictionary, c)) {
            dictionary[c] = dictSize++;
            dictionaryToCreate[c] = true;
        }
        wc = w + c;
        if (Object.prototype.hasOwnProperty.call(dictionary, wc)) {
            w = wc;
        } else {
            emitWord(w);
            dictionary[wc] = dictSize++;
            w = c;
        }
    }
    if (w !== '') emitWord(w);

    writeBits(numBits, 2);
    while (true) {
        dataVal <<= 1;
        if (dataPosition === bitsPerChar - 1) {
            data.push(getChar(dataVal));
            break;
        }
        dataPosition++;
    }
    return data.join('');
}

function decompress(length, resetValue, getNextValue) {
    const dictionary = [0, 1, 2];
    let next;
    let enlargeIn = 4;
    let dictSize = 4;
    let numBits = 3;
    let entry = '';
    const result = [];
    let w;
    let bits, resb, maxpower, power;
    const data = { value: getNextValue(0), position: resetValue, index: 1 };

    const readBits = count => {
        bits = 0;
        maxpower = 2 ** count;
        power = 1;
        while (power !== maxpower) {
            resb = data.value & data.position;
            data.position >>= 1;
            if (data.position === 0) {
                data.position = resetValue;
                data.value = getNextValue(data.index++);
            }
            bits |= (resb > 0 ? 1 : 0) * power;
            power <<= 1;
        }
        return bits;
    };

    next = readBits(2);
    switch (next) {
        case 0: w = String.fromCharCode(readBits(8)); break;
        case 1: w = String.fromCharCode(readBits(16)); break;
        case 2: return '';
        default: return null;
    }
    dictionary[3] = w;
    result.push(w);

    while (true) {
        if (data.index > length) return '';
        const code = readBits(numBits);
        switch (code) {
            case 0:
                dictionary[dictSize++] = String.fromCharCode(readBits(8));
                next = dictSize - 1;
                enlargeIn--;
                break;
            case 1:
                dictionary[dictSize++] = String.fromCharCode(readBits(16));
                next = dictSize - 1;
                enlargeIn--;
                break;
            case 2: return result.join('');
            default: next = code;
        }
        if (enlargeIn === 0) { enlargeIn = 2 ** numBits; numBits++; }
        if (dictionary[next] !== undefined) entry = dictionary[next];
        else if (next === dictSize) entry = w + w.charAt(0);
        else return null;
        result.push(entry);
        dictionary[dictSize++] = w + entry.charAt(0);
        enlargeIn--;
        w = entry;
        if (enlargeIn === 0) { enlargeIn = 2 ** numBits; numBits++; }
    }
}
