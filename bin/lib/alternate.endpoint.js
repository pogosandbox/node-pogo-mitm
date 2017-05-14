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
const http = require("http");
const https = require("https");
const request = require("request-promise");
const getRawBody = require("raw-body");
const utils_1 = require("./utils");
class AlternateEndpoint {
    constructor(config) {
        this.config = config;
        this.utils = new utils_1.default(config);
    }
    launch() {
        return __awaiter(this, void 0, void 0, function* () {
            let config = this.config.alternateEndpoint;
            if (config.active) {
                let server = null;
                if (config.https) {
                    const options = {
                        key: yield fs.readFile('.http-mitm-proxy/keys/sso.pokemon.com.key'),
                        cert: yield fs.readFile('.http-mitm-proxy/certs/sso.pokemon.com.pem')
                    };
                    server = https.createServer(options, _.bind(this.onRequest, this));
                }
                else {
                    server = http.createServer(_.bind(this.onRequest, this));
                }
                server.listen(config.port, () => {
                    let ip = this.utils.getIp();
                    logger.info('Alternate endpoint listening at %s:%s', ip, config.https ? 443 : 80);
                });
            }
        });
    }
    onRequest(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('Fake login request to %s%s', req.headers.host, req.url);
            try {
                let buffer = yield getRawBody(req);
                if (buffer.length === 0)
                    buffer = null;
                let host = req.headers.host;
                delete req.headers.host;
                delete req.headers['content-length'];
                logger.debug(`Making request to https://${host}${req.url}`);
                let options = {
                    uri: `https://${host}${req.url}`,
                    method: req.method,
                    body: buffer,
                    encoding: null,
                    headers: req.headers,
                    resolveWithFullResponse: true,
                    strictSSL: false,
                    simple: false,
                };
                let response = yield request(options);
                response.headers['content-length'] = response.body ? response.body.length : 0;
                yield this.saveToFile(req.url, req.headers, response);
                res.writeHead(response.statusCode, response.headers);
                res.end(response.body, 'binary');
            }
            catch (e) {
                logger.error('Error', e);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(e.toString());
            }
        });
    }
    saveToFile(url, headers, response) {
        return __awaiter(this, void 0, void 0, function* () {
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
            yield fs.writeFile(`${this.config.datadir}/${when}.login.bin`, JSON.stringify(data, null, 4), 'utf8');
        });
    }
}
exports.default = AlternateEndpoint;
//# sourceMappingURL=alternate.endpoint.js.map