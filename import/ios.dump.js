let logger = require('winston');
let fs = require('fs');
let Promise = require('bluebird');
let moment = require('moment');
let _ = require('lodash');

Promise.promisifyAll(fs);

let Config = require('./../lib/config');
let config = new Config().load();

logger.loglevel = config.loglevel;

class IOSDump {
    convert() {
        return fs.readdirAsync('ios.dump')
                .then(files => _.filter(files, f => _.endsWith(f, 'req.raw.bin')))
                .then(files => {
                    if (files.length == 0) throw new Error('no file to import');

                    let date = _.trimEnd(files[0], '.req.raw.bin');
                    let when = moment(+date);
                    let folder = when.format('YYYYDDMM.HHmmss');
                    logger.info('Dest folder: data/%s', folder);

                    try {
                        fs.mkdirSync('data');
                    } catch(e) {}
                    try {
                        fs.mkdirSync('data/' + folder);
                    } catch(e) {}
                    return fs.writeFileAsync(`data/${folder}/.info`, '(from iOS dump)', 'utf8')
                            .then(() => {
                                return {
                                    folder: folder,
                                    files: files,
                                };
                            });
                })
                .then(data => {
                    return Promise.map(data.files, file => {
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
                    return Promise.map(files.files, file => this.handleReqFile(++reqId, files.folder, file));
                })
                .then(files => {
                    return files.length;
                });
    }

    handleReqFile(reqId, folder, file) {
        logger.info('Convert file %s in folder %s', file.file, folder);
        return fs.readFileAsync(`ios.dump/${file.file}`)
                .then(data => {
                    return {
                        id: reqId,
                        when: file.when,
                        data: Buffer.from(data).toString('base64'),
                    };
                })
                .then(data => {
                    let id = _.padStart(reqId, 5, 0);
                    return fs.writeFileAsync(`data/${folder}/${id}.req.bin`, JSON.stringify(data, null, 4), 'utf8');
                })
                .then(() => this.handleResFile(reqId, folder, file));
    }

    handleResFile(reqId, folder, file) {
        let resfile = _.trimEnd(file.file, '.req.raw.bin') + '.res.raw.bin';
        if (fs.existsSync(`ios.dump/${resfile}`)) {
            return fs.readFileAsync(`ios.dump/${resfile}`)
                    .then(data => Buffer.from(data).toString('base64'))
                    .then(data => {
                        let id = _.padStart(reqId, 5, 0);
                        return fs.writeFileAsync(`data/${folder}/${id}.res.bin`, data, 'utf8');
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
