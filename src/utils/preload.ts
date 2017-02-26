import * as logger from 'winston';
import * as fs from 'fs-promise';
import * as _ from 'lodash';
import * as Bluebird from 'bluebird';

import Config from './../lib/config';
import Utils from './../lib/utils';
import Decoder from './../lib/decoder.js';

class Preload {
    config: any;
    utils: Utils;
    decoder: Decoder;

    constructor(config?) {
        this.config = config || new Config().load();
        this.utils = new Utils(this.config);
        this.decoder = new Decoder(this.config);
    }

    async preload() {
        await this.utils.cleanDataFolders();
        let folders = await this.utils.getSessionFolders();
        await Bluebird.map(folders, folder => this.preloadSession(folder));
    }

    async preloadSession(folder: string) {
        if (fs.existsSync(`data/${folder}/.preload`)) return;

        logger.info('Preload session %s', folder);
        let files = await fs.readdir(`data/${folder}`);

        let data = await this.processRequests(folder, files);

        await this.validateData(folder, data);

        // save coords to display a nice map
        let coords = _.map(data, d => {
            return {lat: d.lat, lng: d.lng};
        });
        coords = _.filter(coords, d => d.lat && d.lng);
        await fs.writeFile(`data/${folder}/.preload`, JSON.stringify(coords), 'utf8');

        await this.processResponses(folder, files);
    }

    async validateData(folder: string, data: any[]) {
        try {

        } catch (e) {
            logger.warn(e);
        }
    }

    async processRequests(session: string, files: string[]): Promise<any[]> {
        files = _.filter(files, f => _.endsWith(f, '.req.bin'));
        let data = await Bluebird.map(files, async file => {
            return await this.decoder.decodeRequest(session, _.trimEnd(file, '.req.bin'), true);
        });
        return _.map(data, d => {
            return {
                requestId: d.decoded.request_id,
                lat: d.decoded.latitude,
                lng: d.decoded.longitude,
            };
        });
    }

    async processResponses(session: string, files: string[]): Promise<void> {
        files = _.filter(files, f => _.endsWith(f, '.res.bin'));
        await Bluebird.map(files, async file => {
            await this.decoder.decodeResponse(session, _.trimEnd(file, '.res.bin'), true);
        });
    }
}

let preload = new Preload();
preload.preload()
.then(() => logger.info('Done.'))
.then(() => process.exit())
.catch(e => logger.error(e));
