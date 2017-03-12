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
const fs = require("fs-promise");
const _ = require("lodash");
const moment = require("moment");
const passport = require("passport");
const Bluebird = require("bluebird");
const decoder_js_1 = require("./decoder.js");
const utils_js_1 = require("./utils.js");
const libcsv_1 = require("./../export/libcsv");
class WebUI {
    constructor(config) {
        this.config = config;
        this.decoder = new decoder_js_1.default(config);
        this.utils = new utils_js_1.default(config);
    }
    launch() {
        let config = this.config.ui;
        if (config.active) {
            let app = this.app = express();
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
        let config = this.config.ui;
        let GitHubStrategy = require('passport-github2').Strategy;
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
        let cookieSession = require('cookie-session');
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
            if (!req.isAuthenticated() && !_.startsWith(req.path, '/auth') && !_.startsWith(req.path, '/public')) {
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
                let folders = yield this.utils.getSessionFolders();
                let data = yield Bluebird.map(folders, (folder) => __awaiter(this, void 0, void 0, function* () {
                    let info = {
                        id: folder,
                        title: moment(folder, 'YYYYMMDD.HHmmss').format('DD MMM YY - HH:mm:ss'),
                    };
                    if (fs.existsSync(`data/${folder}/.info`)) {
                        let content = yield fs.readFile(`data/${folder}/.info`, 'utf8');
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
                let result = {
                    title: '',
                    steps: [],
                    files: [],
                };
                if (fs.existsSync(`data/${req.params.session}/.info`)) {
                    let info = yield fs.readFile(`data/${req.params.session}/.info`, 'utf8');
                    result.title = info;
                }
                if (fs.existsSync(`data/${req.params.session}/.preload`)) {
                    let preload = yield fs.readFile(`data/${req.params.session}/.preload`, 'utf8');
                    result.steps = JSON.parse(preload);
                }
                let files = yield fs.readdir(`data/${req.params.session}`);
                files = _.filter(files, d => _.endsWith(d, '.req.bin'));
                let force = !this.config.protos.cachejson;
                result.files = yield Bluebird.map(files, (file) => __awaiter(this, void 0, void 0, function* () {
                    let content = yield fs.readFile(`data/${req.params.session}/${file}`, 'utf8');
                    let request = JSON.parse(content);
                    request.title = '';
                    try {
                        let decoded = yield this.decoder.decodeRequest(req.params.session, _.trimEnd(file, '.req.bin'), force);
                        if (decoded && decoded.decoded) {
                            let main = _.first(decoded.decoded.requests);
                            if (main) {
                                request.title = main.request_name;
                            }
                            request.title += ` (${decoded.decoded.requests.length})`;
                        }
                    }
                    catch (e) { }
                    delete request.data;
                    request.id = _.trimEnd(file, '.req.bin');
                    return request;
                }));
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
                let force = !this.config.protos.cachejson;
                let data = yield this.decoder.decodeRequest(req.params.session, req.params.request, force);
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
                let force = !this.config.protos.cachejson;
                let data = yield this.decoder.decodeResponse(req.params.session, req.params.request, force);
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
                let stats = yield fs.stat('data/requests.signatures.csv');
                let mtime = moment(stats.mtime);
                if (mtime.add(15, 'm').isAfter(moment())) {
                    return res.sendFile('requests.signatures.csv', { root: 'data' });
                }
                else {
                    throw new Error('File too old.');
                }
            }
            catch (e) {
                logger.info('Export signatures to CSV.');
                let csv = new libcsv_1.default(this.config);
                let file = yield csv.exportRequestsSignature('requests.signatures.csv');
                res.sendFile(file, { root: 'data' });
            }
        });
    }
}
exports.default = WebUI;
//# sourceMappingURL=webui.js.map