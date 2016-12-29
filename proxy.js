let logger = require('winston');
let Proxy = require('http-mitm-proxy');
let _ = require('lodash');
let fs = require('fs');
let moment = require('moment');
let Promise = require('bluebird');

let endpoints = {
    api: 'pgorelease.nianticlabs.com',
    oauth: 'android.clients.google.com',
    ptc: 'sso.pokemon.com',
    storage: 'storage.googleapis.com',
};

class MitmProxy {
    constructor(config) {
        this.config = config;
    }

    launch() {
        this.proxy = Proxy()
            .use(Proxy.gunzip)
            .onError(_.bind(this.onError, this))
            .onRequest(_.bind(this.onRequest, this))
            .listen({port: this.config.proxyPort});
    }

    onRequest(context, callback) {
        let config = this.config;
        if (context.clientToProxyRequest.headers.host == `${config.ip}:${config.proxyPort}`) {
            let res = context.proxyToClientResponse;
            if (context.clientToProxyRequest.url == '/proxy.pac') {
                // get proxy.pac
                fs.readFileAsync('proxy.pac', 'utf8').then(data => {
                    data = data.replace('##PROXY##', config.ip);
                    data = data.replace('##PORT##', config.proxyPort);
                    res.writeHead(200, {"Content-Type": "application/x-ns-proxy-autoconfig", "Content-Length": data.length});
                    res.end(data, 'utf8');
                });
            } else if (context.clientToProxyRequest.url == '/cert.crt') {
                // get cert
                let path = proxy.sslCaDir + '/certs/ca.pem';
                fs.readFileAsync(path).then(data => {
                    res.writeHead(200, {"Content-Type": "application/x-x509-ca-cert", "Content-Length": data.length});
                    res.end(data, 'binary');
                });
            } else {
                res.end("what?", 'utf8');
            }
            
        } else if (context.clientToProxyRequest.headers.host == endpoints.api) {
            let requestChunks = [];
            let responseChunks = [];

            context.onRequestData((ctx, chunk, callback) => {
                requestChunks.push(chunk);
                return callback(null, null);
            });

            context.onRequestEnd((ctx, callback) => {
                let buffer = Buffer.concat(requestChunks);
                let url = ctx.clientToProxyRequest.url;

                this.handleApiRequest(ctx, buffer, url)
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

                this.handleApiResponse(ctx, buffer)
                .finally(() => {
                    ctx.proxyToClientResponse.write(buffer);
                    callback(false);
                });
            });

            callback();

        } else {
            callback();

        }
    }

    handleApiRequest(ctx, buffer, url) {
        logger.info('Pogo request: %s', url);
        let id = _.padStart(++this.config.reqId, 4, 0);
        let data = {
            id: id,
            when: +moment(),
            endpoint: url,
            headers: ctx.proxyToServerRequest._headers,
            data: buffer.toString('base64'),
        }
        return fs.writeFileAsync(`${this.config.datadir}/${id}.req.bin`, JSON.stringify(data, null, 4), 'utf8');
    }

    handleApiResponse(ctx, buffer) {
        return Promise.resolve();
    }

    onError(ctx, err) {
        logger.error('Proxy error:', err);
    }
}

module.exports = MitmProxy;