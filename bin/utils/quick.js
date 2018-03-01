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
const path = require("path");
function handleFolder(folder) {
    return __awaiter(this, void 0, void 0, function* () {
        let files = yield fs.readdir(folder);
        files = files.filter(f => f.endsWith('.res.bin'));
        for (let file of files) {
            let data = Buffer.from(yield fs.readFile(path.join(folder, file), 'utf8'), 'base64');
            try {
                console.log(`${data[0].toString(16)} ${data[1].toString(16)} ${data[2].toString(16)}`);
            }
            catch (e) {
                console.error(e);
            }
        }
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        let folders = yield fs.readdir('data');
        for (let folder of folders) {
            yield handleFolder(path.join('data', folder));
        }
    });
}
main()
    .then(() => console.log('done.'))
    .catch(e => console.error(e));
//# sourceMappingURL=quick.js.map