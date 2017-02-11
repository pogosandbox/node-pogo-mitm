import * as express from 'express';
import * as logger from 'winston';
import * as path from 'path';
import * as fs from 'fs-promise';
import * as _ from 'lodash';
import * as moment from 'moment';
import * as passport from 'passport';
import * as Bluebird from 'bluebird';

import Decoder from './decoder.js';
import Utils from './utils.js';

import Csv from './../export/libcsv';

export default class WebUI {
    config: any;
    decoder: Decoder;
    utils: Utils;
    app: any;

    constructor(config) {
        this.config = config;
        this.decoder = new Decoder(config);
        this.utils = new Utils(config);
    }

    launch() {
        let config = this.config.ui;
        if (config.active) {
            let app = this.app = express();
            app.set('etag', false);

            if (config.auth.active) this.activateAuth();

            app.use('/api*', function(req, res, next) {
                res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
                res.header('Expires', '-1');
                res.header('Pragma', 'no-cache');
                next();
            });

            app.get('/api/config', <express.RequestHandler>_.bind(this.getConfig, this));
            app.get('/api/sessions', <express.RequestHandler>_.bind(this.getSessions, this));
            app.get('/api/session/:session', <express.RequestHandler>_.bind(this.getRequests, this));
            app.get('/api/request/:session/:request', <express.RequestHandler>_.bind(this.decodeRequest, this));
            app.get('/api/response/:session/:request', <express.RequestHandler>_.bind(this.decodeResponse, this));
            app.get('/api/export/csv', <express.RequestHandler>_.bind(this.exportCsv, this));

            this.app.get('/logout', function(req, res) {
                                    req.logout();
                                    res.redirect('/');
                                });

            app.use(express.static('webui'));

            app.listen(config.port, () => {
                logger.info('UI started, port %s.', config.port);
            });
        } else {
            logger.info('UI deactivated.');
        }
    }

    activateAuth(): void {
        logger.info('Activate GitHub authentication.');
        let config = this.config.ui;
        let GitHubStrategy = require('passport-github2').Strategy;
        passport.use(new GitHubStrategy(
            {
                clientID: config.auth.githubClientId,
                clientSecret: config.auth.githubClientSecret,
                callbackURL: config.auth.callbackUrl,
            },
            function(accessToken, refreshToken, profile, done) {
                if (_.find(config.auth.users, u => u === profile.username)) {
                    logger.debug('User %s logged in.', profile.username);
                    return done(null, profile);
                } else {
                    return done('unauthorize', null);
                }
            }
        ));

        passport.serializeUser(function(user, done) {
            done(null, JSON.stringify(user));
        });

        passport.deserializeUser(function(user, done) {
            if (typeof user === 'string') {
                done(null, JSON.parse(user));
            } else {
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

        this.app.get('/auth/github',
                    passport.authenticate('github', {scope: ['user:email']}),
                    function(req, res) {});

        this.app.get('/auth/github/callback',
                    passport.authenticate('github', {failureRedirect: '/auth/github'}),
                    function(req, res) {
                        res.redirect('/');
                    });

        this.app.get('/logout', function(req, res) {
                                req.logout();
                                res.redirect('/');
                            });

        this.app.use(function(req, res, next) {
            if (!req.isAuthenticated() && !_.startsWith(req.path, '/auth') && !_.startsWith(req.path, '/public')) {
                res.redirect('/auth/github');
            } else {
                next();
            }
        });
    }

    async getConfig(req: express.Request, res: express.Response, next: Function): Promise<express.Response> {
        return res.json({});
    }

    async getSessions(req: express.Request, res: express.Response, next: Function): Promise<express.Response> {
        logger.info('Getting sessions.');
        try {
            let folders = await this.utils.getSessionFolders();
            let data = await Bluebird.map(folders, async folder => {
                let info = {
                    id: folder,
                    title: moment(folder, 'YYYYMMDD.HHmmss').format('DD MMM YY - HH:mm:ss'),
                };
                if (fs.existsSync(`data/${folder}/.info`)) {
                    let content = await fs.readFile(`data/${folder}/.info`, 'utf8');
                    info.title += ' ' + content;
                }
                return info;
            });
            return res.json(data);
        } catch (e) {
            logger.error(e);
            res.status(500).send(e);
        }
    }

    async getRequests(req: express.Request, res: express.Response, next: Function): Promise<express.Response> {
        logger.info('Getting requests for session %s', req.params.session);
        try {
            let result =  {
                title: '',
                steps: [],
                files: [],
            };

            if (fs.existsSync(`data/${req.params.session}/.info`)) {
                let info = await fs.readFile(`data/${req.params.session}/.info`, 'utf8');
                result.title = info;
            }

            if (fs.existsSync(`data/${req.params.session}/.preload`)) {
                let preload = await fs.readFile(`data/${req.params.session}/.preload`, 'utf8');
                result.steps = JSON.parse(preload);
            }

            let files = await fs.readdir(`data/${req.params.session}`);
            files = _.filter(files, d => _.endsWith(d, '.req.bin'));

            result.files = await Bluebird.map(files, async file => {
                let content = await fs.readFile(`data/${req.params.session}/${file}`, 'utf8');
                let request = JSON.parse(content);
                delete request.data;
                request.id = _.trimEnd(file, '.req.bin');
                return request;
            });

            return res.json(result);
        } catch (e) {
            logger.error(e);
            res.status(500).send(e);
        }
    }

    async decodeRequest(req: express.Request, res: express.Response, next: Function): Promise<express.Response> {
        logger.info('Decrypting session %d, request %s', req.params.session, req.params.request);
        try {
            let force = !this.config.protos.cachejson;
            let data = await this.decoder.decodeRequest(req.params.session, req.params.request, force);
            return res.json(data);
        } catch (e) {
            logger.error(e);
            return res.status(500).send(e);
        }
    }

    async decodeResponse(req: express.Request, res: express.Response, next: Function): Promise<express.Response> {
        logger.info('Decrypting session %d, response %s', req.params.session, req.params.request);
        try {
            let force = !this.config.protos.cachejson;
            let data = await this.decoder.decodeResponse(req.params.session, req.params.request, force);
            return res.json(data);
        } catch (e) {
            logger.error(e);
            return res.status(500).send(e);
        }
    }

    async exportCsv(req: express.Request, res: express.Response, next: Function): Promise<void> {
        try {
            let stats = await fs.stat('data/requests.signatures.csv');
            let mtime = moment(stats.mtime);
            if (mtime.add(15, 'm').isAfter(moment())) {
                return res.sendFile('requests.signatures.csv', {root: 'data'});
            } else {
                throw new Error('File too old.');
            }
        } catch (e) {
            logger.info('Export signatures to CSV.');
            let csv = new Csv(this.config);
            let file = await csv.exportRequestsSignature('requests.signatures.csv');
            res.sendFile(file, {root: 'data'});
        }
    }
}
