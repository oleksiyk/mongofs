"use strict";

/* global before, describe, it, connect */

var Promise = require('bluebird');
var path    = require('path')
var fs      = require('fs')

describe('WriteStream', function() {

    var mongofs;

    before(function() {
        return connect().then(function(_fs) {
            mongofs = _fs
        })
    });

    [
        {
            path: path.dirname(__filename) + '/test-data/image.jpg',
            size: 130566,
            md5: '0b864c06dc35f4fe73afcede3310d8bd',
            contentType: 'image/jpeg'
        },
        {
            path: path.dirname(__filename) + '/test-data/image.png',
            size: 1788844,
            md5: '0527806e48c5f6ca0131e36f8ad27c7e',
            contentType: 'image/png'
        }

    ].forEach(function(f) {
        it('should correctly pipe from fs.ReadStream', function() {
            var deferred = Promise.defer();
            var readStream = fs.createReadStream(f.path)
            var writeStream = mongofs.createWriteStream('/' + path.basename(f.path))

            readStream.on('error', function(err) {
                deferred.reject(err)
            })

            writeStream.on('error', function(err) {
                deferred.reject(err)
            })

            writeStream.on('close', function() {
                deferred.resolve()
            })

            readStream.pipe(writeStream);

            return deferred.promise.then(function() {
                return mongofs.stat('/' + path.basename(f.path)).then(function(file) {
                    file.size.should.be.eql(f.size)
                    file.md5.should.be.eql(f.md5)
                    file.contentType.should.be.eql(f.contentType)
                })
            })
        })
    })

})
