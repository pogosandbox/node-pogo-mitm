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
class IOSDump {
    convert() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield fs.mkdir('data');
            }
            catch (e) { }
            let files = yield fs.readdir('ios.dump.noctem');
            // remove non api call
            files = _.filter(files, f => f.indexOf('undefined') < 0);
            // split requests and responses
            const requests = _.filter(files, f => _.endsWith(f, '.request'));
            const responses = _.filter(files, f => _.endsWith(f, '.response'));
            if (requests.length === 0)
                throw new Error('No file to import');
            const date = this.getTimestamp(requests[0]);
            const when = moment(+date);
            const folder = when.format('YYYYMMDD.HHmmss');
            logger.info('Dest folder: data/%s', folder);
            try {
                yield fs.mkdir('data/' + folder);
            }
            catch (e) { }
            yield fs.writeFile(`data/${folder}/.info`, '(Noctem, iOS)', 'utf8');
            let reqId = 0;
            yield Bluebird.map(requests, file => this.handleReqFile(++reqId, file, folder, responses));
            return requests.length;
        });
    }
    getTimestamp(file) {
        file = file.replace('iOS-', '');
        return +file.substring(0, file.indexOf('-'));
    }
    getRequestId(file) {
        return file.substring(file.lastIndexOf('-') + 1, file.length - '.request'.length);
    }
    handleReqFile(reqId, file, folder, responses) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.info('Convert file %s in folder %s', file, folder);
            const raw = yield fs.readFile(`ios.dump.noctem/${file}`);
            const id = _.padStart(reqId.toString(), 5, '0');
            const content = {
                id: reqId,
                when: this.getTimestamp(file),
                data: Buffer.from(raw).toString('base64'),
            };
            yield fs.writeFile(`data/${folder}/${id}.req.bin`, JSON.stringify(content, null, 4), 'utf8');
            yield this.handleResFile(reqId, file, folder, responses);
        });
    }
    handleResFile(reqId, file, folder, responses) {
        return __awaiter(this, void 0, void 0, function* () {
            const requestId = this.getRequestId(file);
            const resfile = _.find(responses, f => f.endsWith(requestId + '.response'));
            if (fs.existsSync(`ios.dump.noctem/${resfile}`)) {
                const raw = yield fs.readFile(`ios.dump.noctem/${resfile}`);
                const base64 = Buffer.from(raw).toString('base64');
                const id = _.padStart(reqId.toString(), 5, '0');
                yield fs.writeFile(`data/${folder}/${id}.res.bin`, base64, 'utf8');
            }
            else {
                logger.warn('Response file does not exist: ', resfile);
            }
        });
    }
}
const iOSDump = new IOSDump();
iOSDump.convert()
    .then(num => {
    logger.info('%s file(s) converted.', num);
    process.exit();
})
    .catch(e => logger.error(e));
//# sourceMappingURL=ios.dump.noctem.js.map