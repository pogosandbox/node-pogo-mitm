let logger = require('winston');
let fs = require('fs');
let Promise = require('bluebird');
let moment = require('moment');
let _ = require('lodash');

Promise.promisifyAll(fs);

class Snorlax {
    convert() {
        return fs.readdirAsync('snorlax')
                .then(files => {
                    if (files.length == 0) throw new Error('no file to import');

                    let date = files[0].substring(0, files[0].indexOf('.'));
                    let when = moment(date, 'YYMMDDHHmmSSSS');
                    let folder = when.format('YYYYDDMM.HHmmss');
                    logger.info('Dest folder: data/%s', folder);
                    try {
                        fs.mkdirSync('data/' + folder);
                    } catch(e) {}
                    return {
                                folder: folder,
                                files: files,
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
                        };
                    });
                })
                .then(files => {
                    let reqId = 0;
                    return Promise.map(files.files, file => this.handleFile(++reqId, files.folder, file));
                })
                .then(files => {
                    return files.length;
                });
    }

    handleFile(reqId, folder, file) {
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
                    let id = _.padStart(reqId, 4, 0);
                    return fs.writeFile(`data/${folder}/${id}.req.bin`, JSON.stringify(data, null, 4), 'utf8');
                });
    }
}

let snorlax = new Snorlax();
snorlax.convert()
.then(num => {
    logger.info('%s file(s) converted.', num);
});
