import * as logger from 'winston';
import * as fs from 'fs-promise';
import * as Bluebird from 'bluebird';
import * as moment from 'moment';
import * as _ from 'lodash';

import Config from './../lib/config';
let config = new Config().load();

class IOSDump {
    async convert() {
        try {
            await fs.mkdir('data');
        } catch(e) {}
        let files = await fs.readdir('ios.dump.noctem');
        // remove non api call
        files = _.filter(files, f => f.indexOf('undefined') < 0);
        // split requests and responses
        let requests = _.filter(files, f =>  _.endsWith(f, '.request'));
        let responses = _.filter(files, f =>  _.endsWith(f, '.response'));

        if (requests.length == 0) throw new Error('no file to import');
        let date = this.getTimestamp(requests[0]);

        let when = moment(+date);
        let folder = when.format('YYYYMMDD.HHmmss');
        logger.info('Dest folder: data/%s', folder);

        try {
            await fs.mkdir('data/' + folder);
        } catch(e) {}
                 
        await fs.writeFile(`data/${folder}/.info`, '(from iOS dump)', 'utf8');

        let fullRequests = await Bluebird.map(requests, file => {
            let timestamp = this.getTimestamp(file);
            return {
                file: file,
                when: +timestamp,
            };
        });

        let reqId = 0;
        await Bluebird.map(fullRequests, file => this.handleReqFile(++reqId, file, folder, responses));

        return requests.length;
    }

    getTimestamp(file) {
        return file.substring('iOS-'.length, file.indexOf('-', 'iOS-'.length + 1));
    }

    getRequestId(file) {
        return file.substring(file.lastIndexOf("-") + 1);
    }

    handleReqFile(reqId, file, folder, responses) {
        logger.info('Convert file %s in folder %s', file.file, folder);
        return fs.readFile(`ios.dump.noctem/${file.file}`)
                .then(raw => {
                    let id = _.padStart(reqId, 5, '0');
                    let content = {
                        id: reqId,
                        when: file.when,
                        data: Buffer.from(raw).toString('base64'),
                    }
                    return fs.writeFile(`data/${folder}/${id}.req.bin`, JSON.stringify(content, null, 4), 'utf8');
                })
                .then(() => this.handleResFile(reqId, file, folder, responses));
    }

    handleResFile(reqId, file, folder, responses) {
        let requestId = this.getRequestId(file.file);
        let resfile = _.find(<string[]>responses, f => f.endsWith(requestId + '.response'));
        if (fs.existsSync(`ios.dump/${resfile}`)) {
            return fs.readFile(`ios.dump.noctem/${resfile}`)
                    .then(raw => Buffer.from(raw).toString('base64'))
                    .then(raw => {
                        let id = _.padStart(reqId, 5, '0');
                        return fs.writeFile(`data/${folder}/${id}.res.bin`, raw, 'utf8');
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
