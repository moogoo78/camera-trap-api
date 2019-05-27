const os = require('os');
const util = require('util');
const config = require('config');
const leftPad = require('left-pad');
const cors = require('cors');
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const session = require('express-session');
const MongoStore = require('connect-mongo')(session);
const kue = require('kue');
const nocache = require('nocache');
const utils = require('./common/utils');
const errors = require('./models/errors');
const authentication = require('./auth/authentication');
const authorization = require('./auth/authorization');
const UserPermission = require('./models/const/user-permission');
const webRouter = require('./routers/web-router');
const LogModel = require('./models/data/log-model');

const app = express();

// hide x-powered-by
app.locals.settings['x-powered-by'] = false;
// disable ETag at headers
app.disable('etag');
if (!config.isDebug) {
  app.enable('trust proxy');
}

app.use((req, res, next) => {
  // add req.startTime
  req.startTime = new Date();
  if (config.isDebug) {
    // append end hook
    const originEndFunc = res.end;
    res.end = function() {
      // eslint-disable-next-line prefer-rest-params
      const result = originEndFunc.apply(this, arguments);
      const now = new Date();
      const processTime = `${now - req.startTime}`.replace(
        /\B(?=(\d{3})+(?!\d))/g,
        ',',
      );
      console.log(
        `[${res.statusCode}] ${leftPad(processTime, 7)}ms ${`${
          req.method
        }      `.substr(0, 6)} ${req.originalUrl}`,
      );
      if (res.error) {
        console.error(res.error.stack);
      }
      return result;
    };
  }
  next();
});

app.use(cookieParser()); // setup req.cookies
app.use(bodyParser.json()); // setup req.body
app.use(
  session(
    util._extend(
      {
        store: new MongoStore(config.sessionStoreOptions),
      },
      config.sessionOptions,
    ),
  ),
);

app.use(authentication.session);

// write log
if (config.enableLog) {
  app.use((req, res, next) => {
    const originEndFunc = res.end;
    const log = new LogModel({
      hostname: os.hostname(),
      user: req.user.isLogin() ? req.user : undefined,
      ip: req.ip,
      method: req.method,
      path: req.originalUrl,
      headers: (() => {
        if (req.headers && typeof req.body === 'object') {
          const headers = util._extend({}, req.headers);
          delete headers.cookie; // Don't log user's cookie.
          return JSON.stringify(headers);
        }
      })(),
      requestBody: (() => {
        if (req.body && typeof req.body === 'object') {
          return JSON.stringify(req.body);
        }
      })(),
      createTime: req.startTime,
    });
    const logPromise = log.save();
    res.end = function() {
      // eslint-disable-next-line prefer-rest-params
      const result = originEndFunc.apply(this, arguments);
      const now = new Date();
      logPromise.then(() => {
        log.processTime = now - req.startTime;
        log.responseStatus = res.statusCode;
        log.errorStack = res.error ? res.error.stack : undefined;
        return log.save();
      });
      return result;
    };
    next();
  });
}

// Do compression exclusion export .csv.
// To export .csv is a stream response. If we do compression, the user will wait the web fetches all data.
app.use(/(?<!\.csv)$/, compression());

utils.getTaskQueue();
app.use('/admin/kue', authorization([UserPermission.administrator], kue.app));

app.get('/robots.txt', (req, res) => {
  res.send('User-agent: *\nDisallow: /');
});

app.use(nocache());
app.use('/api/v1', cors(config.corsOptions), webRouter.api);
app.use('/callback', webRouter.callback);

// error handler
app.use((req, res, next) => {
  // Didn't match any routers.
  next(new errors.Http404());
});
app.use((error, req, res, next) => {
  error.status = error.status || 500;
  res.status(error.status);
  res.error = error;
  res.json({
    message: error.message,
  });
});

module.exports = app;
