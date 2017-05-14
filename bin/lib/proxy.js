"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger = require("winston");
const fs = require("mz/fs");
const _ = require("lodash");
const moment = require("moment");
const Bluebird = require("bluebird");
let mitmproxy = require('http-mitm-proxy');
const utils_1 = require("./utils");
const decoder_1 = require("./decoder");
let endpoints = {
    api: 'pgorelease.nianticlabs.com',
    ptc: 'sso.pokemon.com',
    googleauth: 'accounts.google.com',
    googleapi: 'www.googleapis.com',
};
class MitmProxy {
    constructor(config) {
        this.config = config;
        this.utils = new utils_1.default(config);
        this.decoder = new decoder_1.default(config);
    }
    launch() {
        return __awaiter(this, void 0, void 0, function* () {
            let config = this.config;
            if (config.proxy.active) {
                let ip = config.ip = this.utils.getIp();
                logger.info('Proxy listening at %s:%s', ip, config.proxy.port);
                logger.info('Proxy config url available at http://%s:%s/proxy.pac', ip, config.proxy.port);
                this.config.proxy.plugins = yield this.loadPlugins();
                this.proxy = mitmproxy()
                    .use(mitmproxy.gunzip)
                    .onError(_.bind(this.onError, this))
                    .onRequest(_.bind(this.onRequest, this))
                    .listen({ port: config.proxy.port, silent: true });
            }
            else {
                logger.info('Proxy deactivated.');
            }
        });
    }
    loadPlugins() {
        return __awaiter(this, void 0, void 0, function* () {
            let plugins = this.config.proxy.plugins;
            let loaded = yield Bluebird.map(plugins, (name) => __awaiter(this, void 0, void 0, function* () {
                try {
                    let plugin = require(`../plugins/${name}`);
                    plugin.name = name;
                    if (_.hasIn(plugin, 'init')) {
                        logger.debug('Load plugin %s', name);
                        yield plugin.init(this);
                    }
                    return plugin;
                }
                catch (e) {
                    logger.error('Error loading plugin %s', name, e);
                    return null;
                }
            }));
            return _.filter(loaded, l => l != null);
        });
    }
    onRequest(context, callback) {
        return __awaiter(this, void 0, void 0, function* () {
            let config = this.config;
            let host = context.clientToProxyRequest.headers.host;
            let endpoint = _.findKey(endpoints, endpoint => endpoint === host);
            if (host === `${config.ip}:${config.proxy.port}` || (config.proxy.hostname && _.startsWith(host, config.proxy.hostname))) {
                let res = context.proxyToClientResponse;
                if (_.startsWith(context.clientToProxyRequest.url, '/proxy.pac')) {
                    // get proxy.pac
                    logger.info('Get proxy.pac');
                    let data = yield fs.readFile('templates/proxy.pac', 'utf8');
                    if (_.endsWith(host, '.ngrok.io')) {
                        data = data.replace(/##PROXY##/g, host + ':80');
                    }
                    else {
                        data = data.replace(/##PROXY##/g, host);
                    }
                    res.writeHead(200, { 'Content-Type': 'application/x-ns-proxy-autoconfig', 'Content-Length': data.length });
                    res.end(data, 'utf8');
                }
                else if (_.endsWith(context.clientToProxyRequest.url, '.mobileconfig')) {
                    logger.info('Get mobileconfig');
                    let data = yield fs.readFile('templates/mobileconfig.xml', 'utf8');
                    data = data.replace('##PAC_URL##', `http://${host}/proxy.pac`);
                    res.writeHead(200, { 'Content-Type': 'application/mobileconfig', 'Content-Length': data.length });
                    res.end(data, 'utf8');
                }
                else if (_.startsWith(context.clientToProxyRequest.url, '/cert')) {
                    // get cert
                    logger.info('Get certificate');
                    let path = this.proxy.sslCaDir + '/certs/ca.pem';
                    let data = yield fs.readFile(path);
                    res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Length': data.length });
                    res.end(data, 'binary');
                }
                else {
                    logger.info('Incorrect request');
                    res.end('what?', 'utf8');
                }
            }
            else if (endpoint) {
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
                context.onRequestEnd((ctx, callback) => __awaiter(this, void 0, void 0, function* () {
                    let buffer = Buffer.concat(requestChunks);
                    let url = ctx.clientToProxyRequest.url;
                    try {
                        if (endpoint === 'api') {
                            ({ buffer, request } = yield this.handleApiRequest(requestId, ctx, buffer, url));
                        }
                        else if (!this.config.proxy.onlyApi) {
                            yield this.simpleDumpRequest(endpoint, ctx, buffer, url);
                        }
                    }
                    catch (e) {
                        logger.error(e);
                    }
                    ctx.proxyToServerRequest.write(buffer);
                    callback();
                }));
                context.onResponseData((ctx, chunk, callback) => {
                    responseChunks.push(chunk);
                    return callback();
                });
                context.onResponseEnd((ctx, callback) => __awaiter(this, void 0, void 0, function* () {
                    let buffer = Buffer.concat(responseChunks);
                    try {
                        if (endpoint === 'api') {
                            buffer = yield this.handleApiResponse(requestId, ctx, buffer, request);
                        }
                        else if (!this.config.proxy.onlyApi) {
                            yield this.simpleDumpResponse(endpoint, ctx, buffer);
                        }
                    }
                    catch (e) {
                        logger.error(e);
                    }
                    ctx.proxyToClientResponse.write(buffer);
                    callback(false);
                }));
                callback();
            }
            else {
                logger.debug('unhandled: %s%s', host, context.clientToProxyRequest.url);
                callback();
            }
        });
    }
    simpleDumpRequest(name, ctx, buffer, url) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('Dumping request to %s %s', name, url);
            let id = +moment();
            let data = {
                when: id,
                url: url,
                headers: ctx.clientToProxyRequest.headers,
            };
            yield fs.writeFile(`${this.config.datadir}/dump.${id}.${name}.req.info`, JSON.stringify(data, null, 4), 'utf8');
            yield fs.writeFile(`${this.config.datadir}/dump.${id}.${name}.req.content`, buffer);
        });
    }
    simpleDumpResponse(name, ctx, buffer) {
        return __awaiter(this, void 0, void 0, function* () {
            let id = +moment();
            let data = {
                when: id,
                headers: ctx.serverToProxyResponse.headers,
            };
            yield fs.writeFile(`${this.config.datadir}/dump.${id}.${name}.res.info`, JSON.stringify(data, null, 4), 'utf8');
            yield fs.writeFile(`${this.config.datadir}/dump.${id}.${name}.res.content`, buffer.toString('utf8'), 'utf8');
        });
    }
    handleApiRequest(id, ctx, buffer, url) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.info('Pogo request: %s', url);
            let data = {
                id: id,
                when: +moment(),
                endpoint: url,
                headers: ctx.proxyToServerRequest._headers,
                data: buffer.toString('base64'),
            };
            yield fs.writeFile(`${this.config.datadir}/${id}.req.bin`, JSON.stringify(data, null, 4), 'utf8');
            let decoded = null;
            if (this.config.proxy.plugins.length > 0) {
                try {
                    let plugins = this.config.proxy.plugins;
                    decoded = this.decoder.decodeRequestBuffer(buffer);
                    let modified = false;
                    yield Bluebird.each(plugins, (plugin) => __awaiter(this, void 0, void 0, function* () {
                        try {
                            if (_.hasIn(plugin, 'handleRequest')) {
                                modified = yield plugin.handleRequest(ctx, decoded);
                            }
                        }
                        catch (e) {
                            logger.error('Error passing request through %s', plugin.name, e);
                        }
                    }));
                    if (modified) {
                        // request has been modified, reencode it (not implemented yet)
                        // buffer = this.decoder.encodeRequestToBuffer(decoded);
                    }
                }
                catch (e) {
                    // logger.error('Error during plugins execution', e);
                }
            }
            return {
                buffer: buffer,
                request: decoded,
            };
        });
    }
    handleApiResponse(id, ctx, buffer, request) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.config.proxy.plugins.length > 0 && ctx.clientToProxyRequest !== '/plfe/version') {
                try {
                    let plugins = this.config.proxy.plugins;
                    let response = this.decoder.decodeResponseBuffer(request, buffer);
                    let modified = false;
                    yield Bluebird.each(plugins, (plugin) => __awaiter(this, void 0, void 0, function* () {
                        try {
                            if (_.hasIn(plugin, 'handleResponse')) {
                                modified = (yield plugin.handleResponse(ctx, response, request)) || modified;
                            }
                        }
                        catch (e) {
                            logger.error('Error passing response through %s', plugin.name, e);
                        }
                    }));
                    if (modified) {
                        // response has been modified, reencode it (not for now)
                        buffer = this.decoder.encodeResponseToBuffer(response);
                    }
                }
                catch (e) {
                    // logger.error('Error during plugins execution', e);
                }
            }
            let data = {
                when: +moment(),
                data: buffer.toString('base64'),
            };
            yield fs.writeFile(`${this.config.datadir}/${id}.res.bin`, JSON.stringify(data, null, 4), 'utf8');
            return buffer;
        });
    }
    onError(ctx, err) {
        logger.error('Proxy error: ', err);
    }
}
exports.default = MitmProxy;
//# sourceMappingURL=proxy.js.map