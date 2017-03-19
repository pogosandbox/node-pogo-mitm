import * as logger from 'winston';
import * as fs from 'fs-promise';
import * as _ from 'lodash';
import * as moment from 'moment';
import * as Bluebird from 'bluebird';

let mitmproxy = require('http-mitm-proxy');

import Config from './config';
import Utils from './utils';
import Decoder from './decoder';

let endpoints = {
    api: 'pgorelease.nianticlabs.com',
    ptc: 'sso.pokemon.com',
    googleauth: 'accounts.google.com',
    googleapi: 'www.googleapis.com',
    // storage: 'storage.googleapis.com',
};

export default class MitmProxy {
    config: any;
    utils: Utils;
    proxy: any;
    decoder: Decoder;

    constructor(config) {
        this.config = config;
        this.utils = new Utils(config);
        this.decoder = new Decoder(config);
    }

    async launch() {
        let config = this.config;
        if (config.proxy.active) {
            let ip = config.ip = this.utils.getIp();
            logger.info('Proxy listening at %s:%s', ip, config.proxy.port);
            logger.info('Proxy config url available at http://%s:%s/proxy.pac', ip, config.proxy.port);

            this.config.proxy.plugins = await this.loadPlugins();

            this.proxy = mitmproxy()
                .use(mitmproxy.gunzip)
                .onError(_.bind(this.onError, this))
                .onRequest(_.bind(this.onRequest, this))
                .listen({port: config.proxy.port, silent: true});
        } else {
            logger.info('Proxy deactivated.');
        }
    }

    async loadPlugins() {
        let plugins: string[] = this.config.proxy.plugins;
        let loaded = await Bluebird.map(plugins, async name => {
            try {
                let plugin = require(`../plugins/${name}`);
                plugin.name = name;
                if (_.hasIn(plugin, 'init')) {
                    logger.debug('Load plugin %s', name);
                    await plugin.init(this);
                }
                return plugin;
            } catch (e) {
                logger.error('Error loading plugin %s', name, e);
                return null;
            }
        });
        return _.filter(loaded, l => l != null);
    }

    async onRequest(context, callback) {
        let config = this.config;
        let host = context.clientToProxyRequest.headers.host;
        let endpoint = _.findKey(endpoints, endpoint => endpoint === host);
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

        } else if (endpoint) {
            let requestChunks = [];
            let responseChunks = [];
            let request = null;

            let id = 0, requestId = '';
            if (endpoint === 'api') {
                id = ++this.config.reqId;
                requestId = _.padStart(id.toString(), 5, '0');
            }

            context.onRequestData((ctx, chunk, callback) => {
                requestChunks.push(chunk);
                return callback(null, null);
            });

            context.onRequestEnd(async (ctx, callback) => {
                let buffer = Buffer.concat(requestChunks);
                let url = ctx.clientToProxyRequest.url;

                try {
                    if (endpoint === 'api') {
                        ({ buffer, request } = await this.handleApiRequest(requestId, ctx, buffer, url));
                    } else if (!this.config.proxy.onlyApi) {
                        await this.simpleDumpRequest(endpoint, ctx, buffer, url);
                    }
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
                    if (endpoint === 'api') {
                        buffer = await this.handleApiResponse(requestId, ctx, buffer, request);
                    } else if (!this.config.proxy.onlyApi) {
                        await this.simpleDumpResponse(endpoint, ctx, buffer);
                    }
                } catch (e) {
                    logger.error(e);
                }

                ctx.proxyToClientResponse.write(buffer);
                callback(false);
            });

            callback();

        } else {
            logger.debug('unhandled: %s%s', host, context.clientToProxyRequest.url);
            callback();

        }
    }

    async simpleDumpRequest(name, ctx, buffer: Buffer, url: string) {
        logger.debug('Dumping request to %s %s', name, url);
        let id = +moment();
        let data = {
            when: id,
            url: url,
            headers: ctx.clientToProxyRequest.headers,
        };
        await fs.writeFile(`${this.config.datadir}/dump.${id}.${name}.req.info`, JSON.stringify(data, null, 4), 'utf8');
        await fs.writeFile(`${this.config.datadir}/dump.${id}.${name}.req.content`, buffer);
    }

    async simpleDumpResponse(name, ctx, buffer: Buffer) {
        let id = +moment();
        let data = {
            when: id,
            headers: ctx.serverToProxyResponse.headers,
        };
        await fs.writeFile(`${this.config.datadir}/dump.${id}.${name}.res.info`, JSON.stringify(data, null, 4), 'utf8');
        await fs.writeFile(`${this.config.datadir}/dump.${id}.${name}.res.content`, buffer.toString('utf8'), 'utf8');
    }

    async handleApiRequest(id, ctx, buffer: Buffer, url) {
        logger.info('Pogo request: %s', url);
        let data = {
            id: id,
            when: +moment(),
            endpoint: url,
            headers: ctx.proxyToServerRequest._headers,
            data: buffer.toString('base64'),
        };
        await fs.writeFile(`${this.config.datadir}/${id}.req.bin`, JSON.stringify(data, null, 4), 'utf8');

        let decoded = null;
        if (this.config.proxy.plugins.length > 0) {
            try {
                let plugins: any[] = this.config.proxy.plugins;

                decoded = this.decoder.decodeRequestBuffer(buffer);

                let modified = false;
                await Bluebird.each(plugins, async plugin => {
                    try {
                        if (_.hasIn(plugin, 'handleRequest')) {
                            modified = await plugin.handleRequest(ctx, decoded);
                        }
                    } catch (e) {
                        logger.error('Error passing request through %s', plugin.name, e);
                    }
                });

                if (modified) {
                    // request has been modified, reencode it (not implemented yet)
                    // buffer = this.decoder.encodeRequestToBuffer(decoded);
                }
            } catch (e) {
                // logger.error('Error during plugins execution', e);
            }
        }

        return {
            buffer: buffer,
            request: decoded,
        };
    }

    async handleApiResponse(id, ctx, buffer: Buffer, request) {
        if (this.config.proxy.plugins.length > 0 && ctx.clientToProxyRequest !== '/plfe/version') {
            try {
                let plugins: any[] = this.config.proxy.plugins;

                let response = this.decoder.decodeResponseBuffer(request, buffer);

                let modified = false;
                await Bluebird.each(plugins, async plugin => {
                    try {
                        if (_.hasIn(plugin, 'handleResponse')) {
                            modified = await plugin.handleResponse(ctx, response, request) || modified;
                        }
                    } catch (e) {
                        logger.error('Error passing response through %s', plugin.name, e);
                    }
                });

                if (modified) {
                    // response has been modified, reencode it (not for now)
                    buffer = this.decoder.encodeResponseToBuffer(response);
                }
            } catch (e) {
                // logger.error('Error during plugins execution', e);
            }
        }

        let data = {
            when: +moment(),
            data: buffer.toString('base64'),
        };
        await fs.writeFile(`${this.config.datadir}/${id}.res.bin`, JSON.stringify(data, null, 4), 'utf8');

        return buffer;
    }

    onError(ctx, err) {
        logger.error('Proxy error: ', err);
    }
}
