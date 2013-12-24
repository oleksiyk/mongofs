"use strict";

/* global before, describe, it, connect, testfiles */

var Promise = require('bluebird');
var path    = require('path')
var fs      = require('fs')

describe('Stream', function() {

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

    function md5FromStream(filename) {
        var deferred = Promise.defer();
        var shasum = require('crypto').createHash('md5');
        var s = mongofs.createReadStream(filename);
        s.on('data', function(d) {
            shasum.update(d);
        });
        s.on('end', function() {
            var d = shasum.digest('hex');
            deferred.resolve(d)
        });
        return deferred.promise;
    }


    before(function() {
        return connect().then(function(_fs) {
            mongofs = _fs
        })
    });

    testfiles.forEach(function(f) {
        it('#writetstream should correctly pipe from fs.ReadStream', function() {
            return copyFileFromFilesystem(f.path, '/' + path.basename(f.path)).then(function() {
                return mongofs.stat('/' + path.basename(f.path)).then(function(file) {
                    file.size.should.be.eql(f.size)
                    file.md5.should.be.eql(f.md5)
                    file.contentType.should.be.eql(f.contentType)
                })
            })
        })
    })

    testfiles.forEach(function(f) {
        it('#readstream should correctly read files', function() {
            return md5FromStream('/' + path.basename(f.path)).should.eventually.be.eql(f.md5)
        })
    })

    it('#writestream should correctly truncate (overwrite) files', function() {
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
