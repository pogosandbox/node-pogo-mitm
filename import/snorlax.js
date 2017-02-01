let logger = require('winston');
let fs = require('fs');
let Promise = require('bluebird');
let moment = require('moment');
let _ = require('lodash');

Promise.promisifyAll(fs);

let Config = require('./../lib/config');
let config = new Config().load();

logger.loglevel = config.loglevel;

class Snorlax {
    convert() {
        return fs.readdirAsync('snorlax')
                .then(files => {
                    files = _.filter(files, file => file.match(/.ENVELOPE_(REQUEST|RESPONSE).log$/));
                    if (files.length == 0) throw new Error('no file to import');

                    let date = files[0].substring(0, files[0].indexOf('.'));
                    let when = moment(date, 'YYMMDDHHmmSSSS');
                    let folder = when.format('YYYYMMDD.HHmmss');
                    logger.info('Dest folder: data/%s', folder);
                    try {
                        fs.mkdirSync('data');
                    } catch(e) {}
                    try {
                        fs.mkdirSync('data/' + folder);
                    } catch(e) {}
                    return {
                                folder: folder,
                                files: _.filter(files, f => f.indexOf('REQUEST') >= 0),
                                responses: _.filter(files, f => f.indexOf('RESPONSE') >= 0),
                            };
                })
                .then(data => {
                    return Promise.map(data.files, file => {
                        let timestamp = file.substring(0, file.indexOf('.'));
                        let when = moment(timestamp, 'YYMMDDHHmmSSSS');
                        return {
                            file: file,
                            when: when.valueOf(),
                        };
                    })
                    .then(files => {
                        return {
                            folder: data.folder,
                            files: files,
                            responses: data.responses,
                        };
                    });
                })
                .then(files => {
                    let reqId = 0;
                    return Promise.map(files.files, (file, idx) => this.handleReqFile(++reqId, files, file, idx));
                })
                .then(files => {
                    return files.length;
                });
    }

    handleReqFile(reqId, files, file, idx) {
        let folder = files.folder;
        logger.info('Convert file %s in folder %s', file.file, folder);
        return fs.readFileAsync(`snorlax/${file.file}`)
                .then(data => {
                    return {
                        id: reqId,
                        when: file.when,
                        data: Buffer.from(data).toString('base64'),
                    };
                })
                .then(data => {
                    let id = _.padStart(reqId, 5, 0);
                    return fs.writeFileAsync(`data/${folder}/${id}.req.bin`, JSON.stringify(data, null, 4), 'utf8')
                            .then(() => id);
                })
                .then(id => {
                    let response = files.responses[idx];
                    return fs.readFileAsync(`snorlax/${response}`)
                            .then(data => Buffer.from(data).toString('base64'))
                            .then(data => {
                                return fs.writeFileAsync(`data/${folder}/${id}.res.bin`, data, 'utf8');
                            });
                });
    }
}

let snorlax = new Snorlax();
snorlax.convert()
.then(num => {
    logger.info('%s file(s) converted.', num);
    process.exit();
});
