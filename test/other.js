"use strict";

/* global before, describe, it, connect, sinon */

// var Promise = require('bluebird');
// var fs      = require('fs');
// var path    = require('path')

describe('Other API', function() {

    var mongofs;

    before(function() {
        return connect().then(function(_fs) {
            mongofs = _fs
        })
    })

    describe('#exists', function() {
        it('should return true for existing file', function() {
            var cb = sinon.spy(function() {})
            return mongofs.mkdir('/exists').then(function() {
                return mongofs.exists('/exists', cb)
                    .then(function(exists) {
                        cb.should.have.been.calledWith(null, true)
                        return exists.should.be.true
                    })
            })
        })

        it('should return false for not existing file', function() {
            return mongofs.exists('/doenotexist').should.eventually.be.false
        })
    })

    describe('#futimes', function() {
        it('should update mtime for file', function() {
            return mongofs.open('/futimes', 'w').then(function(fd) {
                return mongofs.futimes(fd, null, new Date(0)).then(function() {
                    return mongofs.stat('/futimes').then(function(stat) {
                        stat.mtime.should.be.eql(new Date(0))
                    })
                })
            })
        })
    })

    describe('#utimes', function() {
        it('should update mtime for file', function() {
            return mongofs.open('/utimes', 'w').then(function() {
                return mongofs.utimes('/utimes', null, new Date(10)).then(function() {
                    return mongofs.stat('/utimes').then(function(stat) {
                        stat.mtime.should.be.eql(new Date(10))
                    })
                })
            })
        })
    })

    //TODO: check if fstat should update info for opened file
    describe('#fstat', function() {

    })

})
