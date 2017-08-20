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
const express = require("express");
const logger = require("winston");
const fs = require("mz/fs");
const _ = require("lodash");
const moment = require("moment");
const passport = require("passport");
const Bluebird = require("bluebird");
const bodyparser = require("body-parser");
const decoder_js_1 = require("./decoder.js");
const utils_js_1 = require("./utils.js");
const analysis_1 = require("../utils/analysis");
const libcsv_1 = require("./../export/libcsv");
class WebUI {
    constructor(config) {
        this.config = config;
        this.decoder = new decoder_js_1.default(config);
        this.utils = new utils_js_1.default(config);
    }
    launch() {
        const config = this.config.ui;
        if (config.active) {
            const app = this.app = express();
            app.set('etag', false);
            if (config.auth.active)
                this.activateAuth();
            app.use('/api*', function (req, res, next) {
                res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
                res.header('Expires', '-1');
                res.header('Pragma', 'no-cache');
                next();
            });
            app.get('/api/config', _.bind(this.getConfig, this));
            app.get('/api/sessions', _.bind(this.getSessions, this));
            app.get('/api/session/:session', _.bind(this.getRequests, this));
            app.get('/api/request/:session/:request', _.bind(this.decodeRequest, this));
            app.get('/api/response/:session/:request', _.bind(this.decodeResponse, this));
            app.get('/api/export/csv', _.bind(this.exportCsv, this));
            app.post('/api/analyse/:session', _.bind(this.analyse, this));
            app.get('/api/analyse/:session', _.bind(this.analyseResult, this));
            if (config.upload) {
                app.use('/upload/*', bodyparser.raw({ type: '*/*' }));
                app.post('/upload/:mode/:session/:req', _.bind(this.upload, this));
            }
            this.app.get('/logout', function (req, res) {
                req.logout();
                res.redirect('/');
            });
            app.use(express.static('webui'));
            app.listen(config.port, () => {
                logger.info('UI started, port %s.', config.port);
            });
        }
        else {
            logger.info('UI deactivated.');
        }
    }
    activateAuth() {
        logger.info('Activate GitHub authentication.');
        const config = this.config.ui;
        const GitHubStrategy = require('passport-github2').Strategy;
        passport.use(new GitHubStrategy({
            clientID: config.auth.githubClientId,
            clientSecret: config.auth.githubClientSecret,
            callbackURL: config.auth.callbackUrl,
        }, function (accessToken, refreshToken, profile, done) {
            if (_.find(config.auth.users, u => u === profile.username)) {
                logger.debug('User %s logged in.', profile.username);
                return done(null, profile);
            }
            else {
                return done('unauthorize', null);
            }
        }));
        passport.serializeUser(function (user, done) {
            done(null, JSON.stringify(user));
        });
        passport.deserializeUser(function (user, done) {
            if (typeof user === 'string') {
                done(null, JSON.parse(user));
            }
            else {
                done(null, user);
            }
        });
        const cookieSession = require('cookie-session');
        this.app.use(cookieSession({
            name: 'mitm.session',
            secret: config.auth.secret,
            maxAge: 24 * 60 * 60 * 1000,
        }));
        this.app.use(passport.initialize());
        this.app.use(passport.session());
        this.app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }), function (req, res) { });
        this.app.get('/auth/github/callback', passport.authenticate('github', { failureRedirect: '/auth/github' }), function (req, res) {
            res.redirect('/');
        });
        this.app.get('/logout', function (req, res) {
            req.logout();
            res.redirect('/');
        });
        this.app.use(function (req, res, next) {
            if (!req.isAuthenticated() && !_.startsWith(req.path, '/auth') && !_.startsWith(req.path, '/public') && !_.startsWith(req.path, '/upload')) {
                res.redirect('/auth/github');
            }
            else {
                next();
            }
        });
    }
    getConfig(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            return res.json({
                auth: this.config.ui.auth.active,
                ga: this.config.ui.ga.key,
            });
        });
    }
    getSessions(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.info('Getting sessions.');
            try {
                const folders = yield this.utils.getSessionFolders();
                const data = yield Bluebird.map(folders, (folder) => __awaiter(this, void 0, void 0, function* () {
                    const info = {
                        id: folder,
                        title: moment(folder, 'YYYYMMDD.HHmmss').format('DD MMM YY - HH:mm:ss'),
                    };
                    if (fs.existsSync(`data/${folder}/.info`)) {
                        const content = yield fs.readFile(`data/${folder}/.info`, 'utf8');
                        info.title += ' ' + content;
                    }
                    return info;
                }));
                return res.json(data);
            }
            catch (e) {
                logger.error(e);
                res.status(500).send(e);
            }
        });
    }
    getRequests(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.info('Getting requests for session %s', req.params.session);
            try {
                let files = yield fs.readdir(`data/${req.params.session}`);
                files = _.filter(files, d => _.endsWith(d, '.req.bin'));
                const force = !this.config.protos.cachejson;
                const infos = yield Bluebird.map(files, (file) => __awaiter(this, void 0, void 0, function* () {
                    const content = yield fs.readFile(`data/${req.params.session}/${file}`, 'utf8');
                    if (content.length > 0) {
                        const request = JSON.parse(content);
                        request.title = '';
                        const coords = { lat: 0, lng: 0 };
                        try {
                            const decoded = yield this.decoder.decodeRequest(req.params.session, _.trimEnd(file, '.req.bin'), force);
                            if (decoded && decoded.decoded) {
                                coords.lat = decoded.decoded.latitude;
                                coords.lng = decoded.decoded.longitude;
                                const main = _.first(decoded.decoded.requests);
                                if (main) {
                                    request.title = main.request_name;
                                }
                                request.title += ` (${decoded.decoded.requests.length})`;
                            }
                        }
                        catch (e) { }
                        delete request.data;
                        request.id = _.trimEnd(file, '.req.bin');
                        return {
                            file: request,
                            coords,
                        };
                    }
                    else {
                        // fake request when only response
                        return {
                            file: {
                                title: 'UNKNOWN',
                                decoded: {},
                                id: _.trimEnd(file, '.req.bin'),
                            },
                            coords: {
                                lat: 0, lng: 0,
                            }
                        };
                    }
                }));
                const result = {
                    title: '',
                    files: infos.map(info => info.file),
                    steps: infos.map(info => info.coords),
                };
                if (fs.existsSync(`data/${req.params.session}/.info`)) {
                    const info = yield fs.readFile(`data/${req.params.session}/.info`, 'utf8');
                    result.title = info;
                }
                return res.json(result);
            }
            catch (e) {
                logger.error(e);
                res.status(500).send(e);
            }
        });
    }
    decodeRequest(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.info('Decrypting session %d, request %s', req.params.session, req.params.request);
            try {
                const force = !this.config.protos.cachejson;
                const data = yield this.decoder.decodeRequest(req.params.session, req.params.request, force);
                return res.json(data);
            }
            catch (e) {
                logger.error(e);
                return res.status(500).send(e);
            }
        });
    }
    decodeResponse(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.info('Decrypting session %d, response %s', req.params.session, req.params.request);
            try {
                const force = !this.config.protos.cachejson;
                const data = yield this.decoder.decodeResponse(req.params.session, req.params.request, force);
                return res.json(data);
            }
            catch (e) {
                logger.error(e);
                return res.status(500).send(e);
            }
        });
    }
    exportCsv(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const stats = yield fs.stat('data/requests.signatures.csv');
                const mtime = moment(stats.mtime);
                if (mtime.add(15, 'm').isAfter(moment())) {
                    return res.sendFile('requests.signatures.csv', { root: 'data' });
                }
                else {
                    throw new Error('File too old.');
                }
            }
            catch (e) {
                logger.info('Export signatures to CSV.');
                const csv = new libcsv_1.default(this.config);
                const file = yield csv.exportRequestsSignature('requests.signatures.csv');
                res.sendFile(file, { root: 'data' });
            }
        });
    }
    analyse(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            const report = `data/${req.params.session}/analysis.html`;
            const redirect = '/api/analyse/' + req.params.session;
            if (this.config.analysis.nocache || !(yield fs.exists(report))) {
                const analyser = new analysis_1.default(this.config, this.utils);
                yield analyser.run(req.params.session);
            }
            return res.json({
                redirect
            });
        });
    }
    analyseResult(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            const report = `data/${req.params.session}/analysis.html`;
            if (req.params.session && fs.existsSync(report)) {
                res.sendFile(report, {
                    root: '.',
                });
            }
            else {
                res.status(404).send('Nope. Maybe because there is no issue found?');
            }
        });
    }
    upload(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            const session = req.params.session;
            const request = req.params.req;
            const mode = req.params.mode;
            try {
                if (mode !== 'request' && mode !== 'response') {
                    res.status(500).send('Invalid.');
                }
                else if (!session || !request || !moment(session, 'YYYYMMDD.HHmmss').isValid()) {
                    logger.error('Invalid params in upload: %s - %s', session, request);
                    res.status(500).send('Invalid.');
                }
                else {
                    if (!(yield fs.exists(`data/${session}`))) {
                        yield fs.mkdir(`data/${session}`);
                        yield fs.writeFile(`data/${session}/.info`, '(upload)', 'utf8');
                    }
                    const ext = mode === 'request' ? 'req.bin' : 'res.bin';
                    yield fs.writeFile(`data/${session}/${request}.${ext}`, req.body);
                    res.send('ok');
                }
            }
            catch (e) {
                logger.error('Error in upload', e);
                res.status(500).send('Oups.');
            }
        });
    }
}
exports.default = WebUI;
//# sourceMappingURL=webui.js.map