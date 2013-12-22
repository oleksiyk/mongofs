"use strict";

/* global before, describe, it, should, connect */

describe('Folders', function() {

    var mongofs;

    before(function() {
        return connect().then(function(_fs) {
            mongofs = _fs
        })
    })

    describe('#mkdir', function() {
        it('should create folder', function() {
            return mongofs.mkdir('/test')
                .then(function() {
                    return mongofs.db.collection('fs.files').then(function(collection) {
                        return collection.findOne({
                            filename: '/test'
                        })
                    })
                })
                .then(function(folder) {
                    folder.should.be.an('object')
                    folder.should.have.property('filename', '/test')
                    folder.should.have.property('isDirectory', true)
                    folder.should.have.property('mtime').that.is.closeTo(new Date(), 500)
                    folder.should.have.property('ctime').that.is.closeTo(new Date(), 500)
                })
        })

        it('should not create duplicate folder - EEXIST', function() {
            return mongofs.mkdir('/test').should.be.rejected.and.eventually.have.property('code', 'EEXIST')
        })

        it('should not create folders recursively - ENOENT', function() {
            return mongofs.mkdir('/aaa/bbb/ccc').should.be.rejected.and.eventually.have.property('code', 'ENOENT')
        })
    })

    describe('#rmdir', function() {
        it('should remove empty folder', function() {
            return mongofs.rmdir('/test')
                .then(function() {
                    return mongofs.db.collection('fs.files').then(function(collection) {
                        return collection.findOne({
                            filename: '/test'
                        })
                    })
                })
                .then(function(folder) {
                    should.not.exist(folder)
                })
        })

        it('should fail for not existent folder', function() {
            return mongofs.rmdir('/aaa/bbb/ccc').should.be.rejected;
        })

        it('should fail for non empty folder')
    })

    describe('#stat', function() {
        before(function() {
            return mongofs.mkdir('/testStat')
        })

        it('should return valid Stats object for folder', function() {
            return mongofs.stat('/testStat').then(function(stats) {
                stats.should.be.an('object')
                stats.should.have.property('mtime').that.is.closeTo(new Date(), 500)
                stats.should.have.property('ctime').that.is.closeTo(new Date(), 500)
                stats.should.respondTo('isDirectory')
                    .and.respondTo('isBlockDevice')
                    .and.respondTo('isCharacterDevice')
                    .and.respondTo('isSymbolicLink')
                    .and.respondTo('isFIFO')
                    .and.respondTo('isSocket')
                stats.isDirectory().should.eql(true)
                stats.isFile().should.eql(false)
            })
        })
    })

})
