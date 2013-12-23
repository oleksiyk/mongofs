"use strict";

/* global before, describe, it, connect, sinon */

describe('#stat', function() {

    var mongofs;

    before(function() {
        return connect().then(function(_fs) {
            mongofs = _fs
        })
    })

    it('should return valid Stats object for directory', function() {
        var cb = sinon.spy(function() {})
        return mongofs.mkdir('/testStat').then(function() {
            return mongofs.stat('/testStat', cb).then(function(stats) {
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

                cb.should.have.been.calledWith(null, stats)
            })
        })

    })

    it('should return valid Stats object for /', function() {
        var cb = sinon.spy(function() {})
        return mongofs.stat('/', cb).then(function(stats) {
            stats.should.be.an('object')
            stats.should.have.property('mtime')
            stats.should.have.property('ctime')
            stats.should.respondTo('isDirectory')
                .and.respondTo('isBlockDevice')
                .and.respondTo('isCharacterDevice')
                .and.respondTo('isSymbolicLink')
                .and.respondTo('isFIFO')
                .and.respondTo('isSocket')
            stats.isDirectory().should.eql(true)
            stats.isFile().should.eql(false)

            cb.should.have.been.calledWith(null, stats)
        })

    })

    it('should return valid Stats object for file', function() {
        var cb = sinon.spy(function() {})

        return mongofs.open('/testFile', 'w').then(function(fd) {
            return mongofs.write(fd, 'test', 0, 4).then(function() {
                return mongofs.close(fd)
            })
        })
        .then(function() {
            return mongofs.stat('/testFile', cb).then(function(stats) {
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

                cb.should.have.been.calledWith(null, stats)
            })
        })
    })

    it('should fail for not existing path - ENOENT', function() {
        var cb = sinon.spy(function() {})
        return mongofs.stat('/djhjdhjehw/sjhsjhsj', cb).should.be.rejected.and.eventually.have.property('code', 'ENOENT')
            .then(function() {
                cb.getCall(0).args[0].should.be.instanceOf(Error).and.have.property('code', 'ENOENT')
            })
    })

})
