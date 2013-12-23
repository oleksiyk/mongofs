"use strict";

var Stats = function(file) {
    this.file = file;

    this.atime = file.atime;
    this.mtime = file.mtime;
    this.ctime = file.ctime;

    if(!file.isDirectory){
        this.size = file.length;
        this.md5 = file.md5;
        this.contentType = file.contentType;
    }
}

Stats.prototype.isFile = function() {
    return !this.file.isDirectory;
}
Stats.prototype.isDirectory = function() {
    return !!this.file.isDirectory;
}
Stats.prototype.isBlockDevice = function() { return false; }
Stats.prototype.isCharacterDevice = function() { return false; }
Stats.prototype.isSymbolicLink = function() { return false; }
Stats.prototype.isFIFO = function() { return false; }
Stats.prototype.isSocket = function() { return false; }


module.exports = Stats;
