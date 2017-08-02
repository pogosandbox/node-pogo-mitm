import * as logger from 'winston';
import * as fs from 'mz/fs';
import * as _ from 'lodash';
import * as moment from 'moment';
import * as http from 'http';
import * as https from 'https';
import * as request from 'request-promise';
import * as getRawBody from 'raw-body';

import Config from './config';
import Utils from './utils';

export default class AlternateEndpoint {
    config: any;
    utils: Utils;
    proxy: any;

    constructor(config) {
        this.config = config;
        this.utils = new Utils(config);
    }

    async launch() {
        const config = this.config.alternateEndpoint;
        if (config.active) {
            let server = null;
            if (config.https) {
                const options = {
                    key: await fs.readFile('.http-mitm-proxy/keys/sso.pokemon.com.key'),
                    cert: await fs.readFile('.http-mitm-proxy/certs/sso.pokemon.com.pem')
                };
                server = https.createServer(options, <any>_.bind(this.onRequest, this));
            } else {
                server = http.createServer(<any>_.bind(this.onRequest, this));
            }

            server.listen(config.port, () => {
                const ip = this.utils.getIp();
                logger.info('Alternate endpoint listening at %s:%s', ip, config.https ? 443 : 80);
            });
        }
    }

    async onRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        logger.debug('Fake login request to %s%s', req.headers.host, req.url);
        try {
            let buffer = await getRawBody(req);
            if (buffer.length === 0) buffer = null;

            const host = req.headers.host;
            delete req.headers.host;
            delete req.headers['content-length'];

            logger.debug(`Making request to https://${host}${req.url}`);

            const options = {
                uri: `https://${host}${req.url}`,
                method: req.method,
                body: buffer,
                encoding: null,
                headers: req.headers,
                resolveWithFullResponse: true,
                strictSSL: false,
                simple: false,
            };
            const response = await request(options);
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
        const when = +moment();
        const data = {
            when,
            request: {
                endpoint: url,
                headers,
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