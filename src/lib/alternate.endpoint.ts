import * as logger from 'winston';
import * as fs from 'fs';
import * as _ from 'lodash';
// import * as moment from 'moment';
// import * as Bluebird from 'bluebird';
import * as http from 'http';
import * as https from 'https';
import * as request from 'request-promise';
import * as getRawBody from 'raw-body';

import Config from './config';
import Utils from './utils';

export default class Alterna {
    config: any;
    utils: Utils;
    proxy: any;

    constructor(config) {
        this.config = config;
        this.utils = new Utils(config);
    }

    launch() {
        let config = this.config.alternate_endpoint;
        if (config.active) {
            const options = {
                key: fs.readFileSync('.http-mitm-proxy/keys/ca.private.key'),
                cert: fs.readFileSync('.http-mitm-proxy/certs/ca.pem')
            };

            let server = https.createServer(options, _.bind(this.onRequest, this));
            server.listen(config.port, () => {
                 let ip = this.utils.getIp();
                logger.info('Alternate endpoint listening at %s:%s', ip, config.port);
            });
        }
    }

    async onRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        logger.debug('Alternate endpoint request to %s', req.url);
        let buffer = await getRawBody(req);
        if (buffer.length === 0) buffer = null;

        let response = await request({
            url: `https://${req.headers.host}${req.url}`,
            method: req.method,
            body: buffer,
            encoding: null,
            headers: req.headers,
            resolveWithFullResponse: true,
        });
    }
}