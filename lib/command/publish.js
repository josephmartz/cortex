'use strict';

var publish     = module.exports = {};

var node_path   = require('path');
var node_fs     = require('fs');
var node_url    = require('url');
var node_zlib   = require('zlib');

var async       = require('async');
var fs          = require('fs-sync');
var ignore      = require('ignore');
var fstream     = require('fstream');
var tar         = require('tar');
var semver      = require('semver');

var lang        = require('../util/lang');
var pkg_helper  = require('../util/package');

// have no fault tolerance, overload and clean your parameters ahead of time
// @param {Object} options
// - cwd: {node_path=} at least one of cwd and tar must not be undefined
// - force: {boolean=} force to publishing, default to false
// - tar: {node_path=} tar file, if not undefined, must exists
publish.run = function (options, callback) {
    var force = options.force;

    this.MESSAGE = this.context.locale.require('command-publish');

    var self = this;

    // prepare tgz file and package.json
    // @param {Object} opts
    // - pkg {Object} package json data
    // - tar {node_path} tar file
    this.prepare(options, function(err, data) {
        if(err){
            return callback(err);
        }

        // @param {Object} options
        // - tar: {string} tar file path
        // - pkg: {Object} the object of package.json
        // - force: {boolean} force publishing
        self.context.neuropil.publish({
            tar: data.tar,
            pkg: data.pkg,
            force: options.force

        }, function(err, res, json) {

            // TODO
            // standardize callback parameters
            return callback(err);
        });
    });
};


// santitize arguments
// prepare tar file and json data
publish.prepare = function(options, callback) {
    var file = options.tar;
    // file = '/Users/Kael/.npm/neuronjs/2.0.1/package.tgz';
    var temp_dir = this.context.profile.get('temp_dir');
    var temp_package = node_path.join(temp_dir, 'package');
    var cwd = options.cwd;
    var pkg;

    var self = this;

    async.series([
        function(done) {
            // if tar file specified, extract it
            if(file){
                cwd = temp_package;

                self.logger.info( self.logger.template(self.MESSAGE.ANALYSIS_TARBALL, {
                    file: file
                }) );

                fstream.Reader({
                    path: file,
                    type: 'File'
                })
                .pipe(node_zlib.Unzip())
                .pipe(tar.Extract({
                    path: temp_dir
                }))
                .on('end', function (err) {
                    // if(err){
                    //     return done( self.logger.template(self.MESSAGE.ERR_EXTRACTION, {
                    //         file: file,
                    //         error: err
                    //     }) );

                    // }

                    self.check_package_file(cwd, options, function(err, data) {
                        if(err){
                            return done(err);
                        }

                        pkg = data;
                    });
                });
            
            // else compress files into an tar file
            }else{
                self.check_package_file(cwd, options, function(err, data) {
                    if(err){
                        return done(err);
                    }

                    pkg = data;
                    var ignore_rules = lang.object_member_by_namespaces(pkg, 'cortex.ignore', []);

                    file = node_path.join(temp_dir, 'package.tgz');

                    // copy filtered files to the temp dir
                    var files = fs.expand('**', {
                        cwd: cwd,
                        dot: true

                    }).filter(
                        ignore().addIgnoreFile(
                            ignore.select([
                                '.cortexignore',
                                '.npmignore',
                                '.gitignore'
                            ])
                        ).addPattern(ignore_rules).createFilter()
                    );

                    files.forEach(function (path) {
                        var full_path = node_path.join(cwd, path);

                        if(fs.isFile(full_path)){
                            fs.copy(full_path, node_path.join(temp_package, path));
                        }
                    });

                    fs.write( node_path.join(temp_package, 'package.json'), JSON.stringify(pkg, null, 4) );

                    self.logger.info( self.logger.template(self.MESSAGE.COMPRESS_TARBALL, {
                        dir: cwd
                    }) );

                    fstream.Reader({
                        path: temp_package,
                        type: 'Directory'

                    })
                    .pipe(tar.Pack())
                    .pipe(
                        node_zlib.createGzip({
                            level: 6,
                            memLevel: 6
                        })
                    )
                    .pipe(fstream.Writer(file))
                    .on('close', function (err) {
                        // if(err){
                        //     return done( self.logger.template(self.MESSAGE.ERR_PACKAGING, {
                        //         dir: cwd,
                        //         file: file,
                        //         error: err
                        //     }) );
                        // }
                        done();
                    });
                });
            }
        }

    ], function(err) {
        if(err){
            return callback(err);
        }

        callback(null, {
            tar: file,
            pkg: pkg
        });
    });
};


publish.check_package_file = function(cwd, options, callback) {
    var package_json = node_path.join(cwd, 'package.json');
    var self = this;

    pkg_helper.enhanced_package_json(package_json, function (err, data) {
        if ( err ) {
            if ( err.code === 'EJSONPARSE' ) {
                return callback( self.MESSAGE.FAIL_PARSE_PKG );
            }else{
                return callback(err);
            }
        }

        data.styles = pkg_helper.package_styles(cwd, data);
        self.deal_prerelease_version(data, options);

        callback(null, data);
    });
};


publish.deal_prerelease_version = function (pkg, options) {
    var sv = semver.parse(pkg.version);
    var prerelease = sv.prerelease;

    if ( options.prerelease ) {
        if ( prerelease.length === 0 ) {
            prerelease.push(options.prerelease);

            pkg.version = sv.format();

        } else {
            this.logger.info( this.MESSAGE.HAS_PRERELEASE + '\n');
        }
    }
};

