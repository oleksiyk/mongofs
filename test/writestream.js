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
    })

    describe.only('import file from filesystem', function() {
        var testfile = {
            path: path.dirname(__filename) + '/test-data/image.jpg',
            length: 130566,
            md5: '0b864c06dc35f4fe73afcede3310d8bd',
            contentType: 'image/jpeg'
        }

        it('should write file', function() {
            var deferred = Promise.defer();
            var readStream = fs.createReadStream(testfile.path)
            var writeStream = mongofs.createWriteStream('/testimage')

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
                return mongofs.stat('/testimage').then(function(file) {
                    file.size.should.be.eql(testfile.length)
                    file.md5.should.be.eql(testfile.md5)
                    file.contentType.should.be.eql(testfile.contentType)
                })
            })
        })
    })
})
