import * as logger from 'winston';
import * as fs from 'fs-promise';
import * as _ from 'lodash';
import * as moment from 'moment';
import * as Bluebird from 'bluebird';

let mitmproxy = require('http-mitm-proxy');

import Config from './config';
import Utils from './utils';

let endpoints = {
    api: 'pgorelease.nianticlabs.com',
    oauth: 'accounts.google.com',
    ptc: 'sso.pokemon.com',
    storage: 'storage.googleapis.com',
};

export default class MitmProxy {
    config: any;
    utils: Utils;
    proxy: any;

    constructor(config) {
        this.config = config;
        this.utils = new Utils(config);
    }

    launch() {
        let config = this.config;
        if (config.proxy.active) {
            let ip = config.ip = this.utils.getIp();
            logger.info('Proxy listening at %s:%s', ip, config.proxy.port);

            this.proxy = mitmproxy()
                .use(mitmproxy.gunzip)
                .onError(_.bind(this.onError, this))
                .onRequest(_.bind(this.onRequest, this))
                .listen({port: config.proxy.port, silent: true});
        } else {
            logger.info('Proxy deactivated.');
        }
    }

    async onRequest(context, callback) {
        let config = this.config;
        let host = context.clientToProxyRequest.headers.host;
        if (host === `${config.ip}:${config.proxy.port}` || (config.proxy.hostname && _.startsWith(host, config.proxy.hostname))) {
            let res = context.proxyToClientResponse;
            if (_.startsWith(context.clientToProxyRequest.url, '/proxy.pac')) {
                // get proxy.pac
                logger.info('Get proxy.pac');
                let data = await fs.readFile('templates/proxy.pac', 'utf8');
                if (_.endsWith(host, '.ngrok.io')) {
                    data = data.replace(/##PROXY##/g, host + ':80');
                } else {
                    data = data.replace(/##PROXY##/g, host);
                }
                res.writeHead(200, {'Content-Type': 'application/x-ns-proxy-autoconfig', 'Content-Length': data.length});
                res.end(data, 'utf8');
            } else if (_.endsWith(context.clientToProxyRequest.url, '.mobileconfig')) {
                logger.info('Get mobileconfig');
                let data = await fs.readFile('templates/mobileconfig.xml', 'utf8');
                data = data.replace('##PAC_URL##', `http://${host}/proxy.pac`);
                res.writeHead(200, {'Content-Type': 'application/mobileconfig', 'Content-Length': data.length});
                res.end(data, 'utf8');
            } else if (_.startsWith(context.clientToProxyRequest.url, '/cert')) {
                // get cert
                logger.info('Get certificate');
                let path = this.proxy.sslCaDir + '/certs/ca.pem';
                let data = await fs.readFile(path);
                res.writeHead(200, {'Content-Type': 'application/x-x509-ca-cert', 'Content-Length': data.length});
                res.end(data, 'binary');
            } else {
                logger.info('Incorrect request');
                res.end('what?', 'utf8');
            }

        // } else if (host == endpoints.ptc) {
        //     logger.debug('Dump sso headers');
        //     logger.debug(ctx.proxyToServerRequest._headers);
        //     callback();

        } else if (host === endpoints.api) {
            let requestChunks = [];
            let responseChunks = [];

            let id = ++this.config.reqId;
            let requestId = _.padStart(id.toString(), 5, '0');

            context.onRequestData((ctx, chunk, callback) => {
                requestChunks.push(chunk);
                return callback(null, null);
            });

            context.onRequestEnd(async (ctx, callback) => {
                let buffer = Buffer.concat(requestChunks);
                let url = ctx.clientToProxyRequest.url;

                try {
                    await this.handleApiRequest(requestId, ctx, buffer, url);
                } catch (e) {
                    logger.error(e);
                }

                ctx.proxyToServerRequest.write(buffer);
                callback();
            });

            context.onResponseData((ctx, chunk, callback) => {
                responseChunks.push(chunk);
                return callback();
            });

            context.onResponseEnd(async (ctx, callback) => {
                let buffer = Buffer.concat(responseChunks);

                try {
                    await this.handleApiResponse(requestId, ctx, buffer);
                } catch (e) {
                    logger.error(e);
                }

                ctx.proxyToClientResponse.write(buffer);
                callback(false);
            });

            callback();

        } else {
            logger.debug('unhandled: %s', host);
            callback();

        }
    }

    async handleApiRequest(id, ctx, buffer, url) {
        logger.info('Pogo request: %s', url);
        let data = {
            id: id,
            when: +moment(),
            endpoint: url,
            headers: ctx.proxyToServerRequest._headers,
            data: buffer.toString('base64'),
        };
        await fs.writeFile(`${this.config.datadir}/${id}.req.bin`, JSON.stringify(data, null, 4), 'utf8');
    }

    async handleApiResponse(id, ctx, buffer) {
        let data = {
            when: +moment(),
            data: buffer.toString('base64'),
        };
        await fs.writeFile(`${this.config.datadir}/${id}.res.bin`, JSON.stringify(data, null, 4), 'utf8');
    }

    onError(ctx, err) {
        logger.error('Proxy error:', err);
    }
}
