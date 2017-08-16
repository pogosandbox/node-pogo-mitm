import * as logger from 'winston';
import * as fs from 'mz/fs';
import * as Bluebird from 'bluebird';
import * as moment from 'moment';
import * as _ from 'lodash';

import Config from './../lib/config';
const config = new Config().load();

class Snorlax {
    async convert(): Promise<number> {
        let files = await fs.readdir('snorlax');
        files = _.filter(files, file => file.match(/.ENVELOPE_(REQUEST|RESPONSE).log$/) != null);
        if (files.length === 0) throw new Error('no file to import');

        const date = files[0].substring(0, files[0].indexOf('.'));
        const when = moment(date, 'YYMMDDHHmmSSSS');
        const folder = when.format('YYYYMMDD.HHmmss');
        logger.info('Dest folder: data/%s', folder);
        try {
            fs.mkdirSync('data');
        } catch (e) {}
        try {
            fs.mkdirSync('data/' + folder);
        } catch (e) {}

        await fs.writeFile(`data/${folder}/.info`, '(android)', 'utf8');

        const requests = _.filter(<string[]>files, f => f.indexOf('REQUEST') >= 0);
        const responses =  _.filter(<string[]>files, f => f.indexOf('RESPONSE') >= 0);

        await Bluebird.map(requests, file => {
            const timestamp = file.substring(0, file.indexOf('.'));
            const when = moment(timestamp, 'YYMMDDHHmmSSSS');
            return {
                file,
                when: when.valueOf(),
            };
        });

        let reqId = 0;
        await Bluebird.map(requests, async (file, idx) => {
            const response = responses[idx];
            await this.handleReqFile(++reqId, folder, file, response);
        });

        return requests.length;
    }

    async handleReqFile(reqId: number, folder: string, request: string, response: string): Promise<void> {
        logger.info('Convert file %s in folder %s', request, folder);
        let raw = await fs.readFile(`snorlax/${request}`);
        const timestamp = request.substring(0, request.indexOf('.'));
        const when = moment(timestamp, 'YYMMDDHHmmSSSS').valueOf();
        const data = {
            id: reqId,
            when,
            data: Buffer.from(raw).toString('base64'),
        };
        const id = _.padStart(reqId.toString(), 5, '0');
        await fs.writeFile(`data/${folder}/${id}.req.bin`, JSON.stringify(data, null, 4), 'utf8');

        raw = await fs.readFile(`snorlax/${response}`);
        const base64 = Buffer.from(raw).toString('base64');
        await fs.writeFile(`data/${folder}/${id}.res.bin`, base64, 'utf8');
    }
}

const snorlax = new Snorlax();
snorlax.convert()
.then(num => {
    logger.info('%s file(s) converted.', num);
    logger.info('Done.');
    process.exit();
})
.catch(e => logger.error(e));
