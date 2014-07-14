var should = require('chai').should()
var RSVP = require('rsvp');

var Promise = RSVP.Promise;

describe('using an adapter', function () {

    before(function (done) {
        // create repositories

        /*

        RSVP.all(createResources).then(function () {
          done();
        }, function () {
          throw new Error('Failed to create repositories.');
        });

        */

        done();
    });

    describe('getting a list of resources', function () {

        it('in collection one', function (done) {
            // test that list is returned correctly

            // test there is no error

            done();
        });

    });

    describe('getting each individual resource', function () {

        it('in collection one', function (done) {
            // test that the resource is correct and valid

            // test there is no error

            done();
        });

    });

    describe('many to one association', function () {

        it('should be able to associate', function (done) {
            // test that the resource is correct and valid

            // test that all referenc3d links are correct

            // test there is no error

            done();
        });

        it('should be able to dissociate', function (done) {
            // test that the resource is correct and valid

            // test that all referenc3d links are correct

            // test there is no error

            done();
        });

    });

    describe('one to many association', function () {

        it('should be able to associate', function (done) {
            // test that the resource is correct and valid

            // test that all referenc3d links are correct

            // test there is no error

            done();
        });

        it('should be able to dissociate', function (done) {
            // test that the resource is correct and valid

            // test that all referenc3d links are correct

            // test there is no error

            done();
        });

    });

    describe('one to one association', function () {

        it('should be able to associate', function (done) {
            // test that the resource is correct and valid

            // test that all referenc3d links are correct

            // test there is no error

            done();
        });

        it('should be able to dissociate', function (done) {
            // test that the resource is correct and valid

            // test that all referenc3d links are correct

            // test there is no error

            done();
        });

    });

    describe('many to many association', function () {

        it('should be able to associate', function (done) {
            // test that the resource is correct and valid

            // test that all referenc3d links are correct

            // test there is no error

            done();
        });

        it('should be able to dissociate', function (done) {
            // test that the resource is correct and valid

            // test that all referenc3d links are correct

            // test there is no error

            done();
        });

    });

    after(function (done) {
        // delete all resources in the repositories

        /*
        RSVP.all(ids[key].map(function (id) {
        })).then(function () {
          done();
        }, function () {
          throw new Error('Failed to delete resources.');
        });
        */

        done();
    });

});
