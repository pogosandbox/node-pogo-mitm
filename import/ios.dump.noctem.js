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
        try {
            fs.mkdirSync('data');
        } catch(e) {}
        return fs.readdirAsync('ios.dump.noctem')
                .then(files => {
                    // remove non api call
                    files = _.filter(files, f => f.indexOf('undefined') < 0);
                    // split requests and responses
                    return {
                        requests: _.filter(files, f =>  _.endsWith(f, '.request')),
                        responses: _.filter(files, f =>  _.endsWith(f, '.response')),
                    }
                })
                .then(files => {
                    if (files.requests.length == 0) throw new Error('no file to import');
                    let date = this.getTimestamp(files.requests[0]);

                    let when = moment(+date);
                    let folder = when.format('YYYYMMDD.HHmmss');
                    logger.info('Dest folder: data/%s', folder);

                    try {
                            fs.mkdirSync('data/' + folder);
                        } catch(e) {}
                 
                    return fs.writeFileAsync(`data/${folder}/.info`, '(from iOS dump)', 'utf8')
                            .then(() => {
                                return {
                                    folder: folder,
                                    requests: files.requests,
                                    responses: files.responses,
                                };
                            });
                })
                .then(data => {
                    return Promise.map(data.requests, file => {
                        let timestamp = this.getTimestamp(file);
                        return {
                            file: file,
                            when: +timestamp,
                        };
                    })
                    .then(files => {
                        return {
                            folder: data.folder,
                            requests: files,
                            responses: data.responses,
                        };
                    });
                })
                .then(data => {
                    let reqId = 0;
                    return Promise.map(data.requests, file => this.handleReqFile(++reqId, file, data));
                })
                .then(files => {
                    return files.length;
                });
    }

    getTimestamp(file) {
        return file.substring('iOS-'.length, file.indexOf('-', 'iOS-'.length + 1));
    }

    getRequestId(file) {
        return file.substring(file.lastIndexOf("-") + 1);
    }

    handleReqFile(reqId, file, data) {
        logger.info('Convert file %s in folder %s', file.file, data.folder);
        return fs.readFileAsync(`ios.dump.noctem/${file.file}`)
                .then(raw => {
                    let id = _.padStart(reqId, 5, 0);
                    let content = {
                        id: reqId,
                        when: file.when,
                        data: Buffer.from(raw).toString('base64'),
                    }
                    return fs.writeFileAsync(`data/${data.folder}/${id}.req.bin`, JSON.stringify(content, null, 4), 'utf8');
                })
                .then(() => this.handleResFile(reqId, file, data));
    }

    handleResFile(reqId, file, data) {
        let requestId = this.getRequestId(file.file);
        let resfile = _.find(data.responses, f => f.endsWith(requestId + '.response'));
        if (fs.existsSync(`ios.dump/${resfile}`)) {
            return fs.readFileAsync(`ios.dump.noctem/${resfile}`)
                    .then(raw => Buffer.from(raw).toString('base64'))
                    .then(raw => {
                        let id = _.padStart(reqId, 5, 0);
                        return fs.writeFileAsync(`data/${folder}/${id}.res.bin`, raw, 'utf8');
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
