import * as logger from 'winston';
import * as fs from 'mz/fs';
import * as zlib from 'mz/zlib';
import * as Bluebird from 'bluebird';
import * as moment from 'moment';
import * as _ from 'lodash';
import * as JSZip from 'jszip';

import Config from './../lib/config';
const config = new Config().load();

class HarImport {
    async importSession(archive: string) {
        logger.info(`Importing ${archive}...`);
        // load info from archive
        const raw = await fs.readFile(archive, 'utf8');
        const entries = JSON.parse(raw).log.entries;
        // filter request only
        const requests = [];
        let id = 0;
        for (const entry of entries) {
            if (entry.request.method === 'GET' || entry.request.method === 'POST') {
                let body = undefined;
                if (entry.request.postData) {
                    body = Buffer.from(entry.request.postData.text).toString('base64');
                }
                let content = undefined;
                if (entry.response.content.text) {
                    content = Buffer.from(entry.response.content.text, entry.response.content.encoding).toString('base64');
                }
                requests.push({
                    request: {
                        id: ++id,
                        when: +moment(entry.startedDateTime),
                        endpoint: entry.request.url,
                        more: {
                            method: entry.request.method,
                            headers: entry.request.headers,
                        },
                        data: body,
                    },
                    response: content,
                });
            }
        }
        // get date, create dest folder
        const when = moment(requests[0].request.when);
        const folder = when.format('YYYYMMDD.HHmmss');
        logger.info('  folder: data/%s', folder);
        try {
            fs.mkdirSync('data');
        } catch (e) {}
        try {
            fs.mkdirSync('data/' + folder);
        } catch (e) {}
        await fs.writeFile(`data/${folder}/.info`, '(from har archive)', 'utf8');

        for (const request of requests) {
            const id = request.request.id.toString().padStart(4, '0');
            await fs.writeFile(`data/${folder}/${id}.req.bin`, JSON.stringify(request.request, null, 2), 'utf8');
            await fs.writeFile(`data/${folder}/${id}.res.bin`, request.response, 'utf8');
        }
        logger.info('  done.');
    }

    async convert(): Promise<number> {
        let files = await fs.readdir('har');
        files = _.filter(files, file => file.match(/.har$/) != null);
        if (files.length === 0) throw new Error('no file to import');

        for (const file of files) {
            await this.importSession(`har/${file}`);
        }

        return files.length;
    }
}

const importer = new HarImport();
importer.convert()
.then(num => {
    logger.info('%s file(s) converted.', num);
    logger.info('Done.');
    process.exit();
})
.catch(e => logger.error(e));
