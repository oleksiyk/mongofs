"use strict";

/* global before, describe, it, connect, testfiles */

var Promise = require('bluebird');
var path    = require('path')
var fs      = require('fs')

describe('WriteStream', function() {

    var mongofs;

    function copyFileFromFilesystem(from, to){
        var deferred = Promise.defer();
        var readStream = fs.createReadStream(from)
        var writeStream = mongofs.createWriteStream(to)

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

        return deferred.promise
    }

    before(function() {
        return connect().then(function(_fs) {
            mongofs = _fs
        })
    });

    testfiles.forEach(function(f) {
        it('should correctly pipe from fs.ReadStream', function() {
            return copyFileFromFilesystem(f.path, '/' + path.basename(f.path)).then(function() {
                return mongofs.stat('/' + path.basename(f.path)).then(function(file) {
                    file.size.should.be.eql(f.size)
                    file.md5.should.be.eql(f.md5)
                    file.contentType.should.be.eql(f.contentType)
                })
            })
        })
    })

    it('should correctly truncate files', function() {
        return copyFileFromFilesystem(testfiles[1].path, '/someimage').then(function() {
            return copyFileFromFilesystem(testfiles[0].path, '/someimage')
        }).then(function() {
            return mongofs.db.collection('fs.files').then(function(collection) {
                return collection.findOne({
                    filename: '/someimage'
                })
            })
        }).then(function(file) {
            file.length.should.be.eql(testfiles[0].size)
            file.md5.should.be.eql(testfiles[0].md5)
            file.contentType.should.be.eql(testfiles[0].contentType)
            return mongofs.db.collection('fs.chunks').then(function(collection) {
                return collection.count({
                    'files_id': file._id
                }).then(function(count) {
                    count.should.be.eql(1)
                })
            })
        })
    })

})
