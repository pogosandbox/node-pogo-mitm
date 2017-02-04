var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as os from 'os';
import * as fs from 'fs-promise';
import * as moment from 'moment';
import * as _ from 'lodash';
import * as Bluebird from 'bluebird';
export default class Utils {
    constructor(config) {
        this.config = config;
    }
    getIp() {
        // typing is bad but I can't find a way to make it works
        let ipv4 = _(os.networkInterfaces())
            .filter((i, name) => !/(loopback|vmware|internal)/gi.test(name))
            .flatten().filter(ip => !ip.internal && ip.family == 'IPv4').first();
        return ipv4.address;
    }
    initFolders() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.cleanDataFolders();
            yield this.createCurrentFolder();
        });
    }
    createCurrentFolder() {
        return __awaiter(this, void 0, void 0, function* () {
            this.config.datadir = 'data/' + moment().format('YYYYMMDD.HHmmss');
            yield fs.mkdir(this.config.datadir);
        });
    }
    getSessionFolders() {
        return __awaiter(this, void 0, void 0, function* () {
            let content = yield fs.readdir('data');
            let files = yield Bluebird.filter(content, file => {
                let stat = yield fs.stat('data/' + file);
                return stat.isDirectory();
            });
            return _.sortBy(files);
        });
    }
    cleanDataFolders() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield fs.mkdir('data');
            }
            catch (e) { }
            let folders = yield this.getSessionFolders();
            folders = yield Bluebird.filter(folders, dir => {
                let content = yield fs.readdir(`data/${dir}`);
                return content.length == 0;
            });
            yield Bluebird.map(folders, dir => {
                yield fs.rmdir(`data/${dir}`);
            });
        });
    }
}
//# sourceMappingURL=utils.js.map