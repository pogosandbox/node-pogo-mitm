"use strict";
const logger = require("winston");
const fs = require("fs-promise");
const Bluebird = require("bluebird");
const moment = require("moment");
const _ = require("lodash");
const config_1 = require("./../lib/config");
let config = new config_1.default().load();
class IOSDump {
    convert() {
        try {
            fs.mkdirSync('data');
        }
        catch (e) { }
        return fs.readdir('ios.dump')
            .then(sessions => {
            return Bluebird.map(sessions, session => this.handleSession(session));
        });
    }
    handleSession(session) {
        return fs.readdir(`ios.dump/${session}`)
            .then(files => _.filter(files, f => _.endsWith(f, 'req.raw.bin')))
            .then(files => {
            if (files.length == 0)
                throw new Error('no file to import');
            let date = _.trimEnd(files[0], '.req.raw.bin');
            let when = moment(+date);
            let folder = when.format('YYYYMMDD.HHmmss');
            logger.info('Dest folder: data/%s', folder);
            try {
                fs.mkdirSync('data/' + folder);
            }
            catch (e) { }
            return fs.writeFile(`data/${folder}/.info`, '(from iOS dump)', 'utf8')
                .then(() => {
                return {
                    folder: folder,
                    files: files,
                };
            });
        })
            .then(data => {
            return Bluebird.map(data.files, file => {
                let timestamp = _.trimEnd(file, '.req.raw.bin');
                return {
                    file: file,
                    when: +timestamp,
                };
            })
                .then(files => {
                return {
                    folder: data.folder,
                    files: files,
                };
            });
        })
            .then(files => {
            let reqId = 0;
            return Bluebird.map(files.files, file => this.handleReqFile(++reqId, session, file, files.folder));
        })
            .then(data => {
            return data.length;
        });
    }
    handleReqFile(reqId, session, file, folder) {
        logger.info('Convert file %s in folder %s', file.file, folder);
        return fs.readFile(`ios.dump/${session}/${file.file}`)
            .then(data => {
            return {
                id: reqId,
                when: file.when,
                data: Buffer.from(data).toString('base64'),
            };
        })
            .then(data => {
            let id = _.padStart(reqId.toString(), 5, '0');
            return fs.writeFile(`data/${folder}/${id}.req.bin`, JSON.stringify(data, null, 4), 'utf8');
        })
            .then(() => this.handleResFile(reqId, session, file, folder));
    }
    handleResFile(reqId, session, file, folder) {
        let resfile = _.trimEnd(file.file, '.req.raw.bin') + '.res.raw.bin';
        if (fs.existsSync(`ios.dump/${session}/${resfile}`)) {
            return fs.readFile(`ios.dump/${session}/${resfile}`)
                .then(data => Buffer.from(data).toString('base64'))
                .then(data => {
                let id = _.padStart(reqId.toString(), 5, '0');
                return fs.writeFile(`data/${folder}/${id}.res.bin`, data, 'utf8');
            });
        }
    }
}
let iOSDump = new IOSDump();
iOSDump.convert()
    .then(num => {
    logger.info('%s file(s) converted.', num);
    process.exit();
});
//# sourceMappingURL=ios.dump.js.map