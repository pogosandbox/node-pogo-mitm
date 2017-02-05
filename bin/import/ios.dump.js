"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const logger = require("winston");
const fs = require("fs-promise");
const Bluebird = require("bluebird");
const moment = require("moment");
const _ = require("lodash");
const config_1 = require("./../lib/config");
let config = new config_1.default().load();
class IOSDump {
    convert() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield fs.mkdir('data');
            }
            catch (e) { }
            let sessions = yield fs.readdir('ios.dump');
            yield Bluebird.map(sessions, session => this.handleSession(session));
        });
    }
    handleSession(session) {
        return __awaiter(this, void 0, void 0, function* () {
            let files = yield fs.readdir(`ios.dump/${session}`);
            files = _.filter(files, f => _.endsWith(f, 'req.raw.bin'));
            if (files.length == 0)
                throw new Error('no file to import');
            let date = _.trimEnd(files[0], '.req.raw.bin');
            let when = moment(+date);
            let folder = when.format('YYYYMMDD.HHmmss');
            logger.info('Dest folder: data/%s', folder);
            try {
                yield fs.mkdir('data/' + folder);
            }
            catch (e) { }
            yield fs.writeFile(`data/${folder}/.info`, '(from iOS dump)', 'utf8');
            let reqId = 0;
            Bluebird.map(files, file => this.handleReqFile(++reqId, session, file, folder));
            return files.length;
        });
    }
    handleReqFile(reqId, session, file, folder) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.info('Convert file %s in folder %s', file, folder);
            let raw = yield fs.readFile(`ios.dump/${session}/${file}`);
            let content = {
                id: reqId,
                when: +_.trimEnd(file, '.req.raw.bin'),
                data: Buffer.from(raw).toString('base64'),
            };
            let id = _.padStart(reqId.toString(), 5, '0');
            yield fs.writeFile(`data/${folder}/${id}.req.bin`, JSON.stringify(content, null, 4), 'utf8');
            yield this.handleResFile(reqId, session, file, folder);
        });
    }
    handleResFile(reqId, session, file, folder) {
        return __awaiter(this, void 0, void 0, function* () {
            let resfile = _.trimEnd(file.file, '.req.raw.bin') + '.res.raw.bin';
            if (fs.existsSync(`ios.dump/${session}/${resfile}`)) {
                let raw = yield fs.readFile(`ios.dump/${session}/${resfile}`);
                let base64 = Buffer.from(raw).toString('base64');
                let id = _.padStart(reqId.toString(), 5, '0');
                yield fs.writeFile(`data/${folder}/${id}.res.bin`, base64, 'utf8');
            }
        });
    }
}
let iOSDump = new IOSDump();
iOSDump.convert()
    .then(num => {
    logger.info('%s file(s) converted.', num);
    process.exit();
})
    .catch(e => logger.error(e));
//# sourceMappingURL=ios.dump.js.map