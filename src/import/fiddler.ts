import * as logger from 'winston';
import * as fs from 'mz/fs';
import * as zlib from 'mz/zlib';
import * as Bluebird from 'bluebird';
import * as moment from 'moment';
import * as _ from 'lodash';
import * as JSZip from 'jszip';

import Config from './../lib/config';
const config = new Config().load();

class FiddlerImport {
    async importSession(archive: string) {
        logger.info(`Importing ${archive}...`);
        // load info from archive
        const raw = await fs.readFile(archive);
        const zip = new JSZip();
        await zip.loadAsync(raw);
        // filter request only
        const requests = [];
        for (const elt in zip.files) {
            const info = zip.files[elt];
            if (!info.dir) {
                if (elt.endsWith('_c.txt')) {
                    requests.push(elt);
                }
            }
        }
        // get date, create dest folder
        const when = moment(zip.files[requests[0]].date);
        const folder = when.format('YYYYMMDD.HHmmss');
        logger.info('  info folder: data/%s', folder);
        try {
            fs.mkdirSync('data');
        } catch (e) {}
        try {
            fs.mkdirSync('data/' + folder);
        } catch (e) {}
        await fs.writeFile(`data/${folder}/.info`, '(from fiddler)', 'utf8');
        // convert files
        let reqId = 1;
        for (const file of requests) {
            const content = await zip.files[file].async('nodebuffer');
            if (content.slice(0, 100).indexOf('POST https://pgorelease.nianticlabs.com') >= 0) {
                // request
                let raw = await this.getBody(content);
                const data = {
                    id: reqId,
                    when: zip.files[file].date.getTime(),
                    data: raw.toString('base64'),
                };
                const id = _.padStart(reqId.toString(), 5, '0');
                await fs.writeFile(`data/${folder}/${id}.req.bin`, JSON.stringify(data, null, 2), 'utf8');
                // response
                const resp = file.replace('_c.txt', '_s.txt');
                raw = await zip.files[resp].async('nodebuffer');
                raw = await this.getBody(raw);
                await fs.writeFile(`data/${folder}/${id}.res.bin`, raw.toString('base64'), 'utf8');
                // update req id
                reqId++;
            }
        }
        logger.info('  done.');
    }

    async getBody(content: Buffer) {
        const compressed = content.indexOf('Content-Encoding: gzip') > 0;
        const chunked = content.indexOf('Transfer-Encoding: chunked') > 0;
        let idx = content.indexOf(Buffer.from([0x0D, 0x0A, 0x0D, 0x0A]));
        if (idx) {
            content = content.slice(idx + 4);
        }
        if (chunked) {
            let buffer = Buffer.alloc(10);
            idx = 0;
            let nextLine = content.indexOf(Buffer.from([0x0D, 0x0A]), idx);
            while (true) {
                const size = parseInt(content.slice(idx, nextLine).toString('utf8'), 16);
                if (size === 0) break;
                buffer = Buffer.concat([buffer, content.slice(nextLine + 2, nextLine + 2 + size)]);
                idx = nextLine + 2 + size + 2;
                nextLine = content.indexOf(Buffer.from([0x0D, 0x0A]), idx);
            }
            content = buffer;
        }
        if (compressed) {
            content = content.slice(content.indexOf(Buffer.from([0x1F, 0x8B])));
            content = await zlib.unzip(content);
        }
        return content;
    }

    async convert(): Promise<number> {
        let files = await fs.readdir('fiddler');
        files = _.filter(files, file => file.match(/.saz$/) != null);
        if (files.length === 0) throw new Error('no file to import');

        for (const file of files) {
            await this.importSession(`fiddler/${file}`);
        }

        return files.length;
    }
}

const importer = new FiddlerImport();
importer.convert()
.then(num => {
    logger.info('%s file(s) converted.', num);
    logger.info('Done.');
    process.exit();
})
.catch(e => logger.error(e));
