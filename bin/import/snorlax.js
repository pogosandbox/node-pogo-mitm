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
const Bluebird = require("bluebird");
const moment = require("moment");
const _ = require("lodash");
const config_1 = require("./../lib/config");
const config = new config_1.default().load();
class Snorlax {
    convert() {
        return __awaiter(this, void 0, void 0, function* () {
            let files = yield fs.readdir('snorlax');
            files = _.filter(files, file => file.match(/.ENVELOPE_(REQUEST|RESPONSE).log$/) != null);
            if (files.length === 0)
                throw new Error('no file to import');
            const date = files[0].substring(0, files[0].indexOf('.'));
            const when = moment(date, 'YYMMDDHHmmSSSS');
            const folder = when.format('YYYYMMDD.HHmmss');
            logger.info('Dest folder: data/%s', folder);
            try {
                fs.mkdirSync('data');
            }
            catch (e) { }
            try {
                fs.mkdirSync('data/' + folder);
            }
            catch (e) { }
            yield fs.writeFile(`data/${folder}/.info`, '(android)', 'utf8');
            const requests = _.filter(files, f => f.indexOf('REQUEST') >= 0);
            const responses = _.filter(files, f => f.indexOf('RESPONSE') >= 0);
            yield Bluebird.map(requests, file => {
                const timestamp = file.substring(0, file.indexOf('.'));
                const when = moment(timestamp, 'YYMMDDHHmmSSSS');
                return {
                    file,
                    when: when.valueOf(),
                };
            });
            let reqId = 0;
            yield Bluebird.map(requests, (file, idx) => __awaiter(this, void 0, void 0, function* () {
                const response = responses[idx];
                yield this.handleReqFile(++reqId, folder, file, response);
            }));
            return requests.length;
        });
    }
    handleReqFile(reqId, folder, request, response) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.info('Convert file %s in folder %s', request, folder);
            let raw = yield fs.readFile(`snorlax/${request}`);
            const timestamp = request.substring(0, request.indexOf('.'));
            const when = moment(timestamp, 'YYMMDDHHmmSSSS').valueOf();
            const data = {
                id: reqId,
                when,
                data: Buffer.from(raw).toString('base64'),
            };
            const id = _.padStart(reqId.toString(), 5, '0');
            yield fs.writeFile(`data/${folder}/${id}.req.bin`, JSON.stringify(data, null, 4), 'utf8');
            raw = yield fs.readFile(`snorlax/${response}`);
            const base64 = Buffer.from(raw).toString('base64');
            yield fs.writeFile(`data/${folder}/${id}.res.bin`, base64, 'utf8');
        });
    }
}
const snorlax = new Snorlax();
snorlax.convert()
    .then(num => {
    logger.info('%s file(s) converted.', num);
    logger.info('Done.');
    process.exit();
})
    .catch(e => logger.error(e));
//# sourceMappingURL=snorlax.js.map