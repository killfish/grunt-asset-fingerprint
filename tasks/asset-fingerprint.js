"use strict";
var _, crypto, fs, path, url;

fs = require("fs");

path = require("path");

crypto = require("crypto");

_ = require("lodash");

url = require("url");

module.exports = function(grunt) {
    var containsAFingerprint, contentWithHashSubstitutions, stripDestPath;
    stripDestPath                = function(file, files) {
        return file.replace(files.orig.dest + "/", "");
    };
    contentWithHashSubstitutions = function(file, hashMap, cdnPrefixForRootPaths) {
        var originalContent, result;
        originalContent = grunt.file.read(file);

        result = _(hashMap).reduce(function(memo, hashedName, originalName) {

                return  memo
                    .replace(RegExp("\\/" + originalName, "g"), cdnPrefixForRootPaths + "/" + hashedName)
                    .replace(RegExp("" + originalName, "g"), hashedName);

            }, originalContent);

        return {
            result            : result,
            madeAnyDifference : result !== originalContent
        };
    };
    containsAFingerprint         = function(fileName) {
        return fileName.match(/\-\w{32}\./);
    };
    return grunt.registerMultiTask("assetFingerprint", "Generates asset fingerprints and appends to a rails manifest", function() {
        var algorithm, cdnPrefixForRootPaths, filesToHashed, findAndReplaceFiles, keepOriginalFiles, manifestPath;
        manifestPath          = this.options({
            manifestPath : "dist/assets.json"
        }).manifestPath;
        algorithm             = this.options({
            algorithm : "md5"
        }).algorithm;
        findAndReplaceFiles   = grunt.file.expand(this.options({
            findAndReplaceFiles : []
        }).findAndReplaceFiles);
        keepOriginalFiles     = this.options({
            keepOriginalFiles : true
        }).keepOriginalFiles;
        cdnPrefixForRootPaths = this.options({
            cdnPrefixForRootPaths : ""
        }).cdnPrefixForRootPaths;
        filesToHashed         = {};

        var timestamp = new Date().getTime() / 1000;
        var hash = crypto.createHash(algorithm).update(timestamp.toString()).digest('hex');

        _(this.files).each(function(files) {
            var content, dest, destWithHash, extension, src, substitution;
            src  = files.src[0];
            dest = files.dest;
            if (containsAFingerprint(src)) {
                return;
            }
            if (grunt.file.isDir(src)) {
                return grunt.log.debug("Source file `" + src + "` was a directory. Skipping.");
            }
            if (!grunt.file.exists(src)) {
                grunt.log.warn("Source file `" + src + "` not found.");
            }

            extension     = path.extname(dest);
            content       = grunt.file.read(src);

            if (_(findAndReplaceFiles).contains(src)) {
                findAndReplaceFiles = _(findAndReplaceFiles).without(src);
                substitution        = contentWithHashSubstitutions(src, filesToHashed, cdnPrefixForRootPaths);
                if (substitution.madeAnyDifference) {
                    content = substitution.result;
                    grunt.file.write(src, content);
                    // grunt.log.writeln("Applied fingerprinted paths to: " + src);
                }
            }

            destWithHash = (path.dirname(dest)) + "/" + (path.basename(dest, extension)) + "-" + hash + extension;

            filesToHashed[stripDestPath(dest, files)] = stripDestPath(destWithHash, files);

            if (keepOriginalFiles) {
                grunt.file.copy(src, destWithHash);
                // return grunt.log.writeln("Copied: '" + src + "' to '" + destWithHash + "'");
            }
            else {
                fs.renameSync(src, destWithHash);
                //return grunt.log.writeln("Moved: '" + src + "' to '" + destWithHash + "'");
            }
        });
        _(findAndReplaceFiles).each(function(file) {
            var substitution;
            if (!fs.existsSync(file)) {
                return;
            }
            substitution = contentWithHashSubstitutions(file, filesToHashed, cdnPrefixForRootPaths);
            if (substitution.madeAnyDifference) {
                grunt.file.write(file, substitution.result);
                //return grunt.log.writeln("Fingerprinted paths: " + file);
            }
        });
        fs.writeFileSync(manifestPath, JSON.stringify(filesToHashed, null, "  "));
        return grunt.log.writeln("Recorded " + (_(filesToHashed).size()) + " asset mapping(s) to " + manifestPath);
    });
};