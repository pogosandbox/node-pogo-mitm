import * as logger from 'winston';
import * as fs from 'fs-promise';
import * as _ from 'lodash';
import * as moment from 'moment';
import * as http from 'http';
import * as https from 'https';
import * as request from 'request-promise';
import * as getRawBody from 'raw-body';

import Config from './config';
import Utils from './utils';

export default class FakeLogin {
    config: any;
    utils: Utils;
    proxy: any;

    constructor(config) {
        this.config = config;
        this.utils = new Utils(config);
    }

    async launch() {
        let config = this.config.fakeLogin;
        if (config.active) {
            const options = {
                key: await fs.readFile('.http-mitm-proxy/keys/ca.private.key'),
                cert: await fs.readFile('.http-mitm-proxy/certs/ca.pem')
            };

            let server = https.createServer(options, _.bind(this.onRequest, this));
            server.listen(config.port, () => {
                 let ip = this.utils.getIp();
                logger.info('Fake login listening at %s:%s', ip, config.port);
            });
        }
    }

    async onRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        logger.debug('Fake login request to %s', req.url);
        try {
            let buffer = await getRawBody(req);
            if (buffer.length === 0) buffer = null;

            delete req.headers.host;
            delete req.headers['content-length'];

            let options = {
                uri: `https://sso.pokemon.com${req.url}`,
                method: req.method,
                body: buffer,
                encoding: null,
                headers: req.headers,
                resolveWithFullResponse: true,
                strictSSL: false,
                simple: false,
            };
            let response = await request(options);
            response.headers['content-length'] = response.body ? response.body.length : 0;

            await this.saveToFile(req.url, req.headers, response);

            res.writeHead(response.statusCode, response.headers);
            res.end(response.body, 'binary');
        } catch (e) {
            logger.error('Error', e);
            res.writeHead(500, {'Content-Type': 'text/plain'});
            res.end(e.toString());
        }
    }

    async saveToFile(url, headers, response) {
        let when = +moment();
        let data = {
            when: when,
            request: {
                endpoint: url,
                headers: headers,
            },
            response: {
                statusCode: response.statusCode,
                response: response.headers,
                data: response.body.toString('base64'),
            }
        };
        await fs.writeFile(`${this.config.datadir}/${when}.login.bin`, JSON.stringify(data, null, 4), 'utf8');
    }
}