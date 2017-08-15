import * as logger from 'winston';
import * as fs from 'mz/fs';
import * as Bluebird from 'bluebird';
import * as moment from 'moment';
import * as _ from 'lodash';

import Config from './../lib/config';
const config = new Config().load();

class IOSDump {
    async convert(): Promise<number> {
        try {
            await fs.mkdir('data');
        } catch (e) {}

        let files = await fs.readdir('ios.dump.noctem');

        // remove non api call
        files = _.filter(files, f => f.indexOf('undefined') < 0);

        // split requests and responses
        const requests = _.filter(files, f =>  _.endsWith(f, '.request'));
        const responses = _.filter(files, f =>  _.endsWith(f, '.response'));

        if (requests.length === 0) throw new Error('No file to import');

        const date = this.getTimestamp(requests[0]);
        const when = moment(+date);
        const folder = when.format('YYYYMMDD.HHmmss');

        logger.info('Dest folder: data/%s', folder);
        try {
            await fs.mkdir('data/' + folder);
        } catch (e) {}

        await fs.writeFile(`data/${folder}/.info`, '(Noctem, iOS)', 'utf8');

        let reqId = 0;
        await Bluebird.map(requests, file => this.handleReqFile(++reqId, file, folder, responses));

        return requests.length;
    }

    getTimestamp(file: string): number {
        file = file.replace('iOS-', '');
        return +file.substring(0, file.indexOf('-'));
    }

    getRequestId(file: string): string {
        return file.substring(file.lastIndexOf('-') + 1, file.length - '.request'.length);
    }

    async handleReqFile(reqId: number, file: string, folder: string, responses: string[]) {
        logger.info('Convert file %s in folder %s', file, folder);
        const raw = await fs.readFile(`ios.dump.noctem/${file}`);
        const id = _.padStart(reqId.toString(), 5, '0');
        const content = {
            id: reqId,
            when: this.getTimestamp(file),
            data: Buffer.from(raw).toString('base64'),
        };
        await fs.writeFile(`data/${folder}/${id}.req.bin`, JSON.stringify(content, null, 4), 'utf8');
        await this.handleResFile(reqId, file, folder, responses);
    }

    async handleResFile(reqId: number, file: string, folder: string, responses: string[]) {
        const requestId = this.getRequestId(file);
        const resfile = _.find(<string[]>responses, f => f.endsWith(requestId + '.response'));
        if (fs.existsSync(`ios.dump.noctem/${resfile}`)) {
            const raw = await fs.readFile(`ios.dump.noctem/${resfile}`);
            const base64 = Buffer.from(raw).toString('base64');
            const id = _.padStart(reqId.toString(), 5, '0');
            await fs.writeFile(`data/${folder}/${id}.res.bin`, base64, 'utf8');
        } else {
            logger.warn('Response file does not exist: ', resfile);
        }
    }
}

const iOSDump = new IOSDump();
iOSDump.convert()
.then(num => {
    logger.info('%s file(s) converted.', num);
    process.exit();
})
.catch(e => logger.error(e));
