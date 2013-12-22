"use strict";

/* global before, describe, it, connect */

describe('#stat', function() {

    var mongofs;

    before(function() {
        return connect().then(function(_fs) {
            mongofs = _fs
        })
    })

    it('should return valid Stats object for folder', function() {
        return mongofs.mkdir('/testStat').then(function() {
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

    it('should return valid Stats object for file', function() {

        return mongofs.open('/testFile', 'w').then(function(fd) {
            return mongofs.write(fd, 'test', 0, 4).then(function() {
                return mongofs.close(fd)
            })
        })
        .then(function() {
            return mongofs.stat('/testFile').then(function(stats) {
                stats.should.be.an('object')
                stats.should.have.property('mtime').that.is.closeTo(new Date(), 500)
                stats.should.have.property('ctime').that.is.closeTo(new Date(), 500)
                stats.should.respondTo('isDirectory')
                    .and.respondTo('isBlockDevice')
                    .and.respondTo('isCharacterDevice')
                    .and.respondTo('isSymbolicLink')
                    .and.respondTo('isFIFO')
                    .and.respondTo('isSocket')
                stats.isDirectory().should.eql(false)
                stats.isFile().should.eql(true)
                stats.size.should.eql(4)
            })
        })
    })

})
