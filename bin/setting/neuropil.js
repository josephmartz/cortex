'use strict';

var neuropil    = require('neuropil');
var profile     = require('./profile');
var node_url    = require('url');
var logger      = require('./logger');

var node_url    = require('url');
var node_path   = require('path');

module.exports = neuropil({
    logger: require('./logger'),

    username: profile.get('username'),
    password: profile.get('password'),
    email: 'i@kael.me',

    port: profile.get('registry_port'),
    host: profile.get('registry'),

    cacheMapper: function (options, callback) { 
        var pathname = node_url.parse(options.url).pathname;

        // only cache document json for database 'registry'
        // 'http://xxxxxx.com/align' -> cache
        // 'http://xxxx.com/-/user/xxxx' -> not to cache
        if ( /^\/[^\/]/.test(pathname) ) {
            var name = pathname.replace(/^\//, '');
            var cache = node_path.join( profile.get('cache_root'), name, 'document.cache' );

            callback(null, cache);

        } else {
            callback(null);
        }
    }

}).on('request', function(e) {
    e.json && logger.debug('json', e.json);

}).on('response', function(e){
    var res = e.res;
    var code;

    if ( res ) {
        code = res.statusCode;

        logger.info(
            '  ',
            logger.template('{{magenta method}} {{url}}', {
                url     : e.req.safe_url,
                method  : e.req.method
            }),
            e.err ? 
                '{{red ' + (code || 'ERR') + '}}' : 
                '{{' + ( is_code_success(code) ? 'green' : 'yellow' ) + ' ' + (code || 'OK!') + '}}'
        );
         
    // There must be an server error
    } else {
        logger.error(e.err);
    }

}).on('warn', function (msg) {
    if ( msg ) {
        logger.info('');
        logger.warn(msg.message || msg);
    }
    
}).on('verbose', function (msg) {
    if ( msg ) {
        logger.info('');
        logger.verbose(msg.message || msg);
    }
    
}).on('info', function (msg) {
    if ( msg ) {
        var data = msg.data;
        var log = '\n';

        if ( data && data.label ) {
            log += '{{cyan ' + data.label + '}} '
        }

        log += msg.message || msg;

        logger.info(log);
    }
});


function is_code_success(code){
    return !!code && code >= 200 && code < 300;
}

