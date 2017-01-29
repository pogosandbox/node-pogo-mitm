let logger = require('winston');
let mitmproxy = require('http-mitm-proxy');
let _ = require('lodash');
let fs = require('fs');
let moment = require('moment');
// let ngrok = require('ngrok');
// let Promise = require('bluebird');

let Utils = require('./utils');
let utils = new Utils();

let endpoints = {
    api: 'pgorelease.nianticlabs.com',
    oauth: 'accounts.google.com',
    ptc: 'sso.pokemon.com',
    storage: 'storage.googleapis.com',
};

class MitmProxy {
    constructor(config) {
        this.config = config;
    }

    launch() {
        let config = this.config;
        if (config.proxy.active) {
            let ip = config.ip = utils.getIp();
            logger.info('Proxy listening at %s:%s', ip, config.proxy.port);

            this.proxy = mitmproxy()
                .use(mitmproxy.gunzip)
                .onError(_.bind(this.onError, this))
                .onRequest(_.bind(this.onRequest, this))
                .listen({port: config.proxy.port, silent: true});

            // if (config.ngrok.active) {
            //     ngrok.connect({
            //         proto: 'tcp',
            //         addr: config.proxy.port,
            //         region: config.ngrok.region,
            //         authtoken: config.ngrok.token,
            //     }, (err, url) => {
            //         logger.info('ngrok listening at %s', url);
            //     });
            // }
        } else {
            logger.info('Proxy deactivated.');
        }
    }

    onRequest(context, callback) {
        let config = this.config;
        let host = context.clientToProxyRequest.headers.host;
        if (host == `${config.ip}:${config.proxy.port}` || (config.proxy.hostname && _.startsWith(host, config.proxy.hostname))) {
            let res = context.proxyToClientResponse;
            if (_.startsWith(context.clientToProxyRequest.url, '/proxy.pac')) {
                // get proxy.pac
                logger.info('Get proxy.pac');
                fs.readFileAsync('templates/proxy.pac', 'utf8').then(data => {
                    if (_.endsWith(host, '.ngrok.io')) {
                        data = data.replace(/##PROXY##/g, host + ':80');
                    } else {
                        data = data.replace(/##PROXY##/g, host);
                    }
                    res.writeHead(200, {'Content-Type': 'application/x-ns-proxy-autoconfig', 'Content-Length': data.length});
                    res.end(data, 'utf8');
                });
            } else if (_.endsWith(context.clientToProxyRequest.url, '.mobileconfig')) {
                logger.info('Get mobileconfig');
                fs.readFileAsync('templates/mobileconfig.xml', 'utf8').then(data => {
                    data = data.replace('##PAC_URL##', `http://${host}/proxy.pac`);
                    res.writeHead(200, {'Content-Type': 'application/mobileconfig', 'Content-Length': data.length});
                    res.end(data, 'utf8');
                });
            } else if (_.startsWith(context.clientToProxyRequest.url, '/cert')) {
                // get cert
                logger.info('Get certificate');
                let path = this.proxy.sslCaDir + '/certs/ca.pem';
                fs.readFileAsync(path).then(data => {
                    res.writeHead(200, {'Content-Type': 'application/x-x509-ca-cert', 'Content-Length': data.length});
                    res.end(data, 'binary');
                });
            } else {
                logger.info('Incorrect request');
                res.end('what?', 'utf8');
            }

        // } else if (host == endpoints.ptc) {
        //     logger.debug('Dump sso headers');
        //     logger.debug(ctx.proxyToServerRequest._headers);
        //     callback();

        } else if (host == endpoints.api) {
            let requestChunks = [];
            let responseChunks = [];

            let requestId = _.padStart(++this.config.reqId, 5, 0);

            context.onRequestData((ctx, chunk, callback) => {
                requestChunks.push(chunk);
                return callback(null, null);
            });

            context.onRequestEnd((ctx, callback) => {
                let buffer = Buffer.concat(requestChunks);
                let url = ctx.clientToProxyRequest.url;

                this.handleApiRequest(requestId, ctx, buffer, url)
                .finally(() => {
                    ctx.proxyToServerRequest.write(buffer);
                    callback();
                });
            });

            context.onResponseData((ctx, chunk, callback) => {
                responseChunks.push(chunk);
                return callback();
            });

            context.onResponseEnd((ctx, callback) => {
                let buffer = Buffer.concat(responseChunks);

                this.handleApiResponse(requestId, ctx, buffer)
                .finally(() => {
                    ctx.proxyToClientResponse.write(buffer);
                    callback(false);
                });
            });

            callback();

        } else {
            logger.debug('unhandled: %s', host);
            callback();

        }
    }

    handleApiRequest(id, ctx, buffer, url) {
        logger.info('Pogo request: %s', url);
        let data = {
            id: id,
            when: +moment(),
            endpoint: url,
            headers: ctx.proxyToServerRequest._headers,
            data: buffer.toString('base64'),
        };
        return fs.writeFileAsync(`${this.config.datadir}/${id}.req.bin`, JSON.stringify(data, null, 4), 'utf8');
    }

    handleApiResponse(id, ctx, buffer) {
        let data = {
            when: +moment(),
            data: buffer.toString('base64'),
        };
        return fs.writeFileAsync(`${this.config.datadir}/${id}.res.bin`, JSON.stringify(data, null, 4), 'utf8');
    }

    onError(ctx, err) {
        logger.error('Proxy error:', err);
    }
}

module.exports = MitmProxy;
