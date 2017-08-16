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
const _ = require("lodash");
const Bluebird = require("bluebird");
const config_1 = require("./../lib/config");
const utils_1 = require("./../lib/utils");
const decoder_js_1 = require("./../lib/decoder.js");
class Preload {
    constructor(config) {
        this.config = config || new config_1.default().load();
        this.utils = new utils_1.default(this.config);
        this.decoder = new decoder_js_1.default(this.config);
    }
    preload() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.utils.cleanDataFolders();
            const folders = yield this.utils.getSessionFolders();
            yield Bluebird.map(folders, folder => this.preloadSession(folder));
        });
    }
    preloadSession(folder) {
        return __awaiter(this, void 0, void 0, function* () {
            if (fs.existsSync(`data/${folder}/.preload`))
                return;
            logger.info('Preload session %s', folder);
            const files = yield fs.readdir(`data/${folder}`);
            const data = yield this.processRequests(folder, files);
            // save coords to display a nice map
            let coords = _.map(data, d => {
                return { lat: d.lat, lng: d.lng };
            });
            coords = _.filter(coords, d => d.lat && d.lng);
            yield fs.writeFile(`data/${folder}/.preload`, JSON.stringify(coords), 'utf8');
            yield this.processResponses(folder, files);
        });
    }
    processRequests(session, files) {
        return __awaiter(this, void 0, void 0, function* () {
            files = _.filter(files, f => _.endsWith(f, '.req.bin'));
            const data = yield Bluebird.map(files, (file) => __awaiter(this, void 0, void 0, function* () {
                return yield this.decoder.decodeRequest(session, _.trimEnd(file, '.req.bin'), true);
            }));
            return _.map(data, d => {
                return {
                    requestId: d.decoded.request_id,
                    lat: d.decoded.latitude,
                    lng: d.decoded.longitude,
                };
            });
        });
    }
    processResponses(session, files) {
        return __awaiter(this, void 0, void 0, function* () {
            files = _.filter(files, f => _.endsWith(f, '.res.bin'));
            yield Bluebird.map(files, (file) => __awaiter(this, void 0, void 0, function* () {
                yield this.decoder.decodeResponse(session, _.trimEnd(file, '.res.bin'), true);
            }));
        });
    }
}
const preload = new Preload();
preload.preload()
    .then(() => logger.info('Done.'))
    .then(() => process.exit())
    .catch(e => logger.error(e));
//# sourceMappingURL=preload.js.map