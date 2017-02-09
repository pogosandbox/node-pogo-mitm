"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const logger = require("winston");
const fs = require("fs-promise");
const _ = require("lodash");
const moment = require("moment");
let mitmproxy = require('http-mitm-proxy');
const utils_1 = require("./utils");
let endpoints = {
    api: 'pgorelease.nianticlabs.com',
    oauth: 'accounts.google.com',
    ptc: 'sso.pokemon.com',
    storage: 'storage.googleapis.com',
};
class MitmProxy {
    constructor(config) {
        this.config = config;
        this.utils = new utils_1.default(config);
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
                .listen({ port: config.proxy.port, silent: true });
        }
        else {
            logger.info('Proxy deactivated.');
        }
    }
    onRequest(context, callback) {
        return __awaiter(this, void 0, void 0, function* () {
            let config = this.config;
            let host = context.clientToProxyRequest.headers.host;
            if (host == `${config.ip}:${config.proxy.port}` || (config.proxy.hostname && _.startsWith(host, config.proxy.hostname))) {
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
            else if (host == endpoints.api) {
                let requestChunks = [];
                let responseChunks = [];
                let id = ++this.config.reqId;
                let requestId = _.padStart(id.toString(), 5, '0');
                context.onRequestData((ctx, chunk, callback) => {
                    requestChunks.push(chunk);
                    return callback(null, null);
                });
                context.onRequestEnd((ctx, callback) => __awaiter(this, void 0, void 0, function* () {
                    let buffer = Buffer.concat(requestChunks);
                    let url = ctx.clientToProxyRequest.url;
                    try {
                        yield this.handleApiRequest(requestId, ctx, buffer, url);
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
                        yield this.handleApiResponse(requestId, ctx, buffer);
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
                logger.debug('unhandled: %s', host);
                callback();
            }
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
        });
    }
    handleApiResponse(id, ctx, buffer) {
        return __awaiter(this, void 0, void 0, function* () {
            let data = {
                when: +moment(),
                data: buffer.toString('base64'),
            };
            yield fs.writeFile(`${this.config.datadir}/${id}.res.bin`, JSON.stringify(data, null, 4), 'utf8');
        });
    }
    onError(ctx, err) {
        logger.error('Proxy error:', err);
    }
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = MitmProxy;
//# sourceMappingURL=proxy.js.map