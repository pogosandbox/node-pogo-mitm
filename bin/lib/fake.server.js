"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("mz/fs");
class FakeServer {
    constructor(config) {
        this.config = config;
    }
    bufEquals(buf, index, bytes) {
        if (index + bytes.length > buf.length)
            return false;
        for (let i = 0; i < bytes.length; i++) {
            if (buf[index + i] !== bytes[i]) {
                return false;
            }
        }
        return true;
    }
    readString(buffer, offset) {
        const length = buffer.readUInt32LE(offset);
        const str = buffer.slice(offset + 4, offset + 4 + length).toString();
        return {
            text: str,
            length,
            size: length + 4,
        };
    }
    readToken(buffer, offset) {
        const length = buffer.readUInt32LE(offset);
        const data = buffer.slice(offset + 4, offset + 4 + length);
        let index = 0;
        index++; // buffer[index] = 0x0A - string ?
        const lnType = data[index++];
        const type = data.slice(index, index + lnType).toString();
        index += lnType;
        index++; // buffer[index] = 0x12
        index++; // buffer[index] = value ? (82)
        index++; // buffer[index] = 0x0A - string ?
        const lnToken = data[index++];
        const token = data.slice(index, index + lnToken).toString();
        index += lnToken;
        // remains 10 1D 1A 00
        return {
            type,
            content: token,
            size: 4 + length,
        };
    }
    readHeader(buffer) {
        let index = 0;
        const firstlines = [
            [0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0e, 0x00, 0x14, 0x00, 0x10, 0x00],
            [0x04, 0x00, 0x00, 0x00, 0x0e, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00],
        ];
        if (!this.bufEquals(buffer, index, firstlines[0])) {
            throw new Error('Unexpected bytes at ' + index);
        }
        index += firstlines[0].length;
        let typeId = buffer.readUInt16LE(index);
        const type = (typeId === 0x0F) ? 'request' : 'response';
        index += 2;
        if (buffer.readUInt16LE(index) !== 8)
            throw new Error('Unexpected value at ' + index);
        index += 2;
        if (buffer.readUInt16LE(index) !== 4)
            throw new Error('Unexpected value at ' + index);
        index += 2;
        let byte = buffer.readUInt16LE(index);
        if (type === 'request' && byte !== 0)
            throw new Error('Unexpected value at ' + index);
        else if (type === 'response' && byte !== 0x0F)
            throw new Error('Unexpected value at ' + index);
        index += 2;
        byte = buffer.readUInt32LE(index);
        if (byte !== 0x0E)
            throw new Error('Unexpected value at ' + index);
        index += 4;
        typeId = buffer.readUInt16LE(0x1c);
        if (typeId !== 1 && typeId !== 2)
            throw new Error('Unexpected typeId value');
        const subtype = ['?', 'handshake', 'api'][typeId];
        index += 4;
        const dataLength = buffer.readUInt32LE(0x28);
        index = 0x28 + 4;
        if (buffer.length !== dataLength + index) {
            throw new Error('Data length does not match buffer length');
        }
        return {
            type,
            subtype,
            dataLength,
            size: index,
        };
    }
    readHandshakeRequest(buffer, index) {
        index = 100;
        let read = this.readString(buffer, index);
        console.log(`  version: ${read.text}`);
        index += read.size;
        if (index % 8 !== 0)
            index += (8 - index % 8);
        read = this.readString(buffer, index);
        const id = read.text;
        console.log(`  id: ${read.text}`);
        index += read.size;
        if (index % 8 !== 0)
            index += (8 - index % 8);
        const token = this.readToken(buffer, index);
        console.log(`  token type: ${token.type}`);
        console.log(`  token value: ${token.content}`);
        index += token.size;
        return {
            id,
            token: {
                type: token.type,
                content: token.content,
            },
        };
    }
    handleRequest(requestId, buffer) {
        return __awaiter(this, void 0, void 0, function* () {
            // for debugging
            yield fs.writeFile(`${this.config.datadir}/${requestId}.req.raw`, buffer);
            let index = 0;
            const header = this.readHeader(buffer);
            console.log(`  type: ${header.type}`);
            console.log(`  subtype: ${header.subtype}`);
            console.log(`  data size: ${header.dataLength}`);
            index += header.size;
            if (header.type !== 'request')
                throw new Error('Unexpected request type. request was expected, got ' + header.type);
            if (header.subtype === 'handshake') {
                this.readHandshakeRequest(buffer, index);
            }
            else if (header.subtype === 'api') {
                // this.readApiRequest(buffer, index, state.handshake);
                throw new Error('Not implemented');
            }
            return null;
        });
    }
}
exports.default = FakeServer;
//# sourceMappingURL=fake.server.js.map