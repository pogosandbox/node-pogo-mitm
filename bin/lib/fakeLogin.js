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
const fs = require("fs");
const _ = require("lodash");
const https = require("https");
const request = require("request-promise");
const getRawBody = require("raw-body");
const utils_1 = require("./utils");
class FakeLogin {
    constructor(config) {
        this.config = config;
        this.utils = new utils_1.default(config);
    }
    launch() {
        let config = this.config.fakeLogin;
        if (config.active) {
            const options = {
                key: fs.readFileSync('.http-mitm-proxy/keys/ca.private.key'),
                cert: fs.readFileSync('.http-mitm-proxy/certs/ca.pem')
            };
            let server = https.createServer(options, _.bind(this.onRequest, this));
            server.listen(config.port, () => {
                let ip = this.utils.getIp();
                logger.info('Fake login listening at %s:%s', ip, config.port);
            });
        }
    }
    onRequest(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('Fake login request to %s', req.url);
            try {
                let buffer = yield getRawBody(req);
                if (buffer.length === 0)
                    buffer = null;
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
                let response = yield request(options);
                response.headers['content-length'] = response.body ? response.body.length : 0;
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
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = FakeLogin;
//# sourceMappingURL=fakeLogin.js.map