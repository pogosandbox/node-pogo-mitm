import * as logger from 'winston';
import * as fs from 'fs-promise';
import * as Bluebird from 'bluebird';
import * as moment from 'moment';
import * as _ from 'lodash';

import Config from './../lib/config';
let config = new Config().load();

class IOSDump {
    async convert(): Promise<number> {
        try {
            await fs.mkdir('data');
        } catch (e) {}

        let sessions = await fs.readdir('ios.dump');
        sessions = _.filter(sessions, session => _.startsWith('mitm.'));
        let converted = await Bluebird.map(sessions, async session => this.handleSession(session));
        return _.sum(converted);
    }

    async handleSession(session: string): Promise<number> {
        let files = await fs.readdir(`ios.dump/${session}`);
        files = _.filter(files, f => _.endsWith(f, 'req.raw.bin'));

        if (files.length === 0) throw new Error('no file to import');

        let date = _.trimEnd(files[0], '.req.raw.bin');
        let when = moment(+date);
        let folder = when.format('YYYYMMDD.HHmmss');

        logger.info('Dest folder: data/%s', folder);
        try {
            await fs.mkdir('data/' + folder);
        } catch (e) {}

        await fs.writeFile(`data/${folder}/.info`, '(iOS)', 'utf8');

        let reqId = 0;
        await Bluebird.map(files, async file => this.handleReqFile(++reqId, session, file, folder));

        return files.length;
    }

    async handleReqFile(reqId: number, session: string, file: string, folder: string): Promise<void> {
        logger.info('Convert file %s in folder %s', file, folder);
        try {
            let raw = await fs.readFile(`ios.dump/${session}/${file}`);
            let content = {
                id: reqId,
                when: + _.trimEnd(file, '.req.raw.bin'),
                data: Buffer.from(raw).toString('base64'),
            };

            let id = _.padStart(reqId.toString(), 5, '0');
            await fs.writeFile(`data/${folder}/${id}.req.bin`, JSON.stringify(content, null, 4), 'utf8');
            await this.handleResFile(reqId, session, file, folder);
        } catch (e) {
            logger.error('Error importing file %s', file);
            logger.error(e);
        }
    }

    async handleResFile(reqId: number, session: string, file: string, folder: string): Promise<void> {
        let resfile = _.trimEnd(file, '.req.raw.bin');
        resfile += '.res.raw.bin';
        if (fs.existsSync(`ios.dump/${session}/${resfile}`)) {
            try {
                let raw = await fs.readFile(`ios.dump/${session}/${resfile}`);
                let base64 = Buffer.from(raw).toString('base64');
                let id = _.padStart(reqId.toString(), 5, '0');
                await fs.writeFile(`data/${folder}/${id}.res.bin`, base64, 'utf8');
            } catch (e) {
                logger.error('Error importing file %s', resfile);
                logger.error(e);
            }
        }
    }
}

let iOSDump = new IOSDump();
iOSDump.convert()
.then(num => {
    logger.info('%s file(s) converted.', num);
    process.exit();
})
.catch(e => logger.error(e));