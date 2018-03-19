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
const logger = require("winston");
const fs = require("mz/fs");
const moment = require("moment");
const _ = require("lodash");
const config_1 = require("./../lib/config");
const config = new config_1.default().load();
class HarImport {
    importSession(archive) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.info(`Importing ${archive}...`);
            // load info from archive
            const raw = yield fs.readFile(archive, 'utf8');
            const entries = JSON.parse(raw).log.entries;
            // filter request only
            const requests = [];
            let id = 0;
            for (const entry of entries) {
                if (entry.request.method === 'GET' || entry.request.method === 'POST') {
                    let body = undefined;
                    if (entry.request.postData) {
                        body = Buffer.from(entry.request.postData.text).toString('base64');
                    }
                    let content = undefined;
                    if (entry.response.content.text) {
                        content = Buffer.from(entry.response.content.text, entry.response.content.encoding).toString('base64');
                    }
                    requests.push({
                        request: {
                            id: ++id,
                            when: +moment(entry.startedDateTime),
                            endpoint: entry.request.url,
                            more: {
                                method: entry.request.method,
                                headers: entry.request.headers,
                            },
                            data: body,
                        },
                        response: content,
                    });
                }
            }
            // get date, create dest folder
            const when = moment(requests[0].request.when);
            const folder = when.format('YYYYMMDD.HHmmss');
            logger.info('  folder: data/%s', folder);
            try {
                fs.mkdirSync('data');
            }
            catch (e) { }
            try {
                fs.mkdirSync('data/' + folder);
            }
            catch (e) { }
            yield fs.writeFile(`data/${folder}/.info`, '(from har archive)', 'utf8');
            for (const request of requests) {
                const id = request.request.id.toString().padStart(4, '0');
                yield fs.writeFile(`data/${folder}/${id}.req.bin`, JSON.stringify(request.request, null, 2), 'utf8');
                yield fs.writeFile(`data/${folder}/${id}.res.bin`, request.response, 'utf8');
            }
            logger.info('  done.');
        });
    }
    convert() {
        return __awaiter(this, void 0, void 0, function* () {
            let files = yield fs.readdir('har');
            files = _.filter(files, file => file.match(/.har$/) != null);
            if (files.length === 0)
                throw new Error('no file to import');
            for (const file of files) {
                yield this.importSession(`har/${file}`);
            }
            return files.length;
        });
    }
}
const importer = new HarImport();
importer.convert()
    .then(num => {
    logger.info('%s file(s) converted.', num);
    logger.info('Done.');
    process.exit();
})
    .catch(e => logger.error(e));
//# sourceMappingURL=har.js.map